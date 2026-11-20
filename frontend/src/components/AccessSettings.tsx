import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { Modal, Field, Stamp, useUi } from './ui';
import { Icon } from './Icon';
import { ROLES, toFa } from '../lib/format';

export interface BranchRow { id: string; name: string; code: string; address?: string; phone?: string; isDefault: boolean; isActive: boolean; _count?: { warehouses: number; users: number } }
export interface RoleRow { id: string; name: string; description?: string; permissions: string[]; _count?: { users: number } }
interface Catalog { permissions: { key: string; label: string; group: string }[]; systemRoles: { role: string; permissions: string[] }[] }

export const useBranchList = () => useQuery({ queryKey: ['branches-admin'], queryFn: async () => (await api.get<BranchRow[]>('/branches')).data });
export const useRoleList = (enabled = true) => useQuery({ queryKey: ['roles'], enabled, queryFn: async () => (await api.get<RoleRow[]>('/roles')).data });

/* ───────────── شعبه‌ها ───────────── */
export function BranchesCard({ maxBranches }: { maxBranches?: number }) {
  const qc = useQueryClient(); const { toast } = useUi();
  const list = useBranchList();
  const [f, setF] = useState<null | { id?: string; name: string; code: string; address: string; phone: string; createWarehouse: boolean }>(null);
  const [err, setErr] = useState('');
  const active = (list.data ?? []).filter((b) => b.isActive).length;

  const save = useMutation({
    mutationFn: () => f!.id
      ? api.patch(`/branches/${f!.id}`, { name: f!.name, address: f!.address || undefined, phone: f!.phone || undefined })
      : api.post('/branches', { name: f!.name, code: f!.code, address: f!.address || undefined, phone: f!.phone || undefined, createWarehouse: f!.createWarehouse }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['branches-admin'] }); qc.invalidateQueries({ queryKey: ['warehouses'] }); toast('ذخیره شد'); setF(null); toast('برای دیدن شعبه‌ی جدید در بالای صفحه، یک بار صفحه را تازه کنید'); },
    onError: (e: ApiError) => setErr([e.message, ...(e.details ?? [])].join(' — ')),
  });
  const patch = useMutation({
    mutationFn: (v: { id: string; body: object }) => api.patch(`/branches/${v.id}`, v.body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['branches-admin'] }), onError: (e: ApiError) => toast(e.message, 'error'),
  });

  return (
    <section className="sheet">
      <div className="sheet__head"><h2>شعبه‌ها</h2><span className="muted sm">{toFa(active)}{maxBranches ? ` از ${toFa(maxBranches)}` : ''} شعبه‌ی فعال</span><span className="grow" />
        <button className="btn btn--sm btn--primary" onClick={() => { setErr(''); setF({ name: '', code: '', address: '', phone: '', createWarehouse: true }); }}><Icon name="plus" size={15} />شعبه‌ی جدید</button></div>
      <div className="tbl-wrap"><table className="tbl tbl--cards"><thead><tr><th>نام</th><th>کد</th><th>انبارها</th><th>کاربران</th><th /></tr></thead>
        <tbody>{list.data?.map((b) => (
          <tr key={b.id} className={b.isActive ? '' : 'dim'}>
            <td data-label="نام" className="strong">{b.name}{b.isDefault && <> <Stamp tone="green">پیش‌فرض</Stamp></>}{!b.isActive && <> <Stamp tone="gray">غیرفعال</Stamp></>}</td>
            <td data-label="کد"><span className="sku">{b.code}</span></td>
            <td data-label="انبارها" className="n">{toFa(b._count?.warehouses ?? 0)}</td><td data-label="کاربران" className="n">{toFa(b._count?.users ?? 0)}</td>
            <td className="actions">
              <button className="btn btn--sm" onClick={() => { setErr(''); setF({ id: b.id, name: b.name, code: b.code, address: b.address ?? '', phone: b.phone ?? '', createWarehouse: false }); }}>ویرایش</button>{' '}
              {!b.isDefault && b.isActive && <button className="btn btn--sm" onClick={() => patch.mutate({ id: b.id, body: { isDefault: true } })}>پیش‌فرض شود</button>}{' '}
              {!b.isDefault && <button className={`btn btn--sm ${b.isActive ? 'btn--danger' : ''}`} onClick={() => patch.mutate({ id: b.id, body: { isActive: !b.isActive } })}>{b.isActive ? 'غیرفعال' : 'فعال‌سازی'}</button>}
            </td></tr>))}</tbody></table></div>
      <div className="muted sm" style={{ padding: '8px 14px' }}>موجودی هر انبار به یک شعبه تعلق دارد. فروش، خرید، دریافت و هزینه همیشه به «شعبه‌ی فعال» (انتخاب‌شده بالای صفحه) ثبت می‌شود. انبار شعبه را از بخش «انبار» هم می‌توانید عوض کنید.</div>
      {f && <Modal size="sm" title={f.id ? 'ویرایش شعبه' : 'شعبه‌ی جدید'} onClose={() => setF(null)} footer={<><button className="btn btn--primary" disabled={!f.name.trim() || (!f.id && !f.code.trim()) || save.isPending} onClick={() => { setErr(''); save.mutate(); }}>ذخیره</button><button className="btn" onClick={() => setF(null)}>انصراف</button></>}>
        <div className="stack">
          <Field label="نام شعبه" required><input className="input" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          {!f.id && <Field label="کد کوتاه" required hint="انگلیسی یا عدد؛ در شماره فاکتور شعبه می‌آید (مثلاً SH)"><input className="input input--num" value={f.code} maxLength={10} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} /></Field>}
          <Field label="تلفن"><input className="input input--num" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          <Field label="نشانی"><input className="input" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
          {!f.id && <label className="check"><input type="checkbox" checked={f.createWarehouse} onChange={(e) => setF({ ...f, createWarehouse: e.target.checked })} />یک انبار برای این شعبه هم ساخته شود</label>}
          {err && <div className="callout red">{err}</div>}
        </div></Modal>}
    </section>
  );
}

