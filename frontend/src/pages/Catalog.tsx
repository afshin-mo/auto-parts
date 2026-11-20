import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { Icon } from '../components/Icon';
import { PageHead, Modal, Field, Stamp, useUi, Loading, Empty, NumInput } from '../components/ui';
import { useAuth } from '../lib/auth';
import { useBrands, useCategories, useUnits, useVehicles, useWarehouses, Brand, Category, Vehicle, Warehouse, vehicleLabel } from '../lib/queries';
import { toFa } from '../lib/format';

type Tab = 'vehicles' | 'brands' | 'categories' | 'units' | 'warehouses';
const TABS: [Tab, string][] = [['vehicles', 'خودروها'], ['brands', 'برندها'], ['categories', 'دسته‌بندی'], ['units', 'واحدها'], ['warehouses', 'انبارها']];

function useSave(path: string, keys: string[], onDone: () => void, id?: string) {
  const qc = useQueryClient(); const { toast } = useUi(); const [err, setErr] = useState('');
  const m = useMutation({
    mutationFn: (body: unknown) => (id ? api.patch(`${path}/${id}`, body) : api.post(path, body)),
    onSuccess: () => { keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] })); toast('ذخیره شد'); onDone(); },
    onError: (e: ApiError) => setErr([e.message, ...(e.details ?? [])].join(' — ')),
  });
  return { ...m, err };
}

function Shell({ title, onClose, onSave, busy, err, disabled, children }: { title: string; onClose: () => void; onSave: () => void; busy: boolean; err: string; disabled?: boolean; children: React.ReactNode }) {
  return <Modal size="sm" title={title} onClose={onClose} footer={<><button className="btn btn--primary" disabled={busy || disabled} onClick={onSave}>ذخیره</button><button className="btn" onClick={onClose}>انصراف</button></>}>
    <div className="stack">{children}{err && <div className="callout red">{err}</div>}</div></Modal>;
}

