import { BadRequestException } from '@nestjs/common';
import { ReturnsService } from './returns.service';
import { BranchContext } from '../../common/branch.context';

const CTX: BranchContext = { activeId: 'b1', allowedIds: ['b1'], unrestricted: true };

/** تست منطق مبلغ و موجودی برگشتی با پایگاه‌داده‌ی جعلی */
function setup(opts: { already?: number; party?: boolean; moves?: any[]; prior?: any[] } = {}) {
    const party = opts.party === false ? null : { id: 'p1', name: 'مشتری', currentBalance: 1_090_000 };
    const original = {
        id: 'inv1', tenantId: 't1', invoiceNumber: 'S-140507-0001', invoiceType: 'SALE', status: 'CONFIRMED', vatPercent: 9, partyName: null, party,
        partyId: party?.id ?? null,
        // ۳ عدد × ۳۳۳٬۳۳۳ با مالیات ۹٪  → جمع ردیف ۱٬۰۸۹٬۹۹۷
        items: [{ id: 'it1', productId: 'pr1', productName: 'لنت', sku: 'BP', unitId: 'u1', quantity: 3, unitPrice: 333_333, discountAmount: 0, discountPercent: 0, vatAmount: 90_000, vatPercent: 9, totalPrice: 1_090_000, sortOrder: 0 }],
    };
    const calls: any = { partyUpdates: [], movements: [], payments: [], created: null };
    const tx: any = {
        invoice: {
            findFirst: jest.fn(async (a: any) => (a.where.id === 'inv1' ? original : null)),
            create: jest.fn(async (a: any) => { calls.created = a.data; return { id: 'ret1' }; }),
            findUniqueOrThrow: jest.fn(async () => ({ id: 'ret1' })),
        },
        invoiceItem: { groupBy: jest.fn(async () => (opts.already ? [{ originalItemId: 'it1', _sum: { quantity: opts.already } }] : [])) },
        inventoryTransaction: { findMany: jest.fn(async (a: any) => (a.where.referenceItemId ? opts.prior ?? [] : opts.moves ?? [{ productId: 'pr1', warehouseId: 'w9', unitCost: 200_000 }])) },
        warehouse: { findFirst: jest.fn(async () => ({ id: 'w1' })) },
        branch: { findUnique: jest.fn(async () => ({ code: 'HQ', isDefault: true })) },
        product: { findUniqueOrThrow: jest.fn(async () => ({ id: 'pr1', unitId: 'u1', isService: false, purchasePrice: 250_000 })) },
        party: { update: jest.fn(async (a: any) => { calls.partyUpdates.push(a.data.currentBalance); }) },
        payment: { create: jest.fn(async (a: any) => { calls.payments.push(a.data); }) },
    };
    const prisma: any = { ...tx, $transaction: async (fn: any) => fn(tx) };
    const inventory: any = { applyMovement: jest.fn(async (_t: any, m: any) => { calls.movements.push(m); }) };
    return { svc: new ReturnsService(prisma, inventory), calls };
}

