import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { Icon } from './Icon';
import { Field, Modal, useDebounced, useOutside, useUi } from './ui';
import { useAuth } from '../lib/auth';
import { Party } from '../lib/queries';
import { fmtMoney } from '../lib/format';

export function PartyPicker({ type, value, onChange, required }: { type: 'CUSTOMER' | 'SUPPLIER'; value: Party | null; onChange: (p: Party | null) => void; required?: boolean }) {
  const [q, setQ] = useState(''); const [open, setOpen] = useState(false); const [creating, setCreating] = useState(false);
  const { has } = useAuth();
  const dq = useDebounced(q); const ref = useRef<HTMLDivElement>(null); useOutside(ref, () => setOpen(false));
  const { data } = useQuery({ queryKey: ['partypick', type, dq], queryFn: async () => (await api.get<Party[]>('/parties', { partyType: type, search: dq || undefined, limit: 8 })).data, enabled: open });
  if (value) return (
    <div className="callout blue">
      <div className="row"><b className="grow">{value.name}</b><button className="btn btn--sm btn--icon" onClick={() => onChange(null)} aria-label="تغییر"><Icon name="x" size={14} /></button></div>
      <div className="sm">مانده حساب: <b className={value.currentBalance > 0 ? 't-neg' : 't-pos'}>{fmtMoney(Math.abs(value.currentBalance))}</b> {value.currentBalance > 0 ? (type === 'CUSTOMER' ? 'بدهکار' : 'بدهکاریم') : value.currentBalance < 0 ? 'بستانکار' : ''}
        {value.creditLimit ? <> | سقف اعتبار {fmtMoney(value.creditLimit)}</> : null}</div>
    </div>
  );
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input className="input" placeholder={type === 'CUSTOMER' ? (required ? 'جستجوی مشتری…' : 'جستجوی مشتری… (خالی = مشتری متفرقه)') : 'جستجوی تأمین‌کننده…'} value={q} onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); }} />
      {open && <div className="hits" style={{ position: 'absolute', insetInline: 0, zIndex: 30 }}>
        {data?.length === 0 && <div className="muted" style={{ padding: 12 }}>موردی نیست</div>}
        {has('parties.create') && <button className="hit" onClick={() => { setCreating(true); setOpen(false); }}><Icon name="plus" size={15} /><span className="hit__name">{type === 'CUSTOMER' ? 'مشتری' : 'تأمین‌کننده'} جدید{q ? ` «${q}»` : ''}</span></button>}
        {data?.map((p) => <button key={p.id} className="hit" onClick={() => { onChange(p); setOpen(false); setQ(''); }}><span className="hit__name">{p.name}</span><span className="muted sm">{p.mobile}</span></button>)}
      </div>}
      {creating && <QuickParty type={type} name={q} onClose={() => setCreating(false)} onDone={(p) => { setCreating(false); setQ(''); onChange(p); }} />}
    </div>
  );
}

/** ثبت سریع طرف‌حساب وسط فاکتور: فقط نام و موبایل */
function QuickParty({ type, name: n0, onClose, onDone }: { type: 'CUSTOMER' | 'SUPPLIER'; name: string; onClose: () => void; onDone: (p: Party) => void }) {
  const qc = useQueryClient(); const { toast } = useUi();
  const [name, setName] = useState(n0); const [mobile, setMobile] = useState(''); const [err, setErr] = useState('');
  const save = useMutation({
    mutationFn: async () => (await api.post<Party>('/parties', { partyType: type, name: name.trim(), mobile: mobile.trim() || undefined })).data,
    onSuccess: (p) => { qc.invalidateQueries({ queryKey: ['parties'] }); toast('ثبت شد'); onDone(p); },
    onError: (e: ApiError) => setErr([e.message, ...(e.details ?? [])].join(' — ')),
  });
  return (
    <Modal size="sm" title={type === 'CUSTOMER' ? 'مشتری جدید' : 'تأمین‌کننده جدید'} onClose={onClose}
      footer={<><button className="btn btn--primary" disabled={!name.trim() || save.isPending} onClick={() => save.mutate()}>ذخیره و انتخاب</button><button className="btn" onClick={onClose}>انصراف</button></>}>
      <div className="stack" onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) { e.preventDefault(); save.mutate(); } }}>
        <Field label="نام" required><input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="موبایل"><input className="input input--num" inputMode="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} /></Field>
        {err && <div className="callout red">{err}</div>}
      </div>
    </Modal>
  );
}
