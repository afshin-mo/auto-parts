import { ForbiddenException, NotFoundException } from '@nestjs/common';

/**
 * داده‌های پایه (برند، دسته، خودرو، واحد) دو نوع‌اند:
 *  - سیستمی (tenantId = null): برای همه‌ی فروشگاه‌ها قابل مشاهده، فقط توسط SUPER_ADMIN قابل تغییر؛
 *  - اختصاصی (tenantId = شناسه‌ی فروشگاه): فقط همان فروشگاه می‌بیند و تغییر می‌دهد.
 */
export const catalogScope = (tenantId: string) => ({ OR: [{ tenantId: null }, { tenantId }] });

export const isSuper = (role?: string) => role === 'SUPER_ADMIN';

/** کدِ یکتای سراسری برای رکورد اختصاصی؛ رکورد سیستمی همان کد خام را می‌گیرد */
export function scopedCode(tenantId: string | null, raw: string, max = 50) {
    if (!tenantId) return raw;
    const prefix = `${tenantId.slice(0, 6)}:`;
    return `${prefix}${raw}`.slice(0, max);
}

/** بررسی مالکیت قبل از ویرایش/حذف؛ رکورد فروشگاه دیگر «پیدا نشد» است تا وجودش لو نرود */
export function assertOwnership<T extends { tenantId: string | null }>(row: T | null | undefined, tenantId: string, role: string | undefined, what: string): T {
    if (!row || (row.tenantId && row.tenantId !== tenantId)) throw new NotFoundException(`${what} پیدا نشد`);
    if (!row.tenantId && !isSuper(role)) throw new ForbiddenException(`${what} سیستمی است و فقط مدیر سیستم می‌تواند آن را تغییر دهد؛ برای نیاز خودتان یک مورد جدید بسازید`);
    return row;
}
