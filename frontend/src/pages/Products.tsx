import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { Icon } from '../components/Icon';
import { DataTable, Pager, PageHead, Modal, Field, NumInput, Stamp, useDebounced, useUi, Empty, Loading } from '../components/ui';
import { useAuth } from '../lib/auth';
import { Product, useBrands, useCategories, useUnits, useVehicles, useWarehouses, vehicleLabel, categoryPath, branchWarehouses } from '../lib/queries';
import { QuickProduct } from '../components/QuickProduct';
import { fmtMoney, fmtNum, toFa, fmtSale } from '../lib/format';
import { ImportProducts } from '../components/ImportProducts';
import { PRODUCT_COLUMNS, downloadFile, toCSV } from '../lib/csv';
import { saveXlsx } from '../lib/xlsx';
import { useNavigate } from 'react-router-dom';

const EMPTY = { sku: '', name: '', nameEn: '', oemCode: '', partNumber: '', barcode: '', taxGoodsId: '', categoryId: '', brandId: '', unitId: '', purchasePrice: 0 as number | '', salePrice: 0 as number | '', wholesalePrice: '' as number | '', minStock: 0 as number | '', location: '', warrantyMonths: '' as number | '', isService: false, isActive: true, initialQuantity: '' as number | '', warehouseId: '' };

function stockState(p: Product) { const st = p.branchStock ?? p.totalStock; return p.isService ? 'svc' : st <= 0 ? 'out' : st <= p.minStock ? 'low' : 'ok'; }

