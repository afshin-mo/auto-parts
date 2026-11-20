/**
 * شماره منحصر به فرد مالیاتی (۲۲ کاراکتر):
 *   شناسه یکتای حافظه (۶) + تاریخ به‌صورت hex (۵، روز از 1970) + سریال داخلی به‌صورت hex (۱۰) + رقم کنترل Verhoeff (۱)
 * رقم کنترل روی رشته‌ی عددی «شناسه حافظه (حروف = کد ASCII) + روز (۶ رقم) + سریال (۱۲ رقم)» محاسبه می‌شود.
 */
const MULT = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
    [5, 9, 8, 7, 6, 0, 4, 3, 2, 1], [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const PERM = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1], [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];
const INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

export function verhoeffChecksum(num: string): number {
    let c = 0;
    const len = num.length;
    for (let i = 0; i < len; i++) c = MULT[c][PERM[(i + 1) % 8][Number(num[len - i - 1])]];
    return INV[c];
}

export function verhoeffValidate(num: string): boolean {
    let c = 0;
    const len = num.length;
    for (let i = 0; i < len; i++) c = MULT[c][PERM[i % 8][Number(num[len - i - 1])]];
    return c === 0;
}

export const MEMORY_ID_REGEX = /^[A-Za-z0-9]{6}$/;

export function generateTaxId(memoryId: string, issuedAtMs: number, serial: number): string {
    if (!MEMORY_ID_REGEX.test(memoryId)) throw new Error('شناسه یکتای حافظه مالیاتی باید ۶ کاراکتر (حرف انگلیسی یا عدد) باشد');
    const id = memoryId.toUpperCase();
    const days = Math.floor(issuedAtMs / 86_400_000);
    const numericId = [...id].map((ch) => (/\d/.test(ch) ? ch : String(ch.charCodeAt(0)))).join('');
    const decimal = numericId + String(days).padStart(6, '0') + String(serial).padStart(12, '0');
    const check = verhoeffChecksum(decimal);
    return (id + days.toString(16).padStart(5, '0') + serial.toString(16).padStart(10, '0') + check).toUpperCase();
}

/** شماره صورتحساب (inno) = سریال داخلی به‌صورت hex ده‌رقمی */
export const hexSerial = (serial: number) => serial.toString(16).padStart(10, '0');
