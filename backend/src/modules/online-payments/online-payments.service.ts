import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../database/prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { openSecret, sealSecret } from '../../common/utils/secret-box.util';
import { UpdateGatewaySettingsDto } from './dto/online-payment.dto';

interface Cfg { provider: 'zarinpal'; merchantIdEnc?: string; sandbox?: boolean; enabled?: boolean }
const LINK_TTL_MS = 7 * 86_400_000;

/** درگاه پرداخت زرین‌پال (API نسخه ۴ — مبلغ به ریال) */
@Injectable()
export class OnlinePaymentsService {
    private readonly log = new Logger(OnlinePaymentsService.name);
    fetchImpl: typeof fetch = (input, init) => fetch(input, init);
    constructor(private prisma: PrismaService, private payments: PaymentsService) { }

    private front() { return (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, ''); }
    private back() { return (process.env.APP_PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, ''); }
    private hosts(sandbox?: boolean) { return sandbox ? { api: 'https://sandbox.zarinpal.com', pay: 'https://sandbox.zarinpal.com' } : { api: 'https://payment.zarinpal.com', pay: 'https://payment.zarinpal.com' }; }

    private async row(tenantId: string) { return this.prisma.integration.findUnique({ where: { tenantId_type: { tenantId, type: 'PAYMENT_GATEWAY' } } }); }
    private cfg(row: { config: Prisma.JsonValue } | null): Cfg { const s = (row?.config as unknown as Partial<Cfg>) ?? {}; return { ...s, provider: 'zarinpal' }; }

    // ───── تنظیمات ─────
    async getSettings(tenantId: string) {
        const c = this.cfg(await this.row(tenantId));
        return { provider: c.provider, sandbox: c.sandbox ?? true, enabled: !!c.enabled, hasMerchantId: !!c.merchantIdEnc, callbackUrl: `${this.back()}/api/v1/online-payments/callback`, encryptionConfigured: /^[0-9a-fA-F]{64}$/.test(process.env.ENCRYPTION_KEY ?? '') };
    }

    async updateSettings(tenantId: string, dto: UpdateGatewaySettingsDto) {
        const c = this.cfg(await this.row(tenantId));
        if (dto.sandbox !== undefined) c.sandbox = dto.sandbox;
        if (dto.merchantId) { try { c.merchantIdEnc = sealSecret(dto.merchantId); } catch (e) { throw new BadRequestException((e as Error).message); } }
        if (dto.enabled !== undefined) { if (dto.enabled && !c.merchantIdEnc) throw new BadRequestException('ابتدا مرچنت‌کد را وارد کنید'); c.enabled = dto.enabled; }
        const data = { config: c as unknown as Prisma.InputJsonValue, status: c.enabled ? ('ACTIVE' as const) : ('INACTIVE' as const) };
        await this.prisma.integration.upsert({ where: { tenantId_type: { tenantId, type: 'PAYMENT_GATEWAY' } }, update: data, create: { tenantId, type: 'PAYMENT_GATEWAY', ...data } });
        return this.getSettings(tenantId);
    }

