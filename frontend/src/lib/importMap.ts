import { toEn } from './format';

export type ImportKind = 'products' | 'parties' | 'stock' | 'received';
export interface FieldDef { key: string; title: string; required?: boolean; num?: boolean; code?: boolean; syn: string[] }

/** حذف فاصله، نیم‌فاصله، نشانه‌ها و یکی‌کردن ی/ک و ارقام برای تطبیق عنوان ستون */
export const normHeader = (s: string) => toEn(String(s ?? '')).toLowerCase().replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[\s\u200c_\-./\\()]+/g, '');

/**
 * عنوان‌های رایج ستون در خروجی اکسل نرم‌افزارهای حسابداری/انبار فارسی (هلو، سپیدار، حسابفا، طاهر و …).
 * تطبیق خودکار فقط پیشنهاد است؛ کاربر در مرحله‌ی بعد همه‌چیز را می‌بیند و می‌تواند عوض کند.
 */
export const FIELDS: Record<ImportKind, FieldDef[]> = {
  products: [
    { key: 'sku', title: 'کد کالا', required: true, code: true, syn: ['کدکالا', 'کد', 'کدجنس', 'کدکالاخدمت', 'itemcode', 'code', 'sku', 'کدانبار', 'شناسه'] },
    { key: 'name', title: 'نام کالا', required: true, syn: ['نامکالا', 'نام', 'شرحکالا', 'شرح', 'نامجنس', 'عنوان', 'ناممحصول', 'name', 'description', 'نامکالاخدمت'] },
    { key: 'salePrice', title: 'قیمت فروش', num: true, syn: ['قیمتفروش', 'فیفروش', 'قیمت', 'فروش', 'قیمتواحد', 'فی', 'قیمتمصرفکننده', 'price', 'نرخفروش'] },
    { key: 'purchasePrice', title: 'قیمت خرید', num: true, syn: ['قیمتخرید', 'آخرینقیمتخرید', 'بهایتمامشده', 'خرید', 'قیمتتمامشده', 'cost', 'فیخرید', 'نرخخرید'] },
    { key: 'wholesalePrice', title: 'قیمت عمده', num: true, syn: ['قیمتعمده', 'عمده', 'فروشعمده', 'قیمتهمکار', 'قیمتعمدهفروشی'] },
    { key: 'unit', title: 'واحد', syn: ['واحد', 'واحداصلی', 'واحدشمارش', 'unit', 'واحدسنجش'] },
    { key: 'category', title: 'دسته / گروه', syn: ['دسته', 'گروه', 'گروهکالا', 'دستهبندی', 'سرگروه', 'category', 'group', 'گروهاصلی'] },
    { key: 'brand', title: 'برند', syn: ['برند', 'مارک', 'نامتجاری', 'سازنده', 'کارخانه', 'brand', 'کشورسازنده'] },
    { key: 'oemCode', title: 'شماره فنی / OEM', code: true, syn: ['شمارهفنی', 'شمارهفنیoem', 'oem', 'کدفنی', 'oemcode', 'شمارهفنیکالا'] },
    { key: 'partNumber', title: 'شماره قطعه سازنده', code: true, syn: ['شمارهقطعه', 'پارتنامبر', 'partnumber', 'pn', 'شمارهسازنده', 'سریال', 'شمارهسریال'] },
    { key: 'altCodes', title: 'شماره‌های معادل (با , جدا)', code: true, syn: ['شمارههایمعادل', 'معادل', 'کدمعادل', 'کدهایمعادل', 'شمارهمعادل', 'معادلها'] },
    { key: 'barcode', title: 'بارکد', code: true, syn: ['بارکد', 'barcode', 'کدبارکد', 'ean'] },
    { key: 'initialQuantity', title: 'موجودی (اول دوره)', num: true, syn: ['موجودی', 'موجودیاولیه', 'تعداد', 'مقدار', 'موجودیفعلی', 'مانده', 'quantity', 'stock', 'موجودیانبار'] },
    { key: 'warehouse', title: 'انبار (برای موجودی)', syn: ['انبار', 'نامانبار'] },
    { key: 'minStock', title: 'حداقل موجودی', num: true, syn: ['حداقلموجودی', 'نقطهسفارش', 'حداقل', 'min', 'minstock'] },
    { key: 'location', title: 'محل در انبار', syn: ['محل', 'محلانبار', 'قفسه', 'محلقفسه', 'location'] },
    { key: 'warrantyMonths', title: 'گارانتی (ماه)', num: true, syn: ['گارانتی', 'گارانتیماه'] },
    { key: 'taxGoodsId', title: 'شناسه کالا/خدمت (مودیان)', code: true, syn: ['شناسهکالاخدمت', 'شناسهمالیاتی', 'شناسهکالاخدمتمودیان', 'شناسهکالا'] },
  ],
  parties: [
    { key: 'name', title: 'نام', required: true, syn: ['نام', 'نامطرفحساب', 'نامنامخانوادگی', 'عنوان', 'شرح', 'نامشخص', 'نامحساب', 'نامومشتری', 'نامتامینکننده', 'نامتأمینکننده', 'نامطرفحساب', 'نامشخصحقیقیحقوقی'] },
    { key: 'code', title: 'کد', code: true, syn: ['کد', 'کدمشتری', 'کدحساب', 'کدتفصیلی', 'کدطرفحساب', 'کدتامینکننده', 'کدتأمینکننده'] },
    { key: 'partyType', title: 'نوع (مشتری/تأمین‌کننده)', syn: ['نوع', 'نوعطرفحساب', 'نوعحساب', 'گروهحساب'] },
    { key: 'mobile', title: 'موبایل', code: true, syn: ['موبایل', 'تلفنهمراه', 'همراه', 'شمارهموبایل', 'mobile', 'cell', 'شمارههمراه'] },
    { key: 'phone', title: 'تلفن ثابت', code: true, syn: ['تلفن', 'تلفنثابت', 'شمارهتلفن', 'tel', 'phone'] },
    { key: 'city', title: 'شهر', syn: ['شهر', 'city'] },
    { key: 'address', title: 'نشانی', syn: ['آدرس', 'نشانی', 'address'] },
    { key: 'nationalId', title: 'کد ملی / شناسه ملی', code: true, syn: ['کدملی', 'شناسهملی', 'شمارهملی'] },
    { key: 'economicCode', title: 'کد اقتصادی', code: true, syn: ['کداقتصادی', 'شمارهاقتصادی'] },
    { key: 'creditLimit', title: 'سقف اعتبار', num: true, syn: ['سقفاعتبار', 'حداعتبار', 'اعتبار'] },
    { key: 'discountPercent', title: 'درصد تخفیف', num: true, syn: ['درصدتخفیف', 'تخفیف'] },
    { key: 'paymentTerms', title: 'مهلت پرداخت (روز)', num: true, syn: ['مهلتپرداخت', 'مدتتسویه', 'مهلت'] },
    { key: 'balance', title: 'مانده‌ی حساب (یک ستون)', num: true, syn: ['مانده', 'مانده‌اولدوره', 'مانده‌حساب', 'مانده‌نهایی', 'ماندهاولدوره', 'مانده‌حساب', 'ماندهحساب', 'ماندهنهایی', 'balance'] },
    { key: 'debit', title: 'بدهکار', num: true, syn: ['بدهکار', 'ماندهبدهکار', 'گردشبدهکار', 'debit'] },
    { key: 'credit', title: 'بستانکار', num: true, syn: ['بستانکار', 'ماندهبستانکار', 'گردشبستانکار', 'credit'] },
    { key: 'notes', title: 'توضیحات', syn: ['توضیحات', 'یادداشت', 'شرحتکمیلی'] },
  ],
  stock: [
    { key: 'code', title: 'کد کالا (یا شماره فنی/بارکد)', required: true, code: true, syn: ['کدکالا', 'کد', 'کدجنس', 'بارکد', 'شمارهفنی', 'sku', 'code', 'itemcode'] },
    { key: 'quantity', title: 'موجودی', required: true, num: true, syn: ['موجودی', 'تعداد', 'مقدار', 'مانده', 'موجودیفعلی', 'quantity', 'stock', 'موجودیانبار'] },
    { key: 'warehouse', title: 'انبار', syn: ['انبار', 'نامانبار'] },
    { key: 'unitCost', title: 'بهای تمام‌شده‌ی واحد', num: true, syn: ['بهایتمامشده', 'قیمتخرید', 'فی', 'نرخ', 'قیمتتمامشده', 'آخرینقیمتخرید'] },
  ],
  // فاکتور خرید دریافتی (مثل خروجی سامانه‌ی مودیان / نرم‌افزار حسابداری): هر ردیف یک قلم فاکتور است
  received: [
    // فقط چهار ستون ضروری است: SKU، فی، تعداد، قیمت کل؛ بقیه اختیاری‌اند
    { key: 'sku', title: 'SKU', required: true, code: true, syn: ['sku', 'شمارهsku', 'کدsku', 'شمارهسریال', 'سریال', 'serial', 'کدکالا', 'کد'] },
    { key: 'unitPrice', title: 'فی', required: true, num: true, syn: ['فی', 'قیمتواحد', 'فیواحد', 'مبلغواحد', 'unitprice'] },
    { key: 'quantity', title: 'تعداد', required: true, num: true, syn: ['تعداد', 'مقدار', 'qty', 'quantity'] },
    { key: 'total', title: 'قیمت کل', required: true, num: true, syn: ['قیمتکل', 'قیمتخرید', 'مبلغکل', 'جمعکل', 'مبلغنهایی', 'جمعنهایی', 'total'] },
    { key: 'partNumber', title: 'شماره فنی', code: true, syn: ['شمارهفنی', 'partnumber', 'technicalnumber', 'oem', 'شمارهقطعه'] },
    { key: 'brand', title: 'برند', code: true, syn: ['برند', 'brand', 'مارک', 'mark', 'سازنده'] },
    { key: 'name', title: 'نام کالا', syn: ['نامکالا', 'نام', 'شرح', 'شرحکالا', 'توضیحات', 'کالا', 'description'] },
    { key: 'discount', title: 'تخفیف', num: true, syn: ['تخفیف', 'discount'] },
    { key: 'supplier', title: 'تأمین‌کننده', syn: ['تامینکننده', 'تأمینکننده', 'فروشنده', 'supplier', 'vendor'] },
    { key: 'invoiceNo', title: 'شماره فاکتور', code: true, syn: ['شمارهفاکتور', 'فاکتور', 'شمارهسند', 'invoice'] },
    { key: 'date', title: 'تاریخ فاکتور', code: true, syn: ['تاریخ', 'تاریخفاکتور', 'date'] },
    { key: 'taxGoodsId', title: 'شناسه کالا (۱۳ رقمی مودیان)', code: true, syn: ['شناسهکالا', 'شناسهکالاوخدمت', 'شناسهعمومیکالا'] },
  ],
};