/* ───────────── نقش‌ها و دسترسی‌ها ───────────── */
export function RolesCard() {
  const qc = useQueryClient(); const { toast } = useUi();
  const roles = useRoleList();
  const cat = useQuery({ queryKey: ['perm-catalog'], queryFn: async () => (await api.get<Catalog>('/roles/permissions')).data, staleTime: Infinity });
  const [f, setF] = useState<null | { id?: string; name: string; description: string; perms: Set<string> }>(null);
  const [err, setErr] = useState('');
  const groups = Array.from(new Set((cat.data?.permissions ?? []).map((p) => p.group)));

  const save = useMutation({
    mutationFn: () => { const body = { name: f!.name.trim(), description: f!.description || undefined, permissions: [...f!.perms] }; return f!.id ? api.patch(`/roles/${f!.id}`, body) : api.post('/roles', body); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['roles'] }); toast('نقش ذخیره شد'); setF(null); },
    onError: (e: ApiError) => setErr([e.message, ...(e.details ?? [])].join(' — ')),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.del(`/roles/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['roles'] }), onError: (e: ApiError) => toast(e.message, 'error'),
  });
  const toggle = (k: string) => setF((x) => { if (!x) return x; const p = new Set(x.perms); p.has(k) ? p.delete(k) : p.add(k); return { ...x, perms: p }; });
  const toggleGroup = (g: string) => setF((x) => {
    if (!x || !cat.data) return x; const keys = cat.data.permissions.filter((p) => p.group === g).map((p) => p.key);
    const all = keys.every((k) => x.perms.has(k)); const p = new Set(x.perms); keys.forEach((k) => (all ? p.delete(k) : p.add(k))); return { ...x, perms: p };
  });
  const copyFrom = (role: string) => { const r = cat.data?.systemRoles.find((s) => s.role === role); if (r) setF((x) => x && { ...x, perms: new Set(r.permissions) }); };

  return (
    <section className="sheet">
      <div className="sheet__head"><h2>نقش‌ها و سطوح دسترسی</h2><span className="grow" />
        <button className="btn btn--sm btn--primary" onClick={() => { setErr(''); setF({ name: '', description: '', perms: new Set(['dashboard.view', 'products.view', 'parties.view', 'sales.view', 'inventory.view']) }); }}><Icon name="plus" size={15} />نقش جدید</button></div>
      <div className="sheet__body stack" style={{ gap: 8 }}>
        <div className="muted sm">نقش‌های آماده (مدیر، فروشنده، حسابدار، انباردار) همیشه هست. برای دسترسی دقیق‌تر، نقش دلخواه بسازید و به کاربر بدهید؛ مثلاً «فروشنده‌ی بدون دیدن قیمت خرید» یا «انباردار شعبه».</div>
        {!roles.data?.length ? <div className="muted">هنوز نقش دلخواهی نساخته‌اید.</div> : roles.data.map((r) => (
          <div key={r.id} className="row wrap" style={{ borderBottom: '2px dashed var(--line)', padding: '8px 0' }}>
            <span className="grow"><b>{r.name}</b> <span className="muted sm">— {toFa(r.permissions.length)} مجوز · {toFa(r._count?.users ?? 0)} کاربر</span>{r.description && <div className="muted sm">{r.description}</div>}</span>
            <button className="btn btn--sm" onClick={() => { setErr(''); setF({ id: r.id, name: r.name, description: r.description ?? '', perms: new Set(r.permissions) }); }}>ویرایش</button>
            <button className="btn btn--sm btn--danger" onClick={() => confirm(`نقش «${r.name}» حذف شود؟`) && del.mutate(r.id)}>حذف</button>
          </div>))}
      </div>
      {f && cat.data && <Modal title={f.id ? 'ویرایش نقش' : 'نقش جدید'} size="lg" onClose={() => setF(null)} footer={<><button className="btn btn--primary" disabled={!f.name.trim() || f.perms.size === 0 || save.isPending} onClick={() => { setErr(''); save.mutate(); }}>ذخیره</button><button className="btn" onClick={() => setF(null)}>انصراف</button></>}>
        <div className="stack">
          <div className="grid g3">
            <Field label="نام نقش" required><input className="input" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="توضیح"><input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
            <Field label="شروع از روی نقش آماده"><select className="select" value="" onChange={(e) => e.target.value && copyFrom(e.target.value)}><option value="">انتخاب…</option>{cat.data.systemRoles.map((s) => <option key={s.role} value={s.role}>{ROLES[s.role]}</option>)}</select></Field>
          </div>
          {groups.map((g) => {
            const items = cat.data.permissions.filter((p) => p.group === g); const all = items.every((p) => f.perms.has(p.key));
            return (
              <fieldset key={g} style={{ border: '2px solid var(--line-strong)', borderRadius: 8, padding: '8px 12px' }}>
                <legend style={{ padding: '0 6px' }}><label className="check"><input type="checkbox" checked={all} onChange={() => toggleGroup(g)} /><b>{g}</b></label></legend>
                <div className="grid g2">{items.map((p) => <label key={p.key} className="check"><input type="checkbox" checked={f.perms.has(p.key)} onChange={() => toggle(p.key)} />{p.label}</label>)}</div>
              </fieldset>);
          })}
          <div className="muted sm">فقط مجوزهایی را می‌توانید بدهید که خودتان دارید. داده‌های هر شعبه جدا از «دسترسی شعبه» کاربر کنترل می‌شود.</div>
          {err && <div className="callout red">{err}</div>}
        </div></Modal>}
    </section>
  );
}
