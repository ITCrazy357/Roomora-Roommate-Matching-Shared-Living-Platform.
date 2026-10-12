import {
  REFUND_WINDOW_MS,
  refundDeadline,
  withinRefundWindow,
} from './refund-rules.service.js';

describe('Refund deadline from confirmed payment time', () => {
  const paid = new Date('2026-10-12T03:00:00.000Z');
  it('accepts exactly 24 hours and rejects one millisecond later', () => {
    expect(
      withinRefundWindow(paid, new Date(paid.getTime() + REFUND_WINDOW_MS)),
    ).toBe(true);
    expect(
      withinRefundWindow(paid, new Date(paid.getTime() + REFUND_WINDOW_MS + 1)),
    ).toBe(false);
    expect(
      withinRefundWindow(paid, new Date(paid.getTime() + REFUND_WINDOW_MS - 1)),
    ).toBe(true);
  });
  it('uses absolute time irrespective of timezone notation', () => {
    expect(
      withinRefundWindow(
        new Date('2026-10-12T10:00:00+07:00'),
        new Date('2026-10-13T10:00:00+07:00'),
      ),
    ).toBe(true);
    expect(refundDeadline(paid)?.toISOString()).toBe(
      '2026-10-13T03:00:00.000Z',
    );
  });
  it('rejects missing/future payment timestamps', () => {
    expect(withinRefundWindow(null, paid)).toBe(false);
    expect(withinRefundWindow(paid, new Date(paid.getTime() - 1))).toBe(false);
    expect(refundDeadline(null)).toBeNull();
  });
});
