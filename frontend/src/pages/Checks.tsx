import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { Icon } from '../components/Icon';
import { DataTable, Pager, PageHead, Modal, Field, NumInput, Stamp, useUi, Empty } from '../components/ui';
import { JalaliDate } from '../components/JalaliDate';
import { PartyPicker } from '../components/PartyPicker';
import { Party } from '../lib/queries';
import { CHECK_STATUS, daysUntil, fmtDate, fmtMoney, toFa } from '../lib/format';
import { todayISO } from '../lib/jalali';

interface Chk { id: string; checkType: 'RECEIVED' | 'PAID'; checkNumber: string; bankName: string; amount: number; dueDate: string; status: string; party?: { name: string }; partyName?: string; bouncedReason?: string }
const BANKS = ['بانک ملی', 'بانک ملت', 'بانک صادرات', 'بانک تجارت', 'بانک سپه', 'بانک پاسارگاد', 'بانک پارسیان', 'بانک سامان', 'بانک مسکن', 'بانک کشاورزی', 'بانک رفاه', 'بانک آینده', 'بانک شهر', 'سایر'];

export default function Checks() {
  const qc = useQueryClient(); const { toast, confirm } = useUi();
  const [type, setType] = useState(''); const [status, setStatus] = useState('PENDING'); const [page, setPage] = useState(1);
  const [form, setForm] = useState(false); const [bounce, setBounce] = useState<Chk | null>(null); const [reason, setReason] = useState('');
  const [f, setF] = useState({ checkType: 'RECEIVED', checkNumber: '', bankName: BANKS[1], amount: '' as number | '', dueDate: todayISO() });
  const [party, setParty] = useState<Party | null>(null);
  const closeForm = () => { setForm(false); setParty(null); };
  const [err, setErr] = useState('');
  const params = { page, limit: 15, checkType: type || undefined, status: status || undefined };
  const { data, isLoading } = useQuery({ queryKey: ['checks', params], queryFn: async () => {
    if (status !== 'DUE') return api.get<Chk[]>('/checks', params);
    const r = await api.get<Chk[]>('/checks/due', { days: 7 });   // سررسید گذشته و ۷ روز آینده؛ بدون صفحه‌بندی
    return { ...r, data: type ? r.data.filter((c) => c.checkType === type) : r.data, meta: undefined };
  } });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['checks'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); qc.invalidateQueries({ queryKey: ['parties'] }); };

  const create = useMutation({ mutationFn: () => api.post('/checks', { ...f, amount: Number(f.amount), partyId: party?.id }), onSuccess: () => { toast('چک ثبت شد'); closeForm(); refresh(); }, onError: (e: ApiError) => setErr(e.message) });
  const cash = useMutation({ mutationFn: (id: string) => api.post(`/checks/${id}/cash`), onSuccess: () => { toast('چک وصول شد و حساب طرف‌حساب به‌روز شد'); refresh(); }, onError: (e: ApiError) => toast(e.message, 'error') });
  const doBounce = useMutation({ mutationFn: () => api.post(`/checks/${bounce!.id}/bounce`, { reason }), onSuccess: () => { toast('چک برگشت خورد'); setBounce(null); setReason(''); refresh(); }, onError: (e: ApiError) => toast(e.message, 'error') });
  const cancel = useMutation({ mutationFn: (id: string) => api.post(`/checks/${id}/cancel`), onSuccess: () => { toast('چک ابطال شد'); refresh(); } });

  return (
    <>
      <PageHead title="چک‌ها" sub="چک‌های دریافتی و پرداختی با تاریخ سررسید شمسی">
        <button className="btn btn--primary" onClick={() => { setErr(''); setForm(true); }}><Icon name="plus" size={18} />ثبت چک</button>
      </PageHead>
      <section className="sheet">
        <div className="filters">
          <Field label="نوع"><select className="select" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}><option value="">همه</option><option value="RECEIVED">دریافتی</option><option value="PAID">پرداختی</option></select></Field>
          <Field label="وضعیت"><select className="select" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">همه</option><option value="DUE">نزدیک سررسید و گذشته (۷ روز)</option>{Object.entries(CHECK_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Field>
        </div>
        <DataTable rows={data?.data} loading={isLoading} rowKey={(r) => r.id} empty={<Empty icon="cheque" title="چکی پیدا نشد" />}
          cols={[
            { key: 'due', title: 'سررسید', render: (r) => { const d = daysUntil(r.dueDate); return <div><b>{fmtDate(r.dueDate)}</b>{r.status === 'PENDING' && <div><Stamp tone={d < 0 ? 'red' : d <= 3 ? 'amber' : 'gray'}>{d < 0 ? `${toFa(-d)} روز گذشته` : d === 0 ? 'امروز' : `${toFa(d)} روز دیگر`}</Stamp></div>}</div>; } },
            { key: 't', title: 'نوع', render: (r) => <Stamp tone={r.checkType === 'RECEIVED' ? 'green' : 'blue'}>{r.checkType === 'RECEIVED' ? 'دریافتی' : 'پرداختی'}</Stamp> },
            { key: 'p', title: 'طرف‌حساب', render: (r) => r.party?.name ?? r.partyName ?? '—' },
            { key: 'b', title: 'بانک / شماره', render: (r) => <div>{r.bankName}<div><span className="sku">{r.checkNumber}</span></div></div> },
            { key: 's', title: 'وضعیت', render: (r) => <div><Stamp tone={CHECK_STATUS[r.status]?.tone}>{CHECK_STATUS[r.status]?.label}</Stamp>{r.bouncedReason && <div className="muted sm">{r.bouncedReason}</div>}</div> },
            { key: 'a', title: 'مبلغ (ریال)', num: true, render: (r) => <b>{fmtMoney(r.amount)}</b> },
            { key: 'x', title: '', className: 'actions', render: (r) => r.status !== 'PENDING' ? null : <span className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
              <button className="btn btn--sm btn--primary" onClick={async () => { if (await confirm(`چک ${r.checkNumber} به مبلغ ${fmtMoney(r.amount)} ریال وصول شد؟`, { ok: 'وصول شد' })) cash.mutate(r.id); }}><Icon name="check" size={15} />وصول</button>
              <button className="btn btn--sm btn--danger" onClick={() => setBounce(r)}>برگشت</button>
              <button className="btn btn--sm btn--icon" title="ابطال" onClick={async () => { if (await confirm('این چک ابطال شود؟', { danger: true, ok: 'ابطال' })) cancel.mutate(r.id); }}><Icon name="x" size={14} /></button></span> },
          ]} />
        <Pager meta={data?.meta} onPage={setPage} />
      </section>
      {form && <Modal title="ثبت چک" onClose={closeForm} footer={<><button className="btn btn--primary" disabled={!f.checkNumber || !f.amount || create.isPending} onClick={() => { setErr(''); create.mutate(); }}>ثبت</button><button className="btn" onClick={closeForm}>انصراف</button></>}>
        <div className="stack"><div className="grid g2">
          <Field label="نوع چک"><select className="select" value={f.checkType} onChange={(e) => { setF({ ...f, checkType: e.target.value }); setParty(null); }}><option value="RECEIVED">دریافتی (از مشتری)</option><option value="PAID">پرداختی (به تأمین‌کننده)</option></select></Field>
          <Field label="طرف‌حساب"><PartyPicker type={f.checkType === 'RECEIVED' ? 'CUSTOMER' : 'SUPPLIER'} value={party} onChange={setParty} /></Field>
          <Field label="شماره چک" required><input className="input input--num" value={f.checkNumber} onChange={(e) => setF({ ...f, checkNumber: e.target.value })} /></Field>
          <Field label="بانک"><select className="select" value={f.bankName} onChange={(e) => setF({ ...f, bankName: e.target.value })}>{BANKS.map((b) => <option key={b}>{b}</option>)}</select></Field>
          <Field label="مبلغ (ریال)" required><NumInput money value={f.amount} onChange={(v) => setF({ ...f, amount: v })} /></Field>
          <Field label="تاریخ سررسید" required><JalaliDate value={f.dueDate} onChange={(v) => setF({ ...f, dueDate: v })} /></Field>
        </div>{err && <div className="callout red">{err}</div>}</div></Modal>}
      {bounce && <Modal size="sm" title="برگشت چک" onClose={() => setBounce(null)} footer={<><button className="btn btn--danger" disabled={!reason.trim()} onClick={() => doBounce.mutate()}>ثبت برگشت</button><button className="btn" onClick={() => setBounce(null)}>انصراف</button></>}>
        <Field label="علت برگشت" required><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثلاً عدم موجودی" autoFocus /></Field></Modal>}
    </>
  );
}
