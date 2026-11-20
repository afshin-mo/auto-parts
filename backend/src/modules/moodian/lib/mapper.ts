/**
 * تبدیل فاکتور به قالب صورتحساب الکترونیکی سامانه مودیان (INVOICE.V01).
 * مبالغ در سامانه ریال هستند؛ اگر واحد پول فروشگاه تومان باشد ضریب ۱۰ اعمال می‌شود.
 */
export interface MapItem {
    productName: string; quantity: number; unitPrice: number; vatAmount: number; vatPercent: number; totalPrice: number;
    product: { taxGoodsId: string | null; isService: boolean };
    unit: { code: string; name: string };
}
export interface MapInvoice {
    invoiceType: 'SALE' | 'SALE_RETURN';
    date: Date; createdAt: Date;
    totalAmount: number; paidAmount: number;
    party: { name: string; nationalId: string | null; economicCode: string | null; postalCode: string | null } | null;
    items: MapItem[];
    original?: { taxAuthorityId: string | null; taxStatus: string | null } | null;
}
export interface MapContext {
    memoryId: string; economicCode: string; multiplier: number; taxId: string; serialHex: string; unitCodes: Record<string, string>; now: Date;
}

/** کد واحد اندازه‌گیری عدد در فهرست سازمان (مطابق نمونه‌ی رسمی)؛ بقیه‌ی واحدها باید در تنظیمات نگاشت شوند */
export const DEFAULT_UNIT_CODES: Record<string, string> = { pcs: '1627' };

const r = Math.round;
const digits = (v?: string | null) => (v ?? '').replace(/\D/g, '');

export function mapInvoice(inv: MapInvoice, ctx: MapContext) {
    const issues: string[] = [];
    const m = ctx.multiplier;

    if (!/^\d{11,14}$/.test(digits(ctx.economicCode))) issues.push('شماره اقتصادی فروشنده در تنظیمات مودیان نامعتبر است');
    if (!inv.items.length) issues.push('فاکتور ردیف ندارد');

    const body = inv.items.map((it, i) => {
        const n = i + 1;
        const prdis = r(it.quantity * it.unitPrice * m);
        const tsstam = r(it.totalPrice * m);
        const vam = r(it.vatAmount * m);
        const adis = tsstam - vam;
        const dis = prdis - adis;
        const sstid = digits(it.product.taxGoodsId);
        const mu = ctx.unitCodes[it.unit.code] ?? DEFAULT_UNIT_CODES[it.unit.code];

        if (!/^\d{13}$/.test(sstid)) issues.push(`ردیف ${n} («${it.productName}»): شناسه ۱۳ رقمی کالا/خدمت ثبت نشده است`);
        if (!mu) issues.push(`ردیف ${n}: برای واحد «${it.unit.name}» کد واحد مالیاتی در تنظیمات مودیان تعریف نشده است`);
        if (!(it.quantity > 0)) issues.push(`ردیف ${n}: تعداد باید بیشتر از صفر باشد`);
        if (dis < 0) issues.push(`ردیف ${n}: مبلغ پس از تخفیف از مبلغ قبل از تخفیف بیشتر است`);

        return {
            sstid, sstt: it.productName, am: it.quantity, mu: mu ?? '', fee: r(it.unitPrice * m), cfee: null, cut: null, exr: null,
            prdis, dis, adis, vra: r(it.vatPercent), vam,
            odt: null, odr: null, odam: null, olt: null, olr: null, olam: null, consfee: null, spro: null, bros: null, tcpbs: null, cop: null, vop: null, bsrn: null,
            tsstam,
        };
    });

    const sum = (k: 'prdis' | 'dis' | 'adis' | 'vam' | 'tsstam') => body.reduce((s, b) => s + b[k], 0);
    const tbill = sum('tsstam');
    if (tbill !== r(inv.totalAmount * m)) issues.push('جمع ردیف‌ها با مبلغ کل فاکتور برابر نیست');

    // خریدار
    const bid = digits(inv.party?.nationalId);
    const hasBuyer = bid.length === 10 || bid.length === 11;
    const tob = hasBuyer ? (bid.length === 10 ? 1 : 2) : 1;
    const tinb = digits(inv.party?.economicCode) || null;

    // نوع صورتحساب و ارجاع
    const isReturn = inv.invoiceType === 'SALE_RETURN';
    let irtaxid: string | null = null;
    if (isReturn) {
        if (!inv.original?.taxAuthorityId || inv.original.taxStatus !== 'SUCCESS') issues.push('فاکتور اصلی هنوز با موفقیت در سامانه مودیان ثبت نشده است؛ ابتدا آن را ارسال و تأیید کنید');
        irtaxid = inv.original?.taxAuthorityId ?? null;
    }

    // تسویه
    const paid = r(Math.min(inv.paidAmount, inv.totalAmount) * m);
    const setm = paid >= tbill ? 1 : paid <= 0 ? 2 : 3;
    const tvam = sum('vam');
    const cap = setm === 2 ? 0 : paid;
    const insp = tbill - cap;
    const tvop = setm === 1 ? tvam : setm === 2 ? 0 : r((tvam * cap) / (tbill || 1));

    const issuedAt = Math.min((inv.date ?? inv.createdAt).getTime(), ctx.now.getTime());

    const header = {
        taxid: ctx.taxId, indatim: issuedAt, indati2m: issuedAt, inty: hasBuyer ? 1 : 2, inno: ctx.serialHex, irtaxid,
        inp: 1, ins: isReturn ? 4 : 1, tins: digits(ctx.economicCode), tob, bid: hasBuyer ? bid : null, tinb,
        sbc: null, bpc: digits(inv.party?.postalCode) || null, bbc: null, ft: null, bpn: null, scln: null, scc: null, crn: null, billid: null,
        tprdis: sum('prdis'), tdis: sum('dis'), tadis: sum('adis'), tvam, todam: 0, tbill,
        setm, cap, insp, tvop, tax17: 0,
    };

    return { issues, dto: { header, body, payments: [{ iinn: null, acn: null, trmn: null, trn: null, pcn: null, pid: null, pmt: null, pdt: null }] } };
}
