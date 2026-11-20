import { generateKeyPairSync, randomBytes } from 'crypto';
import { generateTaxId, verhoeffChecksum, verhoeffValidate, hexSerial } from './taxid';
import { normalize } from './normalizer';
import { decryptAesKey, decryptPacket, encryptAesKey, encryptPacket, loadPrivateKey, loadPublicKey, signText, verifyText } from './crypto';

// بردارهای زیر از تست‌های کتابخانه‌ی مرجع (snapp-market-pro/moadian) گرفته شده‌اند
describe('شماره مالیاتی', () => {
    it.each([
        ['68697057172018463000000000012', 2],
        ['68697057172018463000000008173', 8],
        ['68697057172018463002572613409', 1],
    ])('رقم کنترل Verhoeff برای %s', (n, c) => expect(verhoeffChecksum(n)).toBe(c));

    it('اعتبارسنجی Verhoeff', () => {
        expect(verhoeffValidate('686970571720184630000000000122')).toBe(true);
        expect(verhoeffValidate('686970571720184630000000081737')).toBe(false);
    });

    it.each([
        ['DEF5GH', '2020-07-20T01:00:10Z', 12, 'DEF5GH0481F000000000C2'],
        ['DEF5GH', '2020-07-20T08:30:30Z', 8173, 'DEF5GH0481F0000001FED8'],
        ['DEF5GH', '2020-07-20T23:11:12Z', 2572613409, 'DEF5GH0481F009956F7211'],
    ])('تولید شماره مالیاتی %s %s #%s', (id, date, serial, expected) => {
        expect(generateTaxId(id, new Date(date).getTime(), serial)).toBe(expected);
    });

    it('شناسه‌ی نامعتبر رد می‌شود و سریال به hex ده‌رقمی تبدیل می‌شود', () => {
        expect(() => generateTaxId('AB', Date.now(), 1)).toThrow();
        expect(hexSerial(255)).toBe('00000000ff');
        expect(generateTaxId('a1b2c3', Date.UTC(2026, 9, 11), 1)).toHaveLength(22);
    });
});

describe('نرمال‌سازی (نمونه‌های سند سازمان و کتابخانه‌ی مرجع)', () => {
    it('تخت‌سازی و مرتب‌سازی کلیدها', () => {
        expect(normalize({ k2: 'v1', k4: 'v2', k3: { k1: 'v4', k5: 'v5' } })).toBe('v1#v4#v5#v2');
        expect(normalize({ KD: 12.94, KB: 'ABC', KA: { B: 'FGB', A: '700' } })).toBe('700#FGB#ABC#12.94');
        expect(normalize({ KD: 12.94, KB: 'ABC', KA: [{ B: 2, A: 1 }, { A: 3, B: 4 }] })).toBe('1#2#3#4#ABC#12.94');
    });
    it('مقدار خالی، بولی و علامت #', () => {
        expect(normalize({ a: null, b: '', c: true, d: false, e: 'x#y' })).toBe(['#', '#', 'true', 'false', 'x##y'].join('#'));
    });
});

describe('رمزنگاری', () => {
    const taxpayer = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const server = generateKeyPairSync('rsa', { modulusLength: 2048 });

    it('امضا با کلید خصوصی (PKCS#8 و PKCS#1 و بدون سرتیتر) قابل تأیید با کلید عمومی است', () => {
        const pem8 = taxpayer.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
        const pem1 = taxpayer.privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();
        const bare = pem8.replace(/-----[^-]+-----|\s/g, '');
        for (const k of [pem8, pem1, bare]) {
            const sig = signText('a#b#c', loadPrivateKey(k));
            expect(verifyText('a#b#c', sig, taxpayer.publicKey)).toBe(true);
            expect(verifyText('a#b#X', sig, taxpayer.publicKey)).toBe(false);
        }
    });

    it('بسته با AES-GCM و کلید AES با RSA-OAEP-SHA256 رفت‌وبرگشت می‌شود (کلید عمومی بدون سرتیتر هم پذیرفته می‌شود)', () => {
        const aesHex = randomBytes(32).toString('hex'), ivHex = randomBytes(16).toString('hex');
        const pubBare = server.publicKey.export({ type: 'spki', format: 'pem' }).toString().replace(/-----[^-]+-----|\s/g, '');
        const wrapped = encryptAesKey(aesHex, loadPublicKey(pubBare));
        expect(decryptAesKey(wrapped, server.privateKey)).toBe(aesHex);

        const text = JSON.stringify({ header: { taxid: 'X' }, sstt: 'لنت ترمز — پژو ۲۰۶' });
        const enc = encryptPacket(text, Buffer.from(aesHex, 'hex'), Buffer.from(ivHex, 'hex'));
        expect(decryptPacket(enc, Buffer.from(aesHex, 'hex'), Buffer.from(ivHex, 'hex'))).toBe(text);
        expect(() => decryptPacket(enc, randomBytes(32), Buffer.from(ivHex, 'hex'))).toThrow();
    });
});
