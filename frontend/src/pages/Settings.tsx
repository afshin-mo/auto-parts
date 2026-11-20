import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { PageHead, Modal, Field, Stamp, useUi, Loading, Pager, DataTable } from '../components/ui';
import { useAuth } from '../lib/auth';
import { ROLES, fmtDate, fmtTime, toFa } from '../lib/format';
import { auditLabel } from '../lib/audit';
import { MoodianSettings } from '../components/MoodianSettings';
import { SmsSettingsCard } from '../components/IntegrationSettings';
import { BranchesCard, RolesCard, useBranchList, useRoleList } from '../components/AccessSettings';

interface Tenant { name: string; ownerName?: string; city?: string; address?: string; phone?: string; economicCode?: string; nationalId?: string; planType: string; planStatus: string; trialEndDate?: string; maxProducts: number; maxUsers: number; maxBranches?: number; settings?: { costMethod?: string }; usage: { products: number; users: number } }
interface U { id: string; name: string; phone: string; role: string; roleId?: string | null; roleName?: string | null; allBranches?: boolean; branchIds?: string[]; defaultBranchId?: string | null; isActive: boolean; lastLoginAt?: string }
const ASSIGN = ['TENANT_ADMIN', 'MANAGER', 'SALESMAN', 'ACCOUNTANT', 'WAREHOUSE'];

