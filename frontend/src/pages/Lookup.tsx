import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Icon } from '../components/Icon';
import { PageHead, Stamp, Empty, Loading, useDebounced, Field } from '../components/ui';
import { ScanButton } from '../components/BarcodeScanner';
import { useAuth } from '../lib/auth';
import { LookupHit, LookupAlt, Product, useBrands, useCategories, useVehicles, vehicleLabel, categoryPath } from '../lib/queries';
import { fmtMoney, toFa, fmtSale } from '../lib/format';

const MATCH: Record<string, { label: string; tone: string }> = {
  'code-exact': { label: 'شماره‌ی دقیق', tone: 'green' }, 'code-prefix': { label: 'شروع با این شماره', tone: 'blue' },
  'code-partial': { label: 'بخشی از شماره', tone: 'gray' }, name: { label: 'نام', tone: 'gray' }, filter: { label: 'سازگار با خودرو', tone: 'blue' },
};

/** موجودی شعبه‌ی فعال + سایر شعبه‌ها */
export function StockBadge({ p }: { p: Product }) {
  if (p.isService) return <span className="muted">خدمت</span>;
  const mine = p.branchStock ?? p.totalStock;
  const cls = mine <= 0 ? 'out' : mine <= p.minStock ? 'low' : 'ok';
  return (
    <span>
      <span className={`stock ${cls} num`}>{mine <= 0 ? 'ناموجود' : `${toFa(mine)} موجود`}</span>
      {!!p.otherBranchStock && p.otherBranchStock > 0 && <span className="muted sm"> · {toFa(p.otherBranchStock)} در شعبه‌های دیگر</span>}
    </span>
  );
}

function AltRow({ a, canSell, onAdd }: { a: LookupAlt; canSell: boolean; onAdd: (id: string) => void }) {
  const p = a.product;
  return (
    <div className="row wrap" style={{ borderBottom: '2px dashed var(--line)', padding: '7px 0' }}>
      <span className="sku">{p.sku}</span>
      <span className="grow"><span className="strong">{p.name}</span>{p.brand && <span className="muted sm"> · {p.brand.name}</span>}<div className="muted sm">{a.reason}</div></span>
      <StockBadge p={p} /><b className="num">{fmtSale(p.salePrice)}</b>
      {canSell && <button className="btn btn--sm" onClick={() => onAdd(p.id)}>افزودن به فاکتور</button>}
    </div>
  );
}

function HitCard({ h, canSell, onAdd, onOpen }: { h: LookupHit; canSell: boolean; onAdd: (id: string) => void; onOpen: (id: string) => void }) {
  const out = !h.isService && (h.branchStock ?? h.totalStock) <= 0;
  const [open, setOpen] = useState(out && h.alternatives.length > 0); // ناموجود → جایگزین‌ها خودکار باز می‌شوند
  const m = MATCH[h.matchedBy] ?? MATCH.name;
  const codes = (h.codes ?? []).filter((c) => !['SKU'].includes(c.type)).slice(0, 4);
  return (
    <article className="sheet" style={{ padding: 14 }}>
      <div className="row wrap" style={{ alignItems: 'flex-start' }}>
        <div className="grow" style={{ minWidth: 220 }}>
          <div className="row wrap"><span className="sku">{h.sku}</span><Stamp tone={m.tone}>{m.label}</Stamp>{h.brand && <Stamp tone="blue">{h.brand.name}</Stamp>}</div>
          <h3 style={{ margin: '6px 0 2px', fontSize: 20 }}>{h.name}</h3>
          <div className="muted sm">{[h.category?.name, h.location && `محل ${h.location}`].filter(Boolean).join(' | ')}</div>
          {codes.length > 0 && <div className="chips" style={{ marginTop: 6 }}>{codes.map((c, i) => <span key={i} className="sku">{c.code}</span>)}</div>}
          {!!h.compatibilities?.length && <div className="muted sm" style={{ marginTop: 6 }}>مناسب: {h.compatibilities.map((c) => vehicleLabel(c.vehicle)).join('، ')}</div>}
        </div>
        <div style={{ textAlign: 'end' }}>
          <div className="num" style={{ fontSize: 24, fontWeight: 800 }}>{fmtSale(h.salePrice)}</div>
          <StockBadge p={h} />
        </div>
      </div>
      <div className="row wrap" style={{ marginTop: 10 }}>
        {canSell && <button className="btn btn--primary btn--sm" onClick={() => onAdd(h.id)}><Icon name="plus" size={15} />افزودن به فاکتور</button>}
        <button className="btn btn--sm" onClick={() => onOpen(h.id)}>جزئیات</button>
        {h.alternatives.length > 0 && <button className={`btn btn--sm ${out ? 'btn--yellow' : ''}`} onClick={() => setOpen(!open)}><Icon name="swap" size={15} />کالاهای مشابه ({toFa(h.alternatives.length)})</button>}
      </div>
      {open && <div style={{ marginTop: 8 }}>{h.alternatives.map((a) => <AltRow key={a.product.id} a={a} canSell={canSell} onAdd={onAdd} />)}</div>}
    </article>
  );
}

