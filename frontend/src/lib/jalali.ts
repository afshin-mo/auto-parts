import * as jalaali from 'jalaali-js';

export const MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
/** هفته از شنبه شروع می‌شود */
export const WEEKDAYS_SHORT = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];
export const WEEKDAYS = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];

export interface JDate { jy: number; jm: number; jd: number }

export const pad = (n: number) => String(n).padStart(2, '0');

/** تاریخ محلی از رشته‌ی YYYY-MM-DD یا ISO کامل، بدون اثر منطقه زمانی */
export function parseISODate(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  return new Date(s);
}

export function isoToJ(iso: string | Date): JDate {
  const d = typeof iso === 'string' ? parseISODate(iso) : iso;
  const { jy, jm, jd } = jalaali.toJalaali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return { jy, jm, jd };
}

export function jToISO({ jy, jm, jd }: JDate): string {
  const g = jalaali.toGregorian(jy, jm, jd);
  return `${g.gy}-${pad(g.gm)}-${pad(g.gd)}`;
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDaysISO(iso: string, days: number): string {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const jMonthLength = (jy: number, jm: number) => jalaali.jalaaliMonthLength(jy, jm);

/** روز هفته: ۰ = شنبه ... ۶ = جمعه */
export function weekdayIndex(iso: string | Date): number {
  const d = typeof iso === 'string' ? parseISODate(iso) : iso;
  return (d.getDay() + 1) % 7;
}

export function jMonthStartWeekday({ jy, jm }: { jy: number; jm: number }): number {
  return weekdayIndex(jToISO({ jy, jm, jd: 1 }));
}

/** اول ماه شمسی جاری به صورت ISO میلادی */
export function currentMonthStartISO(): string {
  const { jy, jm } = isoToJ(todayISO());
  return jToISO({ jy, jm, jd: 1 });
}
export function currentYearStartISO(): string {
  const { jy } = isoToJ(todayISO());
  return jToISO({ jy, jm: 1, jd: 1 });
}
