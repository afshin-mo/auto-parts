import type { PrismaClient } from '@prisma/client';
import { tenantContext } from '../../common/tenant-context';

/** نقش دیتابیسی که سیاست‌های RLS آن همه‌ی ردیف‌ها را می‌دهد (prisma/sql/002_rls.sql) */
const SYSTEM_ROLE = 'auto_parts_system';

/**
 * زمینه‌ی فروشگاه را فقط تا پایان همین تراکنش روی اتصال می‌گذارد (set_config با local=true)،
 * پس با pool مشترک اتصال‌ها به فروشگاه دیگر نشت نمی‌کند.
 */
function setContext(db: Pick<PrismaClient, '$queryRaw'>, rls: boolean) {
    const s = tenantContext.get();
    const system = !!s?.system;
    return db.$queryRaw`SELECT set_config('app.tenant_id', ${system ? '' : (s?.tenantId ?? '')}, true),
        set_config('app.is_super', ${s?.isSuper ? 'on' : ''}, true),
        set_config('role', ${system && rls ? SYSTEM_ROLE : 'none'}, true)`;
}

/**
 * هر کوئری تکی در یک تراکنش کوچک (زمینه + کوئری) اجرا می‌شود؛ تراکنش‌های تعاملی (`$transaction(async tx => …)`)
 * زمینه را یک بار در ابتدا می‌گیرند و `tx` همان کلاینت خام است، پس کوئری‌هایش تراکنش تو در تو نمی‌سازند.
 * shortcut: شکل آرایه‌ای `$transaction([...])` پشتیبانی نمی‌شود؛ هزینه: ۴ رفت‌وبرگشت به‌جای ۱ برای هر کوئری تکی.
 */
export interface TenantPrismaOptions {
    /** false: `002_rls.sql` روی این دیتابیس اجرا نشده و نقش `auto_parts_system` وجود ندارد؛ پس نقش را عوض نمی‌کنیم (فقط فیلترهای سطح برنامه) */
    rls?: boolean;
}

export function createTenantPrisma<T extends PrismaClient>(base: T, { rls = true }: TenantPrismaOptions = {}): T {
    const extended = base.$extends({
        query: {
            async $allOperations({ args, query }) {
                const [, result] = await base.$transaction([setContext(base, rls), query(args)]);
                return result;
            },
        },
    });

    return new Proxy(extended, {
        get(target, prop) {
            if (prop === '$transaction') {
                return (fn: (tx: unknown) => Promise<unknown>, options?: object) => {
                    if (typeof fn !== 'function') throw new Error('$transaction با آرایه پشتیبانی نمی‌شود؛ از شکل تابعی استفاده کنید');
                    return base.$transaction(async (tx) => {
                        await setContext(tx, rls);
                        return await fn(tx); // await داخل تراکنش: PrismaPromiseِ تنبل نباید بعد از بسته‌شدن آن اجرا شود (P2028)
                    }, options);
                };
            }
            return Reflect.get(target, prop, target);
        },
    }) as unknown as T;
}
