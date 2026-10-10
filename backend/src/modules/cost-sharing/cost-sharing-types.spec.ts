import { sharingAmounts, sharingDeadline } from './cost-sharing-types.js';

describe('Financial allocation and monthly deadline', () => {
  it('allocates whole VND exactly, including zero percent and maximum amount', () => {
    for (const amount of [1, 2, 3, 1001, 2000000000]) {
      const weights = [
        { participantId: 'c', basisPoints: 3333 },
        { participantId: 'a', basisPoints: 3333 },
        { participantId: 'b', basisPoints: 3334 },
        { participantId: 'd', basisPoints: 0 },
      ];
      const rows = sharingAmounts(amount, 'WEIGHTED', weights);
      expect(rows.reduce((sum, row) => sum + row.amount, 0)).toBe(amount);
      expect(rows.find((row) => row.participantId === 'd')!.amount).toBe(0);
      expect(rows).toEqual(
        sharingAmounts(amount, 'WEIGHTED', [...weights].reverse()),
      );
      expect(
        rows.every((row) => Number.isInteger(row.amount) && row.amount >= 0),
      ).toBe(true);
    }
  });
  it('uses deterministic equal rounding and local end of day', () => {
    expect(
      sharingAmounts(5, 'EQUAL', [
        { participantId: 'b', basisPoints: 0 },
        { participantId: 'a', basisPoints: 0 },
      ]),
    ).toEqual([
      { participantId: 'a', amount: 3 },
      { participantId: 'b', amount: 2 },
    ]);
    expect(sharingDeadline('2026-02', 31).toISOString()).toBe(
      '2026-02-28T16:59:59.999Z',
    );
  });
});
