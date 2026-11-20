import { generateKeyPairSync, randomBytes } from 'crypto';
import { BadRequestException } from '@nestjs/common';
import { MoodianService } from './moodian.service';
import { decryptAesKey, decryptPacket, loadPublicKey, verifyText } from './lib/crypto';
import { normalize } from './lib/normalizer';
import { verhoeffValidate } from './lib/taxid';

/**
 * آزمون رفت‌وبرگشت کامل با «سازمان امور مالیاتی» جعلی: سرور جعلی امضای بسته‌ها و درخواست را با کلید عمومی مودی
 * تأیید می‌کند، کلید AES را با کلید خصوصی خودش باز می‌کند، بسته را رمزگشایی و شماره مالیاتی را با Verhoeff می‌سنجد.
 * (این آزمون سازگاری با سرور واقعی را اثبات نمی‌کند؛ فقط درستی و هماهنگی داخلی پیاده‌سازی را.)
 */
const taxpayer = generateKeyPairSync('rsa', { modulusLength: 2048 });
const org = generateKeyPairSync('rsa', { modulusLength: 2048 });
const spki = (k: any) => k.export({ type: 'spki', format: 'pem' }).toString();
const pkcs8 = taxpayer.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

function fakeOrg() {
    const received: any[] = []; const calls: string[] = [];
    const fetchImpl = (async (url: string, init: any) => {
        const path = url.split('.ir/')[1]; calls.push(path);
        const body = JSON.parse(init.body); const h = init.headers;
        const ok = (result: any) => new Response(JSON.stringify({ result, timestamp: Date.now() }), { status: 200 });
        const hdr = { timestamp: h.timestamp, requestTraceId: h.requestTraceId };
        if (path.startsWith('req/api/self-tsp/sync/')) {
            const sigOk = verifyText(normalize({ ...body.packet, ...hdr, ...(h.Authorization ? { Authorization: h.Authorization.replace('Bearer ', '') } : {}) }), body.signature, taxpayer.publicKey);
            if (!sigOk) return new Response('{"error":"bad signature"}', { status: 401 });
            const type = body.packet.packetType;
            if (type === 'GET_SERVER_INFORMATION') return ok({ data: { serverTime: Date.now(), publicKeys: [{ key: spki(org.publicKey).replace(/-----[^-]+-----|\s/g, ''), id: 'ORG-KEY-1', algorithm: 'RSA', purpose: 1 }] } });
            if (type === 'GET_TOKEN') return ok({ data: { token: 'TOKEN-123', expiresIn: Date.now() + 3_600_000 } });
            if (type === 'INQUIRY_BY_REFERENCE_NUMBER') return ok({ data: body.packet.data.referenceNumber.map((r: string) => ({ referenceNumber: r, status: 'SUCCESS', data: { confirmationReferenceId: 'CONF-1' } })) });
        }
        if (path === 'req/api/self-tsp/async/normal-enqueue') {
            if (h.Authorization !== 'Bearer TOKEN-123') return new Response('{}', { status: 401 });
            if (!verifyText(normalize({ packets: [body.packets], ...hdr, Authorization: 'TOKEN-123' }), body.signature, taxpayer.publicKey)) return new Response('{"error":"bad request signature"}', { status: 401 });
            const out = body.packets.map((p: any) => {
                const aes = decryptAesKey(p.symmetricKey, org.privateKey);
                const inv = JSON.parse(decryptPacket(p.data, Buffer.from(aes, 'hex'), Buffer.from(p.iv, 'hex')));
                if (!verifyText(normalize(inv), p.dataSignature, taxpayer.publicKey)) return { uid: p.uid, referenceNumber: null, errorCode: '0101', errorDetail: 'امضای بسته نامعتبر' };
                const t: string = inv.header.taxid;
                const numeric = [...t.slice(0, 6)].map((c) => (/\d/.test(c) ? c : c.charCodeAt(0))).join('') + String(parseInt(t.slice(6, 11), 16)).padStart(6, '0') + String(parseInt(t.slice(11, 21), 16)).padStart(12, '0') + t[21];
                if (!verhoeffValidate(numeric)) return { uid: p.uid, referenceNumber: null, errorCode: '0102', errorDetail: 'رقم کنترل' };
                received.push(inv);
                return { uid: p.uid, referenceNumber: `REF-${received.length}`, errorCode: null, errorDetail: null };
            });
            return new Response(JSON.stringify({ result: out }), { status: 200 });
        }
        return new Response('{}', { status: 404 });
    }) as unknown as typeof fetch;
    return { fetchImpl, received, calls };
}

function memoryPrisma(invoice: any) {
    const state: any = { integration: null as any, invoice: { ...invoice } };
    const prisma: any = {
        integration: {
            findUnique: async () => state.integration,
            upsert: async ({ update, create }: any) => { state.integration = state.integration ? { ...state.integration, ...update } : { serialCounter: 0, lastError: null, lastSyncAt: null, ...create }; return state.integration; },
            update: async ({ data }: any) => { const d = { ...data }; if (d.serialCounter?.increment) d.serialCounter = state.integration.serialCounter + d.serialCounter.increment; state.integration = { ...state.integration, ...d }; return state.integration; },
            updateMany: async ({ data }: any) => { state.integration = { ...state.integration, ...data }; return { count: 1 }; },
        },
        tenant: { findUniqueOrThrow: async () => ({ settings: { currency: 'TOMAN' } }) },
        invoice: {
            count: async () => 0,
            findFirst: async () => state.invoice,
            findMany: async ({ where }: any) => (where.taxAuthorityRef ? [state.invoice].filter((i) => i.taxAuthorityRef) : []),
            update: async ({ data }: any) => { state.invoice = { ...state.invoice, ...data }; return state.invoice; },
        },
    };
    return { prisma, state };
}

