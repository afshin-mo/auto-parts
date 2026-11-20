import { Prisma } from '@prisma/client';
import { normalizeCode, normalizeText } from '../../common/utils/code-normalize.util';

const FA = '۰۱۲۳۴۵۶۷۸۹';
/** «2» و «۲» هر دو پیدا شوند (نام‌هایی که ارقامشان فارسی ذخیره شده) */
export const digitVariants = (t: string): string[] => {
    const fa = t.replace(/[0-9]/g, (d) => FA[Number(d)]);
    return fa === t ? [t] : [t, fa];
};

/**
 * جستجوی کالا: عبارت به کلمه‌ها شکسته می‌شود و هر کلمه باید در یکی از این‌ها باشد (AND بین کلمه‌ها):
 * نام، نام انگلیسی، کد کالا، سریال/شماره‌ی قطعه، OEM، بارکد، نام برند (مارک) یا شماره‌های معادل.
 * پس «500655 PT6» یا «لنت PA5» یا «دیسک ترمز» همه کار می‌کنند.
 */
export function productSearchWhere(search: string): Prisma.ProductWhereInput {
    const tokens = normalizeText(search).split(/\s+/).filter(Boolean).slice(0, 6);
    return {
        AND: tokens.map((t) => {
            const ci = (v: string) => ({ contains: v, mode: 'insensitive' as const });
            const code = normalizeCode(t);
            return {
                OR: [
                    ...digitVariants(t).flatMap((v) => [
                        { name: ci(v) }, { nameEn: ci(v) }, { sku: ci(v) }, { partNumber: ci(v) }, { oemCode: ci(v) }, { barcode: ci(v) },
                        { brand: { is: { name: ci(v) } } },
                    ]),
                    ...(code.length >= 2 ? [{ codes: { some: { codeNorm: { contains: code } } } }] : []),
                ],
            };
        }),
    };
}
