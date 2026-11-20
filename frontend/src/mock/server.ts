/**
 * سرور آزمایشی داخل مرورگر (حالت VITE_MOCK=true) برای پیش‌نمایش رابط بدون نیاز به بکند و پایگاه‌داده.
 * ساختار پاسخ‌ها مثل API واقعی است. داده‌ها فقط در حافظه‌اند و با رفرش به حالت اول برمی‌گردند.
 */
import { calcInvoice } from '../lib/calc';
import { ApiError } from '../lib/errors';

type Q = Record<string, any>;
const DAY = 86400000;
let uid = 1000;
const id = (p: string) => `${p}${++uid}`;
const iso = (d: Date) => d.toISOString();
const rnd = (a: number, b: number) => Math.floor(a + Math.random() * (b - a + 1));
const pick = <T,>(a: T[]) => a[rnd(0, a.length - 1)];
class MockError extends Error { constructor(m: string, public status = 400) { super(m); } }

function build() {
  const units = [['pcs', 'عدد'], ['pair', 'جفت'], ['set', 'ست'], ['ltr', 'لیتر'], ['kg', 'کیلوگرم'], ['pack', 'بسته']].map(([code, name]) => ({ id: `u-${code}`, code, name }));
  const unit = (c: string) => units.find((u) => u.code === c)!;
  const brands = [
    ...[['ikco', 'ایران‌خودرو', 'ایران'], ['saipa', 'سایپا', 'ایران'], ['peugeot', 'پژو', 'فرانسه'], ['renault', 'رنو', 'فرانسه'], ['kia', 'کیا', 'کره'], ['toyota', 'تویوتا', 'ژاپن']].map(([c, n, k]) => ({ id: `b-${c}`, code: c, name: n, country: k, kind: 'VEHICLE' })),
    ...[['bosch', 'بوش', 'آلمان'], ['mobis', 'موبیس', 'کره'], ['isaco', 'ایساکو', 'ایران'], ['mega', 'مگا موتور', 'ایران'], ['sakt', 'ساکت', 'ایران'], ['behran', 'بهران', 'ایران'], ['framax', 'فرامکس', 'ایران'], ['ngk', 'NGK', 'ژاپن'], ['safir', 'سفیر', 'ایران']].map(([c, n, k]) => ({ id: `b-${c}`, code: c, name: n, country: k, kind: 'PART' })),
  ];
  const catTree: Record<string, string[]> = { 'ترمز': ['لنت ترمز', 'روغن ترمز'], 'فیلتر': ['فیلتر روغن', 'فیلتر هوا', 'فیلتر کابین'], 'روغن و مایعات': ['روغن موتور', 'ضدیخ'], 'جلوبندی': ['کمک فنر', 'مفصل و موقعیت'], 'برق و جرقه': ['شمع', 'باتری'], 'موتور': ['تسمه تایم', 'پمپ آب'] };
  const categories: any[] = [];
  Object.entries(catTree).forEach(([p, kids]) => { const pid = `c-${p}`; categories.push({ id: pid, name: p, parentId: null, level: 1 }); kids.forEach((k) => categories.push({ id: `c-${k}`, name: k, parentId: pid, level: 2 })); });
  const warehouses = [{ id: 'w1', name: 'انبار اصلی', code: 'MAIN', isDefault: true, isActive: true, address: 'خیابان شوش' }, { id: 'w2', name: 'انبار شوش', code: 'SHOOSH', isDefault: false, isActive: true, address: 'شوش' }];
  const vb = (c: string) => brands.find((b) => b.code === c)!;
  const vehicles = ([['peugeot', 'پژو ۲۰۶ تیپ ۲', 1380, 1396, 'TU3'], ['peugeot', 'پژو ۲۰۶ تیپ ۵', 1385, 1402, 'TU5'], ['peugeot', 'پژو ۴۰۵', 1375, 1402, 'XU7'], ['ikco', 'سمند LX', 1381, 1401, 'EF7'], ['ikco', 'دنا', 1393, null, 'EF7'], ['ikco', 'رانا', 1394, null, 'TU5'], ['saipa', 'پراید ۱۳۱', 1372, 1397, '1.3'], ['saipa', 'تیبا', 1388, 1400, '1.5'], ['saipa', 'کوییک', 1396, null, '1.5'], ['renault', 'تندر ۹۰', 1386, 1402, 'K7M'], ['kia', 'سراتو', 1388, 1400, '2.0'], ['toyota', 'کرولا', 1385, 1400, '1.6']] as any[]).map(([b, m, yf, yt, e], i) => ({ id: `v${i + 1}`, brandId: vb(b).id, brand: vb(b), modelName: m, yearFrom: yf, yearTo: yt, engineType: e }));

  // sku, name, cat, brand, unit, buy, sell, stock, min, oem, loc
  const cat: [string, string, string, string, string, number, number, number, number, string, string][] = [
    ['BP-206-F', 'لنت جلو پژو ۲۰۶', 'لنت ترمز', 'framax', 'set', 520000, 680000, 24, 6, '425230', 'A-1-1'],
    ['BP-206-R', 'لنت عقب پژو ۲۰۶', 'لنت ترمز', 'framax', 'set', 380000, 490000, 18, 5, '425242', 'A-1-2'],
    ['BP-SM-F', 'لنت جلو سمند', 'لنت ترمز', 'framax', 'set', 480000, 640000, 3, 6, '1440002', 'A-1-3'],
    ['BP-PR-F', 'لنت جلو پراید', 'لنت ترمز', 'mega', 'set', 290000, 380000, 40, 10, '11100', 'A-1-4'],
    ['OF-206', 'فیلتر روغن پژو ۲۰۶ و ۴۰۵', 'فیلتر روغن', 'sakt', 'pcs', 78000, 110000, 85, 20, '1109.AL', 'B-1-1'],
    ['OF-PR', 'فیلتر روغن پراید', 'فیلتر روغن', 'sakt', 'pcs', 62000, 90000, 70, 20, '15208', 'B-1-2'],
    ['AF-206', 'فیلتر هوا پژو ۲۰۶', 'فیلتر هوا', 'sakt', 'pcs', 95000, 140000, 32, 10, '1444.TV', 'B-2-1'],
    ['AF-SM', 'فیلتر هوا سمند', 'فیلتر هوا', 'sakt', 'pcs', 105000, 150000, 0, 8, '1444.VK', 'B-2-2'],
    ['CF-206', 'فیلتر کابین پژو ۲۰۶', 'فیلتر کابین', 'mega', 'pcs', 88000, 135000, 27, 8, '6447.KP', 'B-3-1'],
    ['EO-BH-4', 'روغن موتور بهران ۱۰W40 چهار لیتری', 'روغن موتور', 'behran', 'pcs', 780000, 960000, 36, 12, 'BH-1040', 'C-1-1'],
    ['EO-IS-4', 'روغن موتور ایساکو ۲۰W50 چهار لیتری', 'روغن موتور', 'isaco', 'pcs', 640000, 800000, 28, 12, 'IS-2050', 'C-1-2'],
    ['AN-5', 'ضدیخ ۵ لیتری', 'ضدیخ', 'behran', 'pcs', 420000, 560000, 22, 8, 'AN-05', 'C-2-1'],
    ['BF-DOT4', 'روغن ترمز DOT4', 'روغن ترمز', 'isaco', 'pcs', 95000, 135000, 44, 12, 'DOT4', 'C-3-1'],
    ['SA-206-F', 'کمک فنر جلو پژو ۲۰۶ (جفت)', 'کمک فنر', 'sakt', 'pair', 3200000, 4100000, 8, 3, '5202.TT', 'D-1-1'],
    ['SA-SM-R', 'کمک فنر عقب سمند (جفت)', 'کمک فنر', 'sakt', 'pair', 2400000, 3050000, 2, 3, '5206.SM', 'D-1-2'],
    ['RT-206', 'مفصل (rotul) گاردان پژو ۲۰۶', 'مفصل و موقعیت', 'mega', 'pcs', 260000, 360000, 15, 5, '3640.A3', 'D-2-1'],
    ['SP-NGK-206', 'شمع NGK پژو ۲۰۶ (ست ۴ تایی)', 'شمع', 'ngk', 'set', 460000, 620000, 30, 8, 'BKR6E', 'E-1-1'],
    ['SP-BS-PR', 'شمع بوش پراید (ست ۴ تایی)', 'شمع', 'bosch', 'set', 390000, 520000, 26, 8, 'WR7DC', 'E-1-2'],
    ['BT-60', 'باتری ۶۰ آمپر سپاهان', 'باتری', 'safir', 'pcs', 2850000, 3400000, 9, 4, 'BT-60', 'E-2-1'],
    ['TB-206', 'تسمه تایم پژو ۲۰۶ تیپ ۵', 'تسمه تایم', 'mobis', 'pcs', 680000, 890000, 12, 4, 'TB-TU5', 'F-1-1'],
    ['WP-206', 'واتر پمپ پژو ۲۰۶', 'پمپ آب', 'mega', 'pcs', 720000, 940000, 7, 3, 'WP-TU5', 'F-2-1'],
    ['LB-SVC', 'اجرت تعویض روغن و فیلتر', 'روغن موتور', 'isaco', 'pcs', 0, 150000, 0, 0, '', ''],
  ];
  const products: any[] = []; const inventory: any[] = [];
  cat.forEach(([sku, name, c, b, u, buy, sell, stock, min, oem, loc], i) => {
    const p = { id: `p${i + 1}`, sku, name, categoryId: `c-${c}`, brandId: `b-${b}`, unitId: unit(u).id, purchasePrice: buy, salePrice: sell, wholesalePrice: Math.round(sell * 0.93), minStock: min, oemCode: oem || undefined, location: loc || undefined, warrantyMonths: 6, isActive: true, isService: sku === 'LB-SVC', deleted: false, compat: [] as any[], subs: [] as string[], createdAt: iso(new Date(Date.now() - (30 - i) * DAY)) };
    products.push(p);
    if (!p.isService) { inventory.push({ id: `i${i + 1}`, productId: p.id, warehouseId: 'w1', quantity: stock }); if (i % 5 === 0) inventory.push({ id: `i${i + 100}`, productId: p.id, warehouseId: 'w2', quantity: rnd(2, 8) }); }
  });
  products.forEach((p, i) => { if (!p.isService && ![2, 7, 14].includes(i)) p.taxGoodsId = `27200001${String(66000 + i * 7).padStart(5, '0')}`; });
  const link = (sku: string, models: string[]) => { const p = products.find((x) => x.sku === sku)!; models.forEach((m) => p.compat.push({ vehicleId: vehicles.find((v) => v.modelName === m)!.id, position: sku.endsWith('-F') ? 'جلو' : undefined })); };
  link('BP-206-F', ['پژو ۲۰۶ تیپ ۲', 'پژو ۲۰۶ تیپ ۵']); link('BP-206-R', ['پژو ۲۰۶ تیپ ۲', 'پژو ۲۰۶ تیپ ۵']); link('BP-SM-F', ['سمند LX']); link('BP-PR-F', ['پراید ۱۳۱']);
  link('OF-206', ['پژو ۲۰۶ تیپ ۲', 'پژو ۲۰۶ تیپ ۵', 'پژو ۴۰۵']); link('AF-206', ['پژو ۲۰۶ تیپ ۵']); link('AF-SM', ['سمند LX']); link('TB-206', ['پژو ۲۰۶ تیپ ۵']);
  products.find((p) => p.sku === 'OF-206')!.subs.push(products.find((p) => p.sku === 'OF-PR')!.id);
  products.find((p) => p.sku === 'AF-SM')!.subs.push(products.find((p) => p.sku === 'AF-206')!.id);

  const parties: any[] = [['مجید کریمی', 'CUSTOMER', '09121234501', 'تهران'], ['تعمیرگاه نوین', 'CUSTOMER', '09121234502', 'تهران'], ['علی صادقی', 'CUSTOMER', '09121234503', 'کرج'], ['مکانیکی برادران احمدی', 'CUSTOMER', '09121234504', 'تهران'], ['حسین نیک‌پور', 'CUSTOMER', '09121234505', 'شهریار'], ['تاکسی‌سرویس آزادی', 'CUSTOMER', '09121234506', 'تهران'], ['پخش قطعات سپهر', 'SUPPLIER', '09351234501', 'تهران'], ['شرکت فیلتر ساکت', 'SUPPLIER', '09351234502', 'تهران'], ['واردات یدک ایران‌کالا', 'SUPPLIER', '09351234503', 'تبریز']].map(([name, type, mobile, city], i) => ({ id: `pt${i + 1}`, code: `${type === 'CUSTOMER' ? 'C' : 'S'}-${String(i + 1).padStart(4, '0')}`, name, partyType: type, mobile, city, currentBalance: 0, creditLimit: type === 'CUSTOMER' ? 30000000 : 0, discountPercent: i === 1 ? 5 : 0, paymentTerms: 30, isActive: true }));

  const db: any = { units, brands, categories, warehouses, vehicles, products, inventory, parties, invoices: [] as any[], payments: [] as any[], checks: [] as any[], txs: [] as any[],
    users: [{ id: 'u1', name: 'امین رضایی', phone: '09120000000', role: 'TENANT_ADMIN', isActive: true, lastLoginAt: iso(new Date()) }, { id: 'u2', name: 'سعید فروشنده', phone: '09121111111', role: 'SALESMAN', isActive: true }],
    tenant: { name: 'یدکی امین', ownerName: 'امین رضایی', city: 'تهران', address: 'خیابان شوش، پلاک ۱۲۰', phone: '02133445566', planType: 'PRO', planStatus: 'ACTIVE', maxProducts: 5000, maxUsers: 10, nationalId: '', economicCode: '' }, seq: {} as Record<string, number> };

  // فاکتورهای نمونه ۶۰ روز گذشته
  const sellable = products.filter((p) => !p.isService);
  for (let d = 60; d >= 0; d--) {
    const n = d % 7 === 5 ? 0 : rnd(1, 3);
    for (let k = 0; k < n; k++) {
      const date = new Date(Date.now() - d * DAY); date.setHours(rnd(9, 19), rnd(0, 59));
      const party = Math.random() < 0.75 ? pick(parties.filter((p) => p.partyType === 'CUSTOMER')) : null;
      const lines = Array.from({ length: rnd(1, 3) }, () => ({ p: pick(sellable), q: rnd(1, 3) }));
      createInvoice(db, 'SALE', { party, date: iso(date), lines: lines.map((l) => ({ productId: l.p.id, quantity: l.q, unitPrice: l.p.salePrice, discountPercent: 0 })), paid: !party || Math.random() < 0.6 ? 'full' : Math.random() < 0.5 ? 'half' : 'none', noStock: true });
    }
  }
  const due = (n: number) => iso(new Date(Date.now() + n * DAY));
  const P = (n: number) => parties[n];
  db.checks = [
    { id: 'k1', checkType: 'RECEIVED', checkNumber: '784512', bankName: 'بانک ملت', amount: 18500000, dueDate: due(2), status: 'PENDING', partyId: P(1).id },
    { id: 'k2', checkType: 'RECEIVED', checkNumber: '784513', bankName: 'بانک ملی', amount: 9200000, dueDate: due(11), status: 'PENDING', partyId: P(3).id },
    { id: 'k3', checkType: 'PAID', checkNumber: '330021', bankName: 'بانک پاسارگاد', amount: 40000000, dueDate: due(5), status: 'PENDING', partyId: P(6).id },
    { id: 'k4', checkType: 'RECEIVED', checkNumber: '784490', bankName: 'بانک تجارت', amount: 6000000, dueDate: due(-3), status: 'PENDING', partyId: P(0).id },
    { id: 'k5', checkType: 'RECEIVED', checkNumber: '784401', bankName: 'بانک صادرات', amount: 12000000, dueDate: due(-15), status: 'CASHED', partyId: P(2).id },
  ];
  db.moodian = { environment: 'sandbox', memoryId: 'A1B2C3', economicCode: '10101234567', enabled: true, hasPrivateKey: true, hasServerKey: true, serverKeyId: 'MOCK-KEY-1', unitCodes: { pcs: '1627', set: '1648', pair: '1649' }, lastError: null, lastSyncAt: iso(new Date(Date.now() - 3600_000)) };
  // فاکتورها از جدید به قدیم‌اند: چند فاکتور آخر ارسال‌نشده، یکی ردشده، دو تا در انتظار و بقیه ثبت‌شده
  db.invoices.filter((i: any) => i.invoiceType === 'SALE').forEach((i: any, k: number) => {
    if (k < 6) return;
    if (k === 6) { i.taxStatus = 'FAILED'; i.taxAuthorityId = mockTaxId(k); i.taxAuthorityError = '0204: مجموع مبلغ پس از تخفیف با جمع ردیف‌ها همخوانی ندارد'; }
    else if (k < 9) { i.taxStatus = 'PENDING'; i.taxAuthorityId = mockTaxId(k); i.taxAuthorityRef = `REF-${100000 + k}`; i.taxAuthoritySentAt = i.date; }
    else { i.taxStatus = 'SUCCESS'; i.taxAuthorityId = mockTaxId(k); i.taxAuthorityRef = `REF-${100000 + k}`; i.taxConfirmationId = `CONF-${900000 + k}`; i.taxAuthoritySentAt = i.date; }
  });
  db.sms = { provider: 'log', sender: '30001234', enabled: true, hasApiKey: true }; db.smsLogs = []; db.gateway = { provider: 'zarinpal', sandbox: true, enabled: true, hasMerchantId: true }; db.payLinks = [];
  const ex = (d: number, category: string, amount: number, description?: string) => ({ id: id('ex'), category, amount, date: iso(new Date(Date.now() - d * DAY)), method: 'CASH', description });
  db.expenses = [ex(2, 'اجاره', 25000000, 'اجاره مغازه ماه جاری'), ex(5, 'حقوق و دستمزد', 18000000, 'حقوق فروشنده'), ex(9, 'برق، آب و گاز', 2400000), ex(12, 'حمل‌ونقل', 1350000, 'کرایه بار از تهران‌پارس'), ex(20, 'تبلیغات', 3000000), ex(33, 'اجاره', 25000000, 'اجاره ماه قبل'), ex(41, 'تعمیر و نگهداری', 900000)];
  db.audit = ['POST /sales', 'POST /checks/:id/cash', 'POST /products', 'POST /inventory/adjust', 'POST /payments', 'PATCH /parties/:id', 'POST /purchases', 'POST /returns/invoice/:kind/:invoiceId', 'POST /sales/:id/cancel', 'POST /expenses'].flatMap((a, i) => [0, 1].map((k) => ({ id: id('au'), userName: k ? 'سعید فروشنده' : 'امین رضایی', action: a, entityType: a.split('/')[1], createdAt: iso(new Date(Date.now() - (i * 2 + k) * 3600_000 * 5)) })));
  return db;
}

