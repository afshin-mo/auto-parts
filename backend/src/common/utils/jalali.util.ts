import * as jalaali from 'jalaali-js';

/** تاریخ شمسی (سال، ماه، روز) یک Date میلادی */
export function toJalali(date: Date) {
    const { jy, jm, jd } = jalaali.toJalaali(date);
    return { jy, jm, jd };
}

/** پیشوند سال-ماه شمسی مثل 1405-07 برای شماره فاکتور */
export function jalaliYearMonth(date = new Date()): string {
    const { jy, jm } = toJalali(date);
    return `${jy}-${String(jm).padStart(2, '0')}`;
}

/** شروع ماه شمسی به صورت Date میلادی (۰۰:۰۰ به وقت سرور) */
export function jalaliMonthStart(date = new Date()): Date {
    const { jy, jm } = toJalali(date);
    const { gy, gm, gd } = jalaali.toGregorian(jy, jm, 1);
    return new Date(gy, gm - 1, gd);
}

export function startOfDay(date = new Date()): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

export const JALALI_MONTHS = [
    'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
    'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
];
