import { UserRole } from '@prisma/client';

/**
 * کاتالوگ مجوزها (Permissions) — تنها منبع حقیقت برای دسترسی‌ها.
 *
 * هر مجوز با کلید «بخش.عملیات» نام‌گذاری می‌شود. نقش‌های سیستمی (مدیر، فروشنده، …) از روی ستون
 * «پیش‌فرض» همین جدول ساخته می‌شوند و فروشگاه‌ها می‌توانند نقش دلخواه با ترکیب دلخواه مجوز بسازند.
 * افزودن قابلیت جدید = افزودن یک ردیف این‌جا + `@Perm('کلید')` روی مسیر.
 *
 * حروف نقش‌ها: A=مدیر فروشگاه  M=مدیر  S=فروشنده  C=حسابدار  W=انباردار
 */
export interface PermissionDef { key: string; label: string; group: string; roles: string }

const G = (group: string, rows: [string, string, string][]): PermissionDef[] =>
    rows.map(([key, label, roles]) => ({ key, label, group, roles }));

export const PERMISSIONS: PermissionDef[] = [
    ...G('میز کار', [
        ['dashboard.view', 'مشاهده‌ی میز کار و آمار', 'AMSCW'],
    ]),
    ...G('کالاها', [
        ['products.view', 'مشاهده و جستجوی کالا', 'AMSCW'],
        ['products.viewCost', 'مشاهده‌ی قیمت خرید و سود', 'AMCW'],
        ['products.create', 'ثبت کالای جدید', 'AMW'],
        ['products.edit', 'ویرایش کالا، سازگاری و جایگزین‌ها', 'AMW'],
        ['products.delete', 'حذف کالا', 'AM'],
        ['products.import', 'ورود گروهی کالا از فایل', 'AMW'],
        ['products.export', 'خروجی گرفتن از کالاها', 'AMCW'],
        ['catalog.manage', 'مدیریت برند، دسته و خودروها', 'AM'],
    ]),
    ...G('مشتریان و تأمین‌کنندگان', [
        ['parties.view', 'مشاهده‌ی طرف‌حساب‌ها و صورت‌حساب', 'AMSCW'],
        ['parties.create', 'ثبت طرف‌حساب جدید', 'AMSC'],
        ['parties.edit', 'ویرایش طرف‌حساب', 'AMC'],
        ['parties.delete', 'حذف طرف‌حساب', 'A'],
    ]),
    ...G('فروش', [
        ['sales.view', 'مشاهده‌ی فاکتورهای فروش', 'AMSCW'],
        ['sales.create', 'صدور فاکتور فروش', 'AMS'],
        ['sales.receive', 'ثبت دریافت روی فاکتور', 'AMSC'],
        ['sales.cancel', 'لغو فاکتور فروش', 'AM'],
        ['proformas.view', 'مشاهده‌ی پیش‌فاکتورها', 'AMSCW'],
        ['proformas.manage', 'صدور، تبدیل و ابطال پیش‌فاکتور', 'AMS'],
        ['returns.view', 'مشاهده‌ی برگشتی‌ها', 'AMSCW'],
        ['returns.create', 'ثبت فاکتور برگشتی', 'AM'],
    ]),
    ...G('خرید', [
        ['purchases.view', 'مشاهده‌ی فاکتورهای خرید', 'AMCW'],
        ['purchases.create', 'ثبت فاکتور خرید', 'AMCW'],
        ['purchases.pay', 'ثبت پرداخت به تأمین‌کننده', 'AMC'],
        ['purchases.cancel', 'لغو فاکتور خرید', 'AM'],
    ]),
    ...G('انبار', [
        ['inventory.view', 'مشاهده‌ی موجودی و گردش انبار', 'AMSCW'],
        ['inventory.adjust', 'اصلاح موجودی', 'AMW'],
        ['inventory.transfer', 'انتقال بین انبارها', 'AMW'],
        ['inventory.count', 'انبارگردانی', 'AMW'],
        ['inventory.value', 'مشاهده‌ی ارزش ریالی موجودی', 'AMC'],
        ['warehouses.manage', 'ساخت و ویرایش انبار', 'AM'],
        ['warehouses.delete', 'حذف انبار', 'A'],
    ]),
    ...G('حسابداری', [
        ['payments.view', 'مشاهده‌ی دریافت و پرداخت‌ها', 'AMSC'],
        ['payments.create', 'ثبت دریافت و پرداخت', 'AMSC'],
        ['checks.view', 'مشاهده‌ی چک‌ها', 'AMC'],
        ['checks.manage', 'ثبت و تعیین وضعیت چک', 'AMC'],
        ['expenses.view', 'مشاهده‌ی هزینه‌ها', 'AMC'],
        ['expenses.manage', 'ثبت و حذف هزینه', 'AMC'],
        ['withdrawals.view', 'مشاهده‌ی برداشت‌ها از حساب فروشگاه', 'AM'],
        ['withdrawals.manage', 'ثبت و حذف برداشت از حساب فروشگاه', 'AM'],
    ]),
    ...G('گزارش‌ها', [
        ['reports.sales', 'گزارش فروش', 'AMC'],
        ['reports.products', 'گزارش پرفروش، کم‌فروش و کم‌گردش', 'AMC'],
        ['reports.profit', 'گزارش سود و زیان', 'AMC'],
        ['reports.debts', 'گزارش بدهکاران و بستانکاران', 'AMC'],
    ]),
    ...G('مدیریت', [
        ['users.view', 'مشاهده‌ی کاربران', 'AM'],
        ['users.manage', 'ساخت و ویرایش کاربران', 'A'],
        ['roles.manage', 'مدیریت نقش‌ها و دسترسی‌ها', 'A'],
        ['branches.manage', 'مدیریت شعبه‌ها', 'A'],
        ['settings.manage', 'تنظیمات فروشگاه', 'A'],
        ['audit.view', 'مشاهده‌ی گزارش فعالیت کاربران', 'A'],
        ['data.import', 'انتقال داده از نرم‌افزار قبلی', 'AM'],
    ]),
    ...G('اتصال‌ها', [
        ['moodian.use', 'ارسال فاکتور به سامانه مودیان', 'AMC'],
        ['moodian.settings', 'تنظیمات سامانه مودیان', 'A'],
        ['sms.use', 'ارسال پیامک فاکتور', 'AMSC'],
        ['sms.remind', 'یادآوری بدهی و گزارش پیامک', 'AMC'],
        ['sms.settings', 'تنظیمات پیامک', 'A'],
        ['gateway.use', 'ساخت لینک پرداخت آنلاین', 'AMSC'],
        ['gateway.settings', 'تنظیمات درگاه پرداخت', 'A'],
    ]),
];

