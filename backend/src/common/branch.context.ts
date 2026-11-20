import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * زمینه‌ی شعبه برای هر درخواست (توسط BranchGuard از روی کاربر و هدر x-branch-id ساخته می‌شود).
 * کلاس است (نه interface) تا در امضای متدهای دکوراتورشده مشکل متادیتا ایجاد نکند.
 */
export class BranchContext {
    /** شعبه‌ی فعال؛ null یعنی «همه‌ی شعبه‌های مجاز» (فقط برای مشاهده و گزارش) */
    activeId: string | null = null;
    /** شعبه‌هایی که کاربر اجازه‌ی کار با آن‌ها را دارد */
    allowedIds: string[] = [];
    /** کاربر به همه‌ی شعبه‌ها (و رکوردهای قدیمیِ بدون شعبه) دسترسی دارد */
    unrestricted = false;
}

/** شرط Prisma برای مدل‌هایی که ستون branchId دارند (فاکتور، پرداخت، هزینه، انبار) */
export function branchFilter(ctx: BranchContext): Record<string, any> {
    if (ctx.activeId) return { branchId: ctx.activeId };
    if (ctx.unrestricted) return { OR: [{ branchId: { in: ctx.allowedIds } }, { branchId: null }] };
    return { branchId: { in: ctx.allowedIds } };
}

/** معادل branchFilter برای SQL خام. `column` نام ثابتِ ستون است (هرگز ورودی کاربر)؛ مقدارها پارامتر می‌شوند */
export function branchSql(ctx: BranchContext, column: string): Prisma.Sql {
    const col = Prisma.raw(column);
    if (ctx.activeId) return Prisma.sql`${col} = ${ctx.activeId}`;
    if (ctx.unrestricted) return Prisma.sql`(${col} = ANY(${ctx.allowedIds}::text[]) OR ${col} IS NULL)`;
    return Prisma.sql`${col} = ANY(${ctx.allowedIds}::text[])`;
}

/** برای عملیات نوشتنی لازم است دقیقاً یک شعبه انتخاب شده باشد */
export function requireActiveBranch(ctx: BranchContext): string {
    if (!ctx.activeId) {
        throw new BadRequestException('برای این کار یک شعبه‌ی مشخص را انتخاب کنید (حالت «همه‌ی شعبه‌ها» فقط برای مشاهده است)');
    }
    return ctx.activeId;
}
