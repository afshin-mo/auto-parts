import { InvoiceType, Prisma } from '@prisma/client';
import { jalaliYearMonth } from './jalali.util';

const PREFIX: Record<InvoiceType, string> = {
    SALE: 'S',
    PURCHASE: 'P',
    SALE_RETURN: 'SR',
    PURCHASE_RETURN: 'PR',
    PROFORMA: 'PF',
};

/** شماره فاکتور: S-140507-0001  (نوع - [کد شعبه] - سال و ماه شمسی - شمارنده‌ی ماهانه) */
export async function nextInvoiceNumber(tx: Prisma.TransactionClient, tenantId: string, type: InvoiceType, date = new Date(), branchCode?: string | null) {
    const ym = jalaliYearMonth(date).replace('-', '');
    // شعبه‌های غیرمرکزی کد شعبه را در شماره دارند تا شمارنده‌ی هر شعبه جدا باشد: S-SH-140507-0001
    const prefix = `${PREFIX[type]}-${branchCode ? branchCode + '-' : ''}${ym}-`;
    const last = await tx.invoice.findFirst({
        where: { tenantId, invoiceNumber: { startsWith: prefix } },
        orderBy: { invoiceNumber: 'desc' },
        select: { invoiceNumber: true },
    });
    const seq = last ? parseInt(last.invoiceNumber.slice(prefix.length), 10) + 1 : 1;
    return `${prefix}${String(seq).padStart(4, '0')}`;
}
