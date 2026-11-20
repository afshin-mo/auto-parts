import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { Modal, PageHead, Stamp, useUi, Empty, Loading, Field } from '../components/ui';
import { useAuth } from '../lib/auth';
import { fmtDate, fmtMoney, fmtNum } from '../lib/format';

interface Lot { id: string; unitCost: number; quantity: number; supplierName?: string | null; createdAt: string }
interface LotGroup { productId: string; warehouseId: string; sku: string; name: string; warehouse: string; totalQuantity: number; averageCost: number; lots: Lot[] }
interface Prod { id: string; sku: string; name: string; partNumber?: string | null; brand?: string | null; stock: number; salePrice: number; purchasePrice: number }
interface ProdGroup { reasons: string[]; products: Prod[] }

export default function Duplicates() {
  const { has } = useAuth();
  const canLots = has('inventory.adjust'), canProducts = has('products.delete');
  const [tab, setTab] = useState<'lots' | 'products'>('lots');
  return (
    <>
      <PageHead title="کالاهای تکراری" sub="ردیف‌های قیمتِ یک کالا را ادغام یا حذف کنید، یا دو کالایی را که در واقع یکی‌اند یکی کنید" />
      <div className="row" style={{ gap: 8, marginBottom: 12 }}>
        <button className={`btn ${tab === 'lots' ? 'btn--primary' : ''}`} onClick={() => setTab('lots')}>ردیف‌های قیمت</button>
        <button className={`btn ${tab === 'products' ? 'btn--primary' : ''}`} onClick={() => setTab('products')}>کالاهای هم‌شبیه</button>
      </div>
      {tab === 'lots' ? <LotsTab can={canLots} /> : <ProductsTab can={canProducts} />}
    </>
  );
}