function BrandForm({ b, onClose }: { b?: Brand; onClose: () => void }) {
  const [f, setF] = useState({ name: b?.name ?? '', country: b?.country ?? '', kind: b?.kind ?? 'PART' }); const s = useSave('/brands', ['brands'], onClose, b?.id);
  return <Shell title={b ? 'ویرایش برند' : 'برند جدید'} onClose={onClose} busy={s.isPending} err={s.err} disabled={!f.name} onSave={() => s.mutate({ name: f.name, country: f.country || undefined, kind: f.kind })}>
    <Field label="نام" required><input className="input" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
    <div className="grid g2"><Field label="نوع"><select className="select" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="PART">سازنده قطعه</option><option value="VEHICLE">خودروساز</option></select></Field>
      <Field label="کشور"><input className="input" value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })} /></Field></div></Shell>;
}
function CategoryForm({ c, cats, onClose }: { c?: Category; cats: Category[]; onClose: () => void }) {
  const [f, setF] = useState({ name: c?.name ?? '', parentId: c?.parentId ?? '' }); const s = useSave('/categories', ['categories'], onClose, c?.id);
  return <Shell title={c ? 'ویرایش دسته' : 'دسته جدید'} onClose={onClose} busy={s.isPending} err={s.err} disabled={!f.name} onSave={() => s.mutate({ name: f.name, ...(f.parentId ? { parentId: f.parentId } : c ? {} : {}) })}>
    <Field label="نام" required><input className="input" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
    {!c && <Field label="زیرمجموعه‌ی"><select className="select" value={f.parentId} onChange={(e) => setF({ ...f, parentId: e.target.value })}><option value="">— دسته اصلی —</option>{cats.filter((x) => x.level === 1).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>}</Shell>;
}
function VehicleForm({ v, onClose }: { v?: Vehicle; onClose: () => void }) {
  const brands = useBrands().data?.filter((b) => b.kind === 'VEHICLE') ?? [];
  const [f, setF] = useState({ brandId: v?.brandId ?? '', modelName: v?.modelName ?? '', yearFrom: (v?.yearFrom ?? 1390) as number | '', yearTo: (v?.yearTo ?? '') as number | '', engineType: v?.engineType ?? '' });
  const s = useSave('/vehicles', ['vehicles'], onClose, v?.id);
  return <Shell title={v ? 'ویرایش خودرو' : 'خودروی جدید'} onClose={onClose} busy={s.isPending} err={s.err} disabled={!f.brandId || !f.modelName || !f.yearFrom} onSave={() => s.mutate({ brandId: f.brandId, modelName: f.modelName, yearFrom: Number(f.yearFrom), yearTo: f.yearTo ? Number(f.yearTo) : undefined, engineType: f.engineType || undefined })}>
    <Field label="خودروساز" required><select className="select" value={f.brandId} onChange={(e) => setF({ ...f, brandId: e.target.value })}><option value="">انتخاب…</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
    <Field label="مدل" required><input className="input" value={f.modelName} onChange={(e) => setF({ ...f, modelName: e.target.value })} /></Field>
    <div className="grid g3"><Field label="از سال (شمسی)" required><NumInput value={f.yearFrom} onChange={(x) => setF({ ...f, yearFrom: x })} /></Field>
      <Field label="تا سال"><NumInput value={f.yearTo} onChange={(x) => setF({ ...f, yearTo: x })} /></Field>
      <Field label="موتور"><input className="input input--num" value={f.engineType} onChange={(e) => setF({ ...f, engineType: e.target.value })} /></Field></div></Shell>;
}
function UnitForm({ onClose }: { onClose: () => void }) {
  const [f, setF] = useState({ name: '', code: '' }); const s = useSave('/units', ['units'], onClose);
  return <Shell title="واحد جدید" onClose={onClose} busy={s.isPending} err={s.err} disabled={!f.name || !f.code} onSave={() => s.mutate(f)}>
    <Field label="نام" required><input className="input" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
    <Field label="کد انگلیسی" required hint="مثلاً pcs"><input className="input input--num" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></Field></Shell>;
}
function WarehouseForm({ w, onClose }: { w?: Warehouse; onClose: () => void }) {
  const [f, setF] = useState({ name: w?.name ?? '', code: w?.code ?? '', address: w?.address ?? '', isDefault: w?.isDefault ?? false, isActive: w?.isActive ?? true }); const s = useSave('/warehouses', ['warehouses'], onClose, w?.id);
  return <Shell title={w ? 'ویرایش انبار' : 'انبار جدید'} onClose={onClose} busy={s.isPending} err={s.err} disabled={!f.name || !f.code} onSave={() => s.mutate({ name: f.name, code: f.code, address: f.address || undefined, isDefault: f.isDefault, isActive: f.isActive })}>
    <div className="grid g2"><Field label="نام" required><input className="input" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="کد" required><input className="input input--num" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></Field></div>
    <Field label="نشانی"><input className="input" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
    <label className="check"><input type="checkbox" checked={f.isDefault} onChange={(e) => setF({ ...f, isDefault: e.target.checked })} />انبار پیش‌فرض</label>
    <label className="check"><input type="checkbox" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} />فعال</label></Shell>;
}

