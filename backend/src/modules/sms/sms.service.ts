import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { openSecret, sealSecret } from '../../common/utils/secret-box.util';
import { faMoney } from '../../common/utils/fa.util';
import { IR_MOBILE_REGEX, normalizePhone } from '../../common/utils/phone.util';
import { buildMeta } from '../../common/dto/pagination.dto';
import { sendKavenegar, sendSmsIr, SmsResult } from './sms.providers';
import { QuerySmsDto, RemindDto, UpdateSmsSettingsDto } from './dto/sms.dto';

interface Cfg { provider: 'kavenegar' | 'smsir' | 'log'; apiKeyEnc?: string; sender?: string; enabled?: boolean }

@Injectable()
export class SmsService {
    fetchImpl: typeof fetch = (input, init) => fetch(input, init);
    constructor(private prisma: PrismaService) { }

    private async row(tenantId: string) { return this.prisma.integration.findUnique({ where: { tenantId_type: { tenantId, type: 'SMS_GATEWAY' } } }); }
    private cfg(row: { config: Prisma.JsonValue } | null): Cfg { const s = (row?.config as unknown as Partial<Cfg>) ?? {}; return { ...s, provider: s.provider ?? 'log' }; }

    async getSettings(tenantId: string) {
        const c = this.cfg(await this.row(tenantId));
        return { provider: c.provider, sender: c.sender ?? '', enabled: !!c.enabled, hasApiKey: !!c.apiKeyEnc, encryptionConfigured: /^[0-9a-fA-F]{64}$/.test(process.env.ENCRYPTION_KEY ?? '') };
    }

    async updateSettings(tenantId: string, dto: UpdateSmsSettingsDto) {
        const c = this.cfg(await this.row(tenantId));
        if (dto.provider) c.provider = dto.provider;
        if (dto.sender !== undefined) c.sender = dto.sender.replace(/\s/g, '');
        if (dto.apiKey?.trim()) { try { c.apiKeyEnc = sealSecret(dto.apiKey.trim()); } catch (e) { throw new BadRequestException((e as Error).message); } }
        if (c.provider === 'smsir' && c.sender && !/^\d+$/.test(c.sender)) throw new BadRequestException('شماره خط SMS.ir باید فقط عدد باشد');
        if (dto.enabled !== undefined) {
            if (dto.enabled && c.provider !== 'log' && (!c.apiKeyEnc || !c.sender)) throw new BadRequestException('برای فعال‌سازی، کلید API و شماره خط ارسال‌کننده را وارد کنید');
            c.enabled = dto.enabled;
        }
        const data = { config: c as unknown as Prisma.InputJsonValue, status: c.enabled ? ('ACTIVE' as const) : ('INACTIVE' as const) };
        await this.prisma.integration.upsert({ where: { tenantId_type: { tenantId, type: 'SMS_GATEWAY' } }, update: data, create: { tenantId, type: 'SMS_GATEWAY', ...data } });
        return this.getSettings(tenantId);
    }

    /** ارسال یک پیامک و ثبت در گزارش */
    async send(tenantId: string, userId: string | null, receptorRaw: string, message: string, kind: string, refId?: string): Promise<SmsResult & { receptor: string }> {
        const c = this.cfg(await this.row(tenantId));
        if (!c.enabled) throw new BadRequestException('ارسال پیامک فعال نیست (تنظیمات ← پیامک)');
        const receptor = String(normalizePhone(receptorRaw));
        if (!IR_MOBILE_REGEX.test(receptor)) throw new BadRequestException('شماره موبایل معتبر نیست');

        let r: SmsResult;
        try {
            if (c.provider === 'log') r = { ok: true, providerRef: 'log-only' };
            else {
                const key = openSecret(c.apiKeyEnc!);
                r = c.provider === 'kavenegar' ? await sendKavenegar(this.fetchImpl, key, c.sender ?? '', receptor, message) : await sendSmsIr(this.fetchImpl, key, c.sender ?? '', receptor, message);
            }
        } catch (e) { r = { ok: false, error: `ارتباط با سرویس پیامک ناموفق بود: ${(e as Error).message}` }; }

        await this.prisma.smsLog.create({ data: { tenantId, receptor, message, provider: c.provider, kind, refId, status: r.ok ? 'SENT' : 'FAILED', providerRef: r.providerRef, error: r.error, createdBy: userId } });
        return { ...r, receptor };
    }

