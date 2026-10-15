import { listingWeek } from './listing-quota.service.js';

describe('listingWeek (Vietnam)', () => {
  it.each([
    [
      '2026-10-11T16:59:59.999Z',
      '2026-10-04T17:00:00.000Z',
      '2026-10-11T17:00:00.000Z',
    ],
    [
      '2026-10-11T17:00:00.000Z',
      '2026-10-11T17:00:00.000Z',
      '2026-10-18T17:00:00.000Z',
    ],
    [
      '2026-10-15T12:00:00.000Z',
      '2026-10-11T17:00:00.000Z',
      '2026-10-18T17:00:00.000Z',
    ],
    [
      '2026-12-31T20:00:00.000Z',
      '2026-12-27T17:00:00.000Z',
      '2027-01-03T17:00:00.000Z',
    ],
  ])('maps %s to the correct Monday boundary', (input, start, end) => {
    const now = new Date(input);
    const { startsAt, resetsAt } = listingWeek(now);
    expect(startsAt.toISOString()).toBe(start);
    expect(resetsAt.toISOString()).toBe(end);
    expect(now.toISOString()).toBe(input);
  });
});
