import { toEn } from './format';

/** تفکیک CSV با پشتیبانی از گیومه، خط جدید داخل سلول و جداکننده‌ی , ; یا Tab (اکسل فارسی معمولاً ; می‌گذارد) */
export function parseCSV(text: string): string[][] {
  const t = text.replace(/^\uFEFF/, '');
  const first = t.split(/\r?\n/, 1)[0] ?? '';
  const delim = [',', ';', '\t'].map((d) => [d, first.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"' && t[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export function toCSV(rows: (string | number)[][]): string {
  const esc = (v: string | number) => { const s = String(v ?? ''); return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return '\uFEFF' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
}

export function downloadFile(name: string, content: string, mime = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const PRODUCT_COLUMNS: { key: string; title: string; num?: boolean }[] = [
  { key: 'sku', title: 'کد کالا' }, { key: 'name', title: 'نام کالا' }, { key: 'unit', title: 'واحد' }, { key: 'category', title: 'دسته' }, { key: 'brand', title: 'برند' },
  { key: 'purchasePrice', title: 'قیمت خرید', num: true }, { key: 'salePrice', title: 'قیمت فروش', num: true }, { key: 'wholesalePrice', title: 'قیمت عمده', num: true },
  { key: 'minStock', title: 'حداقل موجودی', num: true }, { key: 'initialQuantity', title: 'موجودی اولیه', num: true },
  { key: 'oemCode', title: 'شماره فنی' }, { key: 'partNumber', title: 'شماره قطعه' }, { key: 'barcode', title: 'بارکد' }, { key: 'location', title: 'محل انبار' },
  { key: 'warrantyMonths', title: 'گارانتی (ماه)', num: true }, { key: 'taxGoodsId', title: 'شناسه کالا/خدمت (مودیان)' },
];

const norm = (s: string) => s.trim().toLowerCase().replace(/[\s_]+/g, '');
const HEADER_MAP = new Map<string, { key: string; num?: boolean }>();
PRODUCT_COLUMNS.forEach((c) => { HEADER_MAP.set(norm(c.title), c); HEADER_MAP.set(norm(c.key), c); });
HEADER_MAP.set(norm('sku'), PRODUCT_COLUMNS[0]); HEADER_MAP.set(norm('کد'), PRODUCT_COLUMNS[0]); HEADER_MAP.set(norm('نام'), PRODUCT_COLUMNS[1]);

export interface ParsedImport { rows: Record<string, string | number>[]; unknownHeaders: string[]; missing: string[] }

/** سطرهای CSV را به شیء‌هایی با کلیدهای API تبدیل می‌کند (عددهای فارسی/جداکننده‌ی هزارگان هم پذیرفته می‌شود) */
export function csvToProducts(table: string[][]): ParsedImport {
  const [head, ...body] = table;
  const cols = head.map((h) => HEADER_MAP.get(norm(h)));
  const unknownHeaders = head.filter((_, i) => !cols[i]);
  const present = new Set(cols.filter(Boolean).map((c) => c!.key));
  const missing = ['sku', 'name'].filter((k) => !present.has(k)).map((k) => PRODUCT_COLUMNS.find((c) => c.key === k)!.title);
  const rows = body.map((r) => {
    const o: Record<string, string | number> = {};
    cols.forEach((c, i) => {
      const raw = (r[i] ?? '').trim();
      if (!c || raw === '') return;
      if (c.num) { const n = Number(toEn(raw).replace(/\s/g, '')); o[c.key] = Number.isNaN(n) ? raw : n; } else o[c.key] = toEn(raw).length && /^[\d۰-۹٠-٩.\-/]+$/.test(raw) && ['sku', 'barcode', 'oemCode', 'partNumber', 'taxGoodsId'].includes(c.key) ? toEn(raw) : raw;
    });
    return o;
  }).filter((o) => o.sku);
  return { rows, unknownHeaders, missing };
}
