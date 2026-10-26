import { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../database/prisma.service.js';
import type { ServiceOrder } from '../../generated/prisma/client.js';
import type { PaymentGatewayService } from './payment-gateway.service.js';
import type { ServicePaymentsService } from './service-payments.service.js';
import { ServiceOrdersService } from './service-orders.service.js';

function reconciliationFixture() {
  const orders = Array.from({ length: 11 }, (_, index) => ({
    id: `order-${index}`,
    provider: 'PAYOS',
    providerLinkId: 'a'.repeat(32),
    payUrl: null,
    status: 'EXPIRED',
    createdAt: new Date(2026, 0, 1, 0, 0, index),
  })) as ServiceOrder[];
  // The database claim supplies disjoint batches while their retry leases hold.
  const claim = vi
    .fn()
    .mockResolvedValueOnce(orders.slice(0, 10).map(({ id }) => ({ id })))
    .mockResolvedValueOnce([{ id: orders[10].id }])
    .mockResolvedValue([]);
  const findMany = vi
    .fn()
    .mockImplementation(
      (query: { where: { id?: { in: string[] } }; take?: number }) =>
        Promise.resolve(
          query.where.id
            ? orders.filter((order) => query.where.id!.in.includes(order.id))
            : [...orders].reverse().slice(0, query.take),
        ),
    );
  const sync = vi.fn().mockResolvedValue({
    status: 'PENDING',
    amountPaid: 0,
    payment: undefined,
  });
  const prisma = {
    $queryRaw: claim,
    serviceOrder: { findMany },
  } as unknown as PrismaService;
  const service = new ServiceOrdersService(
    prisma,
    {} as PaymentGatewayService,
    { syncPayos: sync } as unknown as ServicePaymentsService,
    new ConfigService(),
  );
  return { orders, claim, findMany, sync, service };
}

describe('PayOS reconciliation batches', () => {
  it('reaches all eleven orders across batches without repeatedly checking the newest ten', async () => {
    const { service, sync, orders } = reconciliationFixture();
    await service.reconcilePayos();
    expect(sync).toHaveBeenCalledTimes(10);
    await service.reconcilePayos();
    await service.reconcilePayos();

    expect(sync).toHaveBeenCalledTimes(11);
    expect(
      new Set(sync.mock.calls.map(([order]) => (order as ServiceOrder).id)),
    ).toEqual(new Set(orders.map((order) => order.id)));
  });

  it('continues to the next claimed batch when every provider request fails', async () => {
    const { service, sync } = reconciliationFixture();
    sync.mockRejectedValue(new Error('Provider unavailable'));

    await expect(service.reconcilePayos()).resolves.toBeUndefined();
    await expect(service.reconcilePayos()).resolves.toBeUndefined();
    expect(sync).toHaveBeenCalledTimes(11);
  });

  it('does not load or contact the provider when no eligible orders can be claimed', async () => {
    const { service, claim, findMany, sync } = reconciliationFixture();
    claim.mockReset().mockResolvedValue([]);

    await service.reconcilePayos();

    expect(findMany).not.toHaveBeenCalled();
    expect(sync).not.toHaveBeenCalled();
  });

  it('binds a scoped reconciliation to the requested account in the database claim', async () => {
    const { service, claim } = reconciliationFixture();
    const userId = '00000000-0000-4000-8000-000000000001';

    await service.reconcilePayos(userId);

    expect(claim).toHaveBeenCalledWith(
      expect.objectContaining({ values: [userId] }),
    );
  });

  it('keeps provider concurrency at three requests', async () => {
    const { service, sync } = reconciliationFixture();
    let active = 0;
    let maximum = 0;
    sync.mockImplementation(async () => {
      active++;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      active--;
      return { status: 'PENDING', amountPaid: 0 };
    });

    await service.reconcilePayos();

    expect(maximum).toBe(3);
    expect(active).toBe(0);
  });

  it('skips an order paid by a webhook between claiming and loading the batch', async () => {
    const { service, sync, orders } = reconciliationFixture();
    orders[0].status = 'PAID';

    await service.reconcilePayos();

    expect(sync).toHaveBeenCalledTimes(9);
    expect(
      sync.mock.calls.some(
        ([order]) => (order as ServiceOrder).id === orders[0].id,
      ),
    ).toBe(false);
  });
});
