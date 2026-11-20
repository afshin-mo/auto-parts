import { scrub } from './audit.interceptor';

describe('scrub (پاک‌سازی بدنه‌ی درخواست در گزارش فعالیت)', () => {
    it('رمز، توکن، کلید خصوصی، کلید API و مرچنت‌کد ذخیره نمی‌شود، حتی در ساختار تو در تو', () => {
        const out = scrub({
            name: 'x', password: 'p', newPassword: 'n', refreshToken: 't', privateKey: '-----BEGIN PRIVATE KEY-----', apiKey: 'K', merchantId: 'M',
            serverKeyId: 'KID-1', economicCode: '1010', nested: { client_secret: 's', ok: 1 }, list: [{ Authorization: 'Bearer x', v: 2 }],
        });
        expect(JSON.stringify(out)).not.toMatch(/BEGIN PRIVATE|"p"|"n"|"t"|"K"|"M"|Bearer|"s"/);
        expect(out).toMatchObject({ name: 'x', serverKeyId: 'KID-1', economicCode: '1010', nested: { ok: 1 }, list: [{ v: 2 }] });
        expect(out.privateKey).toBe('***');
    });
});
