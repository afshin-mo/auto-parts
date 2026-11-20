/** همان الگوریتم بکند (common/utils/invoice-calc.ts) تا پیش‌نمایش مبلغ با مقدار ثبت‌شده یکی باشد */
export interface LineIn { quantity: number; unitPrice: number; discountPercent: number }
const r = Math.round;

export function calcInvoice(lines: LineIn[], opt: { discountAmount?: number; vatPercent: number }) {
  const base = lines.map((l) => { const gross = r(l.quantity * l.unitPrice); const ld = r(gross * (l.discountPercent / 100)); return { gross, ld, net: gross - ld }; });
  const subtotal = base.reduce((s, b) => s + b.net, 0);
  const invoiceDiscount = Math.min(r(opt.discountAmount ?? 0), subtotal);
  let allocated = 0;
  const items = base.map((b, i) => {
    const share = i === base.length - 1 ? invoiceDiscount - allocated : subtotal > 0 ? r((invoiceDiscount * b.net) / subtotal) : 0;
    allocated += share;
    const taxable = b.net - share; const vat = r(taxable * (opt.vatPercent / 100));
    return { ...b, share, taxable, vat, total: taxable + vat };
  });
  const lineDiscountTotal = base.reduce((s, b) => s + b.ld, 0);
  const vatAmount = items.reduce((s, i) => s + i.vat, 0);
  return { items, subtotal, lineDiscountTotal, invoiceDiscount, vatAmount, total: subtotal - invoiceDiscount + vatAmount };
}