function LotsTab({ can }: { can: boolean }) {
  const qc = useQueryClient(); const { toast } = useUi();
  const q = useQuery({ queryKey: ['dup-lots'], queryFn: async () => (await api.get<LotGroup[]>('/duplicates/lots')).data });
  const [sel, setSel] = useState<Record<string, Set<string>>>({});       // کلید گروه → ردیف‌های انتخاب‌شده
  const [confirm, setConfirm] = useState<{ g: LotGroup; ids: string[] } | null>(null);
  const [del, setDel] = useState<{ g: LotGroup; lot: Lot } | null>(null);
  const [reason, setReason] = useState('');
  const refresh = () => { qc.invalidateQueries({ queryKey: ['dup-lots'] }); qc.invalidateQueries({ queryKey: ['inventory'] }); };
  const merge = useMutation({
    mutationFn: (v: { g: LotGroup; ids: string[] }) => api.post('/duplicates/lots/merge', { productId: v.g.productId, warehouseId: v.g.warehouseId, lotIds: v.ids }),
    onSuccess: () => { toast('ردیف‌ها ادغام شد'); setConfirm(null); setSel({}); refresh(); }, onError: (e: ApiError) => toast(e.message, 'error'),
  });
  const remove = useMutation({
    mutationFn: (v: { lotId: string; reason: string }) => api.post('/duplicates/lots/remove', v),
    onSuccess: () => { toast('ردیف حذف شد'); setDel(null); setReason(''); refresh(); }, onError: (e: ApiError) => toast(e.message, 'error'),
  });
  if (q.isLoading) return <Loading />;
  if (!q.data?.length) return <Empty icon="warehouse" title="کالایی با چند ردیف قیمت نیست" hint="وقتی یک کالا با قیمت‌های مختلف وارد انبار شود، اینجا نمایش داده می‌شود" />;

  const key = (g: LotGroup) => `${g.productId}|${g.warehouseId}`;
  const toggle = (g: LotGroup, id: string) => setSel((s) => { const n = new Set(s[key(g)] ?? []); n.has(id) ? n.delete(id) : n.add(id); return { ...s, [key(g)]: n }; });
  const preview = (g: LotGroup, ids: string[]) => { const ls = g.lots.filter((l) => ids.includes(l.id)); const qty = ls.reduce((s, l) => s + l.quantity, 0); return { qty, avg: Math.round(ls.reduce((s, l) => s + l.quantity * l.unitCost, 0) / (qty || 1)) }; };

  return (
    <div className="stack" style={{ gap: 12 }}>
      {q.data.map((g) => { const ids = [...(sel[key(g)] ?? [])]; return (
        <section className="sheet" key={key(g)}>
          <div className="sheet__head">
            <h2>{g.name} <span className="sku">{g.sku}</span></h2>
            <span className="muted sm">{g.warehouse} · جمع {fmtNum(g.totalQuantity, 2)} · میانگین {fmtMoney(g.averageCost)}</span>
          </div>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr>{can && <th style={{ width: 36 }} />}<th className="n">قیمت خرید</th><th className="n">موجودی</th><th>تأمین‌کننده</th><th>تاریخ ورود</th>{can && <th />}</tr></thead>
            <tbody>{g.lots.map((l) => (
              <tr key={l.id}>
                {can && <td><input type="checkbox" checked={(sel[key(g)] ?? new Set()).has(l.id)} onChange={() => toggle(g, l.id)} aria-label="انتخاب" /></td>}
                <td className="n strong">{fmtMoney(l.unitCost)}</td><td className="n">{fmtNum(l.quantity, 2)}</td>
                <td className="muted">{l.supplierName ?? '—'}</td><td className="muted">{fmtDate(l.createdAt)}</td>
                {can && <td><button className="btn btn--sm" onClick={() => { setDel({ g, lot: l }); setReason(''); }}>حذف</button></td>}
              </tr>))}</tbody>
          </table></div>
          {can && <div className="row" style={{ padding: 12 }}><button className="btn btn--primary btn--sm" disabled={ids.length < 2} onClick={() => setConfirm({ g, ids })}>ادغام {ids.length >= 2 ? `${ids.length} ردیف انتخاب‌شده` : '(حداقل دو ردیف را تیک بزنید)'}</button></div>}
        </section>); })}

      {confirm && (() => { const p = preview(confirm.g, confirm.ids); return (
        <Modal size="sm" title="ادغام ردیف‌های قیمت" onClose={() => setConfirm(null)} footer={<><button className="btn" onClick={() => setConfirm(null)}>انصراف</button><button className="btn btn--primary" disabled={merge.isPending} onClick={() => merge.mutate(confirm)}>ادغام</button></>}>
          <p>موجودی این ردیف‌ها جمع می‌شود: <b>{fmtNum(p.qty, 2)}</b> عدد با قیمت میانگین موزون <b>{fmtMoney(p.avg)}</b>.</p>
          <p className="muted sm">از این به بعد فروش از این ردیف با همین قیمت میانگین حساب می‌شود. فروش‌های قبلی تغییر نمی‌کنند. این کار برگشت‌پذیر نیست.</p>
        </Modal>); })()}

      {del && (
        <Modal size="sm" title="حذف ردیف قیمت" onClose={() => setDel(null)} footer={<><button className="btn" onClick={() => setDel(null)}>انصراف</button><button className="btn btn--danger" disabled={!reason.trim() || remove.isPending} onClick={() => remove.mutate({ lotId: del.lot.id, reason })}>حذف و کسر موجودی</button></>}>
          <p>ردیف <b>{fmtMoney(del.lot.unitCost)}</b> با موجودی <b>{fmtNum(del.lot.quantity, 2)}</b> حذف می‌شود و این مقدار از موجودی کالا کم می‌شود (در «گردش انبار» ثبت می‌شود).</p>
          <Field label="دلیل حذف" required><input className="input" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} /></Field>
        </Modal>)}
    </div>
  );
}