const mockTaxId = (n: number) => `A1B2C30E0${(62 + n).toString(16).toUpperCase().padStart(2, '0')}${(1000 + n).toString(16).toUpperCase().padStart(10, '0')}${n % 10}`;
function stockOf(db: any, pid: string) { return db.inventory.filter((i: any) => i.productId === pid).reduce((s: number, i: any) => s + i.quantity, 0); }
function shapeProduct(db: any, p: any) {
  const inv = db.inventory.filter((i: any) => i.productId === p.id);
  const total = inv.reduce((s: number, i: any) => s + i.quantity, 0);
  return { ...p, category: db.categories.find((c: any) => c.id === p.categoryId), brand: db.brands.find((b: any) => b.id === p.brandId), unit: db.units.find((u: any) => u.id === p.unitId), totalStock: total, availableStock: total, inventory: inv.map((i: any) => ({ ...i, availableQuantity: i.quantity, warehouse: db.warehouses.find((w: any) => w.id === i.warehouseId) })) };
}
function partyOf(db: any, pid?: string | null) { return pid ? db.parties.find((p: any) => p.id === pid) : null; }

function move(db: any, productId: string, warehouseId: string, qty: number, type: string, notes?: string, ref?: string, date?: string) {
  let row = db.inventory.find((i: any) => i.productId === productId && i.warehouseId === warehouseId);
  if (qty < 0 && (!row || row.quantity < -qty)) { const p = db.products.find((x: any) => x.id === productId); throw new MockError(`موجودی «${p?.name}» کافی نیست (موجود: ${row?.quantity ?? 0}، درخواست: ${-qty})`); }
  if (!row) { row = { id: id('i'), productId, warehouseId, quantity: 0 }; db.inventory.push(row); }
  row.quantity += qty;
  db.txs.unshift({ id: id('t'), transactionType: type, quantity: qty, createdAt: date ?? iso(new Date()), notes, referenceType: ref, productId, warehouseId });
}

function addPayment(db: any, o: { direction: string; method: string; amount: number; partyId?: string | null; invoice?: any; date?: string; reference?: string; notes?: string }) {
  if (o.invoice) {
    if (o.amount > o.invoice.remainingAmount) throw new MockError(`مبلغ از مانده‌ی فاکتور (${o.invoice.remainingAmount}) بیشتر است`);
    o.invoice.paidAmount += o.amount; o.invoice.remainingAmount = o.invoice.totalAmount - o.invoice.paidAmount;
    o.invoice.status = o.invoice.remainingAmount <= 0 ? 'PAID' : 'PARTIALLY_PAID';
  }
  const party = partyOf(db, o.partyId ?? o.invoice?.partyId); if (party) party.currentBalance -= o.amount;
  const pay = { id: id('pay'), direction: o.direction, method: o.method, amount: o.amount, date: o.date ?? iso(new Date()), reference: o.reference, notes: o.notes, partyId: party?.id ?? null, invoiceId: o.invoice?.id ?? null };
  db.payments.unshift(pay); return pay;
}

