export interface SmsResult { ok: boolean; providerRef?: string; error?: string }
type F = typeof fetch;

/** کاوه‌نگار: POST https://api.kavenegar.com/v1/{apiKey}/sms/send.json */
export async function sendKavenegar(f: F, apiKey: string, sender: string, receptor: string, message: string): Promise<SmsResult> {
    const body = new URLSearchParams({ receptor, message, ...(sender ? { sender } : {}) });
    const res = await f(`https://api.kavenegar.com/v1/${encodeURIComponent(apiKey)}/sms/send.json`, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(20_000) });
    const j = (await res.json().catch(() => null)) as { return?: { status?: number; message?: string }; entries?: { messageid?: number }[] } | null;
    if (j?.return?.status === 200) return { ok: true, providerRef: String(j.entries?.[0]?.messageid ?? '') };
    return { ok: false, error: `کاوه‌نگار: ${j?.return?.message ?? `HTTP ${res.status}`}` };
}

/** SMS.ir: POST https://api.sms.ir/v1/send/bulk (هدر X-API-KEY) */
export async function sendSmsIr(f: F, apiKey: string, sender: string, receptor: string, message: string): Promise<SmsResult> {
    const res = await f('https://api.sms.ir/v1/send/bulk', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-API-KEY': apiKey },
        body: JSON.stringify({ lineNumber: Number(sender), messageText: message, mobiles: [receptor] }), signal: AbortSignal.timeout(20_000),
    });
    const j = (await res.json().catch(() => null)) as { status?: number; message?: string; data?: { messageIds?: number[] } } | null;
    if (j?.status === 1) return { ok: true, providerRef: String(j.data?.messageIds?.[0] ?? '') };
    return { ok: false, error: `SMS.ir: ${j?.message ?? `HTTP ${res.status}`}` };
}