export default function Lookup() {
  const { has } = useAuth(); const nav = useNavigate();
  const [q, setQ] = useState(''); const dq = useDebounced(q.trim(), 250);
  const [vb, setVb] = useState(''); const [vehicleId, setVehicleId] = useState(''); const [categoryId, setCategoryId] = useState('');
  const brands = useBrands().data, vehicles = useVehicles().data, cats = useCategories().data;
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);

  const models = useMemo(() => (vehicles ?? []).filter((v) => !vb || v.brandId === vb), [vehicles, vb]);
  const active = dq.length > 0 || !!vehicleId || !!categoryId;
  const { data, isFetching } = useQuery({
    queryKey: ['lookup', dq, vehicleId, categoryId], enabled: active,
    queryFn: async () => (await api.get<LookupHit[]>('/products/lookup', { q: dq || undefined, vehicleId: vehicleId || undefined, categoryId: categoryId || undefined, limit: 25 })).data,
  });
  const canSell = has('sales.create');
  const add = (id: string) => nav(`/sales/new?add=${id}`);

  return (
    <>
      <PageHead title="جستجوی سریع قطعه" sub="شماره فنی، OEM، بارکد یا نام؛ یا از روی خودرو. کالاهای مشابه و موجودی شعبه‌ها کنار هر نتیجه می‌آید." />
      <section className="sheet" style={{ padding: 14, marginBottom: 14 }}>
        <div className="row">
          <input ref={input} className="input" style={{ fontSize: 20, height: 52 }} inputMode="search" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="مثلاً 1109.AL یا ۴۲۵۲۳۰ یا لنت پژو" aria-label="جستجو" />
          <ScanButton className="btn--lg" onCode={(c) => setQ(c)} />
        </div>
        <div className="grid g3" style={{ marginTop: 10 }}>
          <Field label="خودروساز"><select className="select" value={vb} onChange={(e) => { setVb(e.target.value); setVehicleId(''); }}><option value="">همه</option>{brands?.filter((b) => b.kind === 'VEHICLE').map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
          <Field label="مدل خودرو"><select className="select" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}><option value="">همه</option>{models.map((v) => <option key={v.id} value={v.id}>{vb ? v.modelName : vehicleLabel(v)}</option>)}</select></Field>
          <Field label="دسته"><select className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}><option value="">همه</option>{cats?.filter((c) => c.level > 1 || !cats.some((k) => k.parentId === c.id)).map((c) => <option key={c.id} value={c.id}>{categoryPath(cats, c.id)}</option>)}</select></Field>
        </div>
      </section>

      {!active ? <Empty icon="search" title="شروع به تایپ کنید" hint="با هر شکل نوشتن شماره (فاصله، خط تیره، ارقام فارسی) کالا پیدا می‌شود" />
        : isFetching && !data ? <Loading />
        : !data?.length ? <Empty icon="search" title="کالایی پیدا نشد" hint="شماره را کوتاه‌تر بنویسید یا فقط خودرو را انتخاب کنید" />
        : <div className="stack">{data.map((h) => <HitCard key={h.id} h={h} canSell={canSell} onAdd={add} onOpen={(id) => nav(`/products?open=${id}`)} />)}</div>}
    </>
  );
}
