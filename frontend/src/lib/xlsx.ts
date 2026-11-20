import { parseCSV } from './csv';

/** خواندن فایل CSV یا اکسل (.xlsx) به‌صورت جدول رشته‌ای؛ کتابخانه‌ی اکسل فقط هنگام نیاز بارگذاری می‌شود */
export async function readTable(file: File): Promise<string[][]> {
  if (/\.xlsx$/i.test(file.name)) {
    const { readSheet } = await import('read-excel-file/browser');
    const rows = (await readSheet(file)) as unknown[][];
    return rows
      .map((r) => r.map((c) => (c === null || c === undefined ? '' : c instanceof Date ? c.toISOString().slice(0, 10) : String(c))))
      .filter((r) => r.some((c) => c.trim() !== ''));
  }
  if (/\.xls$/i.test(file.name)) throw new Error('فرمت قدیمی .xls پشتیبانی نمی‌شود؛ فایل را به .xlsx یا CSV ذخیره کنید');
  return parseCSV(await file.text());
}

/** ذخیره‌ی جدول به‌صورت فایل اکسل؛ ردیف اول سطر عنوان (پررنگ) است */
export async function saveXlsx(fileName: string, rows: (string | number)[][]) {
  const { default: writeExcelFile } = await import('write-excel-file/browser');
  const data = rows.map((r, i) => r.map((v) => (i === 0 ? { value: String(v), fontWeight: 'bold' as const } : typeof v === 'number' ? { value: v, type: Number } : { value: String(v ?? '') })));
  await writeExcelFile(data as never).toFile(fileName);
}