export default function Settings() {
  const { user, has } = useAuth(); const qc = useQueryClient(); const { toast } = useUi(); const admin = has('settings.manage'); const manageUsers = has('users.manage');
  const t = useQuery({ queryKey: ['tenant'], queryFn: async () => (await api.get<Tenant>('/tenants/current')).data });
  const users = useQuery({ queryKey: ['users'], enabled: has('users.view'), queryFn: async () => (await api.get<U[]>('/users')).data });
  const roleList = useRoleList(manageUsers); const branchList = useBranchList();
  const [f, setF] = useState<Partial<Tenant>>({}); const [uf, setUf] = useState<null | { u?: U }>(null); const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const BLANK = { name: '', phone: '', password: '', role: 'SALESMAN', roleId: '', allBranches: true, branchIds: [] as string[], defaultBranchId: '' };
  const [nu, setNu] = useState(BLANK); const [err, setErr] = useState('');
  const [rp, setRp] = useState<null | { u: U; password: string }>(null);
  useEffect(() => { if (t.data) setF(t.data); }, [t.data]);
  const [apage, setApage] = useState(1);
  const audit = useQuery({ queryKey: ['audit', apage], enabled: has('audit.view'), queryFn: () => api.get<{ id: string; userName?: string; action: string; entityType: string; createdAt: string }[]>('/audit', { page: apage, limit: 12 }) });

  const saveShop = useMutation({ mutationFn: () => api.patch('/tenants/current', { name: f.name, ownerName: f.ownerName, city: f.city, address: f.address, phone: f.phone, economicCode: f.economicCode, nationalId: f.nationalId }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['tenant'] }); toast('تنظیمات ذخیره شد'); }, onError: (e: ApiError) => toast(e.message, 'error') });
  const saveCost = useMutation({ mutationFn: (avg: boolean) => api.patch('/tenants/current', { settings: { costMethod: avg ? 'AVERAGE' : 'SPECIFIC' } }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['tenant'] }); toast('ذخیره شد'); }, onError: (e: ApiError) => toast(e.message, 'error') });
  const changePw = useMutation({ mutationFn: () => api.post('/auth/change-password', pw), onSuccess: () => { toast('رمز عبور تغییر کرد'); setPw({ currentPassword: '', newPassword: '' }); }, onError: (e: ApiError) => toast(e.message, 'error') });
  const saveUser = useMutation({ mutationFn: () => {
    const access = { roleId: nu.roleId || null, allBranches: nu.allBranches, branchIds: nu.allBranches ? [] : nu.branchIds, defaultBranchId: nu.defaultBranchId || null };
    return uf?.u ? api.patch(`/users/${uf.u.id}`, { role: nu.role, name: nu.name, ...access }) : api.post('/users', { ...nu, ...access });
  }, onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); qc.invalidateQueries({ queryKey: ['roles'] }); qc.invalidateQueries({ queryKey: ['branches-admin'] }); qc.invalidateQueries({ queryKey: ['tenant'] }); toast('ذخیره شد'); setUf(null); }, onError: (e: ApiError) => setErr([e.message, ...(e.details ?? [])].join(' — ')) });
  const resetPw = useMutation({ mutationFn: () => api.post(`/users/${rp!.u.id}/reset-password`, { password: rp!.password }), onSuccess: () => { toast('رمز جدید تنظیم شد؛ آن را به کاربر اطلاع دهید'); setRp(null); }, onError: (e: ApiError) => toast(e.message, 'error') });
  const toggle = useMutation({ mutationFn: (u: U) => api.patch(`/users/${u.id}`, { isActive: !u.isActive }), onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }), onError: (e: ApiError) => toast(e.message, 'error') });
  const set = (k: keyof Tenant) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  if (!t.data) return <Loading />;

  return (
    <>
      <PageHead title="تنظیمات" sub="مشخصات فروشگاه، کاربران و امنیت حساب" />
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)', alignItems: 'start' }}>
        <div className="stack">
          <section className="sheet"><div className="sheet__head"><h2>مشخصات فروشگاه</h2></div><div className="sheet__body stack">
            <div className="grid g2">
              <Field label="نام فروشگاه"><input className="input" disabled={!admin} value={f.name ?? ''} onChange={set('name')} /></Field>
              <Field label="نام مالک"><input className="input" disabled={!admin} value={f.ownerName ?? ''} onChange={set('ownerName')} /></Field>
              <Field label="شهر"><input className="input" disabled={!admin} value={f.city ?? ''} onChange={set('city')} /></Field>
              <Field label="تلفن"><input className="input input--num" disabled={!admin} value={f.phone ?? ''} onChange={set('phone')} /></Field>
              <Field label="شناسه ملی"><input className="input input--num" disabled={!admin} value={f.nationalId ?? ''} onChange={set('nationalId')} /></Field>
              <Field label="کد اقتصادی"><input className="input input--num" disabled={!admin} value={f.economicCode ?? ''} onChange={set('economicCode')} /></Field>
              <Field label="نشانی (روی فاکتور چاپ می‌شود)" className="span2"><input className="input" disabled={!admin} value={f.address ?? ''} onChange={set('address')} /></Field>
            </div>
            {admin && <div><button className="btn btn--primary" disabled={saveShop.isPending} onClick={() => saveShop.mutate()}>ذخیره</button></div>}
          </div></section>

          <section className="sheet"><div className="sheet__head"><h2>بهای تمام‌شده‌ی فروش</h2></div><div className="sheet__body stack" style={{ gap: 8 }}>
            <label className="check"><input type="checkbox" disabled={!admin || saveCost.isPending} checked={t.data.settings?.costMethod === 'AVERAGE'} onChange={(e) => saveCost.mutate(e.target.checked)} />استفاده از میانگین موزون قیمت خرید</label>
            <div className="muted sm">خاموش (پیش‌فرض): هنگام فروش کالایی که با چند قیمت در انبار است، قیمت خرید را انتخاب می‌کنید و سود با همان قیمت حساب می‌شود. روشن: قیمتی پرسیده نمی‌شود و سود با میانگین موزون قیمت‌های موجود حساب می‌شود.</div>
          </div></section>

          {has('users.view') && <section className="sheet"><div className="sheet__head"><h2>کاربران</h2><span className="grow" />{manageUsers && <button className="btn btn--sm btn--primary" onClick={() => { setErr(''); setNu(BLANK); setUf({}); }}>کاربر جدید</button>}</div>
            <div className="tbl-wrap"><table className="tbl"><thead><tr><th>نام</th><th>موبایل</th><th>نقش</th><th>شعبه</th><th>آخرین ورود</th><th /></tr></thead>
              <tbody>{users.data?.map((u) => <tr key={u.id} className={u.isActive ? '' : 'dim'}><td className="strong">{u.name}{u.id === user?.id && <span className="muted sm"> (شما)</span>}</td><td className="ltr">{u.phone}</td><td><Stamp tone={u.role === 'TENANT_ADMIN' ? 'green' : 'gray'}>{u.roleName ?? ROLES[u.role]}</Stamp></td><td className="muted sm">{u.allBranches === false ? (u.branchIds ?? []).map((id) => branchList.data?.find((b) => b.id === id)?.name).filter(Boolean).join('، ') : 'همه'}</td><td className="muted sm">{u.lastLoginAt ? fmtDate(u.lastLoginAt) : '—'}</td>
                <td className="actions">{manageUsers && u.id !== user?.id && <><button className="btn btn--sm" onClick={() => { setErr(''); setNu({ name: u.name, phone: u.phone, password: '', role: u.role, roleId: u.roleId ?? '', allBranches: u.allBranches !== false, branchIds: u.branchIds ?? [], defaultBranchId: u.defaultBranchId ?? '' }); setUf({ u }); }}>دسترسی</button>{' '}{(u.role !== 'TENANT_ADMIN' || user?.role === 'TENANT_ADMIN') && <><button className="btn btn--sm" onClick={() => setRp({ u, password: '' })}>رمز جدید</button>{' '}</>}<button className={`btn btn--sm ${u.isActive ? 'btn--danger' : ''}`} onClick={() => toggle.mutate(u)}>{u.isActive ? 'غیرفعال' : 'فعال‌سازی'}</button></>}</td></tr>)}</tbody></table></div></section>}
        </div>

        <div className="stack">
          {has('audit.view') && <section className="sheet"><div className="sheet__head"><h2>گزارش فعالیت کاربران</h2></div>
            <DataTable rows={audit.data?.data} loading={audit.isLoading} rowKey={(r) => r.id} empty={<div className="empty">فعالیتی ثبت نشده</div>}
              cols={[
                { key: 't', title: 'زمان', render: (r) => <div>{fmtDate(r.createdAt)}<div className="muted sm">{fmtTime(r.createdAt)}</div></div> },
                { key: 'u', title: 'کاربر', render: (r) => r.userName ?? '—' },
                { key: 'a', title: 'عملیات', render: (r) => <b>{auditLabel(r.action)}</b> },
              ]} />
            <Pager meta={audit.data?.meta} onPage={setApage} /></section>}
          <section className="sheet"><div className="sheet__head"><h2>طرح اشتراک</h2></div><div className="sheet__body stack" style={{ gap: 10 }}>
            <div className="row"><Stamp tone="blue">{t.data.planType}</Stamp><Stamp tone={t.data.planStatus === 'ACTIVE' ? 'green' : 'amber'}>{t.data.planStatus === 'TRIAL' ? 'آزمایشی' : t.data.planStatus === 'ACTIVE' ? 'فعال' : t.data.planStatus}</Stamp>{t.data.trialEndDate && <span className="muted sm">تا {fmtDate(t.data.trialEndDate)}</span>}</div>
            <div><div className="row sm"><span className="grow">کالاها</span><b>{toFa(t.data.usage.products)} از {toFa(t.data.maxProducts)}</b></div><div className="hbar"><i style={{ width: `${Math.min(100, (t.data.usage.products / t.data.maxProducts) * 100)}%` }} /></div></div>
            <div><div className="row sm"><span className="grow">کاربران</span><b>{toFa(t.data.usage.users)} از {toFa(t.data.maxUsers)}</b></div><div className="hbar"><i style={{ width: `${Math.min(100, (t.data.usage.users / t.data.maxUsers) * 100)}%` }} /></div></div>
          </div></section>
          <section className="sheet"><div className="sheet__head"><h2>تغییر رمز عبور</h2></div><div className="sheet__body stack">
            <Field label="رمز فعلی"><input className="input input--num" type="password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /></Field>
            <Field label="رمز جدید" hint="حداقل ۶ کاراکتر"><input className="input input--num" type="password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /></Field>
            <div><button className="btn btn--primary" disabled={!pw.currentPassword || pw.newPassword.length < 6 || changePw.isPending} onClick={() => changePw.mutate()}>تغییر رمز</button></div>
          </div></section>
        </div>
      </div>
      {(has('branches.manage') || has('roles.manage')) && <div className="stack" style={{ marginTop: 16 }}>{has('branches.manage') && <BranchesCard maxBranches={t.data.maxBranches} />}{has('roles.manage') && <RolesCard />}</div>}
      {admin && <div className="stack" style={{ marginTop: 16 }}><MoodianSettings /><SmsSettingsCard /></div>}
      {rp && <Modal size="sm" title={`رمز جدید برای ${rp.u.name}`} onClose={() => setRp(null)} footer={<><button className="btn btn--primary" disabled={rp.password.length < 6 || resetPw.isPending} onClick={() => resetPw.mutate()}>تنظیم رمز</button><button className="btn" onClick={() => setRp(null)}>انصراف</button></>}>
        <Field label="رمز جدید" hint="حداقل ۶ کاراکتر"><input className="input input--num" type="password" autoFocus value={rp.password} onChange={(e) => setRp({ ...rp, password: e.target.value })} /></Field></Modal>}
      {uf && <Modal size="sm" title={uf.u ? 'ویرایش نقش کاربر' : 'کاربر جدید'} onClose={() => setUf(null)} footer={<><button className="btn btn--primary" disabled={saveUser.isPending || !nu.name || (!uf.u && (!nu.phone || nu.password.length < 6))} onClick={() => { setErr(''); saveUser.mutate(); }}>ذخیره</button><button className="btn" onClick={() => setUf(null)}>انصراف</button></>}>
        <div className="stack"><Field label="نام" required><input className="input" value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} /></Field>
          {!uf.u && <><Field label="موبایل" required><input className="input input--num" value={nu.phone} onChange={(e) => setNu({ ...nu, phone: e.target.value })} /></Field>
            <Field label="رمز عبور" required hint="حداقل ۶ کاراکتر"><input className="input input--num" type="password" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} /></Field></>}
          <Field label="نقش" hint="نقش‌های دلخواه را از بخش «نقش‌ها و سطوح دسترسی» می‌سازید">
            <select className="select" value={nu.roleId ? `c:${nu.roleId}` : `s:${nu.role}`} onChange={(e) => { const [k, v] = [e.target.value[0], e.target.value.slice(2)]; setNu(k === 'c' ? { ...nu, roleId: v } : { ...nu, roleId: '', role: v }); }}>
              <optgroup label="نقش‌های آماده">{ASSIGN.map((r) => <option key={r} value={`s:${r}`}>{ROLES[r]}</option>)}</optgroup>
              {!!roleList.data?.length && <optgroup label="نقش‌های دلخواه">{roleList.data.map((r) => <option key={r.id} value={`c:${r.id}`}>{r.name}</option>)}</optgroup>}
            </select></Field>
          {(branchList.data?.length ?? 0) > 1 && <>
            <label className="check"><input type="checkbox" checked={nu.allBranches} onChange={(e) => setNu({ ...nu, allBranches: e.target.checked })} />دسترسی به همه‌ی شعبه‌ها</label>
            {!nu.allBranches && <div className="stack" style={{ gap: 4 }}>{branchList.data?.filter((b) => b.isActive).map((b) => <label key={b.id} className="check"><input type="checkbox" checked={nu.branchIds.includes(b.id)} onChange={(e) => setNu({ ...nu, branchIds: e.target.checked ? [...nu.branchIds, b.id] : nu.branchIds.filter((x) => x !== b.id) })} />{b.name}</label>)}
              <Field label="شعبه‌ی پیش‌فرض"><select className="select" value={nu.defaultBranchId} onChange={(e) => setNu({ ...nu, defaultBranchId: e.target.value })}><option value="">اولین شعبه</option>{branchList.data?.filter((b) => nu.branchIds.includes(b.id)).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field></div>}
          </>}
          {err && <div className="callout red">{err}</div>}</div></Modal>}
    </>
  );
}