function ProductsTab({ can }: { can: boolean }) {
  const qc = useQueryClient(); const { toast } = useUi();
  const q = useQuery({ queryKey: ['dup-products'], queryFn: async () => (await api.get<ProdGroup[]>('/duplicates/products')).data });
  const [main, setMain] = useState<Record<number, string>>({});          // شماره‌ی گروه → کالای اصلی
  const [pick, setPick] = useState<Record<number, Set<string>>>({});     // شماره‌ی گروه → کالاهای ادغام‌شونده
  const [confirm, setConfirm] = useState<{ g: ProdGroup; targetId: string; sourceIds: string[] } | null>(null);
  const merge = useMutation({
    mutationFn: (v: { targetId: string; sourceIds: string[] }) => api.post('/duplicates/products/merge', v),
    onSuccess: () => { toast('کالاها ادغام شد'); setConfirm(null); setMain({}); setPick({}); for (const k of ['dup-products', 'dup-lots', 'products', 'inventory']) qc.invalidateQueries({ queryKey: [k] }); },
    onError: (e: ApiError) => toast(e.message, 'error'),
  });
  if (q.isLoading) return <Loading />;
  if (!q.data?.length) return <Empty icon="box" title="کالای تکراری پیدا نشد" hint="کالاهای هم‌برند که کد/شماره فنی یا نام یکسان دارند اینجا پیشنهاد داده می‌شوند" />;

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="muted sm">یک سریال با دو برند مختلف تکراری حساب نمی‌شود. کالایی که انتخاب نکنید، دست‌نخورده می‌ماند.</div>
      {q.data.map((g, gi) => { const target = main[gi] ?? g.products[0].id; const ids = [...(pick[gi] ?? [])].filter((id) => id !== target); return (
        <section className="sheet" key={gi}>
          <div className="sheet__head"><h2>{g.products[0].name}</h2><span>{g.reasons.map((r) => <Stamp key={r} tone="amber">{r}</Stamp>)}</span></div>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr>{can && <th>اصلی</th>}{can && <th>ادغام شود</th>}<th>کد</th><th>نام</th><th>برند</th><th className="n">موجودی</th><th className="n">قیمت فروش</th></tr></thead>
            <tbody>{g.products.map((p) => (
              <tr key={p.id}>
                {can && <td><input type="radio" name={`main${gi}`} checked={target === p.id} onChange={() => setMain({ ...main, [gi]: p.id })} aria-label="کالای اصلی" /></td>}
                {can && <td><input type="checkbox" disabled={target === p.id} checked={target !== p.id && (pick[gi] ?? new Set()).has(p.id)} onChange={() => setPick((s) => { const n = new Set(s[gi] ?? []); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return { ...s, [gi]: n }; })} aria-label="ادغام" /></td>}
                <td><Link to={`/products?search=${encodeURIComponent(p.sku)}`}><span className="sku">{p.sku}</span></Link></td><td>{p.name}</td><td className="muted">{p.brand ?? '—'}</td>
                <td className="n">{fmtNum(p.stock, 2)}</td><td className="n">{fmtMoney(p.salePrice)}</td>
              </tr>))}</tbody>
          </table></div>
          {can && <div className="row" style={{ padding: 12 }}><button className="btn btn--primary btn--sm" disabled={!ids.length} onClick={() => setConfirm({ g, targetId: target, sourceIds: ids })}>ادغام در کالای اصلی {ids.length ? `(${ids.length} کالا)` : ''}</button></div>}
        </section>); })}

      {confirm && (() => { const t = confirm.g.products.find((p) => p.id === confirm.targetId)!; const s = confirm.g.products.filter((p) => confirm.sourceIds.includes(p.id)); return (
        <Modal size="sm" title="ادغام کالاها" onClose={() => setConfirm(null)} footer={<><button className="btn" onClick={() => setConfirm(null)}>انصراف</button><button className="btn btn--danger" disabled={merge.isPending} onClick={() => merge.mutate({ targetId: confirm.targetId, sourceIds: confirm.sourceIds })}>ادغام</button></>}>
          <p>کالای اصلی: <b>{t.name}</b> <span className="sku">{t.sku}</span></p>
          <p>این کالاها در آن ادغام و بایگانی می‌شوند: {s.map((p) => <span key={p.id} className="sku" style={{ marginInlineEnd: 6 }}>{p.sku}</span>)}</p>
          <p className="muted sm">موجودی (با ردیف‌های قیمت)، فاکتورها، گردش انبار و کدها به کالای اصلی منتقل می‌شود و کدهای قدیمی همچنان همین کالا را پیدا می‌کنند. قیمت‌ها و مشخصات کالای اصلی تغییر نمی‌کند. این کار برگشت‌پذیر نیست.</p>
        </Modal>); })()}
    </div>
  );
}