function createInvoice(db: any, type: 'SALE' | 'PURCHASE', o: { party?: any; date?: string; lines: any[]; paid: 'full' | 'half' | 'none' | number; vat?: number; discount?: number; warehouseId?: string; notes?: string; noStock?: boolean; method?: string }) {
  const vat = o.vat ?? 9;
  const calc = calcInvoice(o.lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice, discountPercent: l.discountPercent ?? 0 })), { discountAmount: o.discount, vatPercent: vat });
  const paid = o.paid === 'full' ? calc.total : o.paid === 'half' ? Math.round(calc.total / 2) : o.paid === 'none' ? 0 : o.paid;
  if (paid > calc.total) throw new MockError('مبلغ از جمع فاکتور بیشتر است');
  if (!o.party && paid < calc.total) throw new MockError('برای فروش نسیه ابتدا مشتری را انتخاب کنید');
  if (!o.noStock && type === 'SALE' && o.party?.creditLimit && o.party.currentBalance + calc.total - paid > o.party.creditLimit) throw new MockError('سقف اعتبار مشتری رد می‌شود');
  const wid = o.warehouseId || 'w1'; const date = o.date ?? iso(new Date());
  const items = o.lines.map((l, i) => { const p = db.products.find((x: any) => x.id === l.productId); return { id: id('it'), productId: p.id, productName: p.name, sku: p.sku, quantity: l.quantity, unitPrice: l.unitPrice, discountAmount: calc.items[i].ld, vatAmount: calc.items[i].vat, totalPrice: calc.items[i].total, unit: db.units.find((u: any) => u.id === p.unitId) }; });
  if (!o.noStock) o.lines.forEach((l, i) => { const p = db.products.find((x: any) => x.id === l.productId); if (p.isService) return; if (type === 'SALE') move(db, p.id, wid, -l.quantity, 'SALE', undefined, 'invoice', date); else { move(db, p.id, wid, l.quantity, 'PURCHASE', undefined, 'invoice', date); p.purchasePrice = Math.round(calc.items[i].net / l.quantity); } });
  const d = new Date(date); const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`; const key = `${type}${ym}`;
  db.seq[key] = (db.seq[key] ?? 0) + 1;
  const inv: any = { id: id('inv'), invoiceType: type, invoiceNumber: `${type === 'SALE' ? 'S' : 'P'}-${ym}-${String(db.seq[key]).padStart(4, '0')}`, date, createdAt: o.noStock ? date : iso(new Date()), status: 'CONFIRMED', subtotal: calc.subtotal, discountAmount: calc.invoiceDiscount, vatAmount: calc.vatAmount, vatPercent: vat, totalAmount: calc.total, paidAmount: 0, remainingAmount: calc.total, partyId: o.party?.id ?? null, partyName: o.party?.name, notes: o.notes, items, creator: { name: 'امین رضایی' }, warehouseId: wid };
  db.invoices.unshift(inv);
  if (o.party) o.party.currentBalance += calc.total;
  if (paid > 0) addPayment(db, { direction: type === 'SALE' ? 'RECEIVED' : 'PAID', method: o.method ?? pick(['CASH', 'CARD', 'TRANSFER']), amount: paid, partyId: o.party?.id, invoice: inv, date });
  return inv;
}

function pfShape(db: any, i: any) { return { ...i, party: partyOf(db, i.partyId), _count: { items: i.items.length }, convertedTo: i.convertedToId ? db.invoices.find((x: any) => x.id === i.convertedToId) : null }; }
function returnedQty(db: any, itemId: string) { return db.invoices.filter((r: any) => r.originalInvoiceId && r.status !== 'CANCELLED').flatMap((r: any) => r.items).filter((x: any) => x.originalItemId === itemId).reduce((s: number, x: any) => s + x.quantity, 0); }

// ───────── روتر ─────────
const page = (rows: any[], q: Q) => { const p = +q.page || 1, l = +q.limit || 20; return { data: rows.slice((p - 1) * l, p * l), meta: { total: rows.length, page: p, limit: l, totalPages: Math.max(1, Math.ceil(rows.length / l)) } }; };
const inRange = (iso: string, q: Q) => (!q.from || iso >= q.from) && (!q.to || iso.slice(0, 10) <= q.to);
const day = (s: string) => { const d = new Date(s); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
const sortBy = (rows: any[], q: Q, fields: string[], def: string) => { const f = fields.includes(q.sortBy) ? q.sortBy : def; const dir = q.sortOrder === 'asc' ? 1 : -1; return [...rows].sort((a, b) => (a[f] > b[f] ? 1 : a[f] < b[f] ? -1 : 0) * dir); };

type H = (c: { q: Q; b: any; p: string[]; db: any }) => any;
const routes: [string, RegExp, H][] = [];
const R = (m: string, path: string, h: H) => routes.push([m, new RegExp(`^${path.replace(/:\w+/g, '([^/]+)')}$`), h]);

const MOCK_BRANCHES = [{ id: 'br1', name: 'شعبه مرکزی', code: 'HQ', isDefault: true, isActive: true, _count: { warehouses: 1, users: 2 } }, { id: 'br2', name: 'شعبه شوش', code: 'SH', isDefault: false, isActive: true, _count: { warehouses: 1, users: 0 } }];
const mockUser = (db: any, extra: object = {}) => ({ id: 'u1', name: 'امین رضایی', phone: '09120000000', role: 'TENANT_ADMIN', roleName: null, tenantId: 't1', tenantName: db.tenant.name, tenantSlug: 'demo', planType: 'PRO', planStatus: 'ACTIVE', permissions: ['*'], allBranches: true, branches: MOCK_BRANCHES, defaultBranchId: 'br1', ...extra });
R('GET', '/auth/me', ({ db }) => mockUser(db));
R('POST', '/auth/login', ({ b, db }) => { if (b.password !== 'demo1234') throw new MockError('شماره موبایل یا رمز عبور اشتباه است', 401); return { accessToken: 'mock', refreshToken: 'mock', user: mockUser(db, { phone: b.phone }) }; });
R('POST', '/auth/register', ({ b }) => ({ accessToken: 'mock', refreshToken: 'mock', user: mockUser({ tenant: { name: b.tenantName } }, { name: b.name, phone: b.phone, tenantName: b.tenantName, tenantSlug: b.tenantSlug, planType: 'FREE', planStatus: 'TRIAL', branches: [MOCK_BRANCHES[0]] }) }));
R('POST', '/auth/change-password', () => ({ changed: true }));
['units', 'brands', 'categories', 'warehouses'].forEach((k) => {
  R('GET', `/${k}`, ({ db }) => db[k]);
  R('POST', `/${k}`, ({ b, db }) => { const r = { id: id(k[0]), isActive: true, ...b, ...(k === 'categories' ? { level: b.parentId ? 2 : 1, parentId: b.parentId ?? null } : {}) }; if (k === 'warehouses' && b.isDefault) db.warehouses.forEach((w: any) => (w.isDefault = false)); db[k].push(r); return r; });
  R('PATCH', `/${k}/:id`, ({ b, db, p }) => { const r = db[k].find((x: any) => x.id === p[0]); if (k === 'warehouses' && b.isDefault) db.warehouses.forEach((w: any) => (w.isDefault = false)); Object.assign(r, b); return r; });
});
R('GET', '/vehicles', ({ db }) => db.vehicles);
R('POST', '/vehicles', ({ b, db }) => { const v = { id: id('v'), ...b, brand: db.brands.find((x: any) => x.id === b.brandId) }; db.vehicles.push(v); return v; });
R('PATCH', '/vehicles/:id', ({ b, db, p }) => { const v = db.vehicles.find((x: any) => x.id === p[0]); Object.assign(v, b, { brand: db.brands.find((x: any) => x.id === (b.brandId ?? v.brandId)) }); return v; });

// کالا
const normC = (x: unknown) => String(x ?? '').toUpperCase().replace(/[^\p{L}\p{N}]/gu, '');
R('GET', '/products/lookup', ({ q, db }) => {
  const term = normC(q.q); const text = String(q.q ?? '').trim();
  const rows = db.products.filter((p: any) => !p.deletedAt && p.isActive !== false && (term || text) && [p.sku, p.oemCode, p.partNumber, p.barcode].some((c: any) => normC(c).includes(term) && term) || (text && p.name.includes(text)));
  const hits = rows.slice(0, +q.limit || 20).map((p: any) => {
    const sp = shapeProduct(db, p); const exact = [p.sku, p.oemCode, p.partNumber, p.barcode].some((c: any) => term && normC(c) === term);
    const alts = q.alternatives === 'false' ? [] : db.products.filter((o: any) => o.id !== p.id && o.categoryId === p.categoryId).slice(0, 3).map((o: any) => ({ reason: 'هم‌دسته و سازگار با همان خودرو', product: shapeProduct(db, o) }));
    return { ...sp, branchStock: sp.totalStock, otherBranchStock: 0, codes: [{ type: 'OEM', code: p.oemCode }].filter((c) => c.code), compatibilities: [], matchedBy: exact ? 'code-exact' : term ? 'code-partial' : 'name', alternatives: alts };
  });
  return hits;
});
R('GET', '/branches', () => MOCK_BRANCHES);
R('GET', '/roles', () => []);
R('GET', '/roles/permissions', () => ({ permissions: [{ key: 'products.view', label: 'مشاهده و جستجوی کالا', group: 'کالاها' }, { key: 'sales.create', label: 'صدور فاکتور فروش', group: 'فروش' }], systemRoles: [{ role: 'SALESMAN', permissions: ['products.view', 'sales.create'] }] }));
R('GET', '/data-import/history', () => []);
R('POST', '/data-import/products', ({ b }) => ({ dryRun: !!b.dryRun, created: b.rows.length, updated: 0, skipped: 0, errors: [], createdBrands: [], createdCategories: [] }));
R('POST', '/data-import/parties', ({ b }) => ({ dryRun: !!b.dryRun, created: b.rows.length, updated: 0, skipped: 0, errors: [], totalOpeningDebit: 0, totalOpeningCredit: 0 }));
R('POST', '/data-import/stock', ({ b }) => ({ dryRun: !!b.dryRun, updated: b.rows.length, unchanged: 0, errors: [], totalQuantityChange: 0 }));
R('GET', '/reports/product-movers', ({ db }) => {
  const rows = db.products.filter((p: any) => !p.isService).map((p: any) => ({ productId: p.id, sku: p.sku, name: p.name, stock: stockOf(db, p.id), soldQty: Math.floor(Math.random() * 40), lastSaleAt: null, daysSinceLastSale: null, stockValue: Math.round(stockOf(db, p.id) * p.purchasePrice), turnover: 1, coverDays: 30 }));
  const sold = rows.filter((r: any) => r.soldQty > 0).sort((a: any, b: any) => b.soldQty - a.soldQty); const half = Math.ceil(sold.length / 3);
  const dead = rows.filter((r: any) => r.soldQty === 0 && r.stock > 0);
  return { days: 30, summary: { fastCount: half, slowCount: sold.length - half, deadCount: dead.length, deadStockValue: dead.reduce((s: number, r: any) => s + r.stockValue, 0), totalSoldQty: 0 }, fast: sold.slice(0, half), slow: sold.slice(half).reverse(), dead };
});
R('GET', '/reports/debts', ({ db }) => {
  const mk = (p: any) => ({ id: p.id, name: p.name, code: p.code, mobile: p.mobile, partyType: p.partyType, balance: Math.abs(p.currentBalance), buckets: { current: Math.abs(p.currentBalance) * 0.4, d1_30: Math.abs(p.currentBalance) * 0.3, d31_60: Math.abs(p.currentBalance) * 0.2, d61_90: 0, d90plus: Math.abs(p.currentBalance) * 0.1 }, oldestOverdueDays: 40, lastPaymentAt: null, creditLimit: null });
  const pack = (list: any[]) => { const rows = list.map(mk); const t: any = { total: 0, current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 }; rows.forEach((r) => { t.total += r.balance; for (const k of ['current', 'd1_30', 'd31_60', 'd61_90', 'd90plus']) t[k] += (r.buckets as any)[k]; }); return { totals: t, rows }; };
  return { debtors: pack(db.parties.filter((p: any) => (p.partyType === 'CUSTOMER' && p.currentBalance > 0) || (p.partyType === 'SUPPLIER' && p.currentBalance < 0))), creditors: pack(db.parties.filter((p: any) => (p.partyType === 'SUPPLIER' && p.currentBalance > 0) || (p.partyType === 'CUSTOMER' && p.currentBalance < 0))) };
});
R('GET', '/products', ({ q, db }) => {
  const s = (q.search ?? '').toString().toLowerCase();
  let rows = db.products.filter((p: any) => !p.deleted && (q.isActive === undefined || String(p.isActive) === String(q.isActive)) && (!q.categoryId || p.categoryId === q.categoryId) && (!q.brandId || p.brandId === q.brandId) && (!q.vehicleId || p.compat.some((c: any) => c.vehicleId === q.vehicleId)) && (!s || [p.name, p.sku, p.oemCode, p.partNumber, p.barcode].some((x) => x && String(x).toLowerCase().includes(s))));
  rows = sortBy(rows, q, ['createdAt', 'name', 'sku', 'salePrice', 'purchasePrice'], 'createdAt');
  const r = page(rows, q); return { data: r.data.map((p: any) => shapeProduct(db, p)), meta: r.meta };
});
R('GET', '/products/:id', ({ db, p }) => {
  const pr = db.products.find((x: any) => x.id === p[0] && !x.deleted); if (!pr) throw new MockError('کالا پیدا نشد', 404);
  return { ...shapeProduct(db, pr), compatibilities: pr.compat.map((c: any) => ({ ...c, vehicle: db.vehicles.find((v: any) => v.id === c.vehicleId) })), substitutes: pr.subs.map((sid: string) => ({ substituteId: sid, substitute: shapeProduct(db, db.products.find((x: any) => x.id === sid)) })) };
});
R('POST', '/products', ({ b, db }) => {
  if (db.products.some((p: any) => !p.deleted && p.sku === b.sku)) throw new MockError('کالایی با این کد (SKU) وجود دارد', 409);
  const { initialQuantity, warehouseId, ...rest } = b; const p = { id: id('p'), isActive: true, isService: false, deleted: false, compat: [], subs: [], createdAt: iso(new Date()), minStock: 0, ...rest };
  db.products.push(p); if (initialQuantity > 0 && !p.isService) move(db, p.id, warehouseId || 'w1', initialQuantity, 'ADJUSTMENT_INCREASE', 'موجودی اولیه', 'initial'); return shapeProduct(db, p);
});
R('PATCH', '/products/:id', ({ b, db, p }) => { const pr = db.products.find((x: any) => x.id === p[0]); Object.assign(pr, b); return shapeProduct(db, pr); });
R('DELETE', '/products/:id', ({ db, p }) => { db.products.find((x: any) => x.id === p[0]).deleted = true; return {}; });
R('POST', '/products/:id/vehicles', ({ b, db, p }) => { const pr = db.products.find((x: any) => x.id === p[0]); if (!pr.compat.some((c: any) => c.vehicleId === b.vehicleId)) pr.compat.push({ vehicleId: b.vehicleId }); return {}; });
R('DELETE', '/products/:id/vehicles/:vid', ({ db, p }) => { const pr = db.products.find((x: any) => x.id === p[0]); pr.compat = pr.compat.filter((c: any) => c.vehicleId !== p[1]); return {}; });
R('POST', '/products/:id/substitutes', ({ b, db, p }) => { const pr = db.products.find((x: any) => x.id === p[0]); if (b.substituteId === pr.id) throw new MockError('کالا نمی‌تواند جایگزین خودش باشد'); if (!pr.subs.includes(b.substituteId)) pr.subs.push(b.substituteId); return {}; });
R('DELETE', '/products/:id/substitutes/:sid', ({ db, p }) => { const pr = db.products.find((x: any) => x.id === p[0]); pr.subs = pr.subs.filter((s: string) => s !== p[1]); return {}; });

// طرف حساب
R('GET', '/parties', ({ q, db }) => {
  const s = (q.search ?? '').toString().toLowerCase();
  let rows = db.parties.filter((p: any) => (!q.partyType || p.partyType === q.partyType) && (!q.withBalance || p.currentBalance !== 0) && (!s || [p.name, p.code, p.mobile].some((x) => x && String(x).toLowerCase().includes(s))));
  return page(sortBy(rows, { ...q, sortOrder: q.sortOrder ?? 'asc' }, ['name', 'code', 'currentBalance', 'createdAt'], 'name'), q);
});
R('GET', '/parties/:id', ({ db, p }) => { const x = db.parties.find((y: any) => y.id === p[0]); if (!x) throw new MockError('طرف حساب پیدا نشد', 404); return x; });
R('POST', '/parties', ({ b, db }) => { const n = db.parties.filter((p: any) => p.partyType === b.partyType).length + 1; const p = { id: id('pt'), code: `${b.partyType === 'CUSTOMER' ? 'C' : 'S'}-${String(n).padStart(4, '0')}`, currentBalance: 0, isActive: true, ...b }; db.parties.push(p); return p; });
R('PATCH', '/parties/:id', ({ b, db, p }) => Object.assign(db.parties.find((x: any) => x.id === p[0]), b));
R('DELETE', '/parties/:id', ({ db, p }) => { if (db.invoices.some((i: any) => i.partyId === p[0]) || db.payments.some((i: any) => i.partyId === p[0])) throw new MockError('این طرف حساب فاکتور، پرداخت یا چک دارد؛ به‌جای حذف، آن را غیرفعال کنید', 409); db.parties = db.parties.filter((x: any) => x.id !== p[0]); return {}; });
R('GET', '/parties/:id/statement', ({ db, p }) => {
  const party = db.parties.find((x: any) => x.id === p[0]); const cust = party.partyType === 'CUSTOMER';
  const base = cust ? 'SALE' : 'PURCHASE', back = cust ? 'SALE_RETURN' : 'PURCHASE_RETURN';
  const rows = [...db.invoices.filter((i: any) => i.partyId === party.id && i.status !== 'CANCELLED' && [base, back].includes(i.invoiceType)).map((i: any) => { const r = i.invoiceType === back; return { kind: 'INVOICE', id: i.id, date: i.date, ref: i.invoiceNumber, description: r ? (cust ? 'برگشت از فروش' : 'برگشت از خرید') : cust ? 'فاکتور فروش' : 'فاکتور خرید', debit: r ? 0 : i.totalAmount, credit: r ? i.totalAmount : 0 }; }),
    ...db.payments.filter((x: any) => x.partyId === party.id).map((x: any) => { const reduces = cust ? x.direction === 'RECEIVED' : x.direction === 'PAID'; return { kind: 'PAYMENT', id: x.id, date: x.date, ref: x.reference ?? '', description: `${reduces ? (cust ? 'دریافت' : 'پرداخت') : 'بازپرداخت'} (${x.method})`, debit: reduces ? 0 : x.amount, credit: reduces ? x.amount : 0 }; })].sort((a, b) => a.date.localeCompare(b.date));
  let bal = 0; return { party, currentBalance: party.currentBalance, entries: rows.map((r) => ({ ...r, balance: (bal += r.debit - r.credit) })) };
});

// فاکتور
(['sales', 'purchases'] as const).forEach((kind) => {
  const type = kind === 'sales' ? 'SALE' : 'PURCHASE';
  R('GET', `/${kind}`, ({ q, db }) => {
    const s = (q.search ?? '').toString().toLowerCase();
    const rows = db.invoices.filter((i: any) => i.invoiceType === type && (!q.status || i.status === q.status) && inRange(i.date, q) && (!s || i.invoiceNumber.toLowerCase().includes(s) || (partyOf(db, i.partyId)?.name ?? i.partyName ?? '').includes(q.search))).map((i: any) => ({ ...i, party: partyOf(db, i.partyId), _count: { items: i.items.length } }));
    return page(rows, q);
  });
  R('GET', `/${kind}/:id`, ({ db, p }) => { const i = db.invoices.find((x: any) => x.id === p[0]); if (!i) throw new MockError('فاکتور پیدا نشد', 404); return { ...i, party: partyOf(db, i.partyId), payments: db.payments.filter((x: any) => x.invoiceId === i.id).reverse() }; });
  R('POST', `/${kind}`, ({ b, db }) => {
    // همان رفتار بکند: ارسال دوباره‌ی یک clientRequestId همان فاکتور را برمی‌گرداند
    const dup = b.clientRequestId && db.invoices.find((i: any) => i.clientRequestId === b.clientRequestId);
    if (dup) return dup;
    const party = partyOf(db, b.partyId);
    const inv = createInvoice(db, type, { party, date: b.date ? new Date(b.date).toISOString() : undefined, lines: b.items, paid: b.payInFull ? 'full' : b.paidAmount ?? 0, vat: b.vatPercent, discount: b.discountAmount, warehouseId: b.warehouseId, notes: b.notes, method: b.paymentMethod });
    if (b.clientRequestId) inv.clientRequestId = b.clientRequestId;
    return inv;
  });
  R('POST', `/${kind}/:id/payments`, ({ b, db, p }) => { const i = db.invoices.find((x: any) => x.id === p[0]); return addPayment(db, { direction: type === 'SALE' ? 'RECEIVED' : 'PAID', method: b.method, amount: b.amount, invoice: i, date: b.date, reference: b.reference }); });
  R('POST', `/${kind}/:id/cancel`, ({ b, db, p }) => {
    const i = db.invoices.find((x: any) => x.id === p[0]); if (i.status === 'CANCELLED') throw new MockError('فاکتور قبلاً لغو شده است');
    i.items.forEach((it: any) => move(db, it.productId, i.warehouseId, type === 'SALE' ? it.quantity : -it.quantity, type === 'SALE' ? 'SALE_RETURN' : 'PURCHASE_RETURN', `لغو فاکتور ${i.invoiceNumber}: ${b.reason}`, 'invoice'));
    const party = partyOf(db, i.partyId); if (party) party.currentBalance -= i.totalAmount; i.status = 'CANCELLED'; i.remainingAmount = 0; return i;
  });
});

// پرداخت و چک
R('GET', '/payments', ({ q, db }) => page(db.payments.filter((x: any) => (!q.direction || x.direction === q.direction) && (!q.method || x.method === q.method)).map((x: any) => ({ ...x, party: partyOf(db, x.partyId), invoice: db.invoices.find((i: any) => i.id === x.invoiceId) })), q));
R('POST', '/payments', ({ b, db }) => addPayment(db, { direction: b.direction, method: b.method, amount: b.amount, partyId: b.partyId, date: b.date, reference: b.reference, notes: b.notes }));
const shapeCheck = (db: any, c: any) => ({ ...c, party: partyOf(db, c.partyId) });
R('GET', '/checks', ({ q, db }) => page(db.checks.filter((c: any) => (!q.checkType || c.checkType === q.checkType) && (!q.status || c.status === q.status)).sort((a: any, b: any) => a.dueDate.localeCompare(b.dueDate)).map((c: any) => shapeCheck(db, c)), q));
R('GET', '/checks/due', ({ q, db }) => { const until = Date.now() + (Number(q.days) || 7) * 86400000; return db.checks.filter((c: any) => c.status === 'PENDING' && new Date(c.dueDate).getTime() <= until).sort((a: any, b: any) => a.dueDate.localeCompare(b.dueDate)).map((c: any) => shapeCheck(db, c)); });
R('POST', '/checks', ({ b, db }) => { const c = { id: id('k'), status: 'PENDING', ...b, dueDate: new Date(b.dueDate).toISOString() }; db.checks.push(c); return shapeCheck(db, c); });
R('POST', '/checks/:id/cash', ({ db, p }) => { const c = db.checks.find((x: any) => x.id === p[0]); if (c.status !== 'PENDING') throw new MockError('فقط چک‌های در انتظار وصول قابل وصول هستند'); c.status = 'CASHED'; addPayment(db, { direction: c.checkType === 'RECEIVED' ? 'RECEIVED' : 'PAID', method: 'CHECK', amount: c.amount, partyId: c.partyId, reference: `چک ${c.checkNumber} - ${c.bankName}` }); return shapeCheck(db, c); });
R('POST', '/checks/:id/bounce', ({ b, db, p }) => { const c = db.checks.find((x: any) => x.id === p[0]); c.status = 'BOUNCED'; c.bouncedReason = b.reason; return shapeCheck(db, c); });
R('POST', '/checks/:id/cancel', ({ db, p }) => { const c = db.checks.find((x: any) => x.id === p[0]); c.status = 'CANCELLED'; return shapeCheck(db, c); });

// انبار
const shapeInv = (db: any, i: any) => { const p = db.products.find((x: any) => x.id === i.productId); return { ...i, availableQuantity: i.quantity, lots: i.quantity > 0 ? [{ id: `lot-${i.id}`, unitCost: p.purchasePrice, quantity: i.quantity }] : [], product: { ...p, unit: db.units.find((u: any) => u.id === p.unitId) }, warehouse: db.warehouses.find((w: any) => w.id === i.warehouseId) }; };
R('GET', '/inventory', ({ q, db }) => db.inventory.filter((i: any) => (!q.warehouseId || i.warehouseId === q.warehouseId) && !db.products.find((p: any) => p.id === i.productId).deleted).map((i: any) => shapeInv(db, i)));
R('GET', '/inventory/lots', ({ q, db }) => { const w = q.warehouseId || db.warehouses[0].id; const i = db.inventory.find((x: any) => x.productId === q.productId && x.warehouseId === w); const p = db.products.find((x: any) => x.id === q.productId); return { warehouseId: w, lots: i && i.quantity > 0 ? [{ id: `lot-${i.id}`, unitCost: p.purchasePrice, quantity: i.quantity }] : [] }; });
R('GET', '/inventory/lots/all', ({ db }) => ({ warehouseId: db.warehouses[0].id, lots: db.inventory.filter((i: any) => i.warehouseId === db.warehouses[0].id && i.quantity > 0).map((i: any) => ({ id: `lot-${i.id}`, productId: i.productId, unitCost: db.products.find((x: any) => x.id === i.productId).purchasePrice, quantity: i.quantity })) }));
R('GET', '/inventory/low-stock', ({ db }) => db.products.filter((p: any) => !p.deleted && p.isActive && !p.isService && p.minStock > 0).map((p: any) => ({ id: p.id, sku: p.sku, name: p.name, minStock: p.minStock, location: p.location, stock: stockOf(db, p.id), shortage: Math.max(0, p.minStock - stockOf(db, p.id)) })).filter((p: any) => p.stock <= p.minStock).sort((a: any, b: any) => a.stock - a.minStock - (b.stock - b.minStock)));
R('GET', '/inventory/value', ({ db }) => { const buy = db.inventory.reduce((s: number, i: any) => s + i.quantity * db.products.find((p: any) => p.id === i.productId).purchasePrice, 0); const sell = db.inventory.reduce((s: number, i: any) => s + i.quantity * db.products.find((p: any) => p.id === i.productId).salePrice, 0); return { totalPurchaseValue: buy, totalSaleValue: sell, potentialProfit: sell - buy }; });
R('GET', '/inventory/transactions', ({ q, db }) => page(db.txs.filter((t: any) => !q.warehouseId || t.warehouseId === q.warehouseId).map((t: any) => ({ ...t, product: db.products.find((p: any) => p.id === t.productId), warehouse: db.warehouses.find((w: any) => w.id === t.warehouseId), creator: { name: 'امین رضایی' } })), q));
R('POST', '/inventory/adjust', ({ b, db }) => { move(db, b.productId, b.warehouseId, b.transactionType === 'ADJUSTMENT_INCREASE' ? b.quantity : -b.quantity, b.transactionType, b.notes, 'adjustment'); return {}; });
R('POST', '/inventory/transfer', ({ b, db }) => { if (b.fromWarehouseId === b.toWarehouseId) throw new MockError('انبار مبدأ و مقصد یکی است'); move(db, b.productId, b.fromWarehouseId, -b.quantity, 'TRANSFER_OUT', b.notes, 'transfer'); move(db, b.productId, b.toWarehouseId, b.quantity, 'TRANSFER_IN', b.notes, 'transfer'); return {}; });
R('POST', '/inventory/stock-count', ({ b, db }) => { b.items.forEach((it: any) => { const row = db.inventory.find((i: any) => i.productId === it.productId && i.warehouseId === it.warehouseId); const diff = it.countedQuantity - (row?.quantity ?? 0); if (diff) move(db, it.productId, it.warehouseId, diff, diff > 0 ? 'ADJUSTMENT_INCREASE' : 'ADJUSTMENT_DECREASE', 'انبارگردانی', 'stock-count'); }); return {}; });

// گزارش
const valid = (db: any) => db.invoices.filter((i: any) => i.invoiceType === 'SALE' && i.status !== 'CANCELLED');
R('GET', '/reports/dashboard', ({ db }) => {
  const t0 = day(iso(new Date())); const sales = valid(db); const sum = (f: Date) => { const r = sales.filter((i: any) => day(i.date) >= f); return { total: r.reduce((s: number, i: any) => s + i.totalAmount, 0), count: r.length }; };
  const days = Array.from({ length: 30 }, (_, k) => { const d = new Date(t0.getTime() - (29 - k) * DAY); return { date: iso(d), total: sales.filter((i: any) => day(i.date).getTime() === d.getTime()).reduce((s: number, i: any) => s + i.totalAmount, 0) }; });
  const monthStart = new Date(t0.getTime() - 16 * DAY);
  return { today: sum(t0), month: sum(monthStart), receivable: db.parties.filter((p: any) => p.partyType === 'CUSTOMER' && p.currentBalance > 0).reduce((s: number, p: any) => s + p.currentBalance, 0), payable: db.parties.filter((p: any) => p.partyType === 'SUPPLIER' && p.currentBalance > 0).reduce((s: number, p: any) => s + p.currentBalance, 0),
    lowStockCount: db.products.filter((p: any) => !p.deleted && p.isActive && !p.isService && p.minStock > 0 && stockOf(db, p.id) <= p.minStock).length,
    dueChecks: db.checks.filter((c: any) => c.status === 'PENDING' && new Date(c.dueDate).getTime() <= t0.getTime() + 7 * DAY).sort((a: any, b: any) => a.dueDate.localeCompare(b.dueDate)).map((c: any) => shapeCheck(db, c)),
    recentInvoices: db.invoices.filter((i: any) => i.invoiceType === 'SALE').slice(0, 6).map((i: any) => ({ ...i, party: partyOf(db, i.partyId) })), salesLast30Days: days };
});
R('GET', '/reports/sales', ({ q, db }) => {
  const rows = new Map<string, any>(); const f = q.from ?? '0000'; const t = q.to ?? '9999';
  valid(db).filter((i: any) => i.date.slice(0, 10) >= f && i.date.slice(0, 10) <= t).forEach((i: any) => {
    const d = new Date(i.date); const key = q.groupBy === 'month' ? `${d.getFullYear()}-${d.getMonth()}` : d.toDateString();
    const label = new Intl.DateTimeFormat('fa-IR-u-ca-persian-nu-latn', q.groupBy === 'month' ? { year: 'numeric', month: 'long' } : { year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    const r = rows.get(key) ?? { label, sort: d.getTime(), count: 0, total: 0, vat: 0, discount: 0 }; r.count++; r.total += i.totalAmount; r.vat += i.vatAmount; r.discount += i.discountAmount; rows.set(key, r);
  });
  const list = [...rows.values()].sort((a, b) => a.sort - b.sort);
  return { rows: list, totals: list.reduce((t, r) => ({ count: t.count + r.count, total: t.total + r.total, vat: t.vat + r.vat, discount: t.discount + r.discount }), { count: 0, total: 0, vat: 0, discount: 0 }) };
});
R('GET', '/reports/top-products', ({ q, db }) => {
  const m = new Map<string, any>(); valid(db).filter((i: any) => i.date.slice(0, 10) >= (q.from ?? '') && i.date.slice(0, 10) <= (q.to ?? '9999')).forEach((i: any) => i.items.forEach((it: any) => { const r = m.get(it.productId) ?? { productId: it.productId, name: it.productName, sku: it.sku, quantity: 0, revenue: 0 }; r.quantity += it.quantity; r.revenue += it.totalPrice; m.set(it.productId, r); }));
  return [...m.values()].sort((a, b) => b.revenue - a.revenue).slice(0, +q.limit || 10);
});
R('GET', '/reports/profit', ({ q, db }) => {
  const inv = valid(db).filter((i: any) => i.date.slice(0, 10) >= (q.from ?? '') && i.date.slice(0, 10) <= (q.to ?? '9999'));
  const back = db.invoices.filter((i: any) => i.invoiceType === 'SALE_RETURN' && i.status !== 'CANCELLED' && i.date.slice(0, 10) >= (q.from ?? '') && i.date.slice(0, 10) <= (q.to ?? '9999'));
  const cost = (list: any[]) => list.reduce((s: number, i: any) => s + i.items.reduce((a: number, it: any) => a + it.quantity * (db.products.find((p: any) => p.id === it.productId)?.purchasePrice ?? 0), 0), 0);
  const revenue = inv.reduce((s: number, i: any) => s + i.subtotal - i.discountAmount, 0) - back.reduce((s: number, i: any) => s + i.subtotal, 0);
  const cogs = cost(inv) - cost(back); const expenses = exIn(db, q).reduce((s: number, e: any) => s + e.amount, 0);
  return { revenue, cogs, grossProfit: revenue - cogs, expenses, netProfit: revenue - cogs - expenses, marginPercent: revenue ? Math.round(((revenue - cogs) / revenue) * 1000) / 10 : 0 };
});
R('GET', '/reports/receivables', ({ q, db }) => { const parties = db.parties.filter((p: any) => p.partyType === (q.type ?? 'CUSTOMER') && p.currentBalance !== 0).sort((a: any, b: any) => b.currentBalance - a.currentBalance); return { total: parties.reduce((s: number, p: any) => s + p.currentBalance, 0), parties }; });

// تنظیمات
R('GET', '/tenants/current', ({ db }) => ({ ...db.tenant, usage: { products: db.products.filter((p: any) => !p.deleted).length, users: db.users.filter((u: any) => u.isActive).length } }));
R('PATCH', '/tenants/current', ({ b, db }) => Object.assign(db.tenant, b));
R('GET', '/users', ({ db }) => db.users);
R('POST', '/users/:id/reset-password', ({ db, p, b }) => { if (!db.users.some((u: any) => u.id === p[0])) throw new MockError('کاربر پیدا نشد', 404); if (String(b.password ?? '').length < 6) throw new MockError('رمز باید حداقل ۶ کاراکتر باشد', 400); return { reset: true }; });
R('POST', '/users', ({ b, db }) => { if (db.users.some((u: any) => u.phone === b.phone)) throw new MockError('این شماره موبایل قبلاً ثبت شده است', 409); const u = { id: id('u'), isActive: true, ...b }; delete u.password; db.users.push(u); return u; });
R('PATCH', '/users/:id', ({ b, db, p }) => Object.assign(db.users.find((u: any) => u.id === p[0]), b));


// برگشتی
R('GET', '/returns', ({ q, db }) => {
  const types = q.kind === 'sale' ? ['SALE_RETURN'] : q.kind === 'purchase' ? ['PURCHASE_RETURN'] : ['SALE_RETURN', 'PURCHASE_RETURN'];
  const rows = db.invoices.filter((i: any) => types.includes(i.invoiceType) && (!q.originalInvoiceId || i.originalInvoiceId === q.originalInvoiceId) && (!q.search || i.invoiceNumber.includes(q.search) || (partyOf(db, i.partyId)?.name ?? '').includes(q.search)))
    .map((i: any) => ({ ...i, party: partyOf(db, i.partyId), original: db.invoices.find((x: any) => x.id === i.originalInvoiceId), _count: { items: i.items.length } }));
  return page(rows, q);
});
R('GET', '/returns/invoice/:kind/:iid/returnable', ({ db, p }) => {
  const inv = db.invoices.find((x: any) => x.id === p[1]); if (!inv) throw new MockError('فاکتور پیدا نشد', 404);
  return { invoiceId: inv.id, invoiceNumber: inv.invoiceNumber, partyName: partyOf(db, inv.partyId)?.name ?? inv.partyName, items: inv.items.map((it: any) => { const ret = returnedQty(db, it.id); return { originalItemId: it.id, productId: it.productId, productName: it.productName, sku: it.sku, soldQuantity: it.quantity, returnedQuantity: ret, returnableQuantity: it.quantity - ret, unitRefund: Math.round(it.totalPrice / it.quantity) }; }) };
});
R('POST', '/returns/invoice/:kind/:iid', ({ b, db, p }) => {
  const sale = p[0] === 'sale'; const orig = db.invoices.find((x: any) => x.id === p[1]); const party = partyOf(db, orig.partyId);
  const lines = b.items.map((l: any) => { const it = orig.items.find((x: any) => x.id === l.originalItemId); const left = it.quantity - returnedQty(db, it.id); if (l.quantity > left) throw new MockError(`تعداد برگشتی «${it.productName}» از مقدار قابل برگشت (${left}) بیشتر است`); const r = l.quantity / it.quantity; return { it, qty: l.quantity, total: Math.round(it.totalPrice * r), vat: Math.round(it.vatAmount * r) }; });
  const total = lines.reduce((s: number, l: any) => s + l.total, 0); const vat = lines.reduce((s: number, l: any) => s + l.vat, 0);
  const refund = b.refundAmount ?? (party ? 0 : total);
  if (refund > total) throw new MockError('مبلغ بازپرداخت از مبلغ برگشتی بیشتر است');
  if (!party && refund < total) throw new MockError('برای فاکتور بدون طرف‌حساب، کل مبلغ برگشتی باید نقد تسویه شود');
  lines.forEach((l: any) => { const pr = db.products.find((x: any) => x.id === l.it.productId); if (!pr.isService) move(db, pr.id, orig.warehouseId, sale ? l.qty : -l.qty, sale ? 'SALE_RETURN' : 'PURCHASE_RETURN', `برگشت از ${orig.invoiceNumber}: ${b.reason}`, 'invoice'); });
  const key = `${sale ? 'SR' : 'PR'}`; db.seq[key] = (db.seq[key] ?? 0) + 1; const d = new Date(); const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  const ret = { id: id('ret'), invoiceType: sale ? 'SALE_RETURN' : 'PURCHASE_RETURN', invoiceNumber: `${key}-${ym}-${String(db.seq[key]).padStart(4, '0')}`, date: iso(d), createdAt: iso(d), status: refund >= total ? 'PAID' : 'CONFIRMED', subtotal: total - vat, discountAmount: 0, vatAmount: vat, vatPercent: orig.vatPercent, totalAmount: total, paidAmount: refund, remainingAmount: total - refund, partyId: orig.partyId, partyName: orig.partyName, notes: b.reason, originalInvoiceId: orig.id, creator: { name: 'امین رضایی' },
    items: lines.map((l: any) => ({ id: id('it'), productId: l.it.productId, productName: l.it.productName, sku: l.it.sku, quantity: l.qty, unitPrice: l.it.unitPrice, discountAmount: 0, vatAmount: l.vat, totalPrice: l.total, unit: l.it.unit, originalItemId: l.it.id })) };
  db.invoices.unshift(ret); if (party) party.currentBalance -= total;
  if (refund > 0) { db.payments.unshift({ id: id('pay'), direction: sale ? 'PAID' : 'RECEIVED', method: b.refundMethod ?? 'CASH', amount: refund, date: iso(d), partyId: party?.id ?? null, invoiceId: ret.id, notes: `بازپرداخت برگشتی ${ret.invoiceNumber}` }); if (party) party.currentBalance += refund; }
  return ret;
});
R('GET', '/returns/:id', ({ db, p }) => { const i = db.invoices.find((x: any) => x.id === p[0]); if (!i) throw new MockError('فاکتور برگشتی پیدا نشد', 404); return { ...i, party: partyOf(db, i.partyId), original: db.invoices.find((x: any) => x.id === i.originalInvoiceId) }; });

// پیش‌فاکتور
R('GET', '/proformas', ({ q, db }) => {
  const st: Record<string, string> = { OPEN: 'DRAFT', CONVERTED: 'CONFIRMED', CANCELLED: 'CANCELLED' };
  return page(db.invoices.filter((i: any) => i.invoiceType === 'PROFORMA' && (!q.state || i.status === st[q.state]) && (!q.search || i.invoiceNumber.includes(q.search) || (partyOf(db, i.partyId)?.name ?? '').includes(q.search))).map((i: any) => pfShape(db, i)), q);
});
R('GET', '/proformas/:id', ({ db, p }) => { const i = db.invoices.find((x: any) => x.id === p[0] && x.invoiceType === 'PROFORMA'); if (!i) throw new MockError('پیش‌فاکتور پیدا نشد', 404); return pfShape(db, i); });
R('POST', '/proformas', ({ b, db }) => {
  const calc = calcInvoice(b.items.map((l: any) => ({ quantity: l.quantity, unitPrice: l.unitPrice, discountPercent: l.discountPercent ?? 0 })), { discountAmount: b.discountAmount, vatPercent: b.vatPercent ?? 9 });
  db.seq.PF = (db.seq.PF ?? 0) + 1; const d = new Date(); const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  const inv = { id: id('pf'), invoiceType: 'PROFORMA', invoiceNumber: `PF-${ym}-${String(db.seq.PF).padStart(4, '0')}`, date: b.date ? new Date(b.date).toISOString() : iso(d), createdAt: iso(d), dueDate: b.validUntil ? new Date(b.validUntil).toISOString() : iso(new Date(Date.now() + 7 * DAY)), status: 'DRAFT', subtotal: calc.subtotal, discountAmount: calc.invoiceDiscount, vatAmount: calc.vatAmount, vatPercent: b.vatPercent ?? 9, totalAmount: calc.total, paidAmount: 0, remainingAmount: calc.total, partyId: b.partyId ?? null, notes: b.notes, creator: { name: 'امین رضایی' },
    items: b.items.map((l: any, i: number) => { const pr = db.products.find((x: any) => x.id === l.productId); return { id: id('it'), productId: pr.id, productName: pr.name, sku: pr.sku, quantity: l.quantity, unitPrice: l.unitPrice, discountPercent: l.discountPercent ?? 0, discountAmount: calc.items[i].ld, vatAmount: calc.items[i].vat, totalPrice: calc.items[i].total, unit: db.units.find((u: any) => u.id === pr.unitId) }; }) };
  db.invoices.unshift(inv); return inv;
});
R('POST', '/proformas/:id/convert', ({ b, db, p }) => {
  const pf = db.invoices.find((x: any) => x.id === p[0]); if (pf.status !== 'DRAFT') throw new MockError('این پیش‌فاکتور قبلاً تبدیل شده است');
  const sale = createInvoice(db, 'SALE', { party: partyOf(db, pf.partyId), lines: pf.items.map((i: any) => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice, discountPercent: i.discountPercent })), paid: b.paidAmount ?? 0, vat: pf.vatPercent, discount: pf.discountAmount, method: b.paymentMethod });
  pf.status = 'CONFIRMED'; pf.convertedToId = sale.id; return sale;
});
R('POST', '/proformas/:id/cancel', ({ db, p }) => { const pf = db.invoices.find((x: any) => x.id === p[0]); if (pf.status !== 'DRAFT') throw new MockError('فقط پیش‌فاکتور باز قابل ابطال است'); pf.status = 'CANCELLED'; return pf; });

// هزینه‌ها
const exIn = (db: any, q: Q) => db.expenses.filter((e: any) => (!q.category || e.category === q.category) && e.date.slice(0, 10) >= (q.from ?? '') && e.date.slice(0, 10) <= (q.to ?? '9999')).sort((a: any, b: any) => b.date.localeCompare(a.date));
R('GET', '/expenses', ({ q, db }) => { const rows = exIn(db, q); const r = page(rows, q); return { data: r.data, meta: { ...r.meta, totalAmount: rows.reduce((s: number, e: any) => s + e.amount, 0) } }; });
R('GET', '/expenses/summary', ({ q, db }) => { const m = new Map<string, any>(); exIn(db, q).forEach((e: any) => { const c = m.get(e.category) ?? { category: e.category, total: 0, count: 0 }; c.total += e.amount; c.count++; m.set(e.category, c); }); const categories = [...m.values()].sort((a, b) => b.total - a.total); return { total: categories.reduce((s, c) => s + c.total, 0), categories }; });
R('POST', '/expenses', ({ b, db }) => { const e = { id: id('ex'), method: 'CASH', ...b, date: b.date ? new Date(b.date).toISOString() : iso(new Date()) }; db.expenses.unshift(e); return e; });
R('DELETE', '/expenses/:id', ({ db, p }) => { db.expenses = db.expenses.filter((e: any) => e.id !== p[0]); return { removed: true }; });

// ورود و خروج کالا + گزارش فعالیت
R('GET', '/products/export', ({ db }) => db.products.filter((p: any) => !p.deleted).map((p: any) => ({ sku: p.sku, name: p.name, unit: db.units.find((u: any) => u.id === p.unitId)?.name, category: db.categories.find((c: any) => c.id === p.categoryId)?.name ?? '', brand: db.brands.find((b: any) => b.id === p.brandId)?.name ?? '', purchasePrice: p.purchasePrice, salePrice: p.salePrice, wholesalePrice: p.wholesalePrice ?? '', minStock: p.minStock, stock: stockOf(db, p.id), oemCode: p.oemCode ?? '', partNumber: '', barcode: '', location: p.location ?? '', warrantyMonths: p.warrantyMonths ?? '' })));
R('POST', '/products/import', ({ b, db }) => {
  const res: any = { dryRun: !!b.dryRun, created: 0, updated: 0, skipped: 0, errors: [], createdBrands: [], createdCategories: [] }; const seen = new Set<string>();
  b.rows.forEach((r: any, i: number) => {
    const err = (m: string) => res.errors.push({ row: i + 1, sku: r.sku, message: m }); const key = String(r.sku).toLowerCase();
    if (seen.has(key)) return err('کد (SKU) در همین فایل تکراری است'); seen.add(key);
    const ex = db.products.find((p: any) => !p.deleted && p.sku.toLowerCase() === key);
    if (ex) { if (!b.updateExisting) { res.skipped++; return; } if (!b.dryRun) Object.assign(ex, Object.fromEntries(['salePrice', 'purchasePrice', 'minStock', 'oemCode', 'location'].filter((k) => r[k] !== undefined).map((k) => [k, r[k]]))); res.updated++; return; }
    if (!r.name) return err('نام کالا خالی است'); if (r.salePrice === undefined) return err('قیمت فروش مشخص نشده است');
    const unit = r.unit ? db.units.find((u: any) => u.name === r.unit || u.code === r.unit) : db.units[0]; if (!unit) return err(`واحد «${r.unit}» تعریف نشده است`);
    let cat = r.category && db.categories.find((c: any) => c.name === r.category); let br = r.brand && db.brands.find((x: any) => x.name === r.brand);
    if (r.category && !cat) { res.createdCategories.push(r.category); if (!b.dryRun) { cat = { id: id('c'), name: r.category, parentId: null, level: 1 }; db.categories.push(cat); } }
    if (r.brand && !br) { res.createdBrands.push(r.brand); if (!b.dryRun) { br = { id: id('b'), name: r.brand, kind: 'PART', code: id('imp') }; db.brands.push(br); } }
    if (!b.dryRun) { const pr = { id: id('p'), sku: r.sku, name: r.name, unitId: unit.id, categoryId: cat?.id, brandId: br?.id, purchasePrice: r.purchasePrice ?? 0, salePrice: r.salePrice, minStock: r.minStock ?? 0, oemCode: r.oemCode, location: r.location, isActive: true, isService: false, deleted: false, compat: [], subs: [], createdAt: iso(new Date()) }; db.products.push(pr); if (r.initialQuantity > 0) move(db, pr.id, 'w1', r.initialQuantity, 'ADJUSTMENT_INCREASE', 'موجودی اولیه (ورود از فایل)', 'import'); }
    res.created++;
  });
  return res;
});

// مودیان (شبیه‌سازی)
const mdState = (db: any) => db.moodian;
const mdIssues = (db: any, inv: any) => { const out: string[] = []; const m = mdState(db); if (!m.memoryId) out.push('شناسه یکتای حافظه مالیاتی در تنظیمات مودیان ثبت نشده است'); inv.items.forEach((it: any, i: number) => { const p = db.products.find((x: any) => x.id === it.productId); if (!/^\d{13}$/.test(p?.taxGoodsId ?? '')) out.push(`ردیف ${i + 1} («${it.productName}»): شناسه ۱۳ رقمی کالا/خدمت ثبت نشده است`); }); return out; };
R('GET', '/moodian/settings', ({ db }) => { const m = mdState(db); const c = (st: string | null) => db.invoices.filter((i: any) => ['SALE', 'SALE_RETURN'].includes(i.invoiceType) && (i.taxStatus ?? null) === st && i.status !== 'CANCELLED').length;
  return { ...m, ready: !!(m.memoryId && m.economicCode && m.hasPrivateKey && m.hasServerKey), encryptionConfigured: true, counts: { notSent: c(null), pending: c('PENDING'), success: c('SUCCESS'), failed: c('FAILED') } }; });
R('PUT', '/moodian/settings', ({ b, db }) => { const m = mdState(db); const { privateKey, enabled, ...rest } = b; Object.assign(m, Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined))); if (privateKey) m.hasPrivateKey = true;
  if (enabled !== undefined) { if (enabled && !(m.memoryId && m.economicCode && m.hasPrivateKey && m.hasServerKey)) throw new MoodianLikeError(); m.enabled = enabled; } return {}; });
class MoodianLikeError extends MockError { constructor() { super('پیش از فعال‌سازی، شناسه حافظه، شماره اقتصادی، کلید خصوصی و کلید عمومی سازمان را کامل کنید'); } }
R('POST', '/moodian/settings/fetch-server-key', ({ db }) => { Object.assign(mdState(db), { hasServerKey: true, serverKeyId: 'MOCK-KEY-1' }); return {}; });
R('POST', '/moodian/settings/test', ({ db }) => { const m = mdState(db); if (!m.hasPrivateKey) throw new MockError('شناسه حافظه مالیاتی و کلید خصوصی در تنظیمات مودیان ثبت نشده است'); return { ok: true, environment: m.environment }; });
R('GET', '/moodian/invoices/:id/preview', ({ db, p }) => { const inv = db.invoices.find((x: any) => x.id === p[0]); const issues = mdIssues(db, inv); if (inv.taxStatus === 'SUCCESS') issues.unshift('این فاکتور قبلاً در سامانه مودیان ثبت شده است');
  return { issues, currentStatus: inv.taxStatus ?? null, payload: { header: { taxid: inv.taxAuthorityId ?? '(هنگام ارسال ساخته می‌شود)', inty: partyOf(db, inv.partyId) ? 2 : 2, inp: 1, ins: inv.invoiceType === 'SALE_RETURN' ? 4 : 1, tins: mdState(db).economicCode, tprdis: Math.round(inv.subtotal * 10), tvam: Math.round(inv.vatAmount * 10), tbill: Math.round(inv.totalAmount * 10), setm: inv.remainingAmount <= 0 ? 1 : inv.paidAmount > 0 ? 3 : 2 },
    body: inv.items.map((it: any) => ({ sstid: db.products.find((x: any) => x.id === it.productId)?.taxGoodsId ?? '', sstt: it.productName, am: it.quantity, mu: '1627', fee: Math.round(it.unitPrice * 10), vra: 9, vam: Math.round(it.vatAmount * 10), tsstam: Math.round(it.totalPrice * 10) })) } }; });
const mdSend = (db: any, inv: any) => { const issues = mdIssues(db, inv); if (issues.length) throw new MockError(`فاکتور برای ارسال به مودیان کامل نیست: ${issues.join(' — ')}`);
  if (inv.taxStatus === 'SUCCESS') throw new MockError('این فاکتور قبلاً در سامانه مودیان ثبت شده است'); if (inv.taxStatus === 'PENDING') throw new MockError('ارسال‌شده و در انتظار پاسخ سازمان است؛ وضعیت را استعلام کنید');
  const n = ++uid; Object.assign(inv, { taxStatus: 'PENDING', taxAuthorityId: mockTaxId(n), taxAuthorityRef: `REF-${n}`, taxAuthoritySentAt: iso(new Date()), taxAuthorityError: null }); return inv; };
R('POST', '/moodian/invoices/:id/send', ({ db, p }) => { const inv = db.invoices.find((x: any) => x.id === p[0]); mdSend(db, inv); return { taxId: inv.taxAuthorityId, referenceNumber: inv.taxAuthorityRef, status: 'PENDING' }; });
const mdInquire = (inv: any) => { if (inv.taxStatus === 'PENDING') { Object.assign(inv, { taxStatus: 'SUCCESS', taxConfirmationId: `CONF-${++uid}` }); } return { id: inv.id, status: inv.taxStatus }; };
R('POST', '/moodian/invoices/:id/inquiry', ({ db, p }) => [mdInquire(db.invoices.find((x: any) => x.id === p[0]))]);
R('POST', '/moodian/sync', ({ db }) => { const pend = db.invoices.filter((i: any) => i.taxStatus === 'PENDING'); pend.forEach(mdInquire); const unsent = db.invoices.filter((i: any) => i.invoiceType === 'SALE' && !i.taxStatus && i.status !== 'CANCELLED').slice(0, 25); const failed: any[] = []; let sent = 0;
  unsent.forEach((i: any) => { try { mdSend(db, i); sent++; } catch (e) { failed.push({ invoiceNumber: i.invoiceNumber, reason: (e as Error).message }); } }); mdState(db).lastSyncAt = iso(new Date()); return { inquired: pend.length, confirmed: pend.length, sent, failed }; });

// برگشتی مستقل
R('POST', '/returns/standalone/:kind', ({ b, db, p }) => {
  const sale = p[0] === 'sale'; const party = partyOf(db, b.partyId);
  const calc = calcInvoice(b.items.map((l: any) => ({ quantity: l.quantity, unitPrice: l.unitPrice, discountPercent: 0 })), { vatPercent: b.vatPercent ?? 9 });
  const refund = b.refundAmount ?? (party ? 0 : calc.total);
  if (refund > calc.total) throw new MockError('مبلغ بازپرداخت از مبلغ برگشتی بیشتر است'); if (!party && refund < calc.total) throw new MockError('بدون طرف‌حساب، کل مبلغ برگشتی باید نقد تسویه شود');
  b.items.forEach((l: any) => { const pr = db.products.find((x: any) => x.id === l.productId); if (!pr.isService) move(db, pr.id, 'w1', sale ? l.quantity : -l.quantity, sale ? 'SALE_RETURN' : 'PURCHASE_RETURN', `برگشتی مستقل: ${b.reason}`, 'invoice'); });
  const key = sale ? 'SR' : 'PR'; db.seq[key] = (db.seq[key] ?? 0) + 1; const d = new Date(); const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  const ret = { id: id('ret'), invoiceType: sale ? 'SALE_RETURN' : 'PURCHASE_RETURN', invoiceNumber: `${key}-${ym}-${String(db.seq[key]).padStart(4, '0')}`, date: iso(d), createdAt: iso(d), status: refund >= calc.total ? 'PAID' : 'CONFIRMED', subtotal: calc.subtotal, discountAmount: 0, vatAmount: calc.vatAmount, vatPercent: b.vatPercent ?? 9, totalAmount: calc.total, paidAmount: refund, remainingAmount: calc.total - refund, partyId: party?.id ?? null, notes: b.reason, creator: { name: 'امین رضایی' },
    items: b.items.map((l: any, i: number) => { const pr = db.products.find((x: any) => x.id === l.productId); return { id: id('it'), productId: pr.id, productName: pr.name, sku: pr.sku, quantity: l.quantity, unitPrice: l.unitPrice, discountAmount: 0, vatAmount: calc.items[i].vat, totalPrice: calc.items[i].total, unit: db.units.find((u: any) => u.id === pr.unitId) }; }) };
  db.invoices.unshift(ret); if (party) party.currentBalance -= calc.total;
  if (refund > 0) { db.payments.unshift({ id: id('pay'), direction: sale ? 'PAID' : 'RECEIVED', method: b.refundMethod ?? 'CASH', amount: refund, date: iso(d), partyId: party?.id ?? null, invoiceId: ret.id, notes: `بازپرداخت برگشتی ${ret.invoiceNumber}` }); if (party) party.currentBalance += refund; }
  return ret;
});

// پیامک
R('GET', '/sms/settings', ({ db }) => ({ ...db.sms, encryptionConfigured: true }));
R('PUT', '/sms/settings', ({ b, db }) => { const { apiKey, enabled, ...rest } = b; Object.assign(db.sms, Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined))); if (apiKey) db.sms.hasApiKey = true; if (enabled !== undefined) { if (enabled && db.sms.provider !== 'log' && (!db.sms.hasApiKey || !db.sms.sender)) throw new MockError('برای فعال‌سازی، کلید API و شماره خط ارسال‌کننده را وارد کنید'); db.sms.enabled = enabled; } return {}; });
const smsSend = (db: any, receptor: string, message: string, kind: string) => { if (!db.sms.enabled) throw new MockError('ارسال پیامک فعال نیست (تنظیمات ← پیامک)'); if (!/^09\d{9}$/.test(receptor)) throw new MockError('شماره موبایل معتبر نیست'); db.smsLogs.unshift({ id: id('sms'), receptor, kind, message, status: 'SENT', createdAt: iso(new Date()) }); };
R('POST', '/sms/test', ({ b, db }) => { smsSend(db, b.receptor, 'پیامک آزمایشی', 'TEST'); return { sent: true }; });
R('POST', '/sms/invoice/:id', ({ db, p }) => { const inv = db.invoices.find((x: any) => x.id === p[0]); const party = partyOf(db, inv.partyId); if (!(party?.mobile || party?.phone)) throw new MockError('برای این مشتری شماره موبایل ثبت نشده است'); smsSend(db, party.mobile || party.phone, `فاکتور ${inv.invoiceNumber}`, 'INVOICE'); return { sent: true }; });
R('POST', '/sms/remind', ({ b, db }) => {
  const list = db.parties.filter((x: any) => x.partyType === 'CUSTOMER' && x.currentBalance >= (b.minBalance ?? 1)).sort((a: any, c: any) => c.currentBalance - a.currentBalance);
  const ok = list.filter((x: any) => /^09\d{9}$/.test(x.mobile ?? '')); const skipped = list.filter((x: any) => !/^09\d{9}$/.test(x.mobile ?? '')).map((x: any) => x.name);
  const msg = (x: any) => `${x.name} عزیز، مانده حساب شما نزد یدکی امین ${Math.round(x.currentBalance).toLocaleString('fa-IR')} ریال است. لطفاً نسبت به تسویه اقدام فرمایید.`;
  if (b.dryRun) return { dryRun: true, recipients: ok.map((x: any) => ({ id: x.id, name: x.name, receptor: x.mobile, balance: x.currentBalance })), skipped, sample: ok[0] ? msg(ok[0]) : null };
  ok.forEach((x: any) => smsSend(db, x.mobile, msg(x), 'REMINDER')); return { dryRun: false, sent: ok.length, failed: [], skipped };
});
R('GET', '/sms/logs', ({ q, db }) => page(db.smsLogs, q));

// پرداخت آنلاین
R('GET', '/online-payments/settings', ({ db }) => ({ ...db.gateway, callbackUrl: 'https://api.example.ir/api/v1/online-payments/callback', encryptionConfigured: true }));
R('PUT', '/online-payments/settings', ({ b, db }) => { const { merchantId, enabled, ...rest } = b; Object.assign(db.gateway, Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined))); if (merchantId) db.gateway.hasMerchantId = true; if (enabled !== undefined) { if (enabled && !db.gateway.hasMerchantId) throw new MockError('ابتدا مرچنت‌کد را وارد کنید'); db.gateway.enabled = enabled; } return {}; });
R('POST', '/online-payments/invoice/:iid', ({ b, db, p }) => { const inv = db.invoices.find((x: any) => x.id === p[0]); const amount = b.amount ?? inv.remainingAmount; if (amount > inv.remainingAmount) throw new MockError(`مبلغ از مانده‌ی فاکتور (${inv.remainingAmount}) بیشتر است`); const rec = { id: id('op'), invoiceId: inv.id, amount, status: 'CREATED', publicToken: `tok${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`, createdAt: iso(new Date()), expiresAt: iso(new Date(Date.now() + 7 * DAY)) }; db.payLinks.unshift(rec); return { id: rec.id, token: rec.publicToken, url: `/pay/${rec.publicToken}`, amount }; });
R('GET', '/online-payments/invoice/:iid', ({ db, p }) => db.payLinks.filter((l: any) => l.invoiceId === p[0]));
R('GET', '/online-payments/public/:token', ({ db, p }) => { const l = db.payLinks.find((x: any) => x.publicToken === p[0]); if (!l) throw new MockError('لینک پرداخت پیدا نشد', 404); const inv = db.invoices.find((x: any) => x.id === l.invoiceId); return { shopName: db.tenant.name, invoiceNumber: inv.invoiceNumber, customerName: partyOf(db, inv.partyId)?.name ?? null, amount: l.amount, status: l.status, paidAt: l.paidAt, refId: l.status === 'PAID' ? l.refId : null }; });
R('POST', '/online-payments/public/:token/start', ({ db, p }) => { // شبیه‌سازی درگاه: پرداخت فوراً موفق می‌شود
  const l = db.payLinks.find((x: any) => x.publicToken === p[0]); if (!l) throw new MockError('لینک پرداخت پیدا نشد', 404); if (l.status === 'PAID') throw new MockError('این پرداخت قبلاً انجام شده است');
  const inv = db.invoices.find((x: any) => x.id === l.invoiceId); addPayment(db, { direction: 'RECEIVED', method: 'CARD', amount: Math.min(l.amount, inv.remainingAmount), invoice: inv, reference: 'درگاه زرین‌پال (شبیه‌سازی)' });
  Object.assign(l, { status: 'PAID', refId: String(Math.floor(100000000 + Math.random() * 899999999)), paidAt: iso(new Date()) }); return { payUrl: `${location.origin}/pay/result?status=ok&token=${l.publicToken}` };
});
R('GET', '/audit', ({ q, db }) => page(db.audit, q));

let DB: any;
export async function mockRequest(method: string, path: string, query: Q, body: any) {
  DB ??= build();
  await new Promise((r) => setTimeout(r, 90));
  for (const [m, re, h] of routes) {
    const match = m === method && re.exec(path);
    if (match) {
      try { const out = h({ q: query, b: body, p: match.slice(1), db: DB }); return out && typeof out === 'object' && 'data' in out && 'meta' in out ? { data: out.data, meta: out.meta } : { data: JSON.parse(JSON.stringify(out)) }; }
      catch (e) { if (e instanceof MockError) throw new ApiError(e.message, e.status); throw e; }
    }
  }
  throw new ApiError(`مسیر آزمایشی تعریف نشده: ${method} ${path}`, 404);
}
