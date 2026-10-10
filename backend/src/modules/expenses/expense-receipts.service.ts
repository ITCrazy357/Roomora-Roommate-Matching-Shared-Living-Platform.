import {
  BadRequestException,
  NotFoundException,
  Injectable,
} from '@nestjs/common';
import sharp from 'sharp';
import { PrismaService } from '../../database/prisma.service.js';
import { HouseAccessService } from '../houses/house-access.service.js';
import { ExpenseEventsService } from './expense-events.service.js';
import { ExpenseAccessService } from './expense-access.service.js';
import type { ExpenseVersionDto } from './dto/expenses.dto.js';
import { expenseInclude, expenseView } from './expense-views.js';

@Injectable()
export class ExpenseReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: HouseAccessService,
    private readonly events: ExpenseEventsService,
    private readonly expenseAccess: ExpenseAccessService,
  ) {}

  async upload(
    userId: string,
    houseId: string,
    id: string,
    dto: ExpenseVersionDto,
    file: Express.Multer.File,
  ) {
    await this.access.active(this.prisma, userId, houseId);
    if (!file?.buffer?.length || file.buffer.length > 5 * 1024 * 1024)
      throw new BadRequestException({ code: 'RECEIPT_INVALID' });
    let data: Buffer;
    try {
      const image = sharp(file.buffer, {
        limitInputPixels: 25_000_000,
        failOn: 'warning',
      });
      const metadata = await image.metadata();
      if (
        !['jpeg', 'png', 'webp'].includes(metadata.format ?? '') ||
        (metadata.pages ?? 1) > 1
      )
        throw new Error('Invalid receipt');
      data = await image
        .rotate()
        .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
      if (data.length > 2 * 1024 * 1024) throw new Error('Receipt too large');
    } catch {
      throw new BadRequestException({ code: 'RECEIPT_INVALID' });
    }
    return this.prisma.$transaction(async (tx) => {
      await this.access.lock(tx, houseId);
      const house = await this.access.active(tx, userId, houseId);
      const previous = await this.expenseAccess.expense(
        tx,
        userId,
        houseId,
        id,
      );
      this.expenseAccess.editable(userId, house.ownerId, previous, dto.version);
      await this.expenseAccess.noPending(tx, houseId);
      await tx.expenseReceipt.upsert({
        where: { expenseId: id },
        create: { expenseId: id, data: Uint8Array.from(data) },
        update: { data: Uint8Array.from(data) },
      });
      const updated = await tx.expense.update({
        where: { id },
        data: { version: { increment: 1 } },
        include: expenseInclude,
      });
      await this.events.record(
        tx,
        userId,
        previous,
        updated,
        'RECEIPT',
        'Cập nhật ảnh biên nhận',
      );
      await this.events.signal(tx, houseId);
      return expenseView(updated);
    });
  }

  async get(userId: string, houseId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.expenseAccess.expense(tx, userId, houseId, id);
      const receipt = await tx.expenseReceipt.findUnique({
        where: { expenseId: id },
      });
      if (!receipt) throw new NotFoundException({ code: 'RECEIPT_NOT_FOUND' });
      return receipt;
    });
  }
}
