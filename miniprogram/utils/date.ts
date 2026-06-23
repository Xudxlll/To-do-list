import { CalendarDay } from '../types/diary';

const LUNAR_INFO = [
  0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2,
  0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977,
  0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970,
  0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950,
  0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557,
  0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5d0, 0x14573, 0x052d0, 0x0a9a8, 0x0e950, 0x06aa0,
  0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0,
  0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b6a0, 0x195a6,
  0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570,
  0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x055c0, 0x0ab60, 0x096d5, 0x092e0,
  0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5,
  0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930,
  0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530,
  0x05aa0, 0x076a3, 0x096d0, 0x04bd7, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45,
  0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0,
  0x14b63,
];

const LUNAR_MONTH_NAMES = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];
const LUNAR_DAY_NAMES = [
  '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十',
];

const LEGAL_HOLIDAYS_2026: Record<string, string> = {
  '2026-01-01': '元旦',
  '2026-01-02': '元旦假期',
  '2026-01-03': '元旦假期',
  '2026-02-15': '春节假期',
  '2026-02-16': '除夕',
  '2026-02-17': '春节',
  '2026-02-18': '春节假期',
  '2026-02-19': '春节假期',
  '2026-02-20': '春节假期',
  '2026-02-21': '春节假期',
  '2026-02-22': '春节假期',
  '2026-02-23': '春节假期',
  '2026-04-04': '清明节',
  '2026-04-05': '清明假期',
  '2026-04-06': '清明假期',
  '2026-05-01': '劳动节',
  '2026-05-02': '劳动节假期',
  '2026-05-03': '劳动节假期',
  '2026-05-04': '劳动节假期',
  '2026-05-05': '劳动节假期',
  '2026-06-19': '端午节',
  '2026-06-20': '端午假期',
  '2026-06-21': '端午假期',
  '2026-09-25': '中秋节',
  '2026-09-26': '中秋假期',
  '2026-09-27': '中秋假期',
  '2026-10-01': '国庆节',
  '2026-10-02': '国庆假期',
  '2026-10-03': '国庆假期',
  '2026-10-04': '国庆假期',
  '2026-10-05': '国庆假期',
  '2026-10-06': '国庆假期',
  '2026-10-07': '国庆假期',
};

export const MIN_DIARY_DATE = '1900-01-31';
export const MAX_DIARY_DATE = '2049-12-31';

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

export function isValidDateString(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = parseDate(date);
  return formatDate(parsed) === date;
}

export function isSupportedDiaryDate(date: string): boolean {
  return isValidDateString(date) && date >= MIN_DIARY_DATE && date <= MAX_DIARY_DATE;
}

export function isSupportedDiaryMonth(month: string): boolean {
  return /^\d{4}-\d{2}$/.test(month) && `${month}-01` >= `${MIN_DIARY_DATE.slice(0, 7)}-01` && `${month}-01` <= `${MAX_DIARY_DATE.slice(0, 7)}-01`;
}

export function isFutureDate(date: string): boolean {
  return parseDate(date).getTime() > parseDate(todayString()).getTime();
}

export function monthKey(date: string): string {
  return date.slice(0, 7);
}

export function formatMonthTitle(date: string): string {
  const d = parseDate(`${monthKey(date)}-01`);
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
}

export function shiftMonth(date: string, delta: number): string {
  const d = parseDate(`${monthKey(date)}-01`);
  d.setMonth(d.getMonth() + delta);
  return formatDate(d);
}

export function canShiftDiaryMonth(date: string, delta: number): boolean {
  return isSupportedDiaryMonth(monthKey(shiftMonth(date, delta)));
}

export function buildCalendarDays(monthDate: string, diaryDates: string[]): CalendarDay[] {
  const first = parseDate(`${monthKey(monthDate)}-01`);
  const year = first.getFullYear();
  const month = first.getMonth();
  const firstWeekday = first.getDay() === 0 ? 7 : first.getDay();
  const start = new Date(year, month, 2 - firstWeekday);
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

function lunarYearDays(year: number): number {
  let sum = 348;
  const info = LUNAR_INFO[year - 1900];
  for (let mask = 0x8000; mask > 0x8; mask >>= 1) {
    if (info & mask) sum += 1;
  }
  return sum + leapDays(year);
}

function leapMonth(year: number): number {
  return LUNAR_INFO[year - 1900] & 0xf;
}

function leapDays(year: number): number {
  const leap = leapMonth(year);
  if (!leap) return 0;
  return (LUNAR_INFO[year - 1900] & 0x10000) ? 30 : 29;
}

function monthDays(year: number, month: number): number {
  return (LUNAR_INFO[year - 1900] & (0x10000 >> month)) ? 30 : 29;
}

export function formatLunarDate(date: string): string {
  if (!isSupportedDiaryDate(date)) return '';
  const target = parseDate(date);
  const base = new Date(1900, 0, 31);
  let offset = Math.floor((target.getTime() - base.getTime()) / 86400000);
  let year = 1900;
  let daysOfYear = 0;

  while (year < 2050) {
    daysOfYear = lunarYearDays(year);
    if (offset < daysOfYear) break;
    offset -= daysOfYear;
    year += 1;
  }

  const leap = leapMonth(year);
  let isLeap = false;
  let month = 1;
  let daysOfMonth = 0;
  while (month <= 12) {
    if (leap > 0 && month === leap + 1 && !isLeap) {
      month -= 1;
      isLeap = true;
      daysOfMonth = leapDays(year);
    } else {
      daysOfMonth = monthDays(year, month);
    }

    if (offset < daysOfMonth) break;
    offset -= daysOfMonth;

    if (isLeap && month === leap) {
      isLeap = false;
    }
    month += 1;
  }

  const monthName = `${isLeap ? '闰' : ''}${LUNAR_MONTH_NAMES[month - 1]}月`;
  return `${monthName}${LUNAR_DAY_NAMES[offset]}`;
}

export function getLegalHolidayName(date: string): string {
  return LEGAL_HOLIDAYS_2026[date] || '';
}

export function formatDiaryDateLabel(date: string): string {
  const lunar = formatLunarDate(date);
  const parts = lunar ? [date, `农历${lunar}`] : [date];
  const holiday = getLegalHolidayName(date);
  if (holiday) parts.push(holiday);
  return parts.join(' ');
}
