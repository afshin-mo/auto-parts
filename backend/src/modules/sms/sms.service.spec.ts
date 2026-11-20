import { randomBytes } from 'crypto';
import { SmsService } from './sms.service';

function setup(provider: 'kavenegar' | 'smsir' | 'log', extra: any = {}) {
    process.env.ENCRYPTION_KEY = randomBytes(32).toString('hex');
    const logs: any[] = []; const sent: any[] = [];
    const state: any = { integration: null };
    const prisma: any = {
        integration: { findUnique: async () => state.integration, upsert: async ({ update, create }: any) => (state.integration = state.integration ? { ...state.integration, ...update } : { ...create }) },
        smsLog: { create: async ({ data }: any) => logs.push(data) },
        tenant: { findUniqueOrThrow: async () => ({ name: 'یدکی امین' }) },
        party: { findMany: async () => extra.parties ?? [] },
        invoice: { findFirst: async () => extra.invoice ?? null },
    };
    const svc = new SmsService(prisma);
    svc.fetchImpl = (async (url: string, init: any) => {
        sent.push({ url, init });
        return new Response(JSON.stringify(url.includes('kavenegar') ? { return: { status: 200 }, entries: [{ messageid: 111 }] } : { status: 1, data: { messageIds: [222] } }), { status: 200 });
    }) as unknown as typeof fetch;
    const ready = async () => { await svc.updateSettings('t1', { provider, apiKey: 'KEY123', sender: provider === 'smsir' ? '3000' : '3000X' }); await svc.updateSettings('t1', { enabled: true }); };
    return { svc, logs, sent, ready };
}

describe('SmsService', () => {
    it('کاوه‌نگار: آدرس و بدنه‌ی فرم درست است و کلید در تنظیمات برنمی‌گردد', async () => {
        const { svc, sent, logs, ready } = setup('kavenegar'); await ready();
        const r = await svc.send('t1', 'u1', '۰۹۱۲۱۲۳۴۵۶۷', 'سلام', 'TEST');
        expect(r).toMatchObject({ ok: true, providerRef: '111', receptor: '09121234567' });
        expect(sent[0].url).toBe('https://api.kavenegar.com/v1/KEY123/sms/send.json');
        expect(String(sent[0].init.body)).toContain('receptor=09121234567');
        expect(logs[0]).toMatchObject({ status: 'SENT', provider: 'kavenegar' });
        expect(JSON.stringify(await svc.getSettings('t1'))).not.toContain('KEY123');
    });

    it('SMS.ir: هدر X-API-KEY و بدنه‌ی JSON', async () => {
        const { svc, sent, ready } = setup('smsir'); await ready();
        await svc.send('t1', 'u1', '09121234567', 'سلام', 'TEST');
        expect(sent[0].url).toBe('https://api.sms.ir/v1/send/bulk');
        expect(sent[0].init.headers['X-API-KEY']).toBe('KEY123');
        expect(JSON.parse(sent[0].init.body)).toMatchObject({ lineNumber: 3000, mobiles: ['09121234567'] });
    });

    it('SMS.ir: خط غیرعددی رد می‌شود', async () => {
        const { svc } = setup('smsir');
        await expect(svc.updateSettings('t1', { provider: 'smsir', apiKey: 'K', sender: '3000X' })).rejects.toThrow('عدد');
    });

    it('حالت log بدون ارسال واقعی؛ شماره نامعتبر و غیرفعال رد می‌شود', async () => {
        const { svc, sent, ready } = setup('log');
        await expect(svc.send('t1', 'u1', '09121234567', 'x', 'TEST')).rejects.toThrow('فعال نیست');
        await ready();
        await expect(svc.send('t1', 'u1', '12345', 'x', 'TEST')).rejects.toThrow('معتبر');
        expect((await svc.send('t1', 'u1', '09121234567', 'x', 'TEST')).ok).toBe(true);
        expect(sent).toHaveLength(0);
    });

    it('یادآوری بدهی: پیش‌نمایش، متن فارسی و رد کردن مشتری بدون موبایل', async () => {
        const parties = [{ id: 'a', name: 'علی', mobile: '09120000001', phone: null, currentBalance: 1_250_000 }, { id: 'b', name: 'بدون شماره', mobile: null, phone: null, currentBalance: 500 }];
        const { svc, logs, ready } = setup('log', { parties }); await ready();
        const dry: any = await svc.remindDebtors('t1', 'u1', { dryRun: true });
        expect(dry.recipients).toHaveLength(1); expect(dry.skipped).toEqual(['بدون شماره']);
        expect(dry.sample).toContain('۱٬۲۵۰٬۰۰۰ ریال');
        const real: any = await svc.remindDebtors('t1', 'u1', {});
        expect(real.sent).toBe(1); expect(logs[0]).toMatchObject({ kind: 'REMINDER', receptor: '09120000001' });
    });
});
