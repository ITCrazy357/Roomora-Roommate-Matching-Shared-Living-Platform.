import type { PrismaService } from '../../database/prisma.service.js';
import type { NotificationsService } from '../communications/notifications.service.js';
import type { CostSharingRulesService } from '../cost-sharing/cost-sharing-rules.service.js';
import type { ExpenseAccessService } from '../expenses/expense-access.service.js';
import type { ExpenseEventsService } from '../expenses/expense-events.service.js';
import { ExpenseRecordsService } from '../expenses/expense-records.service.js';
import type { ExpenseRow } from '../expenses/expense-views.js';
import type { HouseAccessService } from '../houses/house-access.service.js';
import type { ConfirmRecurringDraftDto } from './dto/household.dto.js';
import { HouseholdAccessService } from './household-access.service.js';
import { RecurringDraftsService } from './recurring-drafts.service.js';

function confirmationFixture() {
  const person = {
    id: '00000000-0000-4000-8000-000000000001',
    userId: 'payer-user',
    displayName: 'Payer',
    leftAt: null,
    user: null,
  };
  const draft = {
    id: 'draft-1',
    payerId: person.id,
    status: 'PENDING' as 'PENDING' | 'CONFIRMED',
    expenseId: null as string | null,
    version: 1,
    category: 'INTERNET',
    dueOn: new Date('2026-10-26T00:00:00Z'),
    rule: { createdById: 'owner' },
  };
  let saved: ExpenseRow | null = null;
  const tx = {
    recurringExpenseDraft: {
      findFirst: vi.fn().mockResolvedValue(draft),
      update: vi
        .fn()
        .mockImplementation(({ data }: { data: { expenseId: string } }) => {
          draft.status = 'CONFIRMED';
          draft.expenseId = data.expenseId;
          draft.version++;
          return Promise.resolve(draft);
        }),
    },
    houseParticipant: {
      findUnique: vi.fn().mockResolvedValue(person),
      findMany: vi.fn().mockResolvedValue([person]),
    },
    expense: {
      findUnique: vi.fn().mockImplementation(
        ({
          where,
        }: {
          where: {
            houseId_createdById_clientId: {
              houseId: string;
              createdById: string;
              clientId: string;
            };
          };
        }) => {
          const key = where.houseId_createdById_clientId;
          return Promise.resolve(
            saved &&
              saved.houseId === key.houseId &&
              saved.createdById === key.createdById &&
              saved.clientId === key.clientId
              ? saved
              : null,
          );
        },
      ),
      findUniqueOrThrow: vi
        .fn()
        .mockImplementation(() => Promise.resolve(saved)),
      create: vi
        .fn()
        .mockImplementation(({ data }: { data: Partial<ExpenseRow> }) => {
          saved = {
            ...data,
            id: 'expense-1',
            payer: person,
            createdBy: { profile: { displayName: 'Owner' } },
            splits: [],
            receipt: null,
            _count: { supplierPayments: 0 },
          } as ExpenseRow;
          return Promise.resolve(saved);
        }),
    },
  };
  const prisma = {
    $transaction: (action: (transaction: typeof tx) => Promise<unknown>) =>
      action(tx),
  } as unknown as PrismaService;
  const access = {
    lock: vi.fn().mockResolvedValue(undefined),
    active: vi.fn().mockResolvedValue({ ownerId: 'owner' }),
  } as unknown as HouseAccessService;
  const events = {
    record: vi.fn().mockResolvedValue(undefined),
    signal: vi.fn().mockResolvedValue(undefined),
  };
  // Exercise both real services; replace persistence and unrelated collaborators.
  const expenses = new ExpenseRecordsService(
    prisma,
    access,
    events as unknown as ExpenseEventsService,
    {
      noPending: vi.fn().mockResolvedValue(undefined),
    } as unknown as ExpenseAccessService,
    {
      apply: vi.fn().mockResolvedValue(null),
    } as unknown as CostSharingRulesService,
  );
  const service = new RecurringDraftsService(
    prisma,
    access,
    new HouseholdAccessService({} as NotificationsService),
    expenses,
  );
  const body = {
    title: 'Internet',
    description: '',
    clientId: 'ignored-for-recurring',
    amount: 1_000_000,
    payerId: person.id,
    participantIds: [person.id],
    splitMode: 'EQUAL' as const,
    version: 1,
  } satisfies ConfirmRecurringDraftDto;
  const confirm = (dto: ConfirmRecurringDraftDto, userId = 'owner') =>
    service.confirm(userId, 'house-1', draft.id, dto);
  return { tx, draft, events, body, confirm };
}

describe('Recurring draft payment progress', () => {
  it.each([undefined, 0, 250_000, 1_000_000])(
    'preserves paidAmount=%s when creating the expense',
    async (paidAmount) => {
      const { tx, draft, body, confirm } = confirmationFixture();
      const expected = paidAmount ?? body.amount;

      const expense = await confirm({ ...body, paidAmount });

      expect(expense).toMatchObject({
        paidAmount: expected,
        remainingAmount: body.amount - expected,
      });
      expect(tx.expense.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ paidAmount: expected }),
        }),
      );
      expect(draft).toMatchObject({
        status: 'CONFIRMED',
        expenseId: expense.id,
      });
    },
  );

  it('rejects payment above the total without creating or confirming an expense', async () => {
    const { tx, draft, events, body, confirm } = confirmationFixture();

    await expect(
      confirm({ ...body, paidAmount: body.amount + 1 }),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: 'EXPENSE_PAID_AMOUNT_INVALID' },
    });
    expect(tx.expense.create).not.toHaveBeenCalled();
    expect(tx.recurringExpenseDraft.update).not.toHaveBeenCalled();
    expect(events.record).not.toHaveBeenCalled();
    expect(draft.status).toBe('PENDING');
  });

  it.each([0, 250_000])(
    'returns the same expense for paidAmount=%s when another authorized user retries',
    async (paidAmount) => {
      const { tx, events, body, confirm } = confirmationFixture();
      const input = { ...body, paidAmount };

      const expense = await confirm(input);
      const retry = await confirm(input, 'payer-user');

      expect(retry).toMatchObject({ id: expense.id, paidAmount });
      expect(tx.expense.create).toHaveBeenCalledOnce();
      expect(tx.recurringExpenseDraft.update).toHaveBeenCalledOnce();
      expect(events.record).toHaveBeenCalledOnce();
    },
  );

  it('rejects a retry that changes the paid amount and leaves the original expense intact', async () => {
    const { tx, events, body, confirm } = confirmationFixture();
    const expense = await confirm({ ...body, paidAmount: 0 });

    await expect(
      confirm({ ...body, paidAmount: 250_000 }),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'EXPENSE_RETRY_CHANGED' },
    });
    expect(await confirm({ ...body, paidAmount: 0 })).toMatchObject({
      id: expense.id,
      paidAmount: 0,
      remainingAmount: body.amount,
    });
    expect(tx.expense.create).toHaveBeenCalledOnce();
    expect(events.record).toHaveBeenCalledOnce();
  });
});
