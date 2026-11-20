import { InventoryService } from './inventory.service';

/** دیتابیس ساختگی: فقط ردیف‌های قیمت (lots) و حرکت‌ها، با همان شرط‌های updateMany/upsert که سرویس استفاده می‌کند */
function fake(lots: { id: string; unitCost: number; quantity: number }[], available = 1e9) {
    const txns: any[] = [];
    const tx: any = {
        inventory: { updateMany: async ({ where }: any) => ({ count: where.availableQuantity.gte <= available ? 1 : 0 }), upsert: async () => ({}) },
        inventoryLot: {
            findFirst: async ({ where }: any) => lots.find((l) => (where.id ? l.id === where.id : l.unitCost === where.unitCost)) ?? null,
            findMany: async () => lots.filter((l) => l.quantity > 0),
            updateMany: async ({ where, data }: any) => { if (!where.id) { const z = lots.find((x) => x.unitCost === where.unitCost && x.quantity <= 0); if (z) (z as any).createdAt = data.createdAt; return { count: z ? 1 : 0 }; } const l = lots.find((x) => x.id === where.id)!; if (l.quantity < where.quantity.gte) return { count: 0 }; l.quantity -= data.quantity.decrement; return { count: 1 }; },
            upsert: async ({ where, create, update }: any) => { const k = where.productId_warehouseId_unitCost.unitCost; const l = lots.find((x) => x.unitCost === k); if (l) l.quantity += update.quantity.increment; else lots.push({ id: `n${k}`, unitCost: k, quantity: create.quantity }); },
        },
        inventoryTransaction: { create: async ({ data }: any) => { txns.push(data); return data; } },
    };
    return { tx, txns, svc: new InventoryService({} as any) };
}
const out = (o: object = {}) => ({ tenantId: 't', userId: 'u', productId: 'p', warehouseId: 'w', type: 'SALE', direction: 'OUT', unitId: 'u1', unitCost: 999, quantity: 1, ...o }) as any;

describe('موجودی به تفکیک قیمت خرید', () => {
    it('ورود با دو قیمت مختلف، دو ردیف جدا می‌سازد؛ همان قیمت دوباره فقط جمع می‌شود', async () => {
        const lots: any[] = []; const { svc, tx } = fake(lots);
        for (const c of [100, 120, 100]) await svc.applyMovement(tx, out({ type: 'PURCHASE', direction: 'IN', unitCost: c, quantity: 2 }));
        expect(lots.map((l) => [l.unitCost, l.quantity])).toEqual([[100, 4], [120, 2]]);
    });
    it('فروش از ردیفِ انتخاب‌شده، با همان قیمت خرید ثبت می‌شود (برای سود/زیان)', async () => {
        const lots = [{ id: 'a', unitCost: 100, quantity: 5 }, { id: 'b', unitCost: 120, quantity: 5 }]; const { svc, tx, txns } = fake(lots);
        await svc.applyMovement(tx, out({ lotId: 'b', quantity: 3 }));
        expect(lots.map((l) => l.quantity)).toEqual([5, 2]);
        expect(txns).toEqual([expect.objectContaining({ unitCost: 120, quantity: -3, totalCost: 360 })]);
    });
    it('انتخاب ردیفی که کم‌تر از درخواست موجودی دارد خطا می‌دهد و چیزی کم نمی‌شود', async () => {
        const lots = [{ id: 'a', unitCost: 100, quantity: 2 }]; const { svc, tx } = fake(lots);
        await expect(svc.applyMovement(tx, out({ lotId: 'a', quantity: 3 }))).rejects.toThrow('کمتر');
        expect(lots[0].quantity).toBe(2);
    });
    it('بدون انتخاب: قدیمی‌ترین قیمت اول، و برای هر قیمت یک حرکت', async () => {
        const lots = [{ id: 'a', unitCost: 100, quantity: 2 }, { id: 'b', unitCost: 120, quantity: 5 }]; const { svc, tx, txns } = fake(lots);
        await svc.applyMovement(tx, out({ quantity: 4 }));
        expect(txns.map((t) => [t.unitCost, t.quantity])).toEqual([[100, -2], [120, -2]]);
    });
    it('میانگین موزون: یک حرکت با میانگین، و کسر متناسب از ردیف‌ها', async () => {
        const lots = [{ id: 'a', unitCost: 100, quantity: 2 }, { id: 'b', unitCost: 130, quantity: 2 }]; const { svc, tx, txns } = fake(lots);
        await svc.applyMovement(tx, out({ quantity: 2, costMethod: 'AVERAGE' }));
        expect(txns).toEqual([expect.objectContaining({ unitCost: 115, quantity: -2 })]);
        expect(lots.map((l) => l.quantity)).toEqual([1, 1]);
    });
    it('لغو/برگشت خرید از ردیفِ هم‌قیمت کم می‌کند (lotCost)', async () => {
        const lots = [{ id: 'a', unitCost: 100, quantity: 5 }, { id: 'b', unitCost: 120, quantity: 5 }]; const { svc, tx } = fake(lots);
        await svc.applyMovement(tx, out({ type: 'PURCHASE_RETURN', lotCost: 120, quantity: 2 }));
        expect(lots.map((l) => l.quantity)).toEqual([5, 3]);
    });
});
