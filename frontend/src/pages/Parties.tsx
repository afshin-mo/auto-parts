import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { Icon } from '../components/Icon';
import { DataTable, Pager, PageHead, Modal, Field, NumInput, Stamp, useDebounced, useUi, Empty } from '../components/ui';
import { useAuth } from '../lib/auth';
import { Party } from '../lib/queries';
import { fmtMoney } from '../lib/format';
import { RemindModal } from '../components/RemindModal';
import { useSmsSettings } from '../lib/integrations';

function PartyForm({ party, type, onClose }: { party?: Party; type: 'CUSTOMER' | 'SUPPLIER'; onClose: () => void }) {
  const qc = useQueryClient(); const { toast } = useUi();
  const [f, setF] = useState({ name: party?.name ?? '', mobile: party?.mobile ?? '', phone: party?.phone ?? '', city: party?.city ?? '', address: party?.address ?? '', nationalId: party?.nationalId ?? '', economicCode: party?.economicCode ?? '', notes: party?.notes ?? '', creditLimit: (party?.creditLimit ?? '') as number | '', discountPercent: (party?.discountPercent ?? '') as number | '', paymentTerms: (party?.paymentTerms ?? '') as number | '', openingBalance: (party?.openingBalance && Number(party.openingBalance) !== 0 ? Number(party.openingBalance) : '') as number | '' });
  const [errs, setErrs] = useState<string[]>([]);
  const set = (k: keyof typeof f, v: string | number) => setF((x) => ({ ...x, [k]: v }));
  const save = useMutation({
    mutationFn: () => { const body: Record<string, unknown> = {}; Object.entries(f).forEach(([k, v]) => { if (v !== '') body[k] = v; }); return party ? api.patch(`/parties/${party.id}`, body) : api.post('/parties', { ...body, partyType: type }); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['parties'] }); toast('ذخیره شد'); onClose(); }, onError: (e: ApiError) => setErrs([e.message, ...(e.details ?? [])]),
  });
  const cust = (party?.partyType ?? type) === 'CUSTOMER';
  return (
    <Modal title={party ? 'ویرایش طرف‌حساب' : cust ? 'مشتری جدید' : 'تأمین‌کننده جدید'} onClose={onClose}
      footer={<><button className="btn btn--primary" disabled={!f.name || save.isPending} onClick={() => { setErrs([]); save.mutate(); }}>ذخیره</button><button className="btn" onClick={onClose}>انصراف</button></>}>
      <div className="stack">
        <div className="grid g2">
          <Field label="نام" required className="span2"><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} autoFocus /></Field>
          <Field label="موبایل"><input className="input input--num" value={f.mobile} onChange={(e) => set('mobile', e.target.value)} /></Field>
          <Field label="تلفن"><input className="input input--num" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label="شهر"><input className="input" value={f.city} onChange={(e) => set('city', e.target.value)} /></Field>
          <Field label="کد ملی / شناسه ملی"><input className="input input--num" value={f.nationalId} onChange={(e) => set('nationalId', e.target.value)} /></Field>
          <Field label="نشانی" className="span2"><input className="input" value={f.address} onChange={(e) => set('address', e.target.value)} /></Field>
        </div>
        {cust && <div className="grid g3">
          <Field label="مانده‌ی اول دوره (ریال)" hint={cust ? 'مثبت = مشتری به ما بدهکار است؛ منفی = ما به او بدهکاریم' : 'مثبت = ما به او بدهکاریم؛ منفی = او به ما بدهکار است'}><NumInput money allowNegative value={f.openingBalance} onChange={(v) => set('openingBalance', v)} /></Field>
          <Field label="سقف اعتبار (ریال)" hint="۰ = بدون محدودیت"><NumInput money value={f.creditLimit} onChange={(v) => set('creditLimit', v)} /></Field>
          <Field label="تخفیف پیش‌فرض ٪"><NumInput decimals value={f.discountPercent} onChange={(v) => set('discountPercent', v === '' ? '' : Math.min(100, v))} /></Field>
          <Field label="مهلت پرداخت (روز)"><NumInput value={f.paymentTerms} onChange={(v) => set('paymentTerms', v)} /></Field>
        </div>}
        <Field label="یادداشت"><textarea className="textarea" style={{ minHeight: 56 }} value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
        {errs.length > 0 && <div className="callout red">{errs.map((m) => <div key={m}>{m}</div>)}</div>}
      </div>
    </Modal>
  );
}