function ProductForm({ product, onClose }: { product?: Product; onClose: () => void }) {
  const { branchId } = useAuth();
  const qc = useQueryClient();
  const { toast } = useUi();
  const units = useUnits().data, brands = useBrands().data, cats = useCategories().data, whs = useWarehouses().data;
  const [f, setF] = useState<typeof EMPTY>(product ? { ...EMPTY, ...Object.fromEntries(Object.entries(product).filter(([k]) => k in EMPTY).map(([k, v]) => [k, v ?? ''])) } as typeof EMPTY : { ...EMPTY });
  const [errs, setErrs] = useState<string[]>([]);
  useEffect(() => { if (!product && units?.length && !f.unitId) setF((x) => ({ ...x, unitId: units.find((u) => u.code === 'pcs')?.id ?? units[0].id })); }, [units, product, f.unitId]);
  const set = <K extends keyof typeof EMPTY>(k: K, v: (typeof EMPTY)[K]) => setF((x) => ({ ...x, [k]: v }));

  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(f)) { if (v !== '' && v !== undefined) body[k] = v; }
      if (product) { delete body.initialQuantity; delete body.warehouseId; return api.patch(`/products/${product.id}`, body); }
      return api.post('/products', body);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); toast(product ? 'کالا ویرایش شد' : 'کالا ثبت شد'); onClose(); },
    onError: (e: ApiError) => setErrs([e.message, ...(e.details ?? [])]),
  });

  return (
    <Modal size="lg" title={product ? 'ویرایش کالا' : 'کالای جدید'} onClose={onClose}
      footer={<><button className="btn btn--primary" disabled={save.isPending || !f.name} onClick={() => { setErrs([]); save.mutate(); }}>{save.isPending ? 'در حال ذخیره…' : 'ذخیره'}</button><button className="btn" onClick={onClose}>انصراف</button></>}>
      <div className="stack">
        <div className="grid g3">
          <Field label="نام کالا" required className="span2"><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} autoFocus /></Field>
          <Field label="کد کالا (SKU)" hint={product ? undefined : 'خالی بگذارید تا خودکار ساخته شود'}><input className="input input--num" value={f.sku} onChange={(e) => set('sku', e.target.value)} placeholder={product ? '' : 'خودکار'} /></Field>
          <Field label="شماره فنی / OEM"><input className="input input--num" value={f.oemCode} onChange={(e) => set('oemCode', e.target.value)} /></Field>
          <Field label="شماره قطعه سازنده"><input className="input input--num" value={f.partNumber} onChange={(e) => set('partNumber', e.target.value)} /></Field>
          <Field label="بارکد"><input className="input input--num" value={f.barcode} onChange={(e) => set('barcode', e.target.value)} /></Field>
          <Field label="شناسه کالا/خدمت (مودیان)" hint="۱۳ رقم؛ برای ارسال فاکتور به سامانه لازم است"><input className="input input--num" maxLength={13} value={f.taxGoodsId} onChange={(e) => set('taxGoodsId', e.target.value.replace(/\D/g, ''))} /></Field>
          <Field label="دسته‌بندی">
            <select className="select" value={f.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
              <option value="">— بدون دسته —</option>
              {cats?.filter((c) => c.level > 1).map((c) => <option key={c.id} value={c.id}>{categoryPath(cats, c.id)}</option>)}
              {cats?.filter((c) => c.level === 1 && !cats.some((k) => k.parentId === c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="برند سازنده"><select className="select" value={f.brandId} onChange={(e) => set('brandId', e.target.value)}><option value="">— بدون برند —</option>{brands?.filter((b) => b.kind === 'PART').map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
          <Field label="واحد" required><select className="select" value={f.unitId} onChange={(e) => set('unitId', e.target.value)}>{units?.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
        </div>
        <div className="grid g3">
          <Field label="قیمت خرید (ریال)" required><NumInput money value={f.purchasePrice} onChange={(v) => set('purchasePrice', v)} /></Field>
          <Field label="قیمت فروش (ریال)" hint="اختیاری؛ معمولاً هنگام ثبت فاکتور فروش تعیین می‌شود"><NumInput money value={f.salePrice} onChange={(v) => set('salePrice', v)} /></Field>
          <Field label="قیمت عمده‌فروشی"><NumInput money value={f.wholesalePrice} onChange={(v) => set('wholesalePrice', v)} /></Field>
          <Field label="حداقل موجودی" hint="زیر این عدد در لیست کم‌موجودی می‌آید"><NumInput value={f.minStock} onChange={(v) => set('minStock', v)} /></Field>
          <Field label="محل در انبار"><input className="input input--num" placeholder="A-2-3" value={f.location} onChange={(e) => set('location', e.target.value)} /></Field>
          <Field label="گارانتی (ماه)"><NumInput value={f.warrantyMonths} onChange={(v) => set('warrantyMonths', v)} /></Field>
        </div>
        {!product && !f.isService && (
          <div className="grid g3" style={{ background: 'var(--concrete)', padding: 12, border: '2px dashed var(--line-strong)' }}>
            <Field label="موجودی اولیه" hint="اختیاری — همین حالا در انبار ثبت می‌شود"><NumInput decimals value={f.initialQuantity} onChange={(v) => set('initialQuantity', v)} /></Field>
            <Field label="انبار"><select className="select" value={f.warehouseId} onChange={(e) => set('warehouseId', e.target.value)}><option value="">انبار پیش‌فرض</option>{branchWarehouses(whs, branchId).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>
          </div>
        )}
        <div className="row wrap" style={{ gap: 24 }}>
          <label className="check"><input type="checkbox" checked={f.isService} onChange={(e) => set('isService', e.target.checked)} />کالای خدماتی (اجرت، بدون موجودی)</label>
          <label className="check"><input type="checkbox" checked={f.isActive} onChange={(e) => set('isActive', e.target.checked)} />فعال</label>
        </div>
        {errs.length > 0 && <div className="callout red">{errs.map((m) => <div key={m}>{m}</div>)}</div>}
      </div>
    </Modal>
  );
}

interface Detail extends Product {
  inventory: { warehouse: { id: string; name: string; branchId: string | null }; quantity: number; availableQuantity: number }[];
  compatibilities: { vehicleId: string; position?: string; notes?: string; vehicle: { id: string; modelName: string; yearFrom: number; yearTo?: number; brand: { name: string } } }[];
  substitutes: { substituteId: string; reason?: string; substitute: Product }[];
  codes: { id: string; type: string; code: string; note?: string }[];
}
const CODE_TYPES: Record<string, string> = { SKU: 'کد کالا', PART_NUMBER: 'شماره سازنده', OEM: 'شماره فنی OEM', BARCODE: 'بارکد', AFTERMARKET: 'معادل برند دیگر', SUPPLIER: 'کد تأمین‌کننده', OTHER: 'سایر' };

function ProductDrawer({ id, onClose, onEdit }: { id: string; onClose: () => void; onEdit: (p: Product) => void }) {
  const { has } = useAuth();
  const qc = useQueryClient();
  const { toast } = useUi();
  const vehicles = useVehicles().data;
  const [pickVeh, setPickVeh] = useState('');
  const [pickSub, setPickSub] = useState('');
  const [subSearch, setSubSearch] = useState('');
  const dq = useDebounced(subSearch);
  const q = useQuery({ queryKey: ['product', id], queryFn: async () => (await api.get<Detail>(`/products/${id}`)).data });
  const subs = useQuery({ queryKey: ['subsearch', dq], enabled: dq.length >= 2, queryFn: async () => (await api.get<Product[]>('/products', { search: dq, limit: 6 })).data });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['product', id] }); qc.invalidateQueries({ queryKey: ['products'] }); };
  const edit = has('products.edit'); const seeCost = has('products.viewCost');
  const [newCode, setNewCode] = useState({ code: '', type: 'AFTERMARKET', note: '' });
  const addCode = useMutation({ mutationFn: () => api.post(`/products/${id}/codes`, newCode), onSuccess: () => { setNewCode({ code: '', type: 'AFTERMARKET', note: '' }); refresh(); toast('شماره اضافه شد'); }, onError: (e: ApiError) => toast(e.message, 'error') });
  const delCode = useMutation({ mutationFn: (cid: string) => api.del(`/products/${id}/codes/${cid}`), onSuccess: refresh, onError: (e: ApiError) => toast(e.message, 'error') });
  const addVeh = useMutation({ mutationFn: () => api.post(`/products/${id}/vehicles`, { vehicleId: pickVeh }), onSuccess: () => { setPickVeh(''); refresh(); toast('خودرو اضافه شد'); }, onError: (e: ApiError) => toast(e.message, 'error') });
  const delVeh = useMutation({ mutationFn: (vid: string) => api.del(`/products/${id}/vehicles/${vid}`), onSuccess: refresh });
  const addSub = useMutation({ mutationFn: (sid: string) => api.post(`/products/${id}/substitutes`, { substituteId: sid }), onSuccess: () => { setPickSub(''); setSubSearch(''); refresh(); toast('جایگزین اضافه شد'); }, onError: (e: ApiError) => toast(e.message, 'error') });
  const delSub = useMutation({ mutationFn: (sid: string) => api.del(`/products/${id}/substitutes/${sid}`), onSuccess: refresh });
  const p = q.data;

  return (
    <div className="overlay right" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer">
        <div className="modal__head"><h2>{p?.name ?? '…'}</h2>
          {p && edit && <button className="btn btn--sm" onClick={() => onEdit(p)}><Icon name="edit" size={15} />ویرایش</button>}
          <button className="btn btn--sm btn--icon" onClick={onClose}><Icon name="x" size={16} /></button></div>
        <div className="modal__body stack">
          {!p ? <Loading /> : <>
            <div className="row wrap"><span className="sku">{p.sku}</span>{p.oemCode && <span className="sku">OEM {p.oemCode}</span>}{p.brand && <Stamp tone="blue">{p.brand.name}</Stamp>}{!p.isActive && <Stamp tone="gray">غیرفعال</Stamp>}</div>
            <div className="grid g3">
              <div className="sign sign--green"><div className="sign__in"><span className="sign__label">قیمت فروش</span><span className="sign__value num" style={{ fontSize: 26 }}>{fmtSale(p.salePrice)}</span></div></div>
              {seeCost && <div className="sign sign--dark"><div className="sign__in"><span className="sign__label">قیمت خرید</span><span className="sign__value num" style={{ fontSize: 26 }}>{fmtMoney(p.purchasePrice)}</span></div></div>}
              <div className={`sign ${stockState(p) === 'ok' || stockState(p) === 'svc' ? 'sign--blue' : stockState(p) === 'low' ? 'sign--yellow' : 'sign--red'}`}><div className="sign__in"><span className="sign__label">موجودی کل</span><span className="sign__value num" style={{ fontSize: 26 }}>{p.isService ? '—' : toFa(p.totalStock)}</span></div></div>
            </div>
            <dl className="kv">
              <dt>دسته</dt><dd>{p.category?.name ?? '—'}</dd><dt>واحد</dt><dd>{p.unit?.name}</dd>
              <dt>محل انبار</dt><dd className="ltr">{p.location || '—'}</dd><dt>حداقل موجودی</dt><dd>{fmtNum(p.minStock)}</dd>
              <dt>گارانتی</dt><dd>{p.warrantyMonths ? `${toFa(p.warrantyMonths)} ماه` : '—'}</dd>
              {seeCost && p.salePrice > 0 && <><dt>سود هر واحد</dt><dd>{fmtMoney(p.salePrice - p.purchasePrice)} ({p.purchasePrice ? toFa(Math.round(((p.salePrice - p.purchasePrice) / p.purchasePrice) * 100)) : '—'}٪)</dd></>}
            </dl>

            <section>
              <h3 style={{ fontSize: 20, marginBottom: 6 }}>موجودی به تفکیک انبار</h3>
              {p.inventory.length === 0 ? <div className="muted">هنوز موجودی ثبت نشده</div> : p.inventory.map((i) => <div key={i.warehouse.id} className="row" style={{ borderBottom: '2px dashed var(--line)', padding: '6px 0' }}><span className="grow">{i.warehouse.name}</span><b className="num">{fmtNum(i.quantity, 2)}</b></div>)}
            </section>

            <section>
              <h3 style={{ fontSize: 20, marginBottom: 6 }}>شماره‌های فنی و معادل‌ها</h3>
              <div className="muted sm" style={{ marginBottom: 6 }}>با هر کدام از این شماره‌ها (حتی با فاصله و خط تیره‌ی متفاوت) کالا پیدا می‌شود. کالاهایی که شماره‌ی یکسان دارند به‌عنوان «هم‌شماره» پیشنهاد می‌شوند.</div>
              {p.codes.map((c) => (
                <div key={c.id} className="row" style={{ borderBottom: '2px dashed var(--line)', padding: '5px 0' }}>
                  <span className="muted sm" style={{ width: 120 }}>{CODE_TYPES[c.type] ?? c.type}</span><span className="sku grow">{c.code}</span>{c.note && <span className="muted sm">{c.note}</span>}
                  {edit && !['SKU', 'PART_NUMBER', 'OEM', 'BARCODE'].includes(c.type) && <button className="btn btn--sm btn--icon btn--danger" onClick={() => delCode.mutate(c.id)}><Icon name="x" size={14} /></button>}
                </div>
              ))}
              {edit && <div className="row wrap" style={{ marginTop: 8 }}>
                <input className="input input--num grow" placeholder="شماره‌ی معادل (مثلاً 1109.AL)" value={newCode.code} onChange={(e) => setNewCode({ ...newCode, code: e.target.value })} />
                <select className="select" style={{ width: 150 }} value={newCode.type} onChange={(e) => setNewCode({ ...newCode, type: e.target.value })}>{['AFTERMARKET', 'OEM', 'SUPPLIER', 'OTHER'].map((t) => <option key={t} value={t}>{CODE_TYPES[t]}</option>)}</select>
                <button className="btn btn--primary" disabled={!newCode.code.trim() || addCode.isPending} onClick={() => addCode.mutate()}>افزودن</button>
              </div>}
            </section>

            <section>
              <h3 style={{ fontSize: 20, marginBottom: 6 }}>خودروهای سازگار</h3>
              <div className="chips" style={{ marginBottom: 8 }}>
                {p.compatibilities.length === 0 && <span className="muted">سازگاری ثبت نشده</span>}
                {p.compatibilities.map((c) => (
                  <span key={c.vehicleId} className="chip on" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                    {c.vehicle.brand.name} {c.vehicle.modelName}{c.position ? ` (${c.position})` : ''}
                    {edit && <button style={{ all: 'unset', cursor: 'pointer' }} onClick={() => delVeh.mutate(c.vehicleId)} aria-label="حذف">×</button>}
                  </span>
                ))}
              </div>
              {edit && <div className="row">
                <select className="select" value={pickVeh} onChange={(e) => setPickVeh(e.target.value)}><option value="">افزودن خودرو…</option>{vehicles?.filter((v) => !p.compatibilities.some((c) => c.vehicleId === v.id)).map((v) => <option key={v.id} value={v.id}>{vehicleLabel(v)} ({toFa(v.yearFrom)}–{v.yearTo ? toFa(v.yearTo) : 'اکنون'})</option>)}</select>
                <button className="btn btn--primary" disabled={!pickVeh} onClick={() => addVeh.mutate()}>افزودن</button>
              </div>}
            </section>

            <section>
              <h3 style={{ fontSize: 20, marginBottom: 6 }}>کالاهای جایگزین</h3>
              {p.substitutes.length === 0 && <div className="muted" style={{ marginBottom: 8 }}>جایگزینی ثبت نشده — وقتی کالا تمام شد، این‌جا پیشنهاد می‌دهیم.</div>}
              {p.substitutes.map((s) => (
                <div key={s.substituteId} className="row" style={{ borderBottom: '2px dashed var(--line)', padding: '6px 0' }}>
                  <span className="sku">{s.substitute.sku}</span><span className="grow">{s.substitute.name}</span>
                  <span className="stock num">{toFa(s.substitute.totalStock)}</span>
                  {edit && <button className="btn btn--sm btn--icon btn--danger" onClick={() => delSub.mutate(s.substituteId)}><Icon name="x" size={14} /></button>}
                </div>
              ))}
              {edit && <div style={{ position: 'relative', marginTop: 8 }}>
                <input className="input" placeholder="جستجوی کالا برای افزودن به جایگزین‌ها…" value={subSearch} onChange={(e) => setSubSearch(e.target.value)} />
                {dq.length >= 2 && subs.data && <div className="hits">{subs.data.filter((x) => x.id !== id).map((x) => <button key={x.id} className="hit" onClick={() => addSub.mutate(x.id)}><span className="sku">{x.sku}</span><span className="hit__name">{x.name}</span></button>)}</div>}
              </div>}
            </section>
          </>}
        </div>
      </aside>
    </div>
  );
}

export default function Products() {
  const { has } = useAuth();
  const { confirm, toast } = useUi();
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [sort, setSort] = useState({ by: 'createdAt', order: 'desc' as 'asc' | 'desc' });
  const [form, setForm] = useState<{ p?: Product } | null>(null);
  const [importing, setImporting] = useState(false);
  const [quick, setQuick] = useState(false);
  const nav = useNavigate();
  const [picked, setPicked] = useState<Record<string, Product>>({});
  const pickedList = Object.values(picked);
  const toggle = (p: Product) => setPicked((m) => { const n = { ...m }; if (n[p.id]) delete n[p.id]; else n[p.id] = p; return n; });
  const printLabels = () => { sessionStorage.setItem('labelProducts', JSON.stringify(pickedList.map((p) => ({ id: p.id, name: p.name, sku: p.sku, barcode: p.barcode ?? '', price: p.salePrice, location: p.location ?? '', copies: 1 })))); nav('/labels'); };
  const dq = useDebounced(search);
  const cats = useCategories().data, brands = useBrands().data, vehicles = useVehicles().data;
  const openId = sp.get('open');
  const params = { page, limit: 15, search: dq || undefined, categoryId: categoryId || undefined, brandId: brandId || undefined, vehicleId: vehicleId || undefined, sortBy: sort.by, sortOrder: sort.order };
  const { data, isLoading } = useQuery({ queryKey: ['products', params], queryFn: () => api.get<Product[]>('/products', params) });
  const canEdit = has('products.edit'); const canCreate = has('products.create');
  const canSeeCost = has('products.viewCost');

  const del = useMutation({ mutationFn: (id: string) => api.del(`/products/${id}`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); toast('کالا حذف شد'); }, onError: (e: ApiError) => toast(e.message, 'error') });
  const sortBy = (by: string) => { setSort((s) => ({ by, order: s.by === by && s.order === 'asc' ? 'desc' : 'asc' })); setPage(1); };

  return (
    <>
      <PageHead title="کالاها" sub="جستجو با شماره فنی، نام، OEM، بارکد یا خودرو">
        {pickedList.length > 0 && <button className="btn btn--yellow" onClick={printLabels}><Icon name="tag" size={17} />چاپ برچسب ({toFa(pickedList.length)})</button>}
        {(['xlsx', 'csv'] as const).map((fmt) => (
          <button key={fmt} className="btn" onClick={async () => {
            const rows = (await api.get<Record<string, string | number>[]>('/products/export')).data;
            const cols = [...PRODUCT_COLUMNS.filter((c) => c.key !== 'initialQuantity'), { key: 'stock', title: 'موجودی فعلی' }];
            const table = [cols.map((c) => c.title), ...rows.map((r) => cols.map((c) => r[c.key] ?? ''))];
            if (fmt === 'xlsx') await saveXlsx('کالاها.xlsx', table); else downloadFile('کالاها.csv', toCSV(table));
          }}><Icon name="receipt" size={17} />{fmt === 'xlsx' ? 'خروجی اکسل' : 'CSV'}</button>
        ))}
        {has('products.import') && <button className="btn" onClick={() => setImporting(true)}><Icon name="plus" size={17} />ورود از فایل</button>}
        {canCreate && <button className="btn btn--yellow" onClick={() => setQuick(true)}><Icon name="plus" size={18} />ثبت سریع</button>}
        {canCreate && <button className="btn btn--primary" onClick={() => setForm({})}><Icon name="plus" size={18} />کالای جدید</button>}
      </PageHead>
      <section className="sheet">
        <div className="filters">
          <Field className="search" label="جستجو"><input className="input" placeholder="نام، SKU، OEM یا بارکد…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></Field>
          <Field label="خودرو"><select className="select" value={vehicleId} onChange={(e) => { setVehicleId(e.target.value); setPage(1); }}><option value="">همه‌ی خودروها</option>{vehicles?.map((v) => <option key={v.id} value={v.id}>{vehicleLabel(v)}</option>)}</select></Field>
          <Field label="دسته"><select className="select" value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1); }}><option value="">همه</option>{cats?.filter((c) => c.level > 1).map((c) => <option key={c.id} value={c.id}>{categoryPath(cats, c.id)}</option>)}</select></Field>
          <Field label="برند"><select className="select" value={brandId} onChange={(e) => { setBrandId(e.target.value); setPage(1); }}><option value="">همه</option>{brands?.filter((b) => b.kind === 'PART').map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
        </div>
        <DataTable rows={data?.data} loading={isLoading} rowKey={(r) => r.id} sort={sort} onSort={sortBy} onRow={(r) => setSp({ open: r.id })}
          empty={<Empty title="کالایی پیدا نشد" hint="عبارت جستجو یا فیلترها را عوض کنید" />} rowClass={(r) => (r.isActive ? '' : 'dim')}
          cols={[
            { key: 'pick', title: '', width: 36, render: (r) => <span onClick={(e) => e.stopPropagation()}><input type="checkbox" style={{ width: 18, height: 18, accentColor: 'var(--sign-green)' }} checked={!!picked[r.id]} onChange={() => toggle(r)} aria-label="انتخاب برای چاپ برچسب" /></span> },
            { key: 'sku', title: 'کد', sort: 'sku', render: (r) => <span className="sku">{r.sku}</span> },
            { key: 'name', title: 'نام کالا', sort: 'name', render: (r) => <div><div className="strong">{r.name}</div><div className="muted sm">{[r.brand?.name, r.category?.name, r.oemCode && `OEM ${r.oemCode}`].filter(Boolean).join(' | ')}</div></div> },
            { key: 'loc', title: 'محل', render: (r) => <span className="ltr muted">{r.location ?? '—'}</span> },
            { key: 'stock', title: 'موجودی', render: (r) => { const s = stockState(r); return s === 'svc' ? <span className="muted">خدمت</span> : <span><span className={`stock ${s} num`}>{toFa(r.branchStock ?? r.totalStock)}</span>{!!r.otherBranchStock && <span className="muted sm"> +{toFa(r.otherBranchStock)} شعبه‌ی دیگر</span>}</span>; } },
            ...(canSeeCost ? [{ key: 'buy', title: 'خرید', num: true, sort: 'purchasePrice', render: (r: Product) => <span className="muted">{fmtMoney(r.purchasePrice)}</span> }] : []),
            { key: 'sell', title: 'فروش (ریال)', num: true, sort: 'salePrice', render: (r) => <b>{fmtSale(r.salePrice)}</b> },
            ...(canEdit ? [{ key: 'a', title: '', className: 'actions', render: (r: Product) => (
              <span onClick={(e) => e.stopPropagation()}>
                <button className="btn btn--sm btn--icon" title="ویرایش" onClick={() => setForm({ p: r })}><Icon name="edit" size={15} /></button>{' '}
                {has('products.delete') && <button className="btn btn--sm btn--icon btn--danger" title="حذف" onClick={async () => { if (await confirm(`«${r.name}» حذف شود؟`, { danger: true, ok: 'حذف' })) del.mutate(r.id); }}><Icon name="trash" size={15} /></button>}
              </span>) }] : []),
          ]} />
        <Pager meta={data?.meta} onPage={setPage} />
      </section>
      {quick && <QuickProduct onClose={() => setQuick(false)} />}
      {importing && <ImportProducts onClose={() => setImporting(false)} />}
      {form && <ProductForm product={form.p} onClose={() => setForm(null)} />}
      {openId && !form && <ProductDrawer id={openId} onClose={() => setSp({})} onEdit={(p) => { setSp({}); setForm({ p }); }} />}
    </>
  );
}
