/**
 * کش کوتاه‌مدت «کاربر احراز‌شده» برای JwtStrategy: هر درخواست یک کوئری (با RLS چهار رفت‌وبرگشت) برای کاربر/فروشگاه/شعبه‌ها می‌زد.
 * تغییر کاربر یا نقش در همین پروسه فوراً کش را پاک می‌کند؛ در پروسه‌ی دیگر (یا تغییر مستقیم در دیتابیس، مثل وضعیت اشتراک)
 * حداکثر به‌اندازه‌ی TTL دیر اعمال می‌شود. فقط نتیجه‌ی موفق کش می‌شود، پس کاربر غیرفعال هرگز از کش رد نمی‌شود.
 * shortcut: کش در حافظه‌ی هر پروسه است؛ برای چند instance با ابطال فوری، به Redis ببرید.
 */
const TTL_MS = 30_000;
const MAX_ENTRIES = 5_000;
const entries = new Map<string, { at: number; value: object }>();

export const authUserCache = {
    /** نسخه‌ی کپی‌شده برمی‌گردد تا گاردها با تغییر req.user روی درخواست‌های دیگر اثر نگذارند */
    get<T extends object>(userId: string): T | undefined {
        const hit = entries.get(userId);
        if (!hit) return undefined;
        if (Date.now() - hit.at > TTL_MS) { entries.delete(userId); return undefined; }
        return structuredClone(hit.value) as T;
    },
    set(userId: string, value: object) {
        if (entries.size >= MAX_ENTRIES) entries.clear();
        entries.set(userId, { at: Date.now(), value: structuredClone(value) });
    },
    /** بدون آرگومان: همه (مثلاً وقتی مجوزهای یک نقش عوض می‌شود) */
    clear(userId?: string) { userId ? entries.delete(userId) : entries.clear(); },
};
