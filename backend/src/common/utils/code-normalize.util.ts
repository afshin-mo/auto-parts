const FA = '۰۱۲۳۴۵۶۷۸۹';
const AR = '٠١٢٣٤٥٦٧٨٩';

/**
 * شکل نرمال شماره‌ی فنی برای جستجو: ارقام فارسی/عربی → لاتین، حروف بزرگ، و حذف هر چیزی
 * جز حرف و عدد (فاصله، خط تیره، نقطه، اسلش…). «1109.AL» و «1109 al» و «1109-AL» یکی می‌شوند.
 */
export function normalizeCode(raw: string | null | undefined): string {
    if (!raw) return '';
    return String(raw)
        .replace(/[۰-۹]/g, (d) => String(FA.indexOf(d)))
        .replace(/[٠-٩]/g, (d) => String(AR.indexOf(d)))
        .replace(/ي/g, 'ی').replace(/ك/g, 'ک')
        .toUpperCase()
        .replace(/[^\p{L}\p{N}]/gu, '')
        .slice(0, 100);
}

/** متن نام برای جستجو: ی/ک عربی و ارقام یکسان می‌شوند */
export function normalizeText(raw: string): string {
    return raw
        .replace(/[۰-۹]/g, (d) => String(FA.indexOf(d)))
        .replace(/[٠-٩]/g, (d) => String(AR.indexOf(d)))
        .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک')
        .trim();
}

/**
 * نامی که ذخیره می‌شود: ي/ى/ك عربی → ی/ک فارسی و فاصله‌های تکراری حذف.
 * فایل‌های اکسل نرم‌افزارهای قدیمی حروف عربی دارند و بدون این کار «دیسک» با «ديسك» پیدا نمی‌شود.
 */
export function normalizeName(raw: string): string {
    return raw.replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/\s+/g, ' ').trim();
}
/** مثل normalizeName ولی بدون دست‌زدن به خط‌های جدید (توضیحات چندخطی) */
export function normalizeLetters(raw: string): string {
    return raw.replace(/[يى]/g, 'ی').replace(/ك/g, 'ک');
}
