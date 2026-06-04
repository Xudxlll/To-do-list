import { CalendarDay } from '../types/diary';

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function todayString(): string {
  return formatDate(new Date());
}

export function parseDate(date: string): Date {
  const parts = date.split('-').map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

export function isFutureDate(date: string): boolean {
  return parseDate(date).getTime() > parseDate(todayString()).getTime();
}

export function monthKey(date: string): string {
  return date.slice(0, 7);
}

export function shiftMonth(date: string, delta: number): string {
  const d = parseDate(`${monthKey(date)}-01`);
  d.setMonth(d.getMonth() + delta);
  return formatDate(d);
}

export function buildCalendarDays(monthDate: string, diaryDates: string[]): CalendarDay[] {
  const first = parseDate(`${monthKey(monthDate)}-01`);
  const year = first.getFullYear();
  const month = first.getMonth();
  const firstDay = first.getDay() === 0 ? 7 : first.getDay();
  const start = new Date(year, month, 2 - firstDay);
  const diarySet = diaryDates.reduce((acc, date) => {
    acc[date] = true;
    return acc;
  }, {} as Record<string, boolean>);
  const today = todayString();

  return Array.from({ length: 42 }).map((_, index) => {
    const d = new Date(start);
    d.setDate(start.getDate() + index);
    const date = formatDate(d);
    return {
      date,
      day: d.getDate(),
      inCurrentMonth: d.getMonth() === month,
      isToday: date === today,
      isFuture: isFutureDate(date),
      hasDiary: !!diarySet[date],
    };
  });
}
