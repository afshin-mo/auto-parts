import { DuplicatesService } from './duplicates.service';

const CTX: any = { activeId: 'b1', allowedIds: ['b1'], unrestricted: true };
const WH = { id: 'w1', branchId: null, name: 'مرکزی', isDefault: true };

/** دیتابیس ساختگیِ کوچک برای ردیف‌های قیمت */
function lotsDb(initial: any[]) {
    const lots = initial.map((l) => ({ productId: 'p', warehouseId: 'w1', supplierName: null, ...l }));
    const tx: any = {
        inventoryLot: {
            findMany: async ({ where }: any) => lots.filter((l) => where.id.in.includes(l.id)).sort((a, b) => a.createdAt - b.createdAt),
            findFirst: async ({ where }: any) => lots.find((l) => l.unitCost === where.unitCost && !where.id.notIn.includes(l.id)) ?? null,
            deleteMany: async ({ where }: any) => { for (const id of where.id.in) lots.splice(lots.findIndex((l) => l.id === id), 1); },
            update: async ({ where, data }: any) => Object.assign(lots.find((l) => l.id === where.id)!, data),
        },
    };
    const prisma: any = { $transaction: (fn: any) => fn(tx), warehouse: { findFirst: async () => WH, findUnique: async () => WH } };
    return { lots, svc: new DuplicatesService(prisma, {} as any) };
}

describe('ادغام ردیف‌های قیمت', () => {
    it('موجودی‌ها جمع و قیمت میانگین موزون می‌شود', async () => {
        const { lots, svc } = lotsDb([{ id: 'a', unitCost: 100, quantity: 2, createdAt: 1 }, { id: 'b', unitCost: 130, quantity: 2, createdAt: 2 }]);
        jest.spyOn(require('../../common/utils/branch.util'), 'resolveWarehouse').mockResolvedValue(WH);
        const r = await svc.mergeLots('t', CTX, { productId: 'p', warehouseId: 'w1', lotIds: ['a', 'b'] });
        expect(r).toMatchObject({ unitCost: 115, quantity: 4, merged: 2 });
        expect(lots.map((l) => [l.id, l.unitCost, l.quantity])).toEqual([['a', 115, 4]]);
    });
    it('ردیفِ انتخاب‌نشده با همان قیمت میانگین هم داخل ادغام می‌آید (قیمت یکتا می‌ماند)', async () => {
        const { lots, svc } = lotsDb([{ id: 'a', unitCost: 100, quantity: 2, createdAt: 1 }, { id: 'b', unitCost: 130, quantity: 2, createdAt: 2 }, { id: 'c', unitCost: 115, quantity: 5, createdAt: 3 }]);
        jest.spyOn(require('../../common/utils/branch.util'), 'resolveWarehouse').mockResolvedValue(WH);
        await svc.mergeLots('t', CTX, { productId: 'p', warehouseId: 'w1', lotIds: ['a', 'b'] });
        expect(lots.map((l) => [l.id, l.unitCost, l.quantity])).toEqual([['c', 115, 9]]);
    });
    it('کمتر از دو ردیف معتبر را رد می‌کند', async () => {
        const { svc } = lotsDb([{ id: 'a', unitCost: 100, quantity: 2, createdAt: 1 }]);
        jest.spyOn(require('../../common/utils/branch.util'), 'resolveWarehouse').mockResolvedValue(WH);
        await expect(svc.mergeLots('t', CTX, { productId: 'p', warehouseId: 'w1', lotIds: ['a', 'zzz'] })).rejects.toThrow('حداقل دو ردیف');
    });
});

describe('کاندیدهای کالای تکراری', () => {
    const P = (id: string, name: string, brandId: string | null, codes: string[], stock = 1) => ({
        id, sku: id, name, partNumber: null, brandId, salePrice: 1, purchasePrice: 1, createdAt: new Date(Number(id.slice(1))), brand: brandId ? { name: brandId } : null,
        inventory: [{ quantity: stock }], codes: codes.map((c) => ({ codeNorm: c })),
    });
    const svcWith = (products: any[]) => new DuplicatesService({ product: { findMany: async () => products } } as any, {} as any);

    it('هم‌برند و هم‌کد = تکراری؛ همان سریال با برند دیگر = تکراری نیست', async () => {
        const g = await svcWith([P('p1', 'لنت جلو', 'B1', ['A1']), P('p2', 'لنت ترمز', 'B1', ['A1']), P('p3', 'لنت جلو', 'B2', ['A1'])]).productGroups('t');
        expect(g).toHaveLength(1);
        expect(g[0].products.map((p) => p.id)).toEqual(['p1', 'p2']);
        expect(g[0].reasons).toContain('کد/شماره فنی یکسان');
    });
    it('نامِ یکسان با فاصله/حروف عربی هم‌برند، تکراری حساب می‌شود', async () => {
        const g = await svcWith([P('p1', 'دیسك  ترمز', 'B1', ['X1']), P('p2', 'دیسک ترمز', 'B1', ['X2'])]).productGroups('t');
        expect(g).toHaveLength(1);
    });
});
