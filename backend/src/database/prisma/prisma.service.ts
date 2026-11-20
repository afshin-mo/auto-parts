import { Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { createTenantPrisma } from './tenant-prisma';

/** فقط نوع و توکن تزریق؛ نمونه‌ی واقعی را `createPrismaService` می‌سازد (کلاینت همراه با زمینه‌ی فروشگاه) */
export class PrismaService extends PrismaClient { }

/**
 * ready : `002_rls.sql` اجرا شده (نقش سیستمی هست و جدول tenants سیاست دارد)
 * bypass: کاربر فعلیِ اتصال سوپریوزر/BYPASSRLS یا مالک جدول‌هاست؛ Postgres برای چنین کاربری RLS را اصلاً اعمال نمی‌کند
 */
async function rlsStatus(prisma: PrismaClient) {
    const rows = await prisma.$queryRaw<{ ready: boolean; bypass: boolean; user: string }[]>`SELECT
        (EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'auto_parts_system')
         AND COALESCE((SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.tenants')), false)) AS ready,
        (COALESCE((SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname = current_user), false)
         OR COALESCE((SELECT tableowner = current_user FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenants'), false)) AS bypass,
        current_user::text AS "user"`;
    return { ready: rows[0]?.ready === true, bypass: rows[0]?.bypass === true, user: rows[0]?.user ?? '' };
}

export async function createPrismaService(config: ConfigService): Promise<PrismaService> {
    const raw = new PrismaClient({
        datasources: { db: { url: config.get<string>('database.url') } },
        log: config.get<string>('nodeEnv') === 'development' ? ['error', 'warn'] : ['error'],
    });
    await raw.$connect();
    const { ready, bypass, user } = await rlsStatus(raw);
    const log = new Logger('Prisma');
    if (!ready) log.warn('ایزوله‌سازی فروشگاه‌ها در دیتابیس (RLS) فعال نیست: prisma/sql/002_rls.sql را با کاربر مالک اجرا کنید (docs/UPGRADE-V2.md). تا آن موقع فقط فیلترهای سطح برنامه فعال است.');
    else if (bypass) log.warn(`کاربر دیتابیس «${user}» سوپریوزر یا مالک جدول‌هاست و RLS برای او اعمال نمی‌شود؛ DATABASE_URL برنامه را روی کاربر auto_parts_app بگذارید (docs/UPGRADE-V2.md).`);
    // برای کاربری که RLS را دور می‌زند نیازی به تغییر نقش نیست (و ممکن است اجازه‌اش را هم نداشته باشد)
    return createTenantPrisma(raw, { rls: ready && !bypass }) as PrismaService;
}