const baseInvoice = (taxGoodsId: string | null) => ({
    id: 'inv1', tenantId: 't1', invoiceType: 'SALE', status: 'PAID', date: new Date('2026-10-01T09:00:00Z'), createdAt: new Date('2026-10-01T09:00:00Z'),
    totalAmount: 218_000, paidAmount: 218_000, remainingAmount: 0, taxStatus: null, taxAuthorityId: null, taxAuthorityRef: null, original: null,
    party: { name: 'مشتری', nationalId: '0012345678', economicCode: null, postalCode: null },
    items: [{ productName: 'لنت ترمز', quantity: 2, unitPrice: 100_000, vatAmount: 18_000, vatPercent: 9, totalPrice: 218_000, product: { taxGoodsId, isService: false }, unit: { code: 'pcs', name: 'عدد' } }],
});

describe('MoodianService (با سازمان جعلی)', () => {
    beforeAll(() => { process.env.ENCRYPTION_KEY = randomBytes(32).toString('hex'); });

    async function configured(invoice: any) {
        const { prisma, state } = memoryPrisma(invoice);
        const svc = new MoodianService(prisma);
        const net = fakeOrg(); svc.fetchImpl = net.fetchImpl;
        await svc.updateSettings('t1', { environment: 'sandbox', memoryId: 'a1b2c3', economicCode: '10101234567', privateKey: pkcs8 });
        await svc.fetchServerKey('t1');
        await svc.updateSettings('t1', { enabled: true });
        return { svc, state, net };
    }

    it('کلید خصوصی رمزشده ذخیره می‌شود و هرگز بازگردانده نمی‌شود', async () => {
        const { svc, state } = await configured(baseInvoice('2720000166053'));
        expect(state.integration.config.privateKeyEnc).toMatch(/^v1:/);
        expect(JSON.stringify(state.integration.config)).not.toContain('BEGIN PRIVATE KEY');
        const s = await svc.getSettings('t1');
        expect(JSON.stringify(s)).not.toMatch(/PRIVATE|privateKeyEnc/);
        expect(s).toMatchObject({ hasPrivateKey: true, hasServerKey: true, ready: true, enabled: true, memoryId: 'A1B2C3' });
    });

    it('بدون شناسه کالا، پیش‌نمایش مشکل را می‌گوید و ارسال رد می‌شود', async () => {
        const { svc, net } = await configured(baseInvoice(null));
        const p = await svc.preview('t1', 'inv1');
        expect(p.issues.join(' ')).toContain('شناسه ۱۳ رقمی');
        await expect(svc.send('t1', 'inv1')).rejects.toBeInstanceOf(BadRequestException);
        expect(net.received).toHaveLength(0);
    });

    it('ارسال کامل: امضا، رمزنگاری، شماره مالیاتی و مبالغ (تومان → ریال) توسط سازمان جعلی تأیید می‌شود', async () => {
        const { svc, state, net } = await configured(baseInvoice('2720000166053'));
        const r = await svc.send('t1', 'inv1');
        expect(r.status).toBe('PENDING');
        expect(r.taxId).toHaveLength(22);
        expect(state.invoice).toMatchObject({ taxStatus: 'PENDING', taxAuthorityRef: 'REF-1', taxAuthorityId: r.taxId });

        const inv = net.received[0];
        expect(inv.header).toMatchObject({ taxid: r.taxId, inty: 1, inp: 1, ins: 1, tob: 1, bid: '0012345678', tins: '10101234567', setm: 1, tprdis: 2_000_000, tadis: 2_000_000, tvam: 180_000, tbill: 2_180_000, cap: 2_180_000, insp: 0 });
        expect(inv.header.inno).toBe(r.taxId.slice(11, 21).toLowerCase());
        expect(inv.body[0]).toMatchObject({ sstid: '2720000166053', mu: '1627', am: 2, fee: 1_000_000, prdis: 2_000_000, dis: 0, adis: 2_000_000, vra: 9, vam: 180_000, tsstam: 2_180_000 });
        expect(state.integration.serialCounter).toBe(1);

        const q = await svc.inquire('t1', ['inv1']);
        expect(q[0].status).toBe('SUCCESS');
        expect(state.invoice).toMatchObject({ taxStatus: 'SUCCESS', taxConfirmationId: 'CONF-1' });
        await expect(svc.send('t1', 'inv1')).rejects.toThrow('قبلاً');
    });

    it('فاکتور برگشتی تا وقتی فاکتور اصلی تأیید نشده ارسال نمی‌شود', async () => {
        const ret = { ...baseInvoice('2720000166053'), invoiceType: 'SALE_RETURN', original: { taxAuthorityId: 'X'.repeat(22), taxStatus: 'PENDING' } };
        const { svc } = await configured(ret);
        const p = await svc.preview('t1', 'inv1');
        expect(p.issues.join(' ')).toContain('فاکتور اصلی');
    });
});