/** ستون‌های فایل نمونه‌ی «ورود کالا» (بقیه‌ی ستون‌ها اختیاری‌اند) */
export const RECEIVED_TEMPLATE = ['SKU', 'فی', 'تعداد', 'قیمت کل', 'شماره فنی', 'برند', 'نام کالا', 'تخفیف', 'تأمین‌کننده'];
/** ستون‌های ضروری ورود کالا */
export const RECEIVED_REQUIRED = ['SKU', 'فی', 'تعداد', 'قیمت کل'];

/** فایل شبیه ورود کالا/فاکتور خرید است؟ (SKU + تعداد، و قیمت یا شماره فاکتور) */
export function looksLikeInvoice(headers: string[]): boolean {
  const m = autoMap('received', headers);
  return m.sku !== undefined && m.quantity !== undefined && (m.total !== undefined || m.unitPrice !== undefined || m.invoiceNo !== undefined);
}

/** برای هر فیلد، بهترین ستون فایل را پیدا می‌کند (اول برابری کامل، بعد شمول) */
export function autoMap(kind: ImportKind, headers: string[]): Record<string, number> {
  const H = headers.map(normHeader);
  const used = new Set<number>();
  const out: Record<string, number> = {};
  const defs = FIELDS[kind];
  for (const pass of [0, 1]) {
    for (const f of defs) {
      if (out[f.key] !== undefined) continue;
      const names = [f.key, f.title, ...f.syn].map(normHeader).filter(Boolean);
      const i = H.findIndex((h, idx) => !used.has(idx) && h && (pass === 0 ? names.includes(h) : names.some((n) => n.length >= 3 && (h.includes(n) || n.includes(h)) && h.length >= 3)));
      if (i >= 0) { out[f.key] = i; used.add(i); }
    }
  }
  return out;
}