export default function Parties() {
  const nav = useNavigate(); const { has } = useAuth(); const { confirm, toast } = useUi(); const qc = useQueryClient();
  const [type, setType] = useState<'CUSTOMER' | 'SUPPLIER'>('CUSTOMER');
  const [page, setPage] = useState(1); const [search, setSearch] = useState(''); const [debtors, setDebtors] = useState(false);
  const [form, setForm] = useState<{ p?: Party } | null>(null);
  const [remind, setRemind] = useState(false);
  const { data: sms } = useSmsSettings();
  const dq = useDebounced(search);
  const params = { page, limit: 15, partyType: type, search: dq || undefined, withBalance: debtors || undefined, sortBy: 'name', sortOrder: 'asc' };
  const { data, isLoading } = useQuery({ queryKey: ['parties', params], queryFn: () => api.get<Party[]>('/parties', params) });
  const del = useMutation({ mutationFn: (id: string) => api.del(`/parties/${id}`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['parties'] }); toast('حذف شد'); }, onError: (e: ApiError) => toast(e.message, 'error') });
  const cust = type === 'CUSTOMER';

  return (
    <>
      <PageHead title="طرف‌حساب‌ها" sub="مشتریان و تأمین‌کنندگان به‌همراه مانده حساب">
        {type === 'CUSTOMER' && sms?.enabled && has('sms.remind') && <button className="btn" onClick={() => setRemind(true)}>یادآوری بدهی با پیامک</button>}
        <button className="btn btn--primary" onClick={() => setForm({})}><Icon name="plus" size={18} />{cust ? 'مشتری جدید' : 'تأمین‌کننده جدید'}</button>
      </PageHead>
      <div className="tabs">{(['CUSTOMER', 'SUPPLIER'] as const).map((t) => <button key={t} className={`tab ${type === t ? 'on' : ''}`} onClick={() => { setType(t); setPage(1); }}>{t === 'CUSTOMER' ? 'مشتریان' : 'تأمین‌کنندگان'}</button>)}</div>
      <section className="sheet" style={{ borderTop: 0 }}>
        <div className="filters">
          <Field className="search" label="جستجو"><input className="input" placeholder="نام، کد یا شماره تماس" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></Field>
          <label className="check" style={{ height: 42 }}><input type="checkbox" checked={debtors} onChange={(e) => { setDebtors(e.target.checked); setPage(1); }} />فقط دارای مانده حساب</label>
        </div>
        <DataTable rows={data?.data} loading={isLoading} rowKey={(r) => r.id} onRow={(r) => nav(`/parties/${r.id}`)} empty={<Empty icon="users" title="طرف‌حسابی پیدا نشد" />} rowClass={(r) => (r.isActive ? '' : 'dim')}
          cols={[
            { key: 'c', title: 'کد', render: (r) => <span className="sku">{r.code}</span> },
            { key: 'n', title: 'نام', render: (r) => <div><div className="strong">{r.name}</div><div className="muted sm">{r.city}</div></div> },
            { key: 'm', title: 'تماس', render: (r) => <span className="ltr">{r.mobile || r.phone || '—'}</span> },
            { key: 'b', title: cust ? 'مانده (بدهکار +)' : 'مانده (بدهکاریم +)', num: true, render: (r) => r.currentBalance === 0 ? <span className="muted">—</span> : <span className={`strong ${r.currentBalance > 0 ? 't-neg' : 't-pos'}`}>{fmtMoney(Math.abs(r.currentBalance))} {r.currentBalance < 0 && <Stamp tone="green">بستانکار</Stamp>}</span> },
            { key: 'a', title: '', className: 'actions', render: (r) => <span onClick={(e) => e.stopPropagation()}>
              {has('parties.edit') && <button className="btn btn--sm btn--icon" onClick={() => setForm({ p: r })}><Icon name="edit" size={15} /></button>}{' '}
              {has('parties.delete') && <button className="btn btn--sm btn--icon btn--danger" onClick={async () => { if (await confirm(`«${r.name}» حذف شود؟`, { danger: true, ok: 'حذف' })) del.mutate(r.id); }}><Icon name="trash" size={15} /></button>}</span> },
          ]} />
        <Pager meta={data?.meta} onPage={setPage} />
      </section>
      {remind && <RemindModal onClose={() => setRemind(false)} />}
      {form && <PartyForm party={form.p} type={type} onClose={() => setForm(null)} />}
    </>
  );
}