    async test(tenantId: string, userId: string, receptor: string) {
        const shop = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true } });
        const r = await this.send(tenantId, userId, receptor, `پیامک آزمایشی از ${shop.name}`, 'TEST');
        if (!r.ok) throw new BadRequestException(r.error ?? 'ارسال ناموفق بود');
        return { sent: true };
    }

    async sendInvoice(tenantId: string, userId: string, invoiceId: string, payUrl?: string) {
        const inv = await this.prisma.invoice.findFirst({ where: { id: invoiceId, tenantId, invoiceType: 'SALE', deletedAt: null }, include: { party: true, tenant: { select: { name: true } } } });
        if (!inv) throw new NotFoundException('فاکتور پیدا نشد');
        const mobile = inv.party?.mobile || inv.party?.phone;
        if (!mobile) throw new BadRequestException('برای این مشتری شماره موبایل ثبت نشده است');
        if (payUrl && !/^https?:\/\//.test(payUrl)) throw new BadRequestException('لینک پرداخت نامعتبر است');
        const rem = Number(inv.remainingAmount);
        const text = `${inv.party!.name} عزیز، فاکتور ${inv.invoiceNumber} به مبلغ ${faMoney(Number(inv.totalAmount))} ریال از ${inv.tenant.name} صادر شد.` +
            (rem > 0 ? ` مانده: ${faMoney(rem)} ریال.` : '') + (payUrl && rem > 0 ? `\nپرداخت آنلاین: ${payUrl}` : '');
        const r = await this.send(tenantId, userId, mobile, text, 'INVOICE', inv.id);
        if (!r.ok) throw new BadRequestException(r.error ?? 'ارسال ناموفق بود');
        return { sent: true, receptor: r.receptor };
    }

    /** یادآوری بدهی مشتریان (پیامک جداگانه برای هر مشتری) */
    async remindDebtors(tenantId: string, userId: string, dto: RemindDto) {
        const shop = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true } });
        const parties = await this.prisma.party.findMany({
            where: { tenantId, partyType: 'CUSTOMER', isActive: true, currentBalance: { gte: dto.minBalance ?? 1 }, ...(dto.partyIds?.length ? { id: { in: dto.partyIds } } : {}) },
            select: { id: true, name: true, mobile: true, phone: true, currentBalance: true }, orderBy: { currentBalance: 'desc' }, take: 200,
        });
        const targets = parties.map((p) => ({ ...p, receptor: String(normalizePhone(p.mobile || '')), balance: Number(p.currentBalance) }));
        const ok = targets.filter((t) => IR_MOBILE_REGEX.test(t.receptor));
        const skipped = targets.filter((t) => !IR_MOBILE_REGEX.test(t.receptor)).map((t) => t.name);
        const msg = (t: { name: string; balance: number }) => `${t.name} عزیز، مانده حساب شما نزد ${shop.name} ${faMoney(t.balance)} ریال است. لطفاً نسبت به تسویه اقدام فرمایید.`;

        if (dto.dryRun) return { dryRun: true, recipients: ok.map((t) => ({ id: t.id, name: t.name, receptor: t.receptor, balance: t.balance })), skipped, sample: ok[0] ? msg(ok[0]) : null };
        let sent = 0; const failed: { name: string; reason: string }[] = [];
        for (const t of ok) {
            try { const r = await this.send(tenantId, userId, t.receptor, msg(t), 'REMINDER', t.id); if (r.ok) sent++; else failed.push({ name: t.name, reason: r.error ?? '' }); }
            catch (e) { failed.push({ name: t.name, reason: (e as Error).message }); break; }
        }
        return { dryRun: false, sent, failed, skipped };
    }

    async logs(tenantId: string, q: QuerySmsDto) {
        const { page = 1, limit = 20 } = q;
        const [data, total] = await this.prisma.$transaction(async (tx) => [
            await tx.smsLog.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
            await tx.smsLog.count({ where: { tenantId } }),
        ] as const);
        return { data, meta: buildMeta(total, page, limit) };
    }
}
