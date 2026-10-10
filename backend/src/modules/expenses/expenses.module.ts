import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import {
  ExpensesController,
  FinanceHistoryController,
} from './expenses.controller.js';
import { ExpensesService } from './expenses.service.js';
import { ExpenseParticipantsService } from './expense-participants.service.js';
import { ExpenseBalancesService } from './expense-balances.service.js';
import { ExpensePaymentsService } from './expense-payments.service.js';
import { ExpenseReceiptsService } from './expense-receipts.service.js';
import { ExpenseAccessService } from './expense-access.service.js';
import { ExpenseEventsService } from './expense-events.service.js';
import { ExpenseRemindersService } from './expense-reminders.service.js';
import { ExpensePromisesService } from './expense-promises.service.js';
import { HousesModule } from '../houses/houses.module.js';
import { CommunicationsModule } from '../communications/communications.module.js';

@Module({
  imports: [PrismaModule, AuthModule, HousesModule, CommunicationsModule],
  controllers: [ExpensesController, FinanceHistoryController],
  providers: [
    ExpensesService,
    ExpenseParticipantsService,
    ExpenseBalancesService,
    ExpensePaymentsService,
    ExpenseReceiptsService,
    ExpenseAccessService,
    ExpenseEventsService,
    ExpenseRemindersService,
    ExpensePromisesService,
  ],
})
export class ExpensesModule {}