const toNum = (raw: string): number | undefined => {
  const t = toEn(raw).replace(/[\s٫]/g, '').replace(/[()]/g, (m) => (m === '(' ? '-' : ''));
  if (t === '' || t === '-') return undefined;
  const n = Number(t);
  return Number.isNaN(n) ? undefined : n;
};
/** کدهایی مثل بارکد/کد ملی که اکسل عددی کرده یا با ارقام فارسی نوشته شده‌اند */
const toCode = (raw: string) => { const e = toEn(raw).trim(); return /^[\d.]+$/.test(e) ? e.replace(/\.0+$/, '') : raw.trim(); };

export interface BuildOptions { defaultType?: 'CUSTOMER' | 'SUPPLIER'; balanceMeansPartyOwes?: boolean }

/** ردیف‌های فایل را با نگاشت انتخابی به شیء‌های API تبدیل می‌کند */
export function buildRows(kind: ImportKind, table: string[][], map: Record<string, number>, opt: BuildOptions = {}): Record<string, unknown>[] {
  const defs = FIELDS[kind];
  const rows: Record<string, unknown>[] = [];
  for (const r of table) {
    const o: Record<string, unknown> = {};
    for (const f of defs) {
      const i = map[f.key];
      if (i === undefined || i < 0) continue;
      const raw = (r[i] ?? '').toString().trim();
      if (raw === '') continue;
      if (f.num) { const n = toNum(raw); if (n !== undefined) o[f.key] = n; else o[`__bad_${f.key}`] = raw; }
      else o[f.key] = f.code ? toCode(raw) : raw;
    }
    if (kind === 'parties') {
      const t = String(o.partyType ?? '');
      if (t) o.partyType = /تامین|تأمین|فروشنده|supplier|vendor/i.test(t) ? 'SUPPLIER' : /مشتری|خریدار|customer|client/i.test(t) ? 'CUSTOMER' : undefined;
      const type = (o.partyType as string) ?? opt.defaultType ?? 'CUSTOMER';
      // «بدهکار» یعنی طرف‌حساب به ما بدهکار است. در سیستم: مشتری مثبت = بدهکار به ما ؛ تأمین‌کننده مثبت = ما بدهکاریم
      let owes: number | undefined;
      if (o.debit !== undefined || o.credit !== undefined) owes = Number(o.debit ?? 0) - Number(o.credit ?? 0);
      else if (o.balance !== undefined) owes = (opt.balanceMeansPartyOwes === false ? -1 : 1) * Number(o.balance);
      if (owes !== undefined) o.openingBalance = type === 'SUPPLIER' ? -owes : owes;
      delete o.debit; delete o.credit; delete o.balance;
    }
    const keyField = kind === 'products' ? 'sku' : kind === 'parties' ? 'name' : kind === 'received' ? 'sku' : 'code';
    if (o[keyField]) rows.push(o);
  }
  return rows;
}