describe('ReturnsService.create (فروش)', () => {
    it('برگشت یک عدد از سه عدد، مبلغ را متناسب حساب و موجودی را به انبار اصلی برمی‌گرداند', async () => {
        const { svc, calls } = setup();
        await svc.create('t1', 'u1', 'sale', 'inv1', { items: [{ originalItemId: 'it1', quantity: 1 }], reason: 'خرابی' }, CTX);
        expect(calls.created.totalAmount).toBe(Math.round(1_090_000 / 3));
        expect(calls.created.vatAmount).toBe(30_000);
        expect(calls.created.originalInvoiceId).toBe('inv1');
        expect(calls.movements).toHaveLength(1);
        expect(calls.movements[0]).toMatchObject({ direction: 'IN', type: 'SALE_RETURN', quantity: 1, warehouseId: 'w9', unitCost: 200_000 });
        expect(calls.partyUpdates).toEqual([{ decrement: 363_333 }]);
        expect(calls.payments).toHaveLength(0);
    });

    it('بازپرداخت نقدی مانده‌ی مشتری را به همان اندازه برمی‌گرداند و پرداخت ثبت می‌کند', async () => {
        const { svc, calls } = setup();
        await svc.create('t1', 'u1', 'sale', 'inv1', { items: [{ originalItemId: 'it1', quantity: 1 }], reason: 'x', refundAmount: 363_333 }, CTX);
        expect(calls.payments[0]).toMatchObject({ direction: 'PAID', amount: 363_333 });
        expect(calls.partyUpdates).toEqual([{ decrement: 363_333 }, { increment: 363_333 }]);
        expect(calls.created.status).toBe('PAID');
    });

    it('بیش از مقدار قابل برگشت را رد می‌کند (با احتساب برگشتی‌های قبلی)', async () => {
        const { svc } = setup({ already: 2 });
        await expect(svc.create('t1', 'u1', 'sale', 'inv1', { items: [{ originalItemId: 'it1', quantity: 2 }], reason: 'x' }, CTX)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('فاکتور بدون طرف‌حساب باید نقد تسویه شود', async () => {
        const { svc, calls } = setup({ party: false });
        await svc.create('t1', 'u1', 'sale', 'inv1', { items: [{ originalItemId: 'it1', quantity: 3 }], reason: 'x' }, CTX);
        expect(calls.payments[0].amount).toBe(1_090_000);
        await expect(svc.create('t1', 'u1', 'sale', 'inv1', { items: [{ originalItemId: 'it1', quantity: 1 }], reason: 'x', refundAmount: 100 }, CTX)).rejects.toBeInstanceOf(BadRequestException);
    });
});

describe('ReturnsService.createStandalone', () => {
    function build() {
        const calls: any = { movements: [], party: [], created: null, payments: [] };
        const tx: any = {
            invoice: { findFirst: jest.fn(async () => null), create: jest.fn(async (a: any) => { calls.created = a.data; return { id: 'r1' }; }), findUniqueOrThrow: jest.fn(async () => ({ id: 'r1' })) },
            party: { update: jest.fn(async (a: any) => calls.party.push(a.data.currentBalance)) }, payment: { create: jest.fn(async (a: any) => calls.payments.push(a.data)) },
            branch: { findUnique: jest.fn(async () => ({ code: 'HQ', isDefault: true })) },
        };
        const prisma: any = { ...tx,
            party: { ...tx.party, findFirst: jest.fn(async () => ({ id: 'p1', partyType: 'CUSTOMER', name: 'م' })) },
            product: { findMany: jest.fn(async () => [{ id: 'pr1', name: 'لنت', sku: 'BP', unitId: 'u1', isService: false, purchasePrice: 200_000 }]) },
            warehouse: { findFirst: jest.fn(async () => ({ id: 'w1' })) },
            $transaction: async (fn: any) => fn(tx) };
        const inventory: any = { applyMovement: jest.fn(async (_t: any, m: any) => calls.movements.push(m)) };
        return { svc: new ReturnsService(prisma, inventory), calls };
    }
    it('بدون فاکتور اصلی: مبلغ با مالیات، ورود به انبار پیش‌فرض و کسر از مانده', async () => {
        const { svc, calls } = build();
        await svc.createStandalone('t1', 'u1', 'sale', { partyId: 'p1', items: [{ productId: 'pr1', quantity: 2, unitPrice: 100_000 }], reason: 'x' }, CTX);
        expect(calls.created.totalAmount).toBe(218_000);
        expect(calls.created.originalInvoiceId).toBeUndefined();
        expect(calls.movements[0]).toMatchObject({ direction: 'IN', quantity: 2, warehouseId: 'w1', unitCost: 200_000 });
        expect(calls.party).toEqual([{ decrement: 218_000 }]);
    });
});

describe('برگشت خودکار به همان قیمتِ فروش', () => {
    const sold = [
        { productId: 'pr1', warehouseId: 'w9', unitCost: 100_000, quantity: -2, referenceItemId: 'it1' },
        { productId: 'pr1', warehouseId: 'w9', unitCost: 120_000, quantity: -1, referenceItemId: 'it1' },
    ];
    it('هر بخش به قیمتی برمی‌گردد که از آن فروخته شده بود', async () => {
        const { svc, calls } = setup({ moves: sold });
        await svc.create('t1', 'u1', 'sale', 'inv1', { items: [{ originalItemId: 'it1', quantity: 3 }], reason: 'x' }, CTX);
        expect(calls.movements.map((m: any) => [m.unitCost, m.quantity])).toEqual([[100_000, 2], [120_000, 1]]);
    });
    it('قیمتی که قبلاً برگشته دوباره پر نمی‌شود', async () => {
        const { svc, calls } = setup({ moves: sold, prior: [{ unitCost: 100_000, quantity: 2, referenceItemId: 'it1' }] });
        await svc.create('t1', 'u1', 'sale', 'inv1', { items: [{ originalItemId: 'it1', quantity: 1 }], reason: 'x' }, CTX);
        expect(calls.movements.map((m: any) => [m.unitCost, m.quantity])).toEqual([[120_000, 1]]);
    });
});
