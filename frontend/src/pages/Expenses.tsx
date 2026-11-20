import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { Icon } from '../components/Icon';
import { DataTable, Pager, PageHead, Modal, Field, NumInput, Stamp, useUi, Empty } from '../components/ui';
import { JalaliDate } from '../components/JalaliDate';
import { PAY_METHOD, fmtCompact, fmtDate, fmtMoney, toFa } from '../lib/format';
import { currentMonthStartISO, todayISO } from '../lib/jalali';

interface Exp { id: string; category: string; amount: number; date: string; method: string; description?: string }
const SUGGEST = ['اجاره', 'حقوق و دستمزد', 'برق، آب و گاز', 'حمل‌ونقل', 'تبلیغات', 'تعمیر و نگهداری', 'اینترنت و تلفن', 'مالیات و عوارض', 'ناهار و پذیرایی', 'متفرقه'];

export default function Expenses() {
  const qc = useQueryClient(); const { toast, confirm } = useUi();
  const [from, setFrom] = useState(currentMonthStartISO()); const [to, setTo] = useState(todayISO());
  const [cat, setCat] = useState(''); const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false); const [err, setErr] = useState('');
  const [f, setF] = useState({ category: '', amount: '' as number | '', date: todayISO(), method: 'CASH', description: '' });
  const params = { from, to, category: cat || undefined };
  const list = useQuery({ queryKey: ['expenses', params, page], queryFn: () => api.get<Exp[]>('/expenses', { ...params, page, limit: 15 }) });
  const sum = useQuery({ queryKey: ['expenses-sum', from, to], queryFn: async () => (await api.get<{ total: number; categories: { category: string; total: number; count: number }[] }>('/expenses/summary', { from, to })).data });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['expenses'] }); qc.invalidateQueries({ queryKey: ['expenses-sum'] }); qc.invalidateQueries({ queryKey: ['rep-profit'] }); };

  const save = useMutation({
    mutationFn: () => api.post('/expenses', { category: f.category.trim(), amount: Number(f.amount), date: f.date, method: f.method, description: f.description || undefined }),
    onSuccess: () => { toast('هزینه ثبت شد'); setOpen(false); setF({ ...f, category: '', amount: '', description: '' }); refresh(); }, onError: (e: ApiError) => setErr(e.message),
  });
  const del = useMutation({ mutationFn: (id: string) => api.del(`/expenses/${id}`), onSuccess: () => { toast('حذف شد'); refresh(); } });
  const max = Math.max(...(sum.data?.categories.map((c) => c.total) ?? [1]), 1);
  const top = sum.data?.categories[0];

  return (
    <>
      <PageHead title="هزینه‌ها" sub="اجاره، حقوق، قبض‌ها و سایر هزینه‌ها؛ در گزارش سود خالص کسر می‌شوند">
        <button className="btn btn--primary" onClick={() => { setErr(''); setOpen(true); }}><Icon name="plus" size={18} />ثبت هزینه</button>
      </PageHead>
      <div className="signs" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        <div className="sign sign--red"><div className="sign__in"><span className="sign__label">جمع هزینه‌ها در بازه</span><span className="sign__value num">{fmtCompact(sum.data?.total ?? 0)}<small>ریال</small></span></div></div>
        <div className="sign sign--dark"><div className="sign__in"><span className="sign__label">بیشترین هزینه</span><span className="sign__value" style={{ fontSize: 26 }}>{top?.category ?? '—'}</span><span className="sign__sub">{top ? `${fmtMoney(top.total)} ریال` : ''}</span></div></div>
        <div className="sign sign--blue"><div className="sign__in"><span className="sign__label">تعداد اقلام</span><span className="sign__value num">{toFa(sum.data?.categories.reduce((s, c) => s + c.count, 0) ?? 0)}</span></div></div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)', alignItems: 'start' }}>
        <section className="sheet">
          <div className="filters">
            <Field label="از تاریخ"><JalaliDate value={from} onChange={(v) => { v && setFrom(v); setPage(1); }} /></Field>
            <Field label="تا تاریخ"><JalaliDate value={to} onChange={(v) => { v && setTo(v); setPage(1); }} /></Field>
            <Field label="دسته"><select className="select" value={cat} onChange={(e) => { setCat(e.target.value); setPage(1); }}><option value="">همه</option>{sum.data?.categories.map((c) => <option key={c.category}>{c.category}</option>)}</select></Field>
          </div>
          <DataTable rows={list.data?.data} loading={list.isLoading} rowKey={(r) => r.id} empty={<Empty icon="wallet" title="هزینه‌ای در این بازه نیست" />}
            cols={[
              { key: 'd', title: 'تاریخ', render: (r) => fmtDate(r.date) },
              { key: 'c', title: 'دسته', render: (r) => <Stamp tone="gray">{r.category}</Stamp> },
              { key: 'm', title: 'روش', render: (r) => PAY_METHOD[r.method] },
              { key: 'n', title: 'توضیح', render: (r) => <span className="muted sm">{r.description ?? ''}</span> },
              { key: 'a', title: 'مبلغ (ریال)', num: true, render: (r) => <b>{fmtMoney(r.amount)}</b> },
              { key: 'x', title: '', className: 'actions', render: (r) => <button className="btn btn--sm btn--icon btn--danger" onClick={async () => { if (await confirm('این هزینه حذف شود؟', { danger: true, ok: 'حذف' })) del.mutate(r.id); }}><Icon name="trash" size={15} /></button> },
            ]} />
          <Pager meta={list.data?.meta} onPage={setPage} />
        </section>
        <section className="sheet"><div className="sheet__head"><h2>سهم هر دسته</h2></div>
          <div className="sheet__body stack" style={{ gap: 12 }}>
            {!sum.data?.categories.length && <div className="muted">داده‌ای نیست</div>}
            {sum.data?.categories.map((c) => (
              <div key={c.category}><div className="row"><span className="grow strong">{c.category}</span><b className="num sm">{fmtMoney(c.total)}</b></div>
                <div className="hbar"><i style={{ width: `${(c.total / max) * 100}%`, background: 'var(--alert)' }} /></div></div>))}
          </div>
        </section>
      </div>
      {open && <Modal size="sm" title="ثبت هزینه" onClose={() => setOpen(false)} footer={<><button className="btn btn--primary" disabled={!f.category.trim() || !f.amount || save.isPending} onClick={() => { setErr(''); save.mutate(); }}>ثبت</button><button className="btn" onClick={() => setOpen(false)}>انصراف</button></>}>
        <div className="stack">
          <Field label="دسته هزینه" required><input className="input" list="exp-cats" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} autoFocus /><datalist id="exp-cats">{SUGGEST.map((s) => <option key={s} value={s} />)}</datalist></Field>
          <Field label="مبلغ (ریال)" required><NumInput money value={f.amount} onChange={(v) => setF({ ...f, amount: v })} /></Field>
          <div className="grid g2">
            <Field label="تاریخ"><JalaliDate value={f.date} onChange={(v) => setF({ ...f, date: v })} /></Field>
            <Field label="روش پرداخت"><select className="select" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>{Object.entries(PAY_METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          </div>
          <Field label="توضیح"><input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          {err && <div className="callout red">{err}</div>}
        </div></Modal>}
    </>
  );
}
