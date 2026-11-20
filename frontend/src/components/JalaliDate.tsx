import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { toFa, fmtDateMid } from '../lib/format';
import { MONTHS, WEEKDAYS_SHORT, isoToJ, jToISO, jMonthLength, jMonthStartWeekday, todayISO } from '../lib/jalali';

/**
 * انتخاب تاریخ با تقویم شمسی. مقدار ورودی/خروجی رشته‌ی میلادی YYYY-MM-DD است
 * (همان چیزی که بکند می‌پذیرد) اما به کاربر فقط تاریخ شمسی نمایش داده می‌شود.
 */
export function JalaliDate({ value, onChange, placeholder = 'انتخاب تاریخ', clearable, up, disabled }: {
  value?: string; onChange: (iso: string) => void; placeholder?: string; clearable?: boolean; up?: boolean; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // پنجره‌ی تقویم در body رندر می‌شود تا داخل مودال و جدول بریده نشود
  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const W = 304, H = 380;
    const left = Math.max(8, Math.min(r.right - W, window.innerWidth - W - 8));
    const below = r.bottom + 6; const top = below + H > window.innerHeight && r.top - H - 6 > 8 ? r.top - H - 6 : below;
    setPos({ top, left });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { const t = e.target as Node; if (!ref.current?.contains(t) && !popRef.current?.contains(t)) setOpen(false); };
    const close = (e: Event) => { if (!popRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', down); window.addEventListener('scroll', close, true); window.addEventListener('resize', close);
    return () => { document.removeEventListener('mousedown', down); window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
  }, [open]);

  const today = todayISO();
  const base = isoToJ(value || today);
  const [view, setView] = useState({ jy: base.jy, jm: base.jm });

  const days = useMemo(() => {
    const lead = jMonthStartWeekday(view);
    const len = jMonthLength(view.jy, view.jm);
    return [...Array(lead).fill(0), ...Array.from({ length: len }, (_, i) => i + 1)];
  }, [view]);

  const move = (d: number) => setView(({ jy, jm }) => {
    let m = jm + d, y = jy;
    if (m > 12) { m = 1; y++; } if (m < 1) { m = 12; y--; }
    return { jy: y, jm: m };
  });
  const years = Array.from({ length: 21 }, (_, i) => base.jy - 10 + i);
  if (!years.includes(view.jy)) years.push(view.jy);

  return (
    <div className="dp" ref={ref}>
      <button type="button" disabled={disabled} className="input dp__btn" onClick={() => { if (value) { const j = isoToJ(value); setView({ jy: j.jy, jm: j.jm }); } setOpen((o) => !o); }}>
        <Icon name="cal" size={18} />
        <span className={value ? '' : 'muted'}>{value ? fmtDateMid(value) : placeholder}</span>
        {clearable && value && <span role="button" aria-label="پاک کردن" onClick={(e) => { e.stopPropagation(); onChange(''); }} style={{ flex: 'none' }}><Icon name="x" size={14} /></span>}
      </button>
      {open && pos && createPortal(
        <div ref={popRef} className="dp__pop" style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 300 }} dir="rtl">
          <div className="dp__head">
            <button type="button" onClick={() => move(-1)} aria-label="ماه قبل">›</button>
            <select value={view.jm} onChange={(e) => setView({ ...view, jm: +e.target.value })}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <select value={view.jy} onChange={(e) => setView({ ...view, jy: +e.target.value })}>
              {years.sort((a, b) => a - b).map((y) => <option key={y} value={y}>{toFa(y)}</option>)}
            </select>
            <span style={{ flex: 1 }} />
            <button type="button" onClick={() => move(1)} aria-label="ماه بعد">‹</button>
          </div>
          <div className="dp__grid">
            {WEEKDAYS_SHORT.map((w, i) => <div key={w} className={`dp__wd ${i === 6 ? 'fri' : ''}`}>{w}</div>)}
            {days.map((d, i) => {
              if (!d) return <span key={`e${i}`} />;
              const iso = jToISO({ ...view, jd: d });
              const fri = (i % 7) === 6;
              return (
                <button type="button" key={d} className={`dp__d ${fri ? 'fri' : ''} ${iso === today ? 'today' : ''} ${iso === value ? 'sel' : ''}`}
                  onClick={() => { onChange(iso); setOpen(false); }}>{toFa(d)}</button>
              );
            })}
          </div>
          <div className="dp__foot">
            <button type="button" className="btn btn--sm btn--ghost" onClick={() => { onChange(today); setOpen(false); }}>امروز</button>
            {clearable && <button type="button" className="btn btn--sm btn--ghost" onClick={() => { onChange(''); setOpen(false); }}>پاک کردن</button>}
          </div>
        </div>, document.body)}
    </div>
  );
}
