import { firstMonthlyDate, nextMonthlyDate } from './recurring-dates.js';
import { csvCell } from './house-reports.service.js';

describe('Monthly dates and spreadsheet cells', () => {
  it('clamps day 31 in February and restores it in March', () => {
    const february = nextMonthlyDate(new Date('2026-01-31T00:00:00Z'), 31);
    expect(february.toISOString().slice(0, 10)).toBe('2026-02-28');
    expect(nextMonthlyDate(february, 31).toISOString().slice(0, 10)).toBe(
      '2026-03-31',
    );
  });
  it('handles leap years and year boundaries', () => {
    expect(
      nextMonthlyDate(new Date('2028-01-31T00:00:00Z'), 31)
        .toISOString()
        .slice(0, 10),
    ).toBe('2028-02-29');
    expect(
      nextMonthlyDate(new Date('2026-12-31T00:00:00Z'), 31)
        .toISOString()
        .slice(0, 10),
    ).toBe('2027-01-31');
  });
  it('rejects inconsistent first dates', () => {
    expect(() => firstMonthlyDate('2026-10-10', 5)).toThrow();
    expect(firstMonthlyDate('2026-02-28', 31).getUTCDate()).toBe(28);
  });
  it('escapes formulas, quotes and multiline text without corrupting numeric amounts', () => {
    expect(csvCell(' =HYPERLINK("url")')).toBe('"\' =HYPERLINK(""url"")"');
    expect(csvCell('@SUM(1,2)')).toBe('"\'@SUM(1,2)"');
    expect(csvCell('\t=1+1')).toBe('"\'\t=1+1"');
    expect(csvCell('Nước "uống"\n2 chai')).toBe('"Nước ""uống""\n2 chai"');
    expect(csvCell(-100)).toBe('"-100"');
  });
});
