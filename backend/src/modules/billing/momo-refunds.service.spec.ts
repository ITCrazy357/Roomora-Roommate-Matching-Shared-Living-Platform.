import { ConfigService } from '@nestjs/config';
import { createHmac, randomUUID } from 'node:crypto';
import type {
  ServiceOrder,
  ServiceRefundRequest,
} from '../../generated/prisma/client.js';
import { MomoRefundsService } from './momo-refunds.service.js';

describe('MoMo original-method refund adapter', () => {
  const config = new ConfigService({
    MOMO_PARTNER_CODE: 'TEST',
    MOMO_ACCESS_KEY: 'access',
    MOMO_SECRET_KEY: 'secret',
  });
  const order = {
    id: randomUUID(),
    amount: 49000,
    providerTransId: '12345',
  } as ServiceOrder;
  const refund = { id: randomUUID(), amount: 49000 } as ServiceRefundRequest;
  const service = new MomoRefundsService(config);
  function mockFetch(final: Record<string, unknown>, query = false) {
    return vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (url, options) => {
        expect(typeof options?.body).toBe('string');
        const body = JSON.parse(options!.body as string) as Record<
          string,
          string | number
        >;
        const { signature, lang: _lang, ...fields } = body;
        const expected = Object.entries({ accessKey: 'access', ...fields })
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, value]) => `${key}=${value}`)
          .join('&');
        expect(signature).toBe(
          createHmac('sha256', 'secret').update(expected).digest('hex'),
        );
        expect(typeof url).toBe('string');
        expect(url as string).toMatch(/^https:\/\/test-payment\.momo\.vn\//);
        if ((url as string).endsWith('/query') && !query)
          return new Response(
            JSON.stringify({
              partnerCode: 'TEST',
              orderId: order.id,
              requestId: refund.id + '-o',
              resultCode: 0,
              transId: 12345,
              amount: 49000,
              refundTrans: [],
            }),
          );
        return new Response(
          JSON.stringify({
            partnerCode: 'TEST',
            orderId: refund.id,
            requestId: query ? refund.id + '-q' : refund.id,
            amount: 49000,
            ...final,
          }),
        );
      });
  }
  afterEach(() => vi.restoreAllMocks());
  it('signs a full refund with the same provider idempotency key on retry', async () => {
    const fetch = mockFetch({ resultCode: 0, transId: 98765 });
    expect(await service.create(order, refund)).toMatchObject({
      status: 'COMPLETED',
      reference: '98765',
    });
    await service.create(order, refund);
    expect(JSON.parse(fetch.mock.calls[1][1]?.body as string).requestId).toBe(
      refund.id,
    );
    expect(JSON.parse(fetch.mock.calls[3][1]?.body as string).requestId).toBe(
      refund.id,
    );
  });
  it('keeps a provider-pending result processing', async () => {
    mockFetch({ resultCode: 7002 });
    expect((await service.create(order, refund)).status).toBe('PROCESSING');
  });
  it('does not equate successful query transport with confirmed refund', async () => {
    mockFetch({ resultCode: 0, refundTrans: [] }, true);
    expect((await service.query(order, refund)).status).toBe('PROCESSING');
  });
  it('requires matching refund id and exact amount for query completion', async () => {
    mockFetch(
      {
        resultCode: 0,
        refundTrans: [
          { orderId: refund.id, amount: 49000, transId: 98765, resultCode: 0 },
        ],
      },
      true,
    );
    expect(await service.query(order, refund)).toMatchObject({
      status: 'COMPLETED',
      reference: '98765',
    });
  });
  it('keeps uncertain network results processing without returning sensitive error text', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new Error('secret credential leak'),
    );
    const result = await service.create(order, refund);
    expect(result.status).toBe('PROCESSING');
    expect(result.message).not.toContain('secret');
  });
  it('does not refund an original transaction already refunded externally', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            partnerCode: 'TEST',
            orderId: order.id,
            requestId: refund.id + '-o',
            resultCode: 0,
            transId: 12345,
            amount: 49000,
            refundTrans: [
              {
                orderId: 'external',
                amount: 49000,
                transId: 98765,
                resultCode: 0,
              },
            ],
          }),
        ),
      );
    expect((await service.create(order, refund)).status).toBe('COMPLETED');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
