import { digitVariants, productSearchWhere } from './product-search';

describe('productSearchWhere', () => {
    it('هر کلمه یک شرط AND است (سریال + مارک، نام + مارک)', () => {
        const w: any = productSearchWhere('500655 PT6');
        expect(w.AND).toHaveLength(2);
        const fields = (t: any) => t.OR.flatMap((o: any) => Object.keys(o));
        expect(fields(w.AND[0])).toEqual(expect.arrayContaining(['name', 'sku', 'partNumber', 'barcode', 'brand', 'codes']));
    });
    it('حروف عربی و ارقام فارسی عبارت نرمال می‌شوند', () => {
        const w: any = productSearchWhere('ديسك ۲');
        expect(w.AND[0].OR[0].name.contains).toBe('دیسک');
        const digits = w.AND[1].OR.map((o: any) => o.name?.contains).filter(Boolean);
        expect(digits).toEqual(['2', '۲']);                                   // هر دو شکل رقم
    });
    it('عبارت خالی شرطی نمی‌سازد؛ حداکثر ۶ کلمه', () => {
        expect((productSearchWhere('   ') as any).AND).toEqual([]);
        expect((productSearchWhere('a b c d e f g h') as any).AND).toHaveLength(6);
    });
    it('digitVariants', () => { expect(digitVariants('abc')).toEqual(['abc']); expect(digitVariants('a1')).toEqual(['a1', 'a۱']); });
});
