import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';

/**
 * فروشگاهِ جاری درخواست؛ PrismaService آن را در هر تراکنش به Postgres می‌دهد (`app.tenant_id`) تا سیاست‌های RLS
 * فقط ردیف‌های همین فروشگاه را بدهند. بدون زمینه (یا خارج از درخواست) هیچ ردیفی دیده نمی‌شود.
 */
export interface TenantStore {
    tenantId?: string;
    /** مدیر سیستم: فقط برای نوشتن داده‌ی پایه‌ی سیستمی (tenant_id = null) */
    isSuper?: boolean;
    /** کارهای پیش از شناخته‌شدن فروشگاه (ورود، ثبت‌نام، لینک پرداخت عمومی): با نقش `auto_parts_system` */
    system?: boolean;
}

const als = new AsyncLocalStorage<TenantStore>();

/**
 * کوئری Prisma تنبل است و هنگام `.then` اجرا می‌شود؛ پس `.then` را همین‌جا، داخل محدوده‌ی `run`، صدا می‌زنیم
 * (وگرنه `await` بیرونی کوئری را بدون زمینه اجرا می‌کند).
 */
const run = <T>(store: TenantStore, fn: () => Promise<T>): Promise<T> => als.run(store, () => fn().then((v) => v));

export const tenantContext = {
    get: () => als.getStore(),
    /** میان‌افزار: برای هر درخواست یک store خالی می‌سازد؛ TenantGuard پس از احراز هویت آن را پر می‌کند */
    middleware: (_req: Request, _res: Response, next: NextFunction) => als.run({}, next),
    /** فقط وقتی store درخواست وجود دارد کار می‌کند؛ در غیر این صورت امن می‌ماند (هیچ دسترسی‌ای) */
    set(tenantId: string, isSuper = false) {
        const s = als.getStore();
        if (s) Object.assign(s, { tenantId, isSuper });
    },
    /** اجرای کد با دسترسی سراسری؛ فقط جایی که فروشگاه هنوز مشخص نیست و کد خودش tenantId را صریح فیلتر می‌کند */
    asSystem: <T>(fn: () => Promise<T>) => run({ system: true }, fn),
    /** اجرای کد برای یک فروشگاه مشخص، خارج از درخواست (اسکریپت، تست، کار پس‌زمینه) */
    asTenant: <T>(tenantId: string, fn: () => Promise<T>) => run({ tenantId }, fn),
};
