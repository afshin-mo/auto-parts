import { calculateInvoice } from './invoice-calc';

describe('calculateInvoice', () => {
    it('محاسبه ساده با مالیات ۹٪', () => {
        const r = calculateInvoice([{ quantity: 2, unitPrice: 100_000 }], { vatPercent: 9 });
        expect(r.subtotal).toBe(200_000);
        expect(r.vatAmount).toBe(18_000);
        expect(r.totalAmount).toBe(218_000);
    });

    it('تخفیف ردیفی قبل از مالیات اعمال می‌شود', () => {
        const r = calculateInvoice([{ quantity: 1, unitPrice: 1_000_000, discountPercent: 10 }]);
        expect(r.lineDiscountTotal).toBe(100_000);
        expect(r.subtotal).toBe(900_000);
        expect(r.totalAmount).toBe(981_000);
    });

    it('تخفیف کل فاکتور بین ردیف‌ها پخش می‌شود و جمع‌ها برابرند', () => {
        const r = calculateInvoice(
            [
                { quantity: 3, unitPrice: 33_333 },
                { quantity: 1, unitPrice: 77_777 },
                { quantity: 5, unitPrice: 12_345 },
            ],
            { discountAmount: 10_001, vatPercent: 9 },
        );
        expect(r.items.reduce((s, i) => s + i.invoiceDiscountShare, 0)).toBe(10_001);
        expect(r.items.reduce((s, i) => s + i.total, 0)).toBe(r.totalAmount);
        expect(r.totalAmount).toBe(r.taxable + r.vatAmount);
    });

    it('تخفیف مبلغی از جمع فاکتور بیشتر نمی‌شود', () => {
        const r = calculateInvoice([{ quantity: 1, unitPrice: 50_000 }], { discountAmount: 999_999 });
        expect(r.invoiceDiscount).toBe(50_000);
        expect(r.totalAmount).toBe(0);
    });

    it('تخفیف درصدی کل فاکتور', () => {
        const r = calculateInvoice([{ quantity: 1, unitPrice: 200_000 }], { discountPercent: 5, vatPercent: 0 });
        expect(r.invoiceDiscount).toBe(10_000);
        expect(r.totalAmount).toBe(190_000);
    });
});
