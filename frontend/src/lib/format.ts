import { isoToJ, MONTHS, WEEKDAYS, weekdayIndex, pad, parseISODate } from './jalali';

const FA = '۰۱۲۳۴۵۶۷۸۹';
export const toFa = (v: string | number): string => String(v).replace(/\d/g, (d) => FA[+d]);
export const toEn = (s: string): string =>
  s.replace(/[۰-۹]/g, (d) => String(FA.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[٬,]/g, '');

export const CURRENCY = 'ریال';

export function fmtNum(n: number | string | null | undefined, digits = 0): string {
  if (n === null || n === undefined || n === '') return '—';
  const v = Number(n);
  if (Number.isNaN(v)) return '—';
  return toFa(v.toLocaleString('en-US', { maximumFractionDigits: digits })).replace(/,/g, '٬');
}
export const fmtMoney = (n: number | string | null | undefined) => (n === null || n === undefined ? '—' : `${fmtNum(n)}`);
export const fmtMoneyUnit = (n: number | string | null | undefined) => `${fmtMoney(n)} ${CURRENCY}`;

/** مبلغ کوتاه برای نمودار و کارت: ۱٫۲ میلیون */
export function fmtCompact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return `${toFa((n / 1e9).toFixed(1).replace(/\.0$/, '').replace('.', '٫'))} میلیارد`;
  if (a >= 1e6) return `${toFa((n / 1e6).toFixed(1).replace(/\.0$/, '').replace('.', '٫'))} میلیون`;
  if (a >= 1e3) return `${toFa((n / 1e3).toFixed(0))} هزار`;
  return toFa(n);
}

/** ۱۴۰۵/۰۷/۱۷ */
export function fmtDate(v?: string | Date | null): string {
  if (!v) return '—';
  const { jy, jm, jd } = isoToJ(typeof v === 'string' ? parseISODate(v) : v);
  return toFa(`${jy}/${pad(jm)}/${pad(jd)}`);
}
/** ۱۷ مهر ۱۴۰۵ */
export function fmtDateMid(v?: string | Date | null): string {
  if (!v) return '—';
  const { jy, jm, jd } = isoToJ(typeof v === 'string' ? parseISODate(v) : v);
  return `${toFa(jd)} ${MONTHS[jm - 1]} ${toFa(jy)}`;
}
/** جمعه ۱۷ مهر ۱۴۰۵ */
export function fmtDateLong(v?: string | Date | null): string {
  if (!v) return '—';
  const d = typeof v === 'string' ? parseISODate(v) : v;
  return `${WEEKDAYS[weekdayIndex(d)]} ${fmtDateMid(d)}`;
}
export function fmtTime(v?: string | Date | null): string {
  if (!v) return '';
  const d = typeof v === 'string' ? new Date(v) : v;
  return toFa(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
}
/** روزهای مانده تا تاریخ (منفی = گذشته) */
export function daysUntil(v: string | Date): number {
  const d = typeof v === 'string' ? new Date(v) : v;
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const t = new Date(); const b = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  return Math.round((a - b) / 86400000);
}
export const dateToISODay = (v: string | Date): string => {
  const d = typeof v === 'string' ? new Date(v) : v;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const INVOICE_STATUS: Record<string, { label: string; tone: string }> = {
  DRAFT: { label: 'پیش‌نویس', tone: 'gray' }, CONFIRMED: { label: 'تأییدشده', tone: 'blue' },
  PARTIALLY_PAID: { label: 'تسویه جزئی', tone: 'amber' }, PAID: { label: 'پرداخت‌شده', tone: 'green' },
  CANCELLED: { label: 'لغوشده', tone: 'red' }, SENT_TO_TAX_AUTHORITY: { label: 'ارسال‌شده به مودیان', tone: 'green' },
};
export const CHECK_STATUS: Record<string, { label: string; tone: string }> = {
  PENDING: { label: 'در انتظار', tone: 'amber' }, CASHED: { label: 'وصول‌شده', tone: 'green' },
  BOUNCED: { label: 'برگشتی', tone: 'red' }, CANCELLED: { label: 'ابطال', tone: 'gray' },
};
export const PAY_METHOD: Record<string, string> = { CASH: 'نقد', CARD: 'کارت‌خوان', TRANSFER: 'کارت‌به‌کارت / انتقال', CHECK: 'چک' };
export const ROLES: Record<string, string> = {
  SUPER_ADMIN: 'مدیر سیستم', TENANT_ADMIN: 'مدیر فروشگاه', MANAGER: 'مدیر', SALESMAN: 'فروشنده', ACCOUNTANT: 'حسابدار', WAREHOUSE: 'انباردار',
};
export const TX_TYPE: Record<string, string> = {
  PURCHASE: 'خرید', SALE: 'فروش', SALE_RETURN: 'برگشت از فروش', PURCHASE_RETURN: 'برگشت از خرید',
  ADJUSTMENT_INCREASE: 'افزایش (اصلاح)', ADJUSTMENT_DECREASE: 'کاهش (اصلاح)', TRANSFER_IN: 'ورود انتقالی', TRANSFER_OUT: 'خروج انتقالی',
};

/** قیمت فروش کالا؛ کالایی که قیمت ندارد (قیمت هنگام فاکتور فروش تعیین می‌شود) «۰» نشان داده نمی‌شود */
export const fmtSale = (v: number | string | null | undefined) => (Number(v) > 0 ? fmtMoney(v as number) : 'هنگام فروش');
