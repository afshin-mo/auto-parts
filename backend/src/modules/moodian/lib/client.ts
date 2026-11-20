import { randomBytes, randomUUID, KeyObject } from 'crypto';
import { normalize } from './normalizer';
import { encryptAesKey, encryptPacket, signText } from './crypto';

export const MOODIAN_URLS = { production: 'https://tp.tax.gov.ir', sandbox: 'https://sandboxrc.tax.gov.ir' } as const;
export type MoodianEnv = keyof typeof MOODIAN_URLS;

export interface MoodianCredentials {
    baseUrl: string;
    /** «شناسه یکتای حافظه مالیاتی» (نام کاربری در سامانه) */
    memoryId: string;
    privateKey: KeyObject;
    serverPublicKey?: KeyObject;
    serverKeyId?: string;
}

export class MoodianError extends Error {
    constructor(message: string, public status = 0, public body?: unknown) { super(message); }
}

type Json = Record<string, any>;

/**
 * کلاینت نسخه‌ی ۱ API سامانه مودیان (روش «کلید خصوصی + شناسه یکتا»، مسیر self-tsp).
 * ساختار بسته، امضا و رمزنگاری بر پایه‌ی سند فنی سازمان و کتابخانه‌ی مرجع snapp-market-pro/moadian است.
 */
export class MoodianClient {
    constructor(private c: MoodianCredentials, private fetchImpl: typeof fetch = fetch, private timeoutMs = 30_000) { }

    private headers(token?: string): Record<string, string> {
        const h: Record<string, string> = { timestamp: String(Date.now()), requestTraceId: randomUUID() };
        if (token) h.Authorization = `Bearer ${token}`;
        return h;
    }

    private packet(packetType: string, data: Json | string | null, extra: Json = {}): Json {
        return {
            uid: randomUUID(), packetType, retry: false, data,
            encryptionKeyId: '', symmetricKey: '', iv: '', fiscalId: this.c.memoryId, dataSignature: '', ...extra,
        };
    }

    private async post(path: string, body: Json, headers: Record<string, string>): Promise<Json> {
        let res: Response;
        try {
            res = await this.fetchImpl(`${this.c.baseUrl}/${path}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(this.timeoutMs),
            });
        } catch (e) {
            throw new MoodianError(`ارتباط با سامانه مودیان برقرار نشد: ${(e as Error).message}`);
        }
        const text = await res.text();
        let json: Json | null = null;
        try { json = JSON.parse(text); } catch { /* پاسخ غیر JSON */ }
        if (!res.ok) throw new MoodianError(`سامانه مودیان خطا برگرداند (HTTP ${res.status})`, res.status, json ?? text.slice(0, 500));
        return json ?? {};
    }

    /** درخواست‌های همگام تک‌بسته (دریافت توکن، استعلام، اطلاعات سرور) */
    private async sendOne(type: string, data: Json | string | null, token?: string, withKey = true): Promise<Json> {
        const headers = this.headers(token);
        const packet = this.packet(type, data);
        const forSign = { ...headers, ...(token ? { Authorization: token } : {}) };
        const signature = withKey ? signText(normalize({ ...packet, ...forSign }), this.c.privateKey) : null;
        return this.post(`req/api/self-tsp/sync/${type}`, { packet, signature }, headers);
    }

    /** اطلاعات سرور (کلید عمومی و شناسه‌ی آن). نیازی به توکن ندارد. */
    async serverInformation(): Promise<{ publicKey: string; keyId: string }> {
        const r = await this.sendOne('GET_SERVER_INFORMATION', null, undefined, true);
        const keys: Json[] = r?.result?.data?.publicKeys ?? [];
        const k = keys[0];
        if (!k?.key || !k?.id) throw new MoodianError('پاسخ اطلاعات سرور شامل کلید عمومی نبود', 0, r);
        return { publicKey: k.key, keyId: k.id };
    }

    async login(): Promise<{ token: string; expiresAt: number }> {
        const r = await this.sendOne('GET_TOKEN', { username: this.c.memoryId }, undefined, true);
        const d = r?.result?.data;
        if (!d?.token) throw new MoodianError('توکن دریافت نشد؛ شناسه یکتا و کلید خصوصی را بررسی کنید', 0, r);
        return { token: d.token, expiresAt: Number(d.expiresIn) };
    }

    /** ارسال گروهی صورتحساب‌ها (امضای هر بسته → رمزنگاری → امضای کل درخواست) */
    async sendInvoices(token: string, invoices: Json[]): Promise<Json[]> {
        if (!this.c.serverPublicKey || !this.c.serverKeyId) throw new MoodianError('کلید عمومی سازمان دریافت نشده است');
        const aesHex = randomBytes(32).toString('hex');
        const ivHex = randomBytes(16).toString('hex');
        const wrappedKey = encryptAesKey(aesHex, this.c.serverPublicKey);

        const packets = invoices.map((inv) => {
            const dataSignature = signText(normalize(inv), this.c.privateKey);
            return this.packet('INVOICE.V01', encryptPacket(JSON.stringify(inv), Buffer.from(aesHex, 'hex'), Buffer.from(ivHex, 'hex')), {
                dataSignature, encryptionKeyId: this.c.serverKeyId, symmetricKey: wrappedKey, iv: ivHex,
            });
        });

        const headers = this.headers(token);
        // طبق مرجع، بسته‌ها یک سطح تو در تو می‌شوند: packets.0.<index>.<field>
        const normalized = normalize({ packets: [packets], ...headers, Authorization: token });
        const signature = signText(normalized, this.c.privateKey);
        const r = await this.post('req/api/self-tsp/async/normal-enqueue', { packets, signature, signatureKeyId: null }, headers);
        return Array.isArray(r.result) ? r.result : [];
    }

    /** استعلام وضعیت با شماره‌های پیگیری */
    async inquiry(token: string, referenceNumbers: string[]): Promise<Json[]> {
        const r = await this.sendOne('INQUIRY_BY_REFERENCE_NUMBER', { referenceNumber: referenceNumbers }, token, true);
        const d = r?.result?.data;
        return Array.isArray(d) ? d : [];
    }
}