// ───────── فاکتور خرید دریافتی ─────────
export interface ReceivedPlan {
  /** یک ردیف برای هر SKU یکتا */ products: Record<string, unknown>[];
  /** یک ردیف ورود موجودی برای هر قلم فاکتور (سابقه‌ی فاکتور در توضیح حرکت انبار می‌ماند) */ stock: Record<string, unknown>[];
  skipped: { row: number; reason: string }[]; lines: number; totalQty: number; totalCost: number;
  /** تعداد کالاهایی که در فایل با چند قیمت مختلف آمده‌اند (مثلاً خرید نقدی و اعتباری)؛ خطا نیست */ multiPrice: number;
}
const jalaliText = (d?: unknown) => { const s = String(d ?? ''); return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}/${s.slice(4, 6)}/${s.slice(6)}` : s; };

/**
 * ردیف‌های فاکتور را به «کالاهای یکتا» و «ورودهای موجودی» تبدیل می‌کند.
 * قیمت خرید هر کالا = بهای واحدِ جدیدترین فاکتورِ همان کالا؛ هر ورود موجودی با بهای واحد خودش ثبت می‌شود.
 */
export function planReceived(rows: Record<string, unknown>[]): ReceivedPlan {
  const products = new Map<string, { row: Record<string, unknown>; at: string; cost: number }>();
  const plan: ReceivedPlan = { products: [], stock: [], skipped: [], lines: 0, totalQty: 0, totalCost: 0, multiPrice: 0 };
  const costsOf = new Map<string, Set<number>>();
  rows.forEach((r, idx) => {
    const qty = Number(r.quantity), total = Number(r.total), unit = Number(r.unitPrice);
    // قیمت خرید هر واحد = «قیمت کل» ردیف ÷ تعداد (مبنای سود و زیان)؛ فقط اگر قیمت کل نبود، «فی»
    const raw = total > 0 ? total / qty : unit;
    if (!(qty > 0)) { plan.skipped.push({ row: idx, reason: 'تعداد معتبر نیست' }); return; }
    if (!(raw > 0)) { plan.skipped.push({ row: idx, reason: 'قیمت معتبر نیست' }); return; }
    const cost = Math.round(raw * 100) / 100;
    const sku = String(r.sku);
    const at = `${String(r.date ?? '').padStart(8, '0')}|${String(idx).padStart(6, '0')}`;
    const prev = products.get(sku);
    if (!prev) products.set(sku, { row: r, at, cost });
    else if (at > prev.at) products.set(sku, { row: { ...r, taxGoodsId: r.taxGoodsId ?? prev.row.taxGoodsId, partNumber: r.partNumber ?? prev.row.partNumber }, at, cost });
    // بدون شماره/تاریخ فاکتور، توضیحی نمی‌گذاریم تا ورودِ تازه با همان تعداد و قیمت «تکراری» حساب نشود
    const note = r.invoiceNo || r.date ? `فاکتور خرید ${r.invoiceNo ?? '—'}${r.date ? ` - ${jalaliText(r.date)}` : ''}` : undefined;
    plan.stock.push({ code: sku, quantity: qty, unitCost: cost, note, supplier: r.supplier ? String(r.supplier).trim() : undefined });
    plan.lines++; plan.totalQty += qty; plan.totalCost += qty * cost;
    (costsOf.get(sku) ?? costsOf.set(sku, new Set()).get(sku)!).add(cost);
  });
  plan.multiPrice = [...costsOf.values()].filter((s) => s.size > 1).length;
  for (const [sku, p] of products) {
    plan.products.push({ sku, name: String(p.row.name ?? '').trim() || String(p.row.partNumber ?? '').trim() || String(p.row.sku), partNumber: p.row.partNumber ? String(p.row.partNumber) : undefined, brand: p.row.brand ? String(p.row.brand) : undefined, taxGoodsId: p.row.taxGoodsId ? String(p.row.taxGoodsId) : undefined, purchasePrice: p.cost });
  }
  return plan;
}
