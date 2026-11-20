import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { Icon } from '../components/Icon';
import { DataTable, Pager, PageHead, Modal, Field, NumInput, Stamp, useUi, Empty } from '../components/ui';
import { JalaliDate } from '../components/JalaliDate';
import { PartyPicker } from '../components/PartyPicker';
import { Party } from '../lib/queries';
import { PAY_METHOD, fmtDate, fmtMoney } from '../lib/format';
import { todayISO } from '../lib/jalali';

interface Pay { id: string; direction: 'RECEIVED' | 'PAID'; method: string; amount: number; date: string; reference?: string; notes?: string; party?: { id: string; name: string }; invoice?: { invoiceNumber: string } }

export default function Payments() {
  const qc = useQueryClient(); const { toast } = useUi();
  const [page, setPage] = useState(1); const [dir, setDir] = useState(''); const [method, setMethod] = useState('');
  const [open, setOpen] = useState<null | 'RECEIVED' | 'PAID'>(null);
  const [f, setF] = useState({ amount: '' as number | '', method: 'CASH', date: todayISO(), reference: '', notes: '' });
  const [err, setErr] = useState('');
  const params = { page, limit: 15, direction: dir || undefined, method: method || undefined };
  const { data, isLoading } = useQuery({ queryKey: ['payments', params], queryFn: () => api.get<Pay[]>('/payments', params) });
  const [party, setParty] = useState<Party | null>(null);
  const close = () => { setOpen(null); setParty(null); };

  useEffect(() => { const p = sessionStorage.getItem('payParty'); if (p) { sessionStorage.removeItem('payParty'); api.get<Party>(`/parties/${p}`).then((r) => setParty(r.data)).catch(() => { }); setOpen('RECEIVED'); } }, []);

  const save = useMutation({
    mutationFn: () => api.post('/payments', { direction: open, method: f.method, amount: Number(f.amount), partyId: party?.id, date: f.date, reference: f.reference || undefined, notes: f.notes || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['payments'] }); qc.invalidateQueries({ queryKey: ['parties'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); toast('ثبت شد'); close(); setF({ amount: '', method: 'CASH', date: todayISO(), reference: '', notes: '' }); },
    onError: (e: ApiError) => setErr(e.message),
  });

  return (
    <>
      <PageHead title="دریافت و پرداخت" sub="تسویه حساب مشتریان و تأمین‌کنندگان">
        <button className="btn btn--primary" onClick={() => { setErr(''); setOpen('RECEIVED'); }}><Icon name="plus" size={18} />دریافت از مشتری</button>
        <button className="btn btn--blue" onClick={() => { setErr(''); setOpen('PAID'); }}><Icon name="plus" size={18} />پرداخت به تأمین‌کننده</button>
      </PageHead>
      <section className="sheet">
        <div className="filters">
          <Field label="نوع"><select className="select" value={dir} onChange={(e) => { setDir(e.target.value); setPage(1); }}><option value="">همه</option><option value="RECEIVED">دریافتی</option><option value="PAID">پرداختی</option></select></Field>
          <Field label="روش"><select className="select" value={method} onChange={(e) => { setMethod(e.target.value); setPage(1); }}><option value="">همه</option>{Object.entries(PAY_METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        </div>
        <DataTable rows={data?.data} loading={isLoading} rowKey={(r) => r.id} empty={<Empty icon="wallet" title="تراکنشی ثبت نشده" />}
          cols={[
            { key: 'd', title: 'تاریخ', render: (r) => fmtDate(r.date) },
            { key: 't', title: 'نوع', render: (r) => <Stamp tone={r.direction === 'RECEIVED' ? 'green' : 'blue'}>{r.direction === 'RECEIVED' ? 'دریافت' : 'پرداخت'}</Stamp> },
            { key: 'p', title: 'طرف‌حساب', render: (r) => r.party?.name ?? <span className="muted">بدون طرف‌حساب</span> },
            { key: 'm', title: 'روش', render: (r) => PAY_METHOD[r.method] },
            { key: 'i', title: 'فاکتور', render: (r) => r.invoice ? <span className="sku">{r.invoice.invoiceNumber}</span> : '—' },
            { key: 'r', title: 'مرجع', render: (r) => <span className="muted sm">{r.reference ?? ''}</span> },
            { key: 'a', title: 'مبلغ (ریال)', num: true, render: (r) => <b className={r.direction === 'RECEIVED' ? 't-pos' : ''}>{fmtMoney(r.amount)}</b> },
          ]} />
        <Pager meta={data?.meta} onPage={setPage} />
      </section>
      {open && <Modal size="sm" title={open === 'RECEIVED' ? 'دریافت از مشتری' : 'پرداخت به تأمین‌کننده'} onClose={close}
        footer={<><button className="btn btn--primary" disabled={!party || !f.amount || save.isPending} onClick={() => { setErr(''); save.mutate(); }}>ثبت</button><button className="btn" onClick={close}>انصراف</button></>}>
        <div className="stack">
          <Field label={open === 'RECEIVED' ? 'مشتری' : 'تأمین‌کننده'} required><PartyPicker key={open} type={open === 'RECEIVED' ? 'CUSTOMER' : 'SUPPLIER'} value={party} onChange={setParty} required /></Field>
          {party && party.currentBalance > 0 && <div className="callout blue sm">مانده فعلی: <b>{fmtMoney(party.currentBalance)}</b> <button className="btn btn--sm" onClick={() => setF({ ...f, amount: party.currentBalance })}>تسویه کامل</button></div>}
          <Field label="مبلغ (ریال)" required><NumInput money value={f.amount} onChange={(v) => setF({ ...f, amount: v })} /></Field>
          <div className="grid g2">
            <Field label="روش"><select className="select" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>{Object.entries(PAY_METHOD).filter(([k]) => k !== 'CHECK').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <Field label="تاریخ"><JalaliDate value={f.date} onChange={(v) => setF({ ...f, date: v })} /></Field>
          </div>
          <Field label="شماره پیگیری"><input className="input input--num" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
          {err && <div className="callout red">{err}</div>}
        </div></Modal>}
    </>
  );
}
