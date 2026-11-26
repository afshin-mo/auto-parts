import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { Icon } from '../components/Icon';
import { DataTable, Pager, PageHead, Modal, Field, NumInput, Stamp, useUi, Empty } from '../components/ui';
import { JalaliDate } from '../components/JalaliDate';
import { PAY_METHOD, fmtCompact, fmtDate, fmtMoney, toFa } from '../lib/format';
import { currentMonthStartISO, todayISO } from '../lib/jalali';
import { useAuth } from '../lib/auth';

interface W { id: string; personName: string; amount: number; date: string; method: string; description?: string }
interface Summary { total: number; people: { personName: string; total: number; count: number }[] }

export default function Withdrawals() {
  const qc = useQueryClient(); const { toast, confirm } = useUi(); const { has } = useAuth();
  const manage = has('withdrawals.manage');
  const [from, setFrom] = useState(currentMonthStartISO()); const [to, setTo] = useState(todayISO());
  const [person, setPerson] = useState(''); const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false); const [err, setErr] = useState('');
  const [f, setF] = useState({ personName: '', amount: '' as number | '', date: todayISO(), method: 'CASH', description: '' });
  const params = { from, to, personName: person || undefined };
  const list = useQuery({ queryKey: ['withdrawals', params, page], queryFn: () => api.get<W[]>('/withdrawals', { ...params, page, limit: 15 }) });
  const sum = useQuery({ queryKey: ['withdrawals-sum', from, to], queryFn: async () => (await api.get<Summary>('/withdrawals/summary', { from, to })).data });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['withdrawals'] }); qc.invalidateQueries({ queryKey: ['withdrawals-sum'] }); };

  const save = useMutation({
    mutationFn: () => api.post('/withdrawals', { personName: f.personName.trim(), amount: Number(f.amount), date: f.date, method: f.method, description: f.description || undefined }),
    onSuccess: () => { toast('برداشت ثبت شد'); setOpen(false); setF({ ...f, personName: '', amount: '', description: '' }); refresh(); }, onError: (e: ApiError) => setErr(e.message),
  });
  const del = useMutation({ mutationFn: (id: string) => api.del(`/withdrawals/${id}`), onSuccess: () => { toast('حذف شد'); refresh(); } });
  const max = Math.max(...(sum.data?.people.map((p) => p.total) ?? [1]), 1);

  return (
    <>
      <PageHead title="برداشت از حساب فروشگاه" sub="برداشت شرکا، کارمندان و صاحب فروشگاه؛ سابقه‌ی هر شخص ثبت می‌شود و در سود و زیان فروشگاه حساب نمی‌شود">
        {manage && <button className="btn btn--primary" onClick={() => { setErr(''); setOpen(true); }}><Icon name="plus" size={18} />ثبت برداشت</button>}
      </PageHead>
      <div className="signs" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        <div className="sign sign--red"><div className="sign__in"><span className="sign__label">جمع برداشت‌ها در بازه</span><span className="sign__value num">{fmtCompact(sum.data?.total ?? 0)}<small>ریال</small></span></div></div>
        <div className="sign sign--dark"><div className="sign__in"><span className="sign__label">بیشترین برداشت</span><span className="sign__value" style={{ fontSize: 26 }}>{sum.data?.people[0]?.personName ?? '—'}</span><span className="sign__sub">{sum.data?.people[0] ? `${fmtMoney(sum.data.people[0].total)} ریال` : ''}</span></div></div>
        <div className="sign sign--blue"><div className="sign__in"><span className="sign__label">تعداد برداشت‌ها</span><span className="sign__value num">{toFa(sum.data?.people.reduce((s, p) => s + p.count, 0) ?? 0)}</span></div></div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)', alignItems: 'start' }}>
        <section className="sheet">
          <div className="filters">
            <Field label="از تاریخ"><JalaliDate value={from} onChange={(v) => { v && setFrom(v); setPage(1); }} /></Field>
            <Field label="تا تاریخ"><JalaliDate value={to} onChange={(v) => { v && setTo(v); setPage(1); }} /></Field>
            <Field label="شخص"><select className="select" value={person} onChange={(e) => { setPerson(e.target.value); setPage(1); }}><option value="">همه</option>{sum.data?.people.map((p) => <option key={p.personName}>{p.personName}</option>)}</select></Field>
          </div>
          <DataTable rows={list.data?.data} loading={list.isLoading} rowKey={(r) => r.id} empty={<Empty icon="wallet" title="برداشتی در این بازه نیست" />}
            cols={[
              { key: 'd', title: 'تاریخ', render: (r) => fmtDate(r.date) },
              { key: 'p', title: 'شخص', render: (r) => <Stamp tone="gray">{r.personName}</Stamp> },
              { key: 'm', title: 'روش', render: (r) => PAY_METHOD[r.method] },
              { key: 'n', title: 'توضیح', render: (r) => <span className="muted sm">{r.description ?? ''}</span> },
              { key: 'a', title: 'مبلغ (ریال)', num: true, render: (r) => <b>{fmtMoney(r.amount)}</b> },
              ...(manage ? [{ key: 'x', title: '', className: 'actions', render: (r: W) => <button className="btn btn--sm btn--icon btn--danger" onClick={async () => { if (await confirm('این برداشت حذف شود؟', { danger: true, ok: 'حذف' })) del.mutate(r.id); }}><Icon name="trash" size={15} /></button> }] : []),
            ]} />
          <Pager meta={list.data?.meta} onPage={setPage} />
        </section>
        <section className="sheet"><div className="sheet__head"><h2>جمع برداشت هر شخص</h2></div>
          <div className="sheet__body stack" style={{ gap: 12 }}>
            {!sum.data?.people.length && <div className="muted">داده‌ای نیست</div>}
            {sum.data?.people.map((p) => (
              <div key={p.personName}><div className="row"><button className="grow strong" style={{ textAlign: 'start', background: 'none', border: 0, cursor: 'pointer', padding: 0 }} onClick={() => { setPerson(p.personName); setPage(1); }}>{p.personName} <span className="muted sm">({toFa(p.count)} بار)</span></button><b className="num sm">{fmtMoney(p.total)}</b></div>
                <div className="hbar"><i style={{ width: `${(p.total / max) * 100}%`, background: 'var(--alert)' }} /></div></div>))}
          </div>
        </section>
      </div>
      {open && <Modal size="sm" title="ثبت برداشت از حساب فروشگاه" onClose={() => setOpen(false)} footer={<><button className="btn btn--primary" disabled={!f.personName.trim() || !f.amount || save.isPending} onClick={() => { setErr(''); save.mutate(); }}>ثبت</button><button className="btn" onClick={() => setOpen(false)}>انصراف</button></>}>
        <div className="stack">
          <Field label="نام شخص (شریک، کارمند یا صاحب فروشگاه)" required><input className="input" list="wd-people" value={f.personName} maxLength={120} onChange={(e) => setF({ ...f, personName: e.target.value })} autoFocus /><datalist id="wd-people">{sum.data?.people.map((p) => <option key={p.personName} value={p.personName} />)}</datalist></Field>
          <Field label="مبلغ (ریال)" required><NumInput money value={f.amount} onChange={(v) => setF({ ...f, amount: v })} /></Field>
          <div className="grid g2">
            <Field label="تاریخ"><JalaliDate value={f.date} onChange={(v) => setF({ ...f, date: v })} /></Field>
            <Field label="روش"><select className="select" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>{Object.entries(PAY_METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          </div>
          <Field label="توضیح"><input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          <div className="muted sm">این برداشت در گزارش سود و زیان فروشگاه کسر نمی‌شود.</div>
          {err && <div className="callout red">{err}</div>}
        </div></Modal>}
    </>
  );
}
