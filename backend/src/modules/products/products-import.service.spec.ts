import { ProductsImportService, mergeDuplicateRows } from './products-import.service';
import type { ImportRowDto } from './dto/import-products.dto';

const row = (r: Partial<ImportRowDto> & { sku: string }) => r as ImportRowDto;

describe('mergeDuplicateRows', () => {
    it('ردیف‌های هم‌کد را ادغام می‌کند: تعداد جمع، قیمت آخرین ردیف، بقیه از اولین مقدار پُر', () => {
        const { rows, origin, merged } = mergeDuplicateRows([
            row({ sku: 'A-1', name: 'کالا', purchasePrice: 100, initialQuantity: 4 }),
            row({ sku: 'B-1', name: 'دیگر', purchasePrice: 50 }),
            row({ sku: 'a-1 ', purchasePrice: 120, initialQuantity: 6, brand: 'PT6' }),   // همان کد (بزرگ/کوچک و فاصله مهم نیست)
        ]);
        expect(merged).toBe(1);
        expect(rows).toHaveLength(2);
        expect(rows[0]).toMatchObject({ sku: 'A-1', name: 'کالا', purchasePrice: 120, initialQuantity: 10, brand: 'PT6' });
        expect(origin).toEqual([1, 2]);                                                    // شماره‌ی ردیفِ اولِ هر کالا
    });
    it('بدون تکرار چیزی عوض نمی‌شود', () => {
        const input = [row({ sku: 'X', name: 'a' }), row({ sku: 'Y', name: 'b' })];
        expect(mergeDuplicateRows(input)).toMatchObject({ merged: 0, origin: [1, 2], rows: input });
    });
});

describe('ProductsImportService.importRows: تکرار خطا نیست', () => {
    const make = () => {
        const log = { products: [] as Record<string, any>[], inventory: [] as Record<string, any>[], lots: [] as Record<string, any>[] };
        const wh = { id: 'w1', name: 'انبار اصلی', code: 'MAIN', isActive: true, isDefault: true };
        const fake: any = {
            unit: { findMany: async () => [{ id: 'u1', name: 'عدد', code: 'pcs' }] },
            category: { findMany: async () => [] }, brand: { findMany: async () => [], create: async ({ data }: any) => ({ id: `b-${data.name}`, name: data.name }) },
            product: { findMany: async () => [], count: async () => 0, create: async ({ data }: any) => { const p = { id: `p${log.products.length + 1}`, ...data }; log.products.push(p); return p; } },
            tenant: { findUniqueOrThrow: async () => ({ maxProducts: 1000 }) },
            warehouse: { findMany: async () => [wh], findFirst: async () => wh },
            productCode: { findMany: async () => [], deleteMany: async () => ({}), createMany: async () => ({}), upsert: async () => ({}) },
            inventory: { create: async ({ data }: any) => { log.inventory.push(data); return data; } },
            inventoryLot: { create: async ({ data }: any) => { log.lots.push(data); return data; } },
            inventoryTransaction: { create: async () => ({}) },
            $transaction: async (fn: (tx: unknown) => unknown) => fn(fake),
        };
        return { svc: new ProductsImportService(fake), log };
    };

    it('یک کالا با چند قیمت (نقد/اعتباری) بدون خطای تکراری وارد می‌شود: جمع تعداد، قیمت آخرین ردیف و ردیف موجودیِ جدا برای هر قیمت', async () => {
        const { svc, log } = make();
        const res = await svc.importRows('t1', 'u1', { rows: [
            row({ sku: '801168-P87', name: 'کیت کلاچ', purchasePrice: 1000, initialQuantity: 5 }),
            row({ sku: '500655-PT6', name: 'لنت', purchasePrice: 300, initialQuantity: 2 }),
            row({ sku: '801168-P87', name: 'کیت کلاچ', purchasePrice: 1200, initialQuantity: 5 }),   // همان کالا، قیمت دیگر
        ] } as any);
        expect(res.errors).toEqual([]);
        expect(res).toMatchObject({ created: 2, merged: 1, skipped: 0 });
        const clutch = log.products.find((p) => p.sku === '801168-P87')!;
        expect(Number(clutch.purchasePrice)).toBe(1200);
        expect(log.inventory.find((i) => i.productId === clutch.id)).toMatchObject({ quantity: 10 });
        // قیمت‌های مختلف با هم ادغام نمی‌شوند: دو ردیف موجودی با قیمت‌های خودشان
        expect(log.lots.filter((l) => l.productId === clutch.id).map((l) => [l.unitCost, l.quantity])).toEqual([[1000, 5], [1200, 5]]);
        expect(Number(clutch.salePrice)).toBe(0);                                                   // قیمت فروش اجباری نیست
    });
    it('خطای ردیف‌ها به شماره‌ی ردیف درست فایل اشاره می‌کند (حتی بعد از ادغام)', async () => {
        const { svc } = make();
        const res = await svc.importRows('t1', 'u1', { rows: [
            row({ sku: 'A', name: 'یک' }), row({ sku: 'A', name: 'یک' }), row({ sku: 'B', name: '' }),
        ] } as any);
        expect(res.errors).toEqual([{ row: 3, sku: 'B', message: 'نام کالا خالی است' }]);
        expect(res.merged).toBe(1);
    });
});
