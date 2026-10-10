import { BadRequestException } from '@nestjs/common';
import { dateOnly } from './household-access.service.js';

export function monthlyDate(year: number, month: number, day: number) {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay)));
}
export function nextMonthlyDate(previous: Date, day: number) {
  return monthlyDate(
    previous.getUTCFullYear(),
    previous.getUTCMonth() + 1,
    day,
  );
}
export function firstMonthlyDate(firstOn: string, day: number) {
  const date = dateOnly(firstOn),
    expected = monthlyDate(date.getUTCFullYear(), date.getUTCMonth(), day);
  if (date.getTime() !== expected.getTime())
    throw new BadRequestException({ code: 'RECURRING_DATE_INVALID' });
  return date;
}
