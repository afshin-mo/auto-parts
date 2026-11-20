import { createPrivateKey, createPublicKey, constants, privateDecrypt, publicEncrypt, sign, verify, createCipheriv, createDecipheriv, KeyObject } from 'crypto';

const wrap = (b64: string, label: string) => `-----BEGIN ${label}-----\n${b64.replace(/\s+/g, '').replace(/(.{64})/g, '$1\n')}\n-----END ${label}-----\n`;

/** کلید خصوصی را با یا بدون سرتیتر PEM (PKCS#8 / PKCS#1) می‌پذیرد */
export function loadPrivateKey(input: string): KeyObject {
    const t = input.trim();
    if (t.includes('BEGIN')) return createPrivateKey(t);
    try { return createPrivateKey(wrap(t, 'PRIVATE KEY')); } catch { return createPrivateKey(wrap(t, 'RSA PRIVATE KEY')); }
}

export function loadPublicKey(input: string): KeyObject {
    const t = input.trim();
    return createPublicKey(t.includes('BEGIN') ? t : wrap(t, 'PUBLIC KEY'));
}

/** امضای RSA-SHA256 (PKCS#1 v1.5) به‌صورت base64 */
export function signText(text: string, privateKey: KeyObject): string {
    return sign('RSA-SHA256', Buffer.from(text, 'utf8'), privateKey).toString('base64');
}
export function verifyText(text: string, signatureB64: string, publicKey: KeyObject): boolean {
    return verify('RSA-SHA256', Buffer.from(text, 'utf8'), publicKey, Buffer.from(signatureB64, 'base64'));
}

const xor = (src: Buffer, key: Buffer) => Buffer.from(src.map((b, i) => b ^ key[i % key.length]));

/** رمزنگاری بسته: ابتدا XOR با کلید، سپس AES-256-GCM؛ خروجی base64(متن رمز ‖ tag ۱۶ بایتی) */
export function encryptPacket(text: string, key: Buffer, iv: Buffer): string {
    const c = createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
    const enc = Buffer.concat([c.update(xor(Buffer.from(text, 'utf8'), key)), c.final()]);
    return Buffer.concat([enc, c.getAuthTag()]).toString('base64');
}
export function decryptPacket(b64: string, key: Buffer, iv: Buffer): string {
    const all = Buffer.from(b64, 'base64');
    const d = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
    d.setAuthTag(all.subarray(all.length - 16));
    return xor(Buffer.concat([d.update(all.subarray(0, all.length - 16)), d.final()]), key).toString('utf8');
}

/** رمزنگاری کلید AES (به‌صورت رشته‌ی hex ۶۴ کاراکتری) با کلید عمومی سازمان: RSA-OAEP با SHA-256 */
export function encryptAesKey(aesHex: string, taxOrgPublicKey: KeyObject): string {
    return publicEncrypt({ key: taxOrgPublicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(aesHex, 'utf8')).toString('base64');
}
export function decryptAesKey(b64: string, privateKey: KeyObject): string {
    return privateDecrypt({ key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(b64, 'base64')).toString('utf8');
}
