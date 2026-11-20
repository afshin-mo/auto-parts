import { ReactNode, useEffect, useRef, useState, createContext, useContext, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Icon, IconName } from './Icon';
import { toFa, toEn, fmtNum } from '../lib/format';
import type { Meta } from '../lib/api';

/* ── مودال ── */
export function Modal({ title, onClose, children, footer, size }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'lg' }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${size ?? ''}`} role="dialog" aria-modal>
        <div className="modal__head">
          <h2>{title}</h2>
          <button className="btn btn--sm btn--icon" onClick={onClose} aria-label="بستن"><Icon name="x" size={16} /></button>
        </div>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__foot">{footer}</div>}
      </div>
    </div>, document.body);
}

/* ── فیلد ── */
export function Field({ label, required, hint, error, children, className }: { label?: string; required?: boolean; hint?: string; error?: string; children: ReactNode; className?: string }) {
  return (
    // div (نه label): داخل label، کلیک روی عناصر بازشو/حذف‌شونده به کنترل اول فرزند هدایت می‌شود و رفتار را خراب می‌کند
    <div className={`field ${className ?? ''}`}>
      {label && <span className="field__label">{label}{required && <b> *</b>}</span>}
      {children}
      {error ? <span className="field__err">{error}</span> : hint ? <span className="field__hint">{hint}</span> : null}
    </div>
  );
}

/** ورودی عددی/مبلغ: ارقام فارسی نمایش می‌دهد، مقدار انگلیسی برمی‌گرداند */
export function NumInput({ value, onChange, money, decimals, allowNegative, ...rest }: { value: number | ''; onChange: (v: number | '') => void; money?: boolean; decimals?: boolean; allowNegative?: boolean; placeholder?: string; disabled?: boolean; className?: string; autoFocus?: boolean; readOnly?: boolean; id?: string }) {
  const text = value === '' ? '' : money ? fmtNum(value) : toFa(String(value));
  return (
    <input
      {...rest}
      className={`input input--num ${rest.className ?? ''}`}
      inputMode={allowNegative ? 'text' : decimals ? 'decimal' : 'numeric'}
      value={text}
      onChange={(e) => {
        const raw = toEn(e.target.value.replace(/٫/g, '.')).replace(decimals ? /[^\d.]/g : /[^\d]/g, '');
        if (raw === '') return onChange('');
        // علامت منفی (فقط وقتی مجاز است): وجود «-» در متن یعنی عدد منفی
        const neg = allowNegative && /[-\u2212]/.test(e.target.value);
        const n = Number(raw);
        if (!Number.isNaN(n)) onChange(neg ? -n : n);
      }}
    />
  );
}

export const Stamp = ({ tone, children }: { tone: string; children: ReactNode }) => <span className={`stamp tone-${tone}`}>{children}</span>;

export function Empty({ title = 'موردی پیدا نشد', hint, icon = 'box' }: { title?: string; hint?: string; icon?: IconName }) {
  return <div className="empty"><Icon name={icon} size={46} /><strong>{title}</strong>{hint && <div>{hint}</div>}</div>;
}
export const Loading = () => <div className="loading"><span className="spin" /></div>;

/* ── جدول ── */
export interface Col<T> { key: string; title: ReactNode; render: (row: T) => ReactNode; num?: boolean; sort?: string; width?: number | string; className?: string }
export function DataTable<T>({ cols, rows, loading, empty, onRow, rowKey, rowClass, sort, onSort, foot }: {
  cols: Col<T>[]; rows?: T[]; loading?: boolean; empty?: ReactNode; onRow?: (r: T) => void; rowKey: (r: T) => string; rowClass?: (r: T) => string;
  sort?: { by: string; order: 'asc' | 'desc' }; onSort?: (by: string) => void; foot?: ReactNode;
}) {
  if (loading && !rows) return <Loading />;
  if (!rows || rows.length === 0) return <>{empty ?? <Empty />}</>;
  return (
    <div className="tbl-wrap">
      <table className="tbl tbl--cards">
        <thead><tr>
          {cols.map((c) => (
            <th key={c.key} className={`${c.num ? 'n' : ''} ${c.sort ? 'sortable' : ''}`} style={{ width: c.width }} onClick={() => c.sort && onSort?.(c.sort)}>
              {c.title}{c.sort && sort?.by === c.sort && <span> {sort.order === 'asc' ? '▲' : '▼'}</span>}
            </th>
          ))}
        </tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)} className={`${onRow ? 'clickable' : ''} ${rowClass?.(r) ?? ''}`} onClick={() => onRow?.(r)}>
              {cols.map((c) => <td key={c.key} data-label={typeof c.title === 'string' ? c.title : undefined} className={`${c.num ? 'n' : ''} ${c.className ?? ''}`}>{c.render(r)}</td>)}
            </tr>
          ))}
        </tbody>
        {foot && <tfoot>{foot}</tfoot>}
      </table>
    </div>
  );
}

export function Pager({ meta, onPage }: { meta?: Meta; onPage: (p: number) => void }) {
  if (!meta || meta.total === 0) return null;
  const { page, totalPages, total, limit } = meta;
  const from = (page - 1) * limit + 1, to = Math.min(total, page * limit);
  const pages: number[] = [];
  for (let p = Math.max(1, page - 2); p <= Math.min(totalPages, page + 2); p++) pages.push(p);
  return (
    <div className="pager">
      <span className="info">{toFa(from)} تا {toFa(to)} از {toFa(total)} مورد</span>
      <button className="pg" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="قبلی">›</button>
      {pages.map((p) => <button key={p} className={`pg ${p === page ? 'on' : ''}`} onClick={() => onPage(p)}>{toFa(p)}</button>)}
      <button className="pg" disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="بعدی">‹</button>
    </div>
  );
}

export function PageHead({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="page__head">
      <div className="marker"><i /><div><h1>{title}</h1>{sub && <p>{sub}</p>}</div></div>
      {children && <div className="page__tools">{children}</div>}
    </div>
  );
}

/* ── اعلان‌ها و تأیید ── */
interface Ctx { toast: (msg: string, kind?: 'ok' | 'error') => void; confirm: (msg: string, opts?: { title?: string; danger?: boolean; ok?: string }) => Promise<boolean> }
const UiCtx = createContext<Ctx>(null as unknown as Ctx);
export const useUi = () => useContext(UiCtx);

export function UiProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<{ id: number; msg: string; kind: string }[]>([]);
  const [ask, setAsk] = useState<null | { msg: string; title?: string; danger?: boolean; ok?: string; res: (v: boolean) => void }>(null);
  const toast = useCallback((msg: string, kind: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 3200);
  }, []);
  const confirm = useCallback((msg: string, opts: { title?: string; danger?: boolean; ok?: string } = {}) => new Promise<boolean>((res) => setAsk({ msg, ...opts, res })), []);
  return (
    <UiCtx.Provider value={{ toast, confirm }}>
      {children}
      <div className="toasts">{toasts.map((t) => <div key={t.id} className={`toast ${t.kind === 'error' ? 'error' : ''}`}>{t.msg}</div>)}</div>
      {ask && (
        <Modal size="sm" title={ask.title ?? 'تأیید'} onClose={() => { ask.res(false); setAsk(null); }}
          footer={<>
            <button className={`btn ${ask.danger ? 'btn--danger' : 'btn--primary'}`} onClick={() => { ask.res(true); setAsk(null); }}>{ask.ok ?? 'تأیید'}</button>
            <button className="btn" onClick={() => { ask.res(false); setAsk(null); }}>انصراف</button>
          </>}>
          <p style={{ margin: 0 }}>{ask.msg}</p>
        </Modal>
      )}
    </UiCtx.Provider>
  );
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export function useOutside(ref: React.RefObject<HTMLElement | null>, fn: () => void) {
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && fn();
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref, fn]);
}
