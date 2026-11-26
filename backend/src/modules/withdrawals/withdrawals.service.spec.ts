import { WithdrawalsService } from './withdrawals.service';

const CTX: any = { activeId: 'b1', allowedIds: ['b1'], unrestricted: true };

describe('برداشت از حساب فروشگاه', () => {
    it('نام شخص مرتب می‌شود و برداشت در شعبه‌ی فعال ثبت می‌شود', async () => {
        let data: any;
        const svc = new WithdrawalsService({ withdrawal: { create: async (a: any) => { data = a.data; return data; } } } as any);
        await svc.create('t1', 'u1', { personName: '  علی   رضایی ', amount: 5_000_000 }, CTX);
        expect(data).toMatchObject({ tenantId: 't1', branchId: 'b1', personName: 'علی رضایی', amount: 5_000_000, method: 'CASH', createdBy: 'u1' });
    });
    it('جمع برداشت هر شخص را برمی‌گرداند', async () => {
        const rows = [{ personName: 'الف', _sum: { amount: 300 }, _count: 2 }, { personName: 'ب', _sum: { amount: 100 }, _count: 1 }];
        const svc = new WithdrawalsService({ withdrawal: { groupBy: async () => rows } } as any);
        expect(await svc.summary('t1', CTX)).toEqual({ total: 400, people: [{ personName: 'الف', total: 300, count: 2 }, { personName: 'ب', total: 100, count: 1 }] });
    });
    it('گزارش سود و زیان به جدول برداشت‌ها دست نمی‌زند', () => {
        const src = require('fs').readFileSync(require('path').join(__dirname, '../reports/reports.service.ts'), 'utf8');
        expect(src).not.toMatch(/withdrawal/i);
    });
});
