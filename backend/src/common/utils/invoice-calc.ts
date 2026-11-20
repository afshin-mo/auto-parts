export interface CalcItemInput {
    quantity: number;
    unitPrice: number;
    discountPercent?: number;
}

export interface CalcOptions {
    /** تخفیف کل فاکتور به درصد (اگر discountAmount نبود) */
    discountPercent?: number;
    /** تخفیف کل فاکتور به مبلغ (اولویت با این است) */
    discountAmount?: number;
    vatPercent?: number;
}

export interface CalcItemResult {
    gross: number;
    lineDiscount: number;
    /** مبلغ ردیف پس از تخفیف ردیف */
    net: number;
    /** سهم ردیف از تخفیف کل فاکتور */
    invoiceDiscountShare: number;
    taxable: number;
    vat: number;
    total: number;
}

export interface CalcResult {
    items: CalcItemResult[];
    /** جمع ردیف‌ها پس از تخفیف ردیفی و پیش از تخفیف کل */
    subtotal: number;
    lineDiscountTotal: number;
    invoiceDiscount: number;
    taxable: number;
    vatAmount: number;
    totalAmount: number;
}

const r = (n: number) => Math.round(n);

/**
 * محاسبه فاکتور:
 *  - تخفیف ردیفی روی هر ردیف
 *  - تخفیف کل فاکتور به نسبت بین ردیف‌ها پخش می‌شود تا مالیات هر ردیف درست محاسبه شود
 *  - مالیات بر ارزش افزوده روی مبلغ مشمول (پس از تخفیف‌ها)
 *  - همه مبالغ گرد و صحیح هستند و جمع ردیف‌ها همیشه با جمع فاکتور برابر است
 */
export function calculateInvoice(inputs: CalcItemInput[], options: CalcOptions = {}): CalcResult {
    const vatPercent = options.vatPercent ?? 9;

    const base = inputs.map((it) => {
        const gross = r(it.quantity * it.unitPrice);
        const lineDiscount = r(gross * ((it.discountPercent ?? 0) / 100));
        return { gross, lineDiscount, net: gross - lineDiscount };
    });

    const subtotal = base.reduce((s, b) => s + b.net, 0);
    const lineDiscountTotal = base.reduce((s, b) => s + b.lineDiscount, 0);

    let invoiceDiscount = options.discountAmount && options.discountAmount > 0
        ? options.discountAmount
        : r(subtotal * ((options.discountPercent ?? 0) / 100));
    invoiceDiscount = Math.min(r(invoiceDiscount), subtotal);

    let allocated = 0;
    const items: CalcItemResult[] = base.map((b, i) => {
        const isLast = i === base.length - 1;
        const share = isLast
            ? invoiceDiscount - allocated
            : subtotal > 0 ? r((invoiceDiscount * b.net) / subtotal) : 0;
        allocated += share;
        const taxable = b.net - share;
        const vat = r(taxable * (vatPercent / 100));
        return {
            gross: b.gross,
            lineDiscount: b.lineDiscount,
            net: b.net,
            invoiceDiscountShare: share,
            taxable,
            vat,
            total: taxable + vat,
        };
    });

    const taxable = subtotal - invoiceDiscount;
    const vatAmount = items.reduce((s, i) => s + i.vat, 0);

    return {
        items,
        subtotal,
        lineDiscountTotal,
        invoiceDiscount,
        taxable,
        vatAmount,
        totalAmount: taxable + vatAmount,
    };
}
