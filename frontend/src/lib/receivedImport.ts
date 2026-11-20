import { api } from './api';
import type { ReceivedPlan } from './importMap';

export const CHUNK = 500;
export interface ImportRes { merged?: number; created?: number; updated?: number; skipped?: number; unchanged?: number; errors: { row: number; key?: string; sku?: string; message: string }[]; createdBrands?: string[]; createdCategories?: string[]; totalOpeningDebit?: number; totalOpeningCredit?: number; totalQuantityChange?: number }
export const sum = (a?: number, b?: number) => (a ?? 0) + (b ?? 0);

/**
 * ورود کالا: اول کالاهای تازه ساخته می‌شوند، بعد هر ردیف فایل یک «ورودِ جدید» با قیمت خودش ثبت می‌شود
 * (هم‌قیمت = اضافه به همان ردیف موجودی، قیمت متفاوت = ردیف جدا). SKU تکراری هرگز ردّ نمی‌شود.
 */
export async function runReceivedImport(plan: ReceivedPlan, o: { dryRun: boolean; updateExisting?: boolean; warehouseId?: string; source?: string; fileName?: string }): Promise<ImportRes> {
  const agg: ImportRes = { errors: [], createdBrands: [], createdCategories: [] };
  const common = { dryRun: o.dryRun, source: o.source, fileName: o.fileName };
  for (let i = 0; i < plan.products.length; i += CHUNK) {
    const r = (await api.post<ImportRes>('/data-import/products', { rows: plan.products.slice(i, i + CHUNK), updateExisting: !!o.updateExisting, ...common })).data;
    agg.created = sum(agg.created, r.created); agg.updated = sum(agg.updated, r.updated); agg.skipped = sum(agg.skipped, r.skipped); agg.merged = sum(agg.merged, r.merged);
    agg.createdBrands!.push(...(r.createdBrands ?? [])); agg.createdCategories!.push(...(r.createdCategories ?? []));
    agg.errors.push(...r.errors.map((e) => ({ ...e, row: e.row + i })));
  }
  let qty = plan.totalQty;
  if (!o.dryRun) {
    qty = 0;
    const failed = new Set(agg.errors.map((e) => String(e.sku ?? e.key ?? '')));          // کالایی که ساخته نشد (مثلاً سقف طرح)، ورود موجودی هم نمی‌خواهد
    const stockRows = plan.stock.filter((r) => !failed.has(String(r.code)));
    for (let i = 0; i < stockRows.length; i += CHUNK) {
      const r = (await api.post<ImportRes>('/data-import/stock', { rows: stockRows.slice(i, i + CHUNK), mode: 'ADD', warehouseId: o.warehouseId, ...common })).data;
      qty += r.totalQuantityChange ?? 0;
      agg.errors.push(...r.errors.map((e) => ({ ...e, row: e.row + i, message: `ورود موجودی: ${e.message}` })));
    }
  }
  agg.totalQuantityChange = qty;
  return { ...agg, createdBrands: [...new Set(agg.createdBrands)], createdCategories: [...new Set(agg.createdCategories)] };
}