export const ALL_PERMISSION_KEYS: string[] = PERMISSIONS.map((p) => p.key);
const KEY_SET = new Set(ALL_PERMISSION_KEYS);
export const isValidPermission = (k: string) => KEY_SET.has(k);

const LETTER: Record<string, UserRole> = { A: 'TENANT_ADMIN', M: 'MANAGER', S: 'SALESMAN', C: 'ACCOUNTANT', W: 'WAREHOUSE' };

/** مجوزهای پیش‌فرض هر نقش سیستمی */
export function systemRolePermissions(role: UserRole | string): string[] {
    if (role === 'SUPER_ADMIN' || role === 'TENANT_ADMIN') return [...ALL_PERMISSION_KEYS];
    return PERMISSIONS.filter((p) => [...p.roles].some((l) => LETTER[l] === role)).map((p) => p.key);
}

/** مجوزهای مؤثر کاربر: نقش دلخواه (اگر داشته باشد) وگرنه پیش‌فرض نقش سیستمی */
export function effectivePermissions(role: string, customPermissions?: string[] | null): string[] {
    if (role === 'SUPER_ADMIN') return [...ALL_PERMISSION_KEYS];
    if (customPermissions) return customPermissions.filter(isValidPermission);
    return systemRolePermissions(role);
}
