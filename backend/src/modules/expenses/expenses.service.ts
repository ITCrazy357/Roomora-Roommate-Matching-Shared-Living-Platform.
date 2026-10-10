import { Injectable } from '@nestjs/common';
import type {
  CreateExpenseDto,
  UpdateExpenseDto,
  CancelExpenseDto,
  ExpenseQueryDto,
  CreateDebtPaymentDto,
  PaymentActionDto,
  ExpenseVersionDto,
  RepaymentPromiseDto,
} from './dto/expenses.dto.js';
import { ExpenseBalancesService } from './expense-balances.service.js';
import { ExpenseRecordsService } from './expense-records.service.js';
import { ExpenseParticipantsService } from './expense-participants.service.js';
import { ExpensePaymentsService } from './expense-payments.service.js';
import { ExpenseReceiptsService } from './expense-receipts.service.js';
import { ExpensePromisesService } from './expense-promises.service.js';

@Injectable()
export class ExpensesService {
  constructor(
    private readonly records: ExpenseRecordsService,
    private readonly balancesService: ExpenseBalancesService,
    private readonly participantsService: ExpenseParticipantsService,
    private readonly paymentsService: ExpensePaymentsService,
    private readonly receipts: ExpenseReceiptsService,
    private readonly promises: ExpensePromisesService,
  ) {}

  create(userId: string, houseId: string, dto: CreateExpenseDto) {
    return this.records.create(userId, houseId, dto);
  }

  update(userId: string, houseId: string, id: string, dto: UpdateExpenseDto) {
    return this.records.update(userId, houseId, id, dto);
  }

  cancel(userId: string, houseId: string, id: string, dto: CancelExpenseDto) {
    return this.records.cancel(userId, houseId, id, dto);
  }

  list(userId: string, houseId: string, query: ExpenseQueryDto) {
    return this.records.list(userId, houseId, query);
  }

  adjustments(userId: string, houseId: string, id: string) {
    return this.records.adjustments(userId, houseId, id);
  }

  balances(userId: string, houseId: string) {
    return this.balancesService.get(userId, houseId);
  }

  settlements(userId: string, houseId: string) {
    return this.balancesService.settlements(userId, houseId);
  }

  settle(userId: string, houseId: string) {
    return this.balancesService.settle(userId, houseId);
  }

  participants(userId: string, houseId: string) {
    return this.participantsService.list(userId, houseId);
  }

  addGuest(userId: string, houseId: string, displayName: string) {
    return this.participantsService.addGuest(userId, houseId, displayName);
  }

  removeGuest(userId: string, houseId: string, id: string) {
    return this.participantsService.removeGuest(userId, houseId, id);
  }

  historyHouses(userId: string) {
    return this.participantsService.historyHouses(userId);
  }

  payments(userId: string, houseId: string, query: ExpenseQueryDto) {
    return this.paymentsService.list(userId, houseId, query);
  }

  createPayment(
    userId: string,
    houseId: string,
    dto: CreateDebtPaymentDto,
    file?: Express.Multer.File,
  ) {
    return this.paymentsService.create(userId, houseId, dto, file);
  }

  changePayment(
    userId: string,
    houseId: string,
    id: string,
    dto: PaymentActionDto,
  ) {
    return this.paymentsService.change(userId, houseId, id, dto);
  }

  paymentProof(userId: string, houseId: string, paymentId: string) {
    return this.paymentsService.getProof(userId, houseId, paymentId);
  }

  uploadReceipt(
    userId: string,
    houseId: string,
    id: string,
    dto: ExpenseVersionDto,
    file: Express.Multer.File,
  ) {
    return this.receipts.upload(userId, houseId, id, dto, file);
  }

  receipt(userId: string, houseId: string, id: string) {
    return this.receipts.get(userId, houseId, id);
  }

  savePromise(userId: string, houseId: string, dto: RepaymentPromiseDto) {
    return this.promises.save(userId, houseId, dto);
  }

  cancelPromise(
    userId: string,
    houseId: string,
    recipientId: string,
    dto: ExpenseVersionDto,
  ) {
    return this.promises.cancel(userId, houseId, recipientId, dto);
  }
}