    private async multiplier(tenantId: string) {
        const t = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { settings: true } });
        return ((t.settings as { currency?: string } | null)?.currency ?? 'RIAL') === 'TOMAN' ? 10 : 1;
    }

    // ───── لینک پرداخت (کاربر داخلی) ─────
    async createLink(tenantId: string, userId: string, invoiceId: string, amount?: number) {
        const c = this.cfg(await this.row(tenantId));
        if (!c.enabled) throw new BadRequestException('درگاه پرداخت آنلاین فعال نیست (تنظیمات ← درگاه پرداخت)');
        const inv = await this.prisma.invoice.findFirst({ where: { id: invoiceId, tenantId, invoiceType: 'SALE', deletedAt: null } });
        if (!inv) throw new NotFoundException('فاکتور پیدا نشد');
        if (inv.status === 'CANCELLED' || inv.status === 'DRAFT') throw new BadRequestException('این فاکتور قابل پرداخت نیست');
        const remaining = Number(inv.remainingAmount);
        if (remaining <= 0) throw new BadRequestException('این فاکتور تسویه شده است');
        const amt = amount ?? remaining;
        if (amt > remaining) throw new BadRequestException(`مبلغ از مانده‌ی فاکتور (${remaining}) بیشتر است`);

        const rec = await this.prisma.onlinePayment.create({ data: { tenantId, invoiceId, publicToken: randomBytes(24).toString('hex'), amount: amt, createdBy: userId, expiresAt: new Date(Date.now() + LINK_TTL_MS) } });
        return { id: rec.id, token: rec.publicToken, url: `${this.front()}/pay/${rec.publicToken}`, amount: amt, expiresAt: rec.expiresAt };
    }

    listForInvoice(tenantId: string, invoiceId: string) {
        return this.prisma.onlinePayment.findMany({ where: { tenantId, invoiceId }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, amount: true, status: true, publicToken: true, refId: true, createdAt: true, paidAt: true, expiresAt: true } });
    }

    // ───── صفحه‌ی عمومی پرداخت مشتری ─────
    private async byToken(token: string) {
        const rec = await this.prisma.onlinePayment.findUnique({ where: { publicToken: token }, include: { invoice: { select: { invoiceNumber: true, totalAmount: true, party: { select: { name: true, mobile: true } }, partyName: true } }, tenant: { select: { name: true } } } });
        if (!rec) throw new NotFoundException('لینک پرداخت پیدا نشد');
        return rec;
    }

    async publicInfo(token: string) {
        const r = await this.byToken(token);
        const expired = r.status !== 'PAID' && r.expiresAt.getTime() < Date.now();
        return { shopName: r.tenant.name, invoiceNumber: r.invoice.invoiceNumber, customerName: r.invoice.party?.name ?? r.invoice.partyName ?? null, amount: Number(r.amount), status: expired ? 'EXPIRED' : r.status, paidAt: r.paidAt, refId: r.status === 'PAID' ? r.refId : null };
    }

    async start(token: string) {
        const r = await this.byToken(token);
        if (r.status === 'PAID') throw new BadRequestException('این پرداخت قبلاً انجام شده است');
        if (r.expiresAt.getTime() < Date.now()) throw new BadRequestException('مهلت این لینک تمام شده است؛ از فروشگاه لینک جدید بخواهید');
        const c = this.cfg(await this.row(r.tenantId));
        if (!c.enabled || !c.merchantIdEnc) throw new BadRequestException('درگاه پرداخت فعال نیست');
        const inv = await this.prisma.invoice.findUniqueOrThrow({ where: { id: r.invoiceId } });
        if (inv.status === 'CANCELLED' || Number(inv.remainingAmount) <= 0) throw new BadRequestException('این فاکتور دیگر قابل پرداخت نیست');

        const mult = await this.multiplier(r.tenantId);
        const h = this.hosts(c.sandbox);
        let json: { data?: { code?: number; authority?: string }; errors?: unknown } | null = null;
        try {
            const res = await this.fetchImpl(`${h.api}/pg/v4/payment/request.json`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, signal: AbortSignal.timeout(20_000),
                body: JSON.stringify({ merchant_id: openSecret(c.merchantIdEnc), amount: Math.round(Number(r.amount) * mult), callback_url: `${this.back()}/api/v1/online-payments/callback`, description: `پرداخت فاکتور ${r.invoice.invoiceNumber}`, metadata: r.invoice.party?.mobile ? { mobile: r.invoice.party.mobile } : {} }),
            });
            json = await res.json();
        } catch (e) { throw new BadRequestException(`ارتباط با درگاه برقرار نشد: ${(e as Error).message}`); }

        if (json?.data?.code !== 100 || !json.data.authority) {
            const err = JSON.stringify(json?.errors ?? json).slice(0, 300);
            await this.prisma.onlinePayment.update({ where: { id: r.id }, data: { error: err } });
            throw new BadRequestException(`درگاه درخواست را نپذیرفت: ${err}`);
        }
        await this.prisma.onlinePayment.update({ where: { id: r.id }, data: { status: 'PENDING', authority: json.data.authority, error: null } });
        return { payUrl: `${h.pay}/pg/StartPay/${json.data.authority}` };
    }

    /** بازگشت از درگاه: تأیید تراکنش و ثبت دریافت روی فاکتور. نتیجه: آدرس بازگشت به فرانت */
    async callback(authority?: string, status?: string): Promise<string> {
        const fail = (token?: string) => `${this.front()}/pay/result?status=failed${token ? `&token=${token}` : ''}`;
        if (!authority) return fail();
        const rec = await this.prisma.onlinePayment.findFirst({ where: { authority } });
        if (!rec) return fail();
        const done = `${this.front()}/pay/result?status=ok&token=${rec.publicToken}`;
        if (rec.status === 'PAID') return done;
        if (status !== 'OK') { await this.prisma.onlinePayment.update({ where: { id: rec.id }, data: { status: 'FAILED', error: 'پرداخت توسط کاربر لغو شد یا ناموفق بود' } }); return fail(rec.publicToken); }

        const c = this.cfg(await this.row(rec.tenantId));
        if (!c.merchantIdEnc) return fail(rec.publicToken);
        const mult = await this.multiplier(rec.tenantId);
        let json: { data?: { code?: number; ref_id?: number | string; card_pan?: string }; errors?: unknown } | null = null;
        try {
            const res = await this.fetchImpl(`${this.hosts(c.sandbox).api}/pg/v4/payment/verify.json`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, signal: AbortSignal.timeout(20_000),
                body: JSON.stringify({ merchant_id: openSecret(c.merchantIdEnc), amount: Math.round(Number(rec.amount) * mult), authority }),
            });
            json = await res.json();
        } catch (e) { this.log.error(`verify failed: ${(e as Error).message}`); return fail(rec.publicToken); } // وضعیت PENDING می‌ماند؛ کاربر می‌تواند دوباره تلاش کند

        const code = json?.data?.code;
        if (code !== 100 && code !== 101) {
            await this.prisma.onlinePayment.update({ where: { id: rec.id }, data: { status: 'FAILED', error: JSON.stringify(json?.errors ?? json).slice(0, 300) } });
            return fail(rec.publicToken);
        }

        // idempotent: فقط اولین فراخوانی پرداخت را ثبت می‌کند
        await this.prisma.$transaction(async (tx) => {
            const claimed = await tx.onlinePayment.updateMany({ where: { id: rec.id, status: { not: 'PAID' } }, data: { status: 'PAID', refId: String(json!.data!.ref_id ?? ''), cardPan: json!.data!.card_pan ?? null, paidAt: new Date(), error: null } });
            if (claimed.count === 0) return;
            const inv = await tx.invoice.findUniqueOrThrow({ where: { id: rec.invoiceId } });
            const toInvoice = Math.min(Number(rec.amount), Number(inv.remainingAmount));
            const extra = Number(rec.amount) - toInvoice;
            const base = { tenantId: rec.tenantId, userId: rec.createdBy, direction: 'RECEIVED' as const, method: 'CARD' as const, partyId: inv.partyId, reference: `درگاه زرین‌پال ${json!.data!.ref_id ?? ''}`, notes: `پرداخت آنلاین فاکتور ${inv.invoiceNumber}` };
            if (toInvoice > 0 && inv.status !== 'CANCELLED') await this.payments.record(tx, { ...base, amount: toInvoice, invoiceId: inv.id });
            else if (inv.partyId) await this.payments.record(tx, { ...base, amount: Number(rec.amount) });
            if (extra > 0 && toInvoice > 0 && inv.partyId) await this.payments.record(tx, { ...base, amount: extra, notes: `مازاد پرداخت آنلاین فاکتور ${inv.invoiceNumber}` });
        });
        return done;
    }
}
