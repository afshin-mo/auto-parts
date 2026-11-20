import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import JsBarcode from 'jsbarcode';
import { PageHead, Field, NumInput, Empty } from '../components/ui';
import { Icon } from '../components/Icon';
import { fmtMoney } from '../lib/format';

interface Item { id: string; name: string; sku: string; barcode: string; price: number; location: string; copies: number }
const SIZES: Record<string, { w: number; h: number; label: string }> = { s: { w: 40, h: 25, label: '۴۰×۲۵ میلی‌متر' }, m: { w: 50, h: 30, label: '۵۰×۳۰ میلی‌متر' }, l: { w: 70, h: 40, label: '۷۰×۴۰ میلی‌متر' } };

function Barcode({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const [bad, setBad] = useState(false);
  useEffect(() => {
    try { setBad(false); JsBarcode(ref.current, value, { format: 'CODE128', width: 1.4, height: 28, displayValue: true, fontSize: 10, margin: 0 }); } catch { setBad(true); }
  }, [value]);
  return bad ? <div className="muted sm">بارکد ناممکن</div> : <svg ref={ref} style={{ maxWidth: '100%' }} />;
}

/** چاپ برچسب قفسه/بارکد؛ مقدار بارکد = بارکد کالا و در نبود آن کد SKU (CODE128، فقط حروف انگلیسی و عدد) */
export default function Labels() {
  const nav = useNavigate();
  const [items, setItems] = useState<Item[]>(() => { try { return JSON.parse(sessionStorage.getItem('labelProducts') ?? '[]'); } catch { return []; } });
  const [size, setSize] = useState('m'); const [mode, setMode] = useState<'roll' | 'a4'>('roll');
  const [show, setShow] = useState({ name: true, price: true, location: false, sku: true });
  const dim = SIZES[size];
  const labels = useMemo(() => items.flatMap((it) => Array.from({ length: Math.max(0, it.copies) }, (_, i) => ({ ...it, key: `${it.id}-${i}` }))), [items]);
  const bar = (it: Item) => (it.barcode || it.sku).trim();
  const set = (id: string, copies: number) => setItems((l) => l.map((x) => (x.id === id ? { ...x, copies } : x)));

  return (
    <>
      <style>{`@media print { @page { size: ${mode === 'roll' ? `${dim.w}mm ${dim.h}mm` : 'A4'}; margin: ${mode === 'roll' ? 0 : '8mm'}; } .lbl-sheet { gap: ${mode === 'roll' ? 0 : '3mm'} !important; } .lbl { break-inside: avoid; ${mode === 'roll' ? 'page-break-after: always; border: 0 !important;' : ''} } }
        .lbl { width: ${dim.w}mm; height: ${dim.h}mm; }`}</style>
      <PageHead title="چاپ برچسب" sub="برچسب قفسه و بارکد کالاها">
        <button className="btn" onClick={() => nav('/products')}>بازگشت به کالاها</button>
        <button className="btn btn--primary" disabled={!labels.length} onClick={() => window.print()}><Icon name="print" size={17} />چاپ {labels.length ? `(${labels.length})` : ''}</button>
      </PageHead>
      {items.length === 0 ? <section className="sheet"><Empty icon="tag" title="کالایی انتخاب نشده" hint="در فهرست کالاها، کالاها را تیک بزنید و «چاپ برچسب» را بزنید" /></section> : (
        <div className="stack">
          <section className="sheet no-print"><div className="sheet__body grid g3">
            <Field label="اندازه‌ی برچسب"><select className="select" value={size} onChange={(e) => setSize(e.target.value)}>{Object.entries(SIZES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Field>
            <Field label="نوع چاپ" hint={mode === 'roll' ? 'چاپگر رولی: هر برچسب یک صفحه' : 'برگه‌ی A4: چند برچسب کنار هم'}><select className="select" value={mode} onChange={(e) => setMode(e.target.value as 'roll' | 'a4')}><option value="roll">چاپگر برچسب (رولی)</option><option value="a4">برگه A4</option></select></Field>
            <div className="chips" style={{ alignSelf: 'end', paddingBottom: 6 }}>
              {([['name', 'نام'], ['price', 'قیمت'], ['sku', 'کد'], ['location', 'محل قفسه']] as const).map(([k, l]) => <button key={k} className={`chip ${show[k] ? 'on' : ''}`} onClick={() => setShow({ ...show, [k]: !show[k] })}>{l}</button>)}
            </div>
            <div className="span3" style={{ gridColumn: '1 / -1' }}><table className="tbl"><thead><tr><th>کالا</th><th>مقدار بارکد</th><th style={{ width: 120 }}>تعداد برچسب</th><th style={{ width: 44 }} /></tr></thead>
              <tbody>{items.map((it) => <tr key={it.id}><td className="strong">{it.name}</td><td><span className="sku">{bar(it)}</span>{!/^[\x20-\x7E]+$/.test(bar(it)) && <div className="field__err">فقط حروف انگلیسی و عدد پشتیبانی می‌شود</div>}</td>
                <td><NumInput value={it.copies} onChange={(v) => set(it.id, v === '' ? 0 : Math.min(500, v))} /></td>
                <td><button className="btn btn--sm btn--icon btn--danger" onClick={() => setItems((l) => l.filter((x) => x.id !== it.id))}><Icon name="x" size={14} /></button></td></tr>)}</tbody></table></div>
          </div></section>
          <div className="lbl-sheet" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {labels.map((l) => (
              <div key={l.key} className="lbl" style={{ border: '1px dashed var(--line-strong)', background: '#fff', padding: '1.5mm 2mm', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', overflow: 'hidden', color: '#000' }}>
                {show.name && <div style={{ fontWeight: 700, fontSize: size === 'l' ? 13 : 10.5, lineHeight: 1.25, maxHeight: '2.6em', overflow: 'hidden' }}>{l.name}</div>}
                <div style={{ display: 'flex', justifyContent: 'center', overflow: 'hidden', flex: 1, alignItems: 'center' }}><Barcode value={bar(l)} /></div>
                {(show.price || show.sku || show.location) && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: size === 's' ? 9 : 10.5, gap: 4 }}>
                  {show.price && <b>{fmtMoney(l.price)} ریال</b>}{show.location && l.location && <span className="ltr">{l.location}</span>}{show.sku && !show.location && <span className="ltr">{l.sku}</span>}</div>}
              </div>))}
          </div>
        </div>)}
    </>
  );
}
