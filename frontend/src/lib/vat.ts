import { useState } from 'react';

const KEY = 'vat';
interface Vat { on: boolean; percent: number | '' }
const read = (): Vat => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Vat> | null;
    if (v && typeof v.on === 'boolean') return { on: v.on, percent: typeof v.percent === 'number' ? v.percent : '' };
  } catch { /* ignore */ }
  return { on: false, percent: '' };
};

/**
 * مالیات بر ارزش افزوده: اختیاری، و درصدش را کاربر دستی می‌نویسد (نرخ هر سال عوض می‌شود).
 * آخرین انتخاب روی همین دستگاه یادآوری می‌شود. `missing` یعنی مالیات روشن است ولی درصد معتبر (۱ تا ۱۰۰) نوشته نشده.
 */
export function useVat() {
  const [v, setV] = useState<Vat>(read);
  const save = (n: Vat) => { setV(n); try { localStorage.setItem(KEY, JSON.stringify(n)); } catch { /* ignore */ } };
  const valid = v.percent !== '' && Number(v.percent) > 0 && Number(v.percent) <= 100;
  return {
    on: v.on,
    raw: v.percent,
    percent: v.on && valid ? Number(v.percent) : 0,
    missing: v.on && !valid,
    setOn: (on: boolean) => save({ ...v, on }),
    setPercent: (percent: number | '') => save({ ...v, percent }),
  };
}
