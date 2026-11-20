import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { Icon } from '../components/Icon';
import { DataTable, Pager, PageHead, Modal, Field, NumInput, Stamp, useUi, Empty, Loading } from '../components/ui';
import { ProductPicker } from '../components/ProductPicker';
import { useAuth } from '../lib/auth';
import { Product, useWarehouses } from '../lib/queries';
import { TX_TYPE, fmtDate, fmtMoney, fmtNum, fmtTime, toFa } from '../lib/format';

interface Lot { id: string; unitCost: number; quantity: number; supplierName?: string | null }
interface Row { id: string; quantity: number; availableQuantity: number; lots?: Lot[]; product: { id: string; sku: string; name: string; minStock: number; location?: string; purchasePrice: number; unit?: { name: string } }; warehouse: { id: string; name: string } }
interface Low { id: string; sku: string; name: string; minStock: number; stock: number; shortage: number; location?: string; unit?: { name: string } }
interface Tx { id: string; transactionType: string; quantity: number; createdAt: string; notes?: string; referenceType?: string; product: { name: string; sku: string }; warehouse: { name: string }; creator?: { name: string } }

function AdjustModal({ onClose, mode }: { onClose: () => void; mode: 'adjust' | 'transfer' }) {
  const qc = useQueryClient(); const { toast } = useUi(); const whs = useWarehouses().data?.filter((w) => w.isActive) ?? [];
  const [p, setP] = useState<Product | null>(null);
  const [f, setF] = useState({ warehouseId: '', toWarehouseId: '', type: 'ADJUSTMENT_INCREASE', quantity: '' as number | '', unitCost: '' as number | '', notes: '' });
  const [err, setErr] = useState('');
  useEffect(() => { if (whs.length && !f.warehouseId) setF((x) => ({ ...x, warehouseId: whs.find((w) => w.isDefault)?.id ?? whs[0].id })); }, [whs, f.warehouseId]);
  const save = useMutation({
    mutationFn: () => mode === 'adjust'
      ? api.post('/inventory/adjust', { productId: p!.id, warehouseId: f.warehouseId, transactionType: f.type, quantity: Number(f.quantity), unitCost: f.type === 'ADJUSTMENT_INCREASE' && f.unitCost !== '' ? Number(f.unitCost) : undefined, notes: f.notes || undefined })
      : api.post('/inventory/transfer', { productId: p!.id, fromWarehouseId: f.warehouseId, toWarehouseId: f.toWarehouseId, quantity: Number(f.quantity), notes: f.notes || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inventory'] }); qc.invalidateQueries({ queryKey: ['products'] }); toast('ثبت شد'); onClose(); }, onError: (e: ApiError) => setErr(e.message),
  });
  return (
    <Modal size="sm" title={mode === 'adjust' ? 'اصلاح موجودی' : 'انتقال بین انبارها'} onClose={onClose}
      footer={<><button className="btn btn--primary" disabled={!p || !f.quantity || save.isPending || (mode === 'transfer' && !f.toWarehouseId)} onClick={() => { setErr(''); save.mutate(); }}>ثبت</button><button className="btn" onClick={onClose}>انصراف</button></>}>
      <div className="stack">
        <Field label="کالا" required><ProductPicker value={p} onChange={setP} /></Field>
        <div className="grid g2">
          <Field label={mode === 'adjust' ? 'انبار' : 'از انبار'}><select className="select" value={f.warehouseId} onChange={(e) => setF({ ...f, warehouseId: e.target.value })}>{whs.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>
          {mode === 'adjust'
            ? <Field label="نوع"><select className="select" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="ADJUSTMENT_INCREASE">افزایش</option><option value="ADJUSTMENT_DECREASE">کاهش</option></select></Field>
            : <Field label="به انبار"><select className="select" value={f.toWarehouseId} onChange={(e) => setF({ ...f, toWarehouseId: e.target.value })}><option value="">انتخاب…</option>{whs.filter((w) => w.id !== f.warehouseId).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>}
        </div>
        <Field label="تعداد" required><NumInput decimals value={f.quantity} onChange={(v) => setF({ ...f, quantity: v })} /></Field>
        {mode === 'adjust' && f.type === 'ADJUSTMENT_INCREASE' && <Field label="قیمت خرید واحد" hint="قیمت متفاوت = ردیف موجودی جدا؛ خالی = قیمت خرید فعلی کالا"><NumInput money value={f.unitCost} onChange={(v) => setF({ ...f, unitCost: v })} /></Field>}
        <Field label="توضیح"><input className="input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder={mode === 'adjust' ? 'مثلاً: شکستگی، هدیه، اصلاح شمارش' : ''} /></Field>
        {err && <div className="callout red">{err}</div>}
      </div>
    </Modal>
  );
}

function CountModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient(); const { toast } = useUi(); const whs = useWarehouses().data?.filter((w) => w.isActive) ?? [];
  const [wid, setWid] = useState(''); const [counts, setCounts] = useState<Record<string, number | ''>>({}); const [err, setErr] = useState('');
  useEffect(() => { if (whs.length && !wid) setWid(whs.find((w) => w.isDefault)?.id ?? whs[0].id); }, [whs, wid]);
  const { data, isLoading } = useQuery({ queryKey: ['inventory', 'count', wid], enabled: !!wid, queryFn: async () => (await api.get<Row[]>('/inventory', { warehouseId: wid })).data });
  // شمارش به تفکیک قیمت خرید: هر قیمت یک ردیف؛ اختلاف فقط از/به همان قیمت اعمال می‌شود
  const lines = (data ?? []).flatMap((r) => (r.lots?.length ? r.lots.map((l) => ({ key: l.id, r, lotId: l.id as string | undefined, qty: l.quantity, cost: l.unitCost })) : [{ key: r.id, r, lotId: undefined, qty: r.quantity, cost: r.product.purchasePrice }]));
  const changed = lines.filter((l) => counts[l.key] !== undefined && counts[l.key] !== '' && Number(counts[l.key]) !== l.qty);
  const save = useMutation({
    mutationFn: () => api.post('/inventory/stock-count', { notes: 'انبارگردانی', items: changed.map((l) => ({ productId: l.r.product.id, warehouseId: wid, lotId: l.lotId, countedQuantity: Number(counts[l.key]) })) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inventory'] }); qc.invalidateQueries({ queryKey: ['products'] }); toast(`${toFa(changed.length)} اختلاف اصلاح شد`); onClose(); }, onError: (e: ApiError) => setErr(e.message),
  });
  return (
    <Modal size="lg" title="انبارگردانی" onClose={onClose} footer={<><button className="btn btn--primary" disabled={!changed.length || save.isPending} onClick={() => save.mutate()}>ثبت {changed.length ? `${toFa(changed.length)} اختلاف` : ''}</button><button className="btn" onClick={onClose}>انصراف</button></>}>
      <div className="stack">
        <Field label="انبار"><select className="select" value={wid} onChange={(e) => { setWid(e.target.value); setCounts({}); }}>{whs.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>
        <div className="muted sm">فقط تعدادی را وارد کنید که با سیستم تفاوت دارد؛ ردیف‌های خالی تغییری نمی‌کنند.</div>
        {isLoading ? <Loading /> : <div className="tbl-wrap"><table className="tbl"><thead><tr><th>کالا</th><th className="n">قیمت خرید</th><th className="n">در سیستم</th><th style={{ width: 130 }}>شمارش‌شده</th><th className="n">اختلاف</th></tr></thead>
          <tbody>{lines.map((l) => { const c = counts[l.key]; const diff = c === undefined || c === '' ? null : Number(c) - l.qty; return (
            <tr key={l.key}><td><b>{l.r.product.name}</b> <span className="sku">{l.r.product.sku}</span></td><td className="n">{fmtMoney(l.cost)}</td><td className="n">{fmtNum(l.qty, 2)}</td>
              <td><NumInput decimals value={c ?? ''} onChange={(v) => setCounts({ ...counts, [l.key]: v })} /></td>
              <td className="n strong">{diff === null ? '' : <span className={diff === 0 ? '' : diff > 0 ? 't-pos' : 't-neg'}>{diff > 0 ? '+' : ''}{fmtNum(diff, 2)}</span>}</td></tr>); })}</tbody></table></div>}
        {err && <div className="callout red">{err}</div>}
      </div>
    </Modal>
  );
}

export default function Inventory() {
  const { has } = useAuth(); const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') ?? 'stock'; const whs = useWarehouses().data;
  const [wid, setWid] = useState(''); const [search, setSearch] = useState(''); const [page, setPage] = useState(1);
  const [modal, setModal] = useState<null | 'adjust' | 'transfer' | 'count'>(null);
  const edit = has('inventory.adjust', 'inventory.transfer', 'inventory.count');
  const stock = useQuery({ queryKey: ['inventory', 'rows', wid], enabled: tab === 'stock', queryFn: async () => (await api.get<Row[]>('/inventory', { warehouseId: wid || undefined })).data });
  const low = useQuery({ queryKey: ['inventory', 'low'], enabled: tab === 'low', queryFn: async () => (await api.get<Low[]>('/inventory/low-stock')).data });
  const tx = useQuery({ queryKey: ['inventory', 'tx', page, wid], enabled: tab === 'tx', queryFn: () => api.get<Tx[]>('/inventory/transactions', { page, limit: 20, warehouseId: wid || undefined }) });
  const val = useQuery({ queryKey: ['inventory', 'value'], enabled: has('inventory.value'), queryFn: async () => (await api.get<{ totalPurchaseValue: number; totalSaleValue: number; potentialProfit: number }>('/inventory/value')).data });
  // کالای چندقیمتی: هر قیمت خرید یک ردیف جدا (با همان کد کالا)
  const rows = stock.data?.filter((r) => !search || (r.product.name + r.product.sku).toLowerCase().includes(search.toLowerCase()))
    .flatMap((r) => (r.lots?.length ? r.lots.map((l) => ({ ...r, id: l.id, quantity: l.quantity, total: r.quantity, cost: l.unitCost, supplier: l.supplierName })) : [{ ...r, total: r.quantity, cost: r.product.purchasePrice, supplier: null as string | null | undefined }]));

  return (
    <>
      <PageHead title="انبار" sub="موجودی هر انبار، کم‌موجودی‌ها و گردش کالا">
        {edit && <>
          <button className="btn" onClick={() => setModal('count')}><Icon name="check" size={17} />انبارگردانی</button>
          <button className="btn" onClick={() => setModal('transfer')}><Icon name="swap" size={17} />انتقال</button>
          <button className="btn btn--primary" onClick={() => setModal('adjust')}><Icon name="plus" size={17} />اصلاح موجودی</button></>}
      </PageHead>
      {val.data && <div className="signs" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        <div className="sign sign--dark"><div className="sign__in"><span className="sign__label">ارزش موجودی (خرید)</span><span className="sign__value num">{fmtMoney(val.data.totalPurchaseValue)}</span></div></div>
        <div className="sign sign--blue"><div className="sign__in"><span className="sign__label">ارزش موجودی (فروش)</span><span className="sign__value num">{fmtMoney(val.data.totalSaleValue)}</span></div></div>
        <div className="sign sign--green"><div className="sign__in"><span className="sign__label">سود بالقوه</span><span className="sign__value num">{fmtMoney(val.data.potentialProfit)}</span></div></div>
      </div>}
      <div className="tabs">{[['stock', 'موجودی'], ['low', 'کم‌موجودی'], ['tx', 'گردش انبار']].map(([k, l]) => <button key={k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => { setSp({ tab: k }); setPage(1); }}>{l}</button>)}</div>
      <section className="sheet" style={{ borderTop: 0 }}>
        {tab !== 'low' && <div className="filters">
          <Field label="انبار"><select className="select" value={wid} onChange={(e) => { setWid(e.target.value); setPage(1); }}><option value="">همه‌ی انبارها</option>{whs?.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>
          {tab === 'stock' && <Field className="search" label="جستجو"><input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="نام یا کد کالا" /></Field>}
        </div>}
        {tab === 'stock' && <DataTable rows={rows} loading={stock.isLoading} rowKey={(r) => r.id} empty={<Empty title="موجودی ثبت نشده" />}
          cols={[
            { key: 'p', title: 'کالا', render: (r) => <div><b>{r.product.name}</b> <span className="sku">{r.product.sku}</span></div> },
            { key: 'w', title: 'انبار', render: (r) => r.warehouse.name },
            { key: 'l', title: 'محل', render: (r) => <span className="ltr muted">{r.product.location ?? '—'}</span> },
            { key: 'q', title: 'موجودی', num: true, render: (r) => <span className={`stock num ${r.total <= 0 ? 'out' : r.total <= r.product.minStock ? 'low' : ''}`}>{fmtNum(r.quantity, 2)} {r.product.unit?.name}</span> },
            { key: 'c', title: 'قیمت خرید', num: true, render: (r) => fmtMoney(r.cost) },
            { key: 'sp', title: 'تأمین‌کننده', render: (r) => <span className="muted">{r.supplier ?? '—'}</span> },
            { key: 'v', title: 'ارزش (خرید)', num: true, render: (r) => <span className="muted">{fmtMoney(r.quantity * r.cost)}</span> },
          ]} />}
        {tab === 'low' && <DataTable rows={low.data} loading={low.isLoading} rowKey={(r) => r.id} empty={<Empty icon="check" title="همه‌چیز به اندازه کافی موجود است" />}
          cols={[
            { key: 'p', title: 'کالا', render: (r) => <div><b>{r.name}</b> <span className="sku">{r.sku}</span></div> },
            { key: 'l', title: 'محل', render: (r) => <span className="ltr muted">{r.location ?? '—'}</span> },
            { key: 's', title: 'موجودی', num: true, render: (r) => <span className={`stock num ${r.stock <= 0 ? 'out' : 'low'}`}>{toFa(r.stock)}</span> },
            { key: 'm', title: 'حداقل', num: true, render: (r) => toFa(r.minStock) },
            { key: 'sh', title: 'کسری', num: true, render: (r) => <Stamp tone="red">{toFa(r.shortage)}</Stamp> },
            { key: 'a', title: '', className: 'actions', render: (r) => <Link className="btn btn--sm btn--blue" to={`/purchases/new?product=${r.id}`}>ثبت خرید</Link> },
          ]} />}
        {tab === 'tx' && <><DataTable rows={tx.data?.data} loading={tx.isLoading} rowKey={(r) => r.id} empty={<Empty title="گردشی ثبت نشده" />}
          cols={[
            { key: 'd', title: 'زمان', render: (r) => <div>{fmtDate(r.createdAt)}<div className="muted sm">{fmtTime(r.createdAt)}</div></div> },
            { key: 'p', title: 'کالا', render: (r) => <div><b>{r.product.name}</b> <span className="sku">{r.product.sku}</span></div> },
            { key: 't', title: 'نوع', render: (r) => <Stamp tone={r.quantity > 0 ? 'green' : 'amber'}>{TX_TYPE[r.transactionType] ?? r.transactionType}</Stamp> },
            { key: 'w', title: 'انبار', render: (r) => r.warehouse.name },
            { key: 'q', title: 'تعداد', num: true, render: (r) => <b className={r.quantity > 0 ? 't-pos' : 't-neg'}>{r.quantity > 0 ? '+' : ''}{fmtNum(r.quantity, 2)}</b> },
            { key: 'n', title: 'توضیح', render: (r) => <span className="muted sm">{r.notes ?? ''}</span> },
          ]} /><Pager meta={tx.data?.meta} onPage={setPage} /></>}
      </section>
      {(modal === 'adjust' || modal === 'transfer') && <AdjustModal mode={modal} onClose={() => setModal(null)} />}
      {modal === 'count' && <CountModal onClose={() => setModal(null)} />}
    </>
  );
}
