export interface ScheduleLineLike {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  breakMinutes: number;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Weekly hours are DERIVED from the schedule lines, never typed in.
 *   hoursPerWeek = Σ((end − start) − break) / 60
 */
export function scheduleHoursPerWeek(lines: ScheduleLineLike[]): number {
  const minutes = lines.reduce((sum, line) => {
    const span = toMinutes(line.endTime) - toMinutes(line.startTime) - (line.breakMinutes || 0);
    return sum + Math.max(0, span);
  }, 0);
  return Math.round((minutes / 60) * 100) / 100;
}

export function scheduleDaysPerWeek(lines: ScheduleLineLike[]): number {
  return new Set(lines.map((l) => l.dayOfWeek)).size;
}

/** How many scheduled working days fall inside [from, to] inclusive. */
export function countWorkingDays(
  lines: ScheduleLineLike[],
  from: Date,
  to: Date,
): number {
  const workingDays = new Set(lines.map((l) => l.dayOfWeek));
  if (workingDays.size === 0) return 0;

  let count = 0;
  const cursor = new Date(from.getTime());
  while (cursor <= to) {
    // JS getDay(): 0 = Sunday. Our model: 0 = Monday.
    const day = (cursor.getDay() + 6) % 7;
    if (workingDays.has(day)) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}
