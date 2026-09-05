/**
 * Overtime pay rules.
 *
 * Hourly rate is derived from the BASIC component of pay (not the full gross),
 * which is the usual statutory base. Weekend hours earn a higher multiplier
 * than weekday hours.
 */

/** A standard working day. */
export const STANDARD_DAY_HOURS = 8;
/** Typical paid working days in a month, used to derive the hourly rate. */
export const WORKING_DAYS_PER_MONTH = 22;
/** Basic is 50% of contract wage — matches the seeded "Regular Salary" structure. */
export const BASIC_PERCENT_OF_WAGE = 0.5;

export const OVERTIME_MULTIPLIER = {
  weekday: 1.5,
  weekend: 2,
} as const;

export interface OvertimeQuote {
  hours: number;
  isWeekend: boolean;
  hourlyRate: number;
  multiplier: number;
  amount: number;
}

/** Saturday or Sunday. */
export function isWeekendDate(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

/**
 * What a stretch of approved overtime is worth.
 *
 * @param monthlyWage the contract wage for the period
 * @param hours       overtime hours beyond the standard day
 * @param isWeekend   whether the day was a Saturday or Sunday
 * @param basicAmount the payslip's BASIC line, when known — falls back to a
 *                    percentage of the wage so a quote can be shown before the
 *                    payslip exists
 */
export function quoteOvertime(
  monthlyWage: number,
  hours: number,
  isWeekend: boolean,
  basicAmount?: number,
): OvertimeQuote {
  const basic = basicAmount ?? monthlyWage * BASIC_PERCENT_OF_WAGE;
  const hourlyRate = basic / (WORKING_DAYS_PER_MONTH * STANDARD_DAY_HOURS);
  const multiplier = isWeekend ? OVERTIME_MULTIPLIER.weekend : OVERTIME_MULTIPLIER.weekday;
  const safeHours = Math.max(0, hours);

  return {
    hours: Math.round(safeHours * 100) / 100,
    isWeekend,
    hourlyRate: Math.round(hourlyRate * 100) / 100,
    multiplier,
    amount: Math.round(safeHours * hourlyRate * multiplier * 100) / 100,
  };
}
