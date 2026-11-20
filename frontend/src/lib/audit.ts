/** برچسب فارسی عملیات ثبت‌شده در گزارش فعالیت */
const RULES: [RegExp, string][] = [
  [/^POST \/sales\/:id\/cancel/, 'لغو فاکتور فروش'], [/^POST \/sales\/:id\/payments/, 'ثبت دریافت برای فاکتور'], [/^POST \/sales$/, 'صدور فاکتور فروش'],
  [/^POST \/purchases\/:id\/cancel/, 'لغو فاکتور خرید'], [/^POST \/purchases\/:id\/payments/, 'ثبت پرداخت برای فاکتور خرید'], [/^POST \/purchases$/, 'ثبت فاکتور خرید'],
  [/^POST \/returns/, 'ثبت فاکتور برگشتی'], [/^POST \/proformas\/:id\/convert/, 'تبدیل پیش‌فاکتور به فاکتور'], [/^POST \/proformas\/:id\/cancel/, 'ابطال پیش‌فاکتور'], [/^POST \/proformas/, 'صدور پیش‌فاکتور'],
  [/^POST \/payments/, 'ثبت دریافت/پرداخت'], [/^POST \/checks\/:id\/cash/, 'وصول چک'], [/^POST \/checks\/:id\/bounce/, 'برگشت چک'], [/^POST \/checks\/:id\/cancel/, 'ابطال چک'], [/^POST \/checks/, 'ثبت چک'],
  [/^POST \/products\/import/, 'ورود گروهی کالا'], [/^POST \/products\/:id\/vehicles/, 'افزودن خودروی سازگار'], [/^DELETE \/products\/:id\/vehicles/, 'حذف خودروی سازگار'],
  [/^POST \/products\/:id\/substitutes/, 'افزودن کالای جایگزین'], [/^POST \/products/, 'ایجاد کالا'], [/^PATCH \/products/, 'ویرایش کالا'], [/^DELETE \/products/, 'حذف کالا'],
  [/^POST \/inventory\/adjust/, 'اصلاح موجودی'], [/^POST \/inventory\/transfer/, 'انتقال بین انبارها'], [/^POST \/inventory\/stock-count/, 'انبارگردانی'],
  [/^POST \/parties/, 'ایجاد طرف‌حساب'], [/^PATCH \/parties/, 'ویرایش طرف‌حساب'], [/^DELETE \/parties/, 'حذف طرف‌حساب'],
  [/^POST \/expenses/, 'ثبت هزینه'], [/^DELETE \/expenses/, 'حذف هزینه'],
  [/^POST \/users\/:id\/reset-password/, 'بازنشانی رمز کاربر'], [/^POST \/users/, 'ایجاد کاربر'], [/^PATCH \/users/, 'ویرایش کاربر'],
  [/^PATCH \/tenants/, 'ویرایش مشخصات فروشگاه'], [/^POST \/auth\/change-password/, 'تغییر رمز عبور'],
  [/^(POST|PATCH|DELETE) \/(brands|categories|units|vehicles|warehouses)/, 'تغییر اطلاعات پایه'],
];
export function auditLabel(action: string): string {
  // بکند مسیر کامل را ثبت می‌کند (/api/v1/sales/...)؛ پیشوند را برمی‌داریم
  const a = action.replace(/ \/api\/v\d+(?=\/|$)/, ' ').replace(/ +/g, ' ').replace(/ \/$/, '');
  return RULES.find(([re]) => re.test(a))?.[1] ?? action;
}
