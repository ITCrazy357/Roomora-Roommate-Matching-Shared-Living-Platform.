import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import {
  refundDetails,
  RefundRulesService,
  withinRefundWindow,
} from './refund-rules.service.js';
import {
  MomoRefundsService,
  type GatewayRefundResult,
} from './momo-refunds.service.js';
import { prepareImage } from '../communications/message-media.js';
import type {
  BeginRefundDto,
  CompleteRefundDto,
  FailRefundDto,
  RefundNoteDto,
  RefundQueryDto,
  ReviewRefundDto,
  VerifyRefundRecipientDto,
} from './dto/refund.dto.js';
import type {
  Prisma,
  ServiceRefundStatus,
} from '../../generated/prisma/client.js';
import {
  findRefundBank,
  normalizeAccountName,
  refundBankId,
} from './refund-banks.js';

@Injectable()
export class AdminRefundsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: RefundRulesService,
    private readonly momo: MomoRefundsService,
  ) {}

  async list(query: RefundQueryDto) {
    const where: Prisma.ServiceRefundRequestWhereInput =
      query.status === 'all'
        ? {}
        : { status: query.status as ServiceRefundStatus };
    const q = query.q;
    if (q) {
      const contains = { contains: q, mode: 'insensitive' as const };
      where.OR = [
        { refundReference: contains },
        { accountNumber: contains },
        {
          accountName: {
            contains: normalizeAccountName(q),
            mode: 'insensitive',
          },
        },
        { bankName: contains },
        { order: { buyerName: contains } },
        { order: { buyerEmail: contains } },
        { order: { listingTitle: contains } },
        { order: { providerTransId: contains } },
        { order: { providerOrderCode: contains } },
      ];
      if (
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          q,
        )
      )
        where.OR.push({ id: q }, { orderId: q });
    }
    const [items, total] = await this.prisma.$transaction(
      [
        this.prisma.serviceRefundRequest.findMany({
          where,
          include: {
            order: {
              select: {
                id: true,
                buyerName: true,
                buyerEmail: true,
                planName: true,
                provider: true,
              },
            },
          },
          orderBy:
            query.status === 'COMPLETED'
              ? [{ completedAt: 'desc' }, { id: 'desc' }]
              : query.status === 'PENDING'
                ? [{ createdAt: 'asc' }, { id: 'asc' }]
                : [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
        this.prisma.serviceRefundRequest.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      items,
      total,
      page: query.page,
      pages: Math.ceil(total / query.limit),
    };
  }

  async get(id: string) {
    const refund = await this.prisma.serviceRefundRequest.findUnique({
      where: { id },
      include: refundDetails,
    });
    if (!refund) throw new NotFoundException();
    return {
      ...refund,
      gatewayAvailable: refund.method !== 'MOMO' || this.momo.available(),
    };
  }

  async review(actorId: string, id: string, dto: ReviewRefundDto) {
    await this.prisma.$transaction(async (tx) => {
      const refund = await this.rules.lock(tx, id);
      await this.rules.admin(tx, actorId);
      this.rules.requireVersion(refund, dto.version);
      this.rules.requireStatus(refund, 'PENDING', 'APPROVED');
      this.rules.requirePaid(refund.order);
      if (dto.decision === 'APPROVED') {
        this.rules.requireStatus(refund, 'PENDING');
        if (
          refund.source === 'USER' &&
          !withinRefundWindow(refund.order.paidAt, refund.createdAt)
        )
          throw new ConflictException({ code: 'REFUND_REQUEST_INELIGIBLE' });
      }
      await this.rules.change(tx, refund, actorId, dto.decision, dto.note, {
        status: dto.decision,
        decisionNote: dto.note,
        approvedAt: dto.decision === 'APPROVED' ? new Date() : null,
      });
    });
    return this.get(id);
  }

  async verifyRecipient(
    actorId: string,
    id: string,
    dto: VerifyRefundRecipientDto,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const refund = await this.rules.lock(tx, id);
      await this.rules.admin(tx, actorId);
      this.rules.requireVersion(refund, dto.version);
      this.rules.requireStatus(refund, 'APPROVED');
      this.rules.requirePaid(refund.order);
      if (
        refund.method !== 'MANUAL_BANK' ||
        !refund.accountNumber ||
        !refund.accountName ||
        !refund.bankId ||
        !refund.bankName
      )
        throw new ConflictException({ code: 'REFUND_RECIPIENT_REQUIRED' });
      if (!findRefundBank(refund.bankId))
        throw new BadRequestException({ code: 'REFUND_BANK_INVALID' });
      const normalize = (name: string) =>
        normalizeAccountName(name).replace(/\s+/g, '');
      const different =
        (refund.order.payerAccount &&
          refund.order.payerAccount !== refund.accountNumber) ||
        (refund.order.payerBankId &&
          refundBankId(refund.order.payerBankId) !==
            refundBankId(refund.bankId)) ||
        (refund.order.payerName &&
          normalize(refund.order.payerName) !== normalize(refund.accountName));
      if (
        different &&
        (!dto.differentAccountApproved ||
          !refund.differentAccountReason ||
          refund.differentAccountReason.trim().length < 10)
      )
        throw new ConflictException({
          code: 'REFUND_DIFFERENT_ACCOUNT_REVIEW',
        });
      // Matching text is only a comparison aid. An admin must attest the bank evidence.
      await this.rules.change(
        tx,
        refund,
        actorId,
        'RECIPIENT_VERIFIED',
        dto.note,
        {
          verifiedAt: new Date(),
          verifiedById: actorId,
          verificationNote: dto.note,
          verificationReference: dto.evidenceReference,
        },
        {
          evidenceReference: dto.evidenceReference,
          differentAccountApproved: dto.differentAccountApproved,
        },
      );
    });
    return this.get(id);
  }

  async begin(actorId: string, id: string, dto: BeginRefundDto) {
    const refund = await this.prisma.$transaction(async (tx) => {
      const current = await this.rules.lock(tx, id);
      await this.rules.admin(tx, actorId);
      this.rules.requireVersion(current, dto.version);
      this.rules.requireStatus(current, 'APPROVED');
      this.rules.requirePaid(current.order);
      if (current.amount !== current.order.amount)
        throw new ConflictException({ code: 'REFUND_AMOUNT_MISMATCH' });
      if (current.method === 'MANUAL_BANK' && !current.verifiedAt)
        throw new ConflictException({ code: 'REFUND_RECIPIENT_UNVERIFIED' });
      if (current.method === 'MANUAL_BANK' && !findRefundBank(current.bankId))
        throw new BadRequestException({ code: 'REFUND_BANK_INVALID' });
      if (current.method === 'MOMO' && !this.momo.available())
        throw new ServiceUnavailableException({
          code: 'REFUND_GATEWAY_NOT_CONFIGURED',
        });
      await this.rules.change(tx, current, actorId, 'PROCESSING', dto.note, {
        status: 'PROCESSING',
        processingAt: new Date(),
        lastError: null,
        gatewayLeaseAt: current.method === 'MOMO' ? new Date() : null,
      });
      return tx.serviceRefundRequest.findUniqueOrThrow({
        where: { id },
        include: refundDetails,
      });
    });
    if (refund.method === 'MOMO')
      await this.applyGateway(
        actorId,
        id,
        await this.momo.create(refund.order, refund),
      );
    return this.get(id);
  }

  async reconcile(actorId: string, id: string, version: number) {
    const refund = await this.prisma.$transaction(async (tx) => {
      const current = await this.rules.lock(tx, id);
      await this.rules.admin(tx, actorId);
      this.rules.requireVersion(current, version);
      if (current.status === 'COMPLETED') return current;
      this.rules.requireStatus(current, 'PROCESSING');
      this.rules.requirePaid(current.order);
      if (current.method !== 'MOMO')
        throw new ConflictException({ code: 'REFUND_ORIGINAL_METHOD' });
      if (
        current.gatewayLeaseAt &&
        current.gatewayLeaseAt.getTime() > Date.now() - 90000
      )
        throw new ConflictException({ code: 'REFUND_IN_PROGRESS' });
      await tx.serviceRefundRequest.update({
        where: { id },
        data: { gatewayLeaseAt: new Date() },
      });
      return current;
    });
    if (refund.status !== 'COMPLETED')
      await this.applyGateway(
        actorId,
        id,
        await this.momo.query(refund.order, refund),
      );
    return this.get(id);
  }

  private async applyGateway(
    actorId: string,
    id: string,
    result: GatewayRefundResult,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const refund = await this.rules.lock(tx, id);
      await this.rules.admin(tx, actorId);
      if (refund.status === 'COMPLETED') return;
      this.rules.requireStatus(refund, 'PROCESSING');
      if (result.status === 'COMPLETED' && result.reference)
        await this.rules.complete(
          tx,
          refund,
          actorId,
          result.reference,
          new Date(),
          result.message,
        );
      else
        await this.rules.change(
          tx,
          refund,
          actorId,
          'GATEWAY_RESULT',
          result.message,
          {
            status: result.status,
            lastError: result.message,
            gatewayLeaseAt: null,
          },
        );
    });
  }

  async retry(actorId: string, id: string, dto: RefundNoteDto) {
    await this.prisma.$transaction(async (tx) => {
      const refund = await this.rules.lock(tx, id);
      await this.rules.admin(tx, actorId);
      this.rules.requireVersion(refund, dto.version);
      this.rules.requireStatus(refund, 'FAILED');
      this.rules.requirePaid(refund.order);
      await this.rules.change(tx, refund, actorId, 'RETRY_APPROVED', dto.note, {
        status: 'APPROVED',
        lastError: null,
        gatewayLeaseAt: null,
      });
    });
    return this.get(id);
  }

  async fail(actorId: string, id: string, dto: FailRefundDto) {
    await this.prisma.$transaction(async (tx) => {
      const refund = await this.rules.lock(tx, id);
      await this.rules.admin(tx, actorId);
      this.rules.requireVersion(refund, dto.version);
      this.rules.requireStatus(refund, 'PROCESSING');
      this.rules.requirePaid(refund.order);
      if (refund.method !== 'MANUAL_BANK')
        throw new ConflictException({ code: 'REFUND_ORIGINAL_METHOD' });
      await this.rules.change(
        tx,
        refund,
        actorId,
        'TRANSFER_FAILED',
        dto.note,
        { status: 'FAILED', lastError: dto.note },
      );
    });
    return this.get(id);
  }

  async uploadProof(
    actorId: string,
    id: string,
    version: number,
    file: Express.Multer.File,
  ) {
    await this.get(id);
    let image: Awaited<ReturnType<typeof prepareImage>>;
    try {
      image = await prepareImage(file);
    } catch {
      throw new BadRequestException({ code: 'REFUND_PROOF_INVALID' });
    }
    await this.prisma.$transaction(async (tx) => {
      const refund = await this.rules.lock(tx, id);
      await this.rules.admin(tx, actorId);
      this.rules.requireVersion(refund, version);
      this.rules.requireStatus(refund, 'PROCESSING');
      this.rules.requirePaid(refund.order);
      if (refund.method !== 'MANUAL_BANK')
        throw new ConflictException({ code: 'REFUND_ORIGINAL_METHOD' });
      const proof = await tx.serviceRefundProof.create({
        data: {
          refundId: id,
          uploadedById: actorId,
          data: image.data,
          mimeType: image.mimeType,
        },
      });
      await this.rules.change(
        tx,
        refund,
        actorId,
        'PROOF_ADDED',
        'Đính kèm chứng từ chuyển khoản; chưa xác nhận hoàn tiền',
        {},
        { proofId: proof.id },
      );
    });
    return this.get(id);
  }

  async complete(actorId: string, id: string, dto: CompleteRefundDto) {
    await this.prisma.$transaction(async (tx) => {
      const refund = await this.rules.lock(tx, id);
      await this.rules.admin(tx, actorId);
      this.rules.requireVersion(refund, dto.version);
      this.rules.requireStatus(refund, 'PROCESSING');
      if (refund.method !== 'MANUAL_BANK' || !refund.verifiedAt)
        throw new ConflictException({ code: 'REFUND_RECIPIENT_UNVERIFIED' });
      if (dto.amount !== refund.amount || dto.amount !== refund.order.amount)
        throw new ConflictException({ code: 'REFUND_AMOUNT_MISMATCH' });
      const reference = dto.reference.trim().toUpperCase();
      if (
        [refund.id, refund.orderId, refund.order.providerTransId].some(
          (value) => value?.toUpperCase() === reference,
        )
      )
        throw new ConflictException({
          code: 'REFUND_TRANSFER_REFERENCE_REQUIRED',
        });
      const proof = refund.proofs.find((item) => item.id === dto.proofId);
      if (
        !proof ||
        !refund.processingAt ||
        proof.createdAt < refund.processingAt
      )
        throw new ConflictException({ code: 'REFUND_PROOF_REQUIRED' });
      const transferredAt = new Date(dto.transferredAt);
      if (
        transferredAt.getTime() < refund.processingAt.getTime() - 60000 ||
        transferredAt.getTime() > Date.now() + 60000
      )
        throw new ConflictException({ code: 'REFUND_TRANSFER_TIME_INVALID' });
      await this.rules.complete(
        tx,
        refund,
        actorId,
        dto.reference,
        transferredAt,
        dto.note,
        dto.proofId,
      );
    });
    return this.get(id);
  }

  async proof(id: string, proofId: string, userId?: string) {
    const proof = await this.prisma.serviceRefundProof.findFirst({
      where: {
        id: proofId,
        refundId: id,
        ...(userId ? { refund: { order: { userId } } } : {}),
      },
    });
    if (!proof) throw new NotFoundException();
    return proof;
  }
}
