const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** تبدیل ارقام فارسی و عربی به لاتین */
export function normalizeDigits(input: string): string {
    return input
        .replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)))
        .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)));
}

/** نرمال‌سازی شماره موبایل ایران به قالب 09xxxxxxxxx */
export function normalizePhone(input: unknown): unknown {
    if (typeof input !== 'string') return input;
    let v = normalizeDigits(input).replace(/[\s\-()]/g, '');
    if (v.startsWith('+98')) v = '0' + v.slice(3);
    else if (v.startsWith('0098')) v = '0' + v.slice(4);
    else if (v.startsWith('98') && v.length === 12) v = '0' + v.slice(2);
    else if (v.startsWith('9') && v.length === 10) v = '0' + v;
    return v;
}

export const IR_MOBILE_REGEX = /^09\d{9}$/;
