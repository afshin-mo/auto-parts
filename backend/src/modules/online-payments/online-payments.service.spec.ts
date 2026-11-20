import { randomBytes } from 'crypto';
import { OnlinePaymentsService } from './online-payments.service';
import { sealSecret } from '../../common/utils/secret-box.util';

const MERCHANT = '12345678-1234-1234-1234-123456789012';

function setup() {
    process.env.ENCRYPTION_KEY = randomBytes(32).toString('hex');
    process.env.FRONTEND_URL = 'https://shop.example'; process.env.APP_PUBLIC_URL = 'https://api.example';
    const state: any = { op: null as any, invoice: { id: 'inv1', tenantId: 't1', invoiceType: 'SALE', status: 'CONFIRMED', remainingAmount: 100_000, totalAmount: 100_000, invoiceNumber: 'S-1', partyId: 'p1' } };
    const integration = { config: { provider: 'zarinpal', merchantIdEnc: sealSecret(MERCHANT), sandbox: true, enabled: true } };
    const prisma: any = {
        integration: { findUnique: async () => integration },
        tenant: { findUniqueOrThrow: async () => ({ settings: { currency: 'TOMAN' } }) },
        invoice: { findFirst: async () => state.invoice, findUniqueOrThrow: async () => state.invoice },
        onlinePayment: {
            create: async ({ data }: any) => (state.op = { id: 'op1', status: 'CREATED', refId: null, paidAt: null, authority: null, ...data }),
            findUnique: async () => state.op && { ...state.op, invoice: { invoiceNumber: 'S-1', totalAmount: 100_000, party: { name: 'م', mobile: '09121234567' }, partyName: null }, tenant: { name: 'یدکی' } },
            findFirst: async ({ where }: any) => (state.op?.authority === where.authority ? state.op : null),
            update: async ({ data }: any) => (state.op = { ...state.op, ...data }),
            updateMany: async ({ where, data }: any) => { if (state.op.status === where.status.not) return { count: 0 }; state.op = { ...state.op, ...data }; return { count: 1 }; },
        },
        $transaction: async (fn: any) => fn(prisma),
    };
    const payments: any = { record: jest.fn(async () => ({})) };
    const svc = new OnlinePaymentsService(prisma, payments);
    const reqs: any[] = [];
    svc.fetchImpl = (async (url: string, init: any) => {
        reqs.push({ url, body: JSON.parse(init.body) });
        const body = url.endsWith('request.json') ? { data: { code: 100, authority: 'A0000000000000000000000000000TEST' }, errors: [] } : { data: { code: 100, ref_id: 987654, card_pan: '6037****1234' }, errors: [] };
        return new Response(JSON.stringify(body), { status: 200 });
    }) as unknown as typeof fetch;
    return { svc, state, payments, reqs };
}

describe('OnlinePaymentsService (زرین‌پال جعلی)', () => {
    it('لینک ← شروع پرداخت (مبلغ به ریال) ← بازگشت موفق: یک‌بار ثبت دریافت، تکرار بی‌اثر', async () => {
        const { svc, state, payments, reqs } = setup();
        const link = await svc.createLink('t1', 'u1', 'inv1', 50_000);
        expect(link.url).toBe(`https://shop.example/pay/${link.token}`);

        const info = await svc.publicInfo(link.token);
        expect(info).toMatchObject({ shopName: 'یدکی', invoiceNumber: 'S-1', amount: 50_000, status: 'CREATED' });

        const { payUrl } = await svc.start(link.token);
        expect(payUrl).toBe('https://sandbox.zarinpal.com/pg/StartPay/A0000000000000000000000000000TEST');
        expect(reqs[0].body).toMatchObject({ merchant_id: MERCHANT, amount: 500_000, callback_url: 'https://api.example/api/v1/online-payments/callback' });
        expect(state.op.status).toBe('PENDING');

        const back = await svc.callback('A0000000000000000000000000000TEST', 'OK');
        expect(back).toBe(`https://shop.example/pay/result?status=ok&token=${link.token}`);
        expect(reqs[1].body).toMatchObject({ amount: 500_000, authority: 'A0000000000000000000000000000TEST' });
        expect(payments.record).toHaveBeenCalledTimes(1);
        expect(payments.record.mock.calls[0][1]).toMatchObject({ amount: 50_000, invoiceId: 'inv1', method: 'CARD', direction: 'RECEIVED' });
        expect(state.op).toMatchObject({ status: 'PAID', refId: '987654' });

        await svc.callback('A0000000000000000000000000000TEST', 'OK');
        expect(payments.record).toHaveBeenCalledTimes(1);
    });

    it('انصراف کاربر در درگاه: ناموفق و بدون ثبت دریافت', async () => {
        const { svc, payments } = setup();
        const link = await svc.createLink('t1', 'u1', 'inv1');
        await svc.start(link.token);
        const back = await svc.callback('A0000000000000000000000000000TEST', 'NOK');
        expect(back).toContain('status=failed');
        expect(payments.record).not.toHaveBeenCalled();
    });

    it('مبلغ بیشتر از مانده یا فاکتور تسویه‌شده رد می‌شود', async () => {
        const { svc, state } = setup();
        await expect(svc.createLink('t1', 'u1', 'inv1', 200_000)).rejects.toThrow('بیشتر');
        state.invoice.remainingAmount = 0;
        await expect(svc.createLink('t1', 'u1', 'inv1')).rejects.toThrow('تسویه');
    });
});
