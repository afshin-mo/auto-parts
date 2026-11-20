import { normalizeCode, normalizeLetters, normalizeName, normalizeText } from './code-normalize.util';

describe('normalizeCode', () => {
    it('فاصله، خط تیره و نقطه را برمی‌دارد و حروف را بزرگ می‌کند', () => {
        expect(normalizeCode('1109.al')).toBe('1109AL');
        expect(normalizeCode('1109 AL')).toBe('1109AL');
        expect(normalizeCode('11-09/al')).toBe('1109AL');
    });
    it('ارقام فارسی و عربی را لاتین می‌کند', () => {
        expect(normalizeCode('۴۲۵۲۳۰')).toBe('425230');
        expect(normalizeCode('٤٢٥٢٣٠')).toBe('425230');
    });
    it('ورودی خالی یا فقط نشانه، رشته‌ی خالی می‌دهد', () => {
        expect(normalizeCode(null)).toBe('');
        expect(normalizeCode(' - . ')).toBe('');
    });
    it('ی و ک عربی را یکسان می‌کند', () => {
        expect(normalizeText('كيا')).toBe('کیا');
    });
});

describe('normalizeName / normalizeLetters', () => {
    it('حروف عربی را فارسی و فاصله‌های تکراری را یکی می‌کند', () => {
        expect(normalizeName('ديسك  ترمز   جلو ( ست 2 تايي )')).toBe('دیسک ترمز جلو ( ست 2 تایی )');
        expect(normalizeName('  كيت  كلاچ  ')).toBe('کیت کلاچ');
        expect(normalizeName('مقصور')).toBe('مقصور');                       // ی/ک فارسی دست‌نخورده
    });
    it('normalizeLetters خط جدید را نگه می‌دارد', () => {
        expect(normalizeLetters('ك\nي')).toBe('ک\nی');
    });
});