export default function Catalog() {
  const { has } = useAuth(); const [tab, setTab] = useState<Tab>('vehicles'); const [form, setForm] = useState<null | { item?: any }>(null); const [vq, setVq] = useState('');
  const vehicles = useVehicles(), brands = useBrands(), cats = useCategories(), units = useUnits(), whs = useWarehouses();
  const edit = has('catalog.manage');
  const close = () => setForm(null);

  return (
    <>
      <PageHead title="اطلاعات پایه" sub="خودروها، برندها، دسته‌ها، واحدها و انبارها">
        {edit ? <button className="btn btn--primary" onClick={() => setForm({})}><Icon name="plus" size={18} />افزودن</button> : null}
      </PageHead>
      <div className="tabs">{TABS.map(([k, l]) => <button key={k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{l}</button>)}</div>
      <section className="sheet" style={{ borderTop: 0 }}>
        {tab === 'vehicles' && (vehicles.isLoading ? <Loading /> : <>
          <div className="filters"><Field className="search" label="جستجوی خودرو"><input className="input" value={vq} onChange={(e) => setVq(e.target.value)} /></Field></div>
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>خودروساز</th><th>مدل</th><th>سال تولید (شمسی)</th><th>موتور</th><th /></tr></thead>
            <tbody>{vehicles.data?.filter((v) => !vq || vehicleLabel(v).includes(vq)).map((v) => <tr key={v.id}><td>{v.brand.name}</td><td className="strong">{v.modelName}</td><td>{toFa(v.yearFrom)} – {v.yearTo ? toFa(v.yearTo) : 'اکنون'}</td><td><span className="sku">{v.engineType ?? '—'}</span></td>
              <td className="actions">{edit && <button className="btn btn--sm btn--icon" onClick={() => setForm({ item: v })}><Icon name="edit" size={15} /></button>}</td></tr>)}</tbody></table></div></>)}
        {tab === 'brands' && <div className="tbl-wrap"><table className="tbl"><thead><tr><th>نام</th><th>نوع</th><th>کشور</th><th /></tr></thead>
          <tbody>{brands.data?.map((b) => <tr key={b.id}><td className="strong">{b.name}</td><td><Stamp tone={b.kind === 'VEHICLE' ? 'blue' : 'gray'}>{b.kind === 'VEHICLE' ? 'خودروساز' : 'سازنده قطعه'}</Stamp></td><td>{b.country ?? '—'}</td>
            <td className="actions">{edit && <button className="btn btn--sm btn--icon" onClick={() => setForm({ item: b })}><Icon name="edit" size={15} /></button>}</td></tr>)}</tbody></table></div>}
        {tab === 'categories' && <div className="sheet__body">{cats.data?.filter((c) => c.level === 1).map((p) => (
          <div key={p.id} style={{ marginBottom: 14 }}><div className="row"><h3 style={{ fontSize: 22 }}>{p.name}</h3>{edit && <button className="btn btn--sm btn--icon" onClick={() => setForm({ item: p })}><Icon name="edit" size={14} /></button>}</div>
            <div className="chips" style={{ marginTop: 6 }}>{cats.data!.filter((c) => c.parentId === p.id).map((c) => <span key={c.id} className="chip" onClick={() => edit && setForm({ item: c })}>{c.name}</span>)}</div></div>))}</div>}
        {tab === 'units' && <div className="tbl-wrap"><table className="tbl"><thead><tr><th>نام</th><th>کد</th></tr></thead><tbody>{units.data?.map((u) => <tr key={u.id}><td className="strong">{u.name}</td><td><span className="sku">{u.code}</span></td></tr>)}</tbody></table></div>}
        {tab === 'warehouses' && <div className="tbl-wrap"><table className="tbl"><thead><tr><th>نام</th><th>کد</th><th>نشانی</th><th>وضعیت</th><th /></tr></thead>
          <tbody>{whs.data?.map((w) => <tr key={w.id} className={w.isActive ? '' : 'dim'}><td className="strong">{w.name} {w.isDefault && <Stamp tone="green">پیش‌فرض</Stamp>}</td><td><span className="sku">{w.code}</span></td><td>{w.address ?? '—'}</td><td>{w.isActive ? 'فعال' : 'غیرفعال'}</td>
            <td className="actions">{edit && <button className="btn btn--sm btn--icon" onClick={() => setForm({ item: w })}><Icon name="edit" size={15} /></button>}</td></tr>)}</tbody></table></div>}
        {!vehicles.data && !brands.data && <Empty />}
      </section>
      {form && tab === 'vehicles' && <VehicleForm v={form.item} onClose={close} />}
      {form && tab === 'brands' && <BrandForm b={form.item} onClose={close} />}
      {form && tab === 'categories' && <CategoryForm c={form.item} cats={cats.data ?? []} onClose={close} />}
      {form && tab === 'units' && <UnitForm onClose={close} />}
      {form && tab === 'warehouses' && <WarehouseForm w={form.item} onClose={close} />}
    </>
  );
}
