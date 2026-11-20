import { BadRequestException, Injectable, NotFoundException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { openSecret, sealSecret } from '../../common/utils/secret-box.util';
import { MoodianClient, MoodianError, MOODIAN_URLS, MoodianEnv } from './lib/client';
import { loadPrivateKey, loadPublicKey } from './lib/crypto';
import { generateTaxId, hexSerial, MEMORY_ID_REGEX } from './lib/taxid';
import { mapInvoice, MapInvoice } from './lib/mapper';
import { UpdateMoodianSettingsDto } from './dto/moodian.dto';

interface StoredConfig {
    environment: MoodianEnv; memoryId?: string; economicCode?: string; privateKeyEnc?: string;
    serverPublicKey?: string; serverKeyId?: string; unitCodes?: Record<string, string>; enabled?: boolean;
}

const INVOICE_INCLUDE = {
    party: true,
    items: { orderBy: { sortOrder: 'asc' as const }, include: { product: { select: { taxGoodsId: true, isService: true } }, unit: { select: { code: true, name: true } } } },
    original: { select: { taxAuthorityId: true, taxStatus: true } },
} satisfies Prisma.InvoiceInclude;

type FullInvoice = Prisma.InvoiceGetPayload<{ include: typeof INVOICE_INCLUDE }>;

@Injectable()
export class MoodianService {
    private readonly log = new Logger(MoodianService.name);
    private tokens = new Map<string, { token: string; expiresAt: number }>();
    /** برای تست‌ها قابل جایگزینی است */
    fetchImpl: typeof fetch = (input, init) => fetch(input, init);

    constructor(private prisma: PrismaService) { }

    // ───────────── تنظیمات ─────────────
    private async loadIntegration(tenantId: string) {
        return this.prisma.integration.findUnique({ where: { tenantId_type: { tenantId, type: 'TAX_AUTHORITY' } } });
    }

    private cfg(row: { config: Prisma.JsonValue } | null): StoredConfig {
        const stored = (row?.config as unknown as Partial<StoredConfig>) ?? {};
        return { ...stored, environment: stored.environment ?? 'sandbox' };
    }

    async getSettings(tenantId: string) {
        const row = await this.loadIntegration(tenantId);
        const c = this.cfg(row);
        const [pending, success, failed, notSent] = await Promise.all([
            this.prisma.invoice.count({ where: { tenantId, taxStatus: 'PENDING' } }),
            this.prisma.invoice.count({ where: { tenantId, taxStatus: 'SUCCESS' } }),
            this.prisma.invoice.count({ where: { tenantId, taxStatus: 'FAILED' } }),
            this.prisma.invoice.count({ where: { tenantId, invoiceType: { in: ['SALE', 'SALE_RETURN'] }, taxStatus: null, status: { notIn: ['CANCELLED', 'DRAFT'] }, deletedAt: null } }),
        ]);
        return {
            environment: c.environment, memoryId: c.memoryId ?? '', economicCode: c.economicCode ?? '', enabled: !!c.enabled,
            hasPrivateKey: !!c.privateKeyEnc, hasServerKey: !!(c.serverPublicKey && c.serverKeyId), serverKeyId: c.serverKeyId ?? '',
            unitCodes: c.unitCodes ?? {}, ready: this.isReady(c), lastError: row?.lastError ?? null, lastSyncAt: row?.lastSyncAt ?? null,
            counts: { notSent, pending, success, failed },
            encryptionConfigured: /^[0-9a-fA-F]{64}$/.test(process.env.ENCRYPTION_KEY ?? ''),
        };
    }

    private isReady(c: StoredConfig) {
        return !!(c.memoryId && c.economicCode && c.privateKeyEnc && c.serverPublicKey && c.serverKeyId);
    }

    async updateSettings(tenantId: string, dto: UpdateMoodianSettingsDto) {
        const row = await this.loadIntegration(tenantId);
        const c = this.cfg(row);
        if (dto.environment) c.environment = dto.environment;
        if (dto.memoryId) c.memoryId = dto.memoryId.toUpperCase();
        if (dto.economicCode) c.economicCode = dto.economicCode;
        if (dto.serverPublicKey) { loadPublicKey(dto.serverPublicKey); c.serverPublicKey = dto.serverPublicKey; }
        if (dto.serverKeyId) c.serverKeyId = dto.serverKeyId;
        if (dto.unitCodes) c.unitCodes = Object.fromEntries(Object.entries(dto.unitCodes).filter(([, v]) => /^\d{1,6}$/.test(String(v))));
        if (dto.privateKey?.trim()) {
            try { loadPrivateKey(dto.privateKey); } catch { throw new BadRequestException('کلید خصوصی خوانده نشد؛ باید RSA و به‌صورت PEM (PKCS#8 یا PKCS#1) باشد'); }
            try { c.privateKeyEnc = sealSecret(dto.privateKey.trim()); } catch (e) { throw new BadRequestException((e as Error).message); }
        }
        if (dto.enabled !== undefined) {
            if (dto.enabled && !this.isReady(c)) throw new BadRequestException('پیش از فعال‌سازی، شناسه حافظه، شماره اقتصادی، کلید خصوصی و کلید عمومی سازمان را کامل کنید');
            c.enabled = dto.enabled;
        }
        const data = { config: c as unknown as Prisma.InputJsonValue, status: c.enabled ? ('ACTIVE' as const) : ('INACTIVE' as const) };
        await this.prisma.integration.upsert({ where: { tenantId_type: { tenantId, type: 'TAX_AUTHORITY' } }, update: data, create: { tenantId, type: 'TAX_AUTHORITY', ...data } });
        this.tokens.delete(tenantId);
        return this.getSettings(tenantId);
    }

    private client(c: StoredConfig, needServerKey: boolean): MoodianClient {
        if (!c.memoryId || !c.privateKeyEnc) throw new BadRequestException('شناسه حافظه مالیاتی و کلید خصوصی در تنظیمات مودیان ثبت نشده است');
        if (needServerKey && !(c.serverPublicKey && c.serverKeyId)) throw new BadRequestException('کلید عمومی سازمان دریافت نشده است (دکمه‌ی «دریافت کلید از سازمان»)');
        let priv;
        try { priv = loadPrivateKey(openSecret(c.privateKeyEnc)); } catch (e) { throw new BadRequestException(`کلید خصوصی ذخیره‌شده قابل خواندن نیست: ${(e as Error).message}`); }
        return new MoodianClient({
            baseUrl: MOODIAN_URLS[c.environment], memoryId: c.memoryId, privateKey: priv,
            serverPublicKey: c.serverPublicKey ? loadPublicKey(c.serverPublicKey) : undefined, serverKeyId: c.serverKeyId,
        }, this.fetchImpl);
    }

    private wrapErr(e: unknown): never {
        if (e instanceof MoodianError) throw new BadRequestException(e.status ? `${e.message}: ${JSON.stringify(e.body ?? '').slice(0, 300)}` : e.message);
        throw e;
    }

    async fetchServerKey(tenantId: string) {
        const c = this.cfg(await this.loadIntegration(tenantId));
        try {
            const info = await this.client(c, false).serverInformation();
            return this.updateSettings(tenantId, { serverPublicKey: info.publicKey, serverKeyId: info.keyId });
        } catch (e) { this.wrapErr(e); }
    }

    private async token(tenantId: string, c: StoredConfig, client: MoodianClient) {
        const cached = this.tokens.get(tenantId);
        if (cached && cached.expiresAt - 100_000 > Date.now()) return cached.token;
        const t = await client.login();
        this.tokens.set(tenantId, t);
        return t.token;
    }

    async testConnection(tenantId: string) {
        const c = this.cfg(await this.loadIntegration(tenantId));
        const client = this.client(c, false);
        try {
            this.tokens.delete(tenantId);
            const t = await this.token(tenantId, c, client);
            await this.prisma.integration.update({ where: { tenantId_type: { tenantId, type: 'TAX_AUTHORITY' } }, data: { lastError: null } });
            return { ok: true, tokenPreview: `${t.slice(0, 6)}…`, environment: c.environment };
        } catch (e) {
            await this.prisma.integration.updateMany({ where: { tenantId, type: 'TAX_AUTHORITY' }, data: { lastError: (e as Error).message.slice(0, 500) } });
            this.wrapErr(e);
        }
    }

    // ───────────── فاکتور ─────────────
    private async loadInvoice(tenantId: string, id: string): Promise<FullInvoice> {
        const inv = await this.prisma.invoice.findFirst({ where: { id, tenantId, deletedAt: null, invoiceType: { in: ['SALE', 'SALE_RETURN'] } }, include: INVOICE_INCLUDE });
        if (!inv) throw new NotFoundException('فاکتور فروش یا برگشتی پیدا نشد');
        return inv;
    }

    private async multiplier(tenantId: string) {
        const t = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { settings: true } });
        const cur = (t.settings as { currency?: string } | null)?.currency ?? 'RIAL';
        return cur === 'TOMAN' ? 10 : 1; // فقط فروشگاه‌هایی که صراحتاً واحد «تومان» دارند ×۱۰ می‌شوند
    }

    private toMapInvoice(inv: FullInvoice): MapInvoice {
        return {
            invoiceType: inv.invoiceType as 'SALE' | 'SALE_RETURN', date: inv.date, createdAt: inv.createdAt,
            totalAmount: Number(inv.totalAmount), paidAmount: Number(inv.paidAmount),
            party: inv.party ? { name: inv.party.name, nationalId: inv.party.nationalId, economicCode: inv.party.economicCode, postalCode: inv.party.postalCode } : null,
            items: inv.items.map((i) => ({
                productName: i.productName, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice), vatAmount: Number(i.vatAmount), vatPercent: Number(i.vatPercent), totalPrice: Number(i.totalPrice),
                product: i.product, unit: i.unit,
            })),
            original: inv.original,
        };
    }

    private eligibility(inv: FullInvoice): string | null {
        if (inv.status === 'CANCELLED') return 'فاکتور لغو شده است';
        if (inv.status === 'DRAFT') return 'فاکتور پیش‌نویس است';
        if (inv.taxStatus === 'SUCCESS') return 'این فاکتور قبلاً در سامانه مودیان ثبت شده است';
        if (inv.taxStatus === 'PENDING') return 'ارسال‌شده و در انتظار پاسخ سازمان است؛ وضعیت را استعلام کنید';
        return null;
    }

    /** پیش‌نمایش بسته و مشکلات احتمالی، بدون ارسال و بدون مصرف سریال */
    async preview(tenantId: string, id: string) {
        const [inv, row, mult] = await Promise.all([this.loadInvoice(tenantId, id), this.loadIntegration(tenantId), this.multiplier(tenantId)]);
        const c = this.cfg(row);
        const issues: string[] = [];
        if (!c.memoryId || !MEMORY_ID_REGEX.test(c.memoryId)) issues.push('شناسه یکتای حافظه مالیاتی در تنظیمات مودیان ثبت نشده است');
        const block = this.eligibility(inv);
        if (block) issues.push(block);
        const when = Date.now();
        const sample = mapInvoice(this.toMapInvoice(inv), {
            memoryId: c.memoryId ?? 'AAAAAA', economicCode: c.economicCode ?? '', multiplier: mult, unitCodes: c.unitCodes ?? {}, now: new Date(),
            taxId: c.memoryId && MEMORY_ID_REGEX.test(c.memoryId) ? generateTaxId(c.memoryId, when, inv.taxAuthorityId ? 1 : (row?.serialCounter ?? 0) + 1) : '(پس از ثبت شناسه حافظه ساخته می‌شود)',
            serialHex: hexSerial((row?.serialCounter ?? 0) + 1),
        });
        return { issues: [...issues, ...sample.issues], payload: sample.dto, currentStatus: inv.taxStatus, taxId: inv.taxAuthorityId, referenceNumber: inv.taxAuthorityRef, error: inv.taxAuthorityError };
    }

    async send(tenantId: string, id: string) {
        const row = await this.loadIntegration(tenantId);
        const c = this.cfg(row);
        if (!c.enabled) throw new BadRequestException('اتصال مودیان فعال نیست (تنظیمات ← سامانه مودیان)');
        const inv = await this.loadInvoice(tenantId, id);
        const block = this.eligibility(inv);
        if (block) throw new BadRequestException(block);
        const mult = await this.multiplier(tenantId);

        // سریال اتمی؛ هر تلاش جدید یک شماره‌ی مالیاتی تازه می‌گیرد
        const bumped = await this.prisma.integration.update({ where: { tenantId_type: { tenantId, type: 'TAX_AUTHORITY' } }, data: { serialCounter: { increment: 1 } }, select: { serialCounter: true } });
        const now = new Date();
        const issuedAt = Math.min((inv.date ?? inv.createdAt).getTime(), now.getTime());
        const taxId = generateTaxId(c.memoryId!, issuedAt, bumped.serialCounter);
        const { dto, issues } = mapInvoice(this.toMapInvoice(inv), { memoryId: c.memoryId!, economicCode: c.economicCode ?? '', multiplier: mult, unitCodes: c.unitCodes ?? {}, now, taxId, serialHex: hexSerial(bumped.serialCounter) });
        if (issues.length) throw new BadRequestException({ message: 'فاکتور برای ارسال به مودیان کامل نیست', details: issues });

        const client = this.client(c, true);
        try {
            const token = await this.token(tenantId, c, client);
            const res = await client.sendInvoices(token, [dto]);
            const r = res[0] ?? {};
            if (r.errorCode || !r.referenceNumber) {
                const msg = `${r.errorCode ?? ''} ${typeof r.errorDetail === 'string' ? r.errorDetail : JSON.stringify(r.errorDetail ?? '')}`.trim() || 'پاسخ نامعتبر از سامانه';
                await this.prisma.invoice.update({ where: { id }, data: { taxStatus: 'FAILED', taxAuthorityId: taxId, taxAuthorityError: msg.slice(0, 1000) } });
                throw new BadRequestException(`سامانه مودیان بسته را نپذیرفت: ${msg}`);
            }
            await this.prisma.invoice.update({ where: { id }, data: { taxStatus: 'PENDING', taxAuthorityId: taxId, taxAuthorityRef: r.referenceNumber, taxAuthoritySentAt: now, taxAuthorityError: null } });
            return { taxId, referenceNumber: r.referenceNumber, status: 'PENDING' };
        } catch (e) {
            if (e instanceof BadRequestException) throw e;
            if (e instanceof MoodianError) {
                await this.prisma.invoice.update({ where: { id }, data: { taxStatus: null, taxAuthorityError: e.message.slice(0, 1000) } });
                this.tokens.delete(tenantId);
            }
            this.wrapErr(e);
        }
    }

    /** استعلام وضعیت یک یا چند فاکتور ارسال‌شده */
    async inquire(tenantId: string, ids: string[]) {
        const row = await this.loadIntegration(tenantId);
        const c = this.cfg(row);
        const invoices = await this.prisma.invoice.findMany({ where: { tenantId, id: { in: ids }, taxAuthorityRef: { not: null } } });
        if (!invoices.length) return [];
        const client = this.client(c, false);
        try {
            const token = await this.token(tenantId, c, client);
            const results = await client.inquiry(token, invoices.map((i) => i.taxAuthorityRef!));
            const out: { id: string; status: string; error?: string }[] = [];
            for (const inv of invoices) {
                const r = results.find((x) => x.referenceNumber === inv.taxAuthorityRef);
                if (!r) continue;
                const st = String(r.status ?? '').toUpperCase();
                const errs: { code?: string; message?: string }[] = r.data?.error ?? [];
                const warns: { code?: string; message?: string }[] = r.data?.warning ?? [];
                const fmt = (l: { code?: string; message?: string }[]) => l.map((e) => `${e.code ?? ''}: ${e.message ?? ''}`).join(' | ');
                if (st === 'SUCCESS') {
                    await this.prisma.invoice.update({ where: { id: inv.id }, data: { taxStatus: 'SUCCESS', taxConfirmationId: r.data?.confirmationReferenceId ?? null, taxAuthorityError: warns.length ? `هشدار: ${fmt(warns)}`.slice(0, 1000) : null } });
                } else if (st === 'FAILED') {
                    await this.prisma.invoice.update({ where: { id: inv.id }, data: { taxStatus: 'FAILED', taxAuthorityError: (fmt(errs) || 'رد شد').slice(0, 1000) } });
                }
                out.push({ id: inv.id, status: st === 'SUCCESS' || st === 'FAILED' ? st : 'PENDING', error: errs.length ? fmt(errs) : undefined });
            }
            await this.prisma.integration.update({ where: { tenantId_type: { tenantId, type: 'TAX_AUTHORITY' } }, data: { lastSyncAt: new Date(), lastError: null } });
            return out;
        } catch (e) { this.wrapErr(e); }
    }

    /** همگام‌سازی: ابتدا استعلام در انتظارها، سپس ارسال فاکتورهای ارسال‌نشده (به ترتیب تاریخ) */
    async sync(tenantId: string, limit = 25) {
        const pending = await this.prisma.invoice.findMany({ where: { tenantId, taxStatus: 'PENDING' }, select: { id: true }, take: 100 });
        const inquired = pending.length ? await this.inquire(tenantId, pending.map((p) => p.id)) : [];

        const unsent = await this.prisma.invoice.findMany({
            where: { tenantId, invoiceType: 'SALE', taxStatus: null, status: { notIn: ['CANCELLED', 'DRAFT'] }, deletedAt: null },
            orderBy: { date: 'asc' }, take: limit, select: { id: true, invoiceNumber: true },
        });
        const sent: string[] = []; const failed: { invoiceNumber: string; reason: string }[] = [];
        for (const u of unsent) {
            try { await this.send(tenantId, u.id); sent.push(u.invoiceNumber); }
            catch (e) { failed.push({ invoiceNumber: u.invoiceNumber, reason: this.reason(e) }); }
        }
        return { inquired: inquired.length, confirmed: inquired.filter((i) => i.status === 'SUCCESS').length, sent: sent.length, failed };
    }

    private reason(e: unknown): string {
        const r = (e as { getResponse?: () => unknown }).getResponse?.() as { message?: string; details?: string[] } | string | undefined;
        if (typeof r === 'string') return r;
        return [r?.message, ...(r?.details ?? [])].filter(Boolean).join(' — ') || (e as Error).message;
    }
}
