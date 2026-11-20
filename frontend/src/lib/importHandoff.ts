/**
 * فایلی که در یک دیالوگ انتخاب شده و باید در ویزارد ورود ادامه پیدا کند (بدون اینکه کاربر دوباره فایل را انتخاب کند).
 * فقط در حافظه‌ی همین صفحه می‌ماند و با اولین برداشتن پاک می‌شود.
 */
let pending: File | null = null;
export const handoffFile = (f: File) => { pending = f; };
export const takeHandoff = (): File | null => { const f = pending; pending = null; return f; };
