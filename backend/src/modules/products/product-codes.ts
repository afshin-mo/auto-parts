import { Prisma, ProductCodeType } from '@prisma/client';
import { normalizeCode } from '../../common/utils/code-normalize.util';

/** نوع‌هایی که از فیلدهای خود کالا ساخته می‌شوند و در هر ذخیره دوباره همگام می‌شوند (بقیه دستی‌اند) */
export const MANAGED_TYPES: ProductCodeType[] = ['SKU', 'PART_NUMBER', 'OEM', 'BARCODE'];

interface CodeSource { sku?: string | null; partNumber?: string | null; oemCode?: string | null; barcode?: string | null }

/** ردیف‌های ProductCode را از روی فیلدهای کالا بازسازی می‌کند (داخل تراکنش) */
export async function syncProductCodes(tx: Prisma.TransactionClient, tenantId: string, productId: string, p: CodeSource) {
    const wanted: [ProductCodeType, string | null | undefined][] = [
        ['SKU', p.sku], ['PART_NUMBER', p.partNumber], ['OEM', p.oemCode], ['BARCODE', p.barcode],
    ];
    const seen = new Set<string>();
    const manual = await tx.productCode.findMany({ where: { productId, type: { notIn: MANAGED_TYPES } }, select: { codeNorm: true } });
    manual.forEach((m) => seen.add(m.codeNorm));

    const rows: Prisma.ProductCodeCreateManyInput[] = [];
    for (const [type, code] of wanted) {
        const codeNorm = normalizeCode(code);
        if (!codeNorm || seen.has(codeNorm)) continue;
        seen.add(codeNorm);
        rows.push({ tenantId, productId, type, code: String(code).trim().slice(0, 100), codeNorm });
    }
    await tx.productCode.deleteMany({ where: { productId, type: { in: MANAGED_TYPES } } });
    if (rows.length) await tx.productCode.createMany({ data: rows, skipDuplicates: true });
}
