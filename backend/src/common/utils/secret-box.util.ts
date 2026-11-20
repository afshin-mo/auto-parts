import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/** رمزنگاری تنظیمات حساس (مثل کلید خصوصی) پیش از ذخیره در پایگاه‌داده — AES-256-GCM با ENCRYPTION_KEY */
function key(): Buffer {
    const hex = process.env.ENCRYPTION_KEY;
    if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
        throw new Error('ENCRYPTION_KEY تنظیم نشده است (۶۴ کاراکتر hex؛ با openssl rand -hex 32 بسازید)');
    }
    return Buffer.from(hex, 'hex');
}

export function sealSecret(plain: string): string {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', key(), iv);
    const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
    return `v1:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${enc.toString('base64')}`;
}

export function openSecret(sealed: string): string {
    const [v, iv, tag, data] = sealed.split(':');
    if (v !== 'v1') throw new Error('قالب داده‌ی رمزشده نامعتبر است');
    const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8');
}
