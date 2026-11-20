import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Icon } from '../components/Icon';
import { DataTable, Pager, PageHead, Stamp, useDebounced, Empty, Field } from '../components/ui';
import { JalaliDate } from '../components/JalaliDate';
import { SalesTabs } from '../components/SalesTabs';
import { TAX_STATUS, useMoodian } from '../lib/moodian';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useUi } from '../components/ui';
import { INVOICE_STATUS, fmtDate, fmtMoney, toFa } from '../lib/format';

interface Inv { taxStatus?: string | null; id: string; invoiceNumber: string; date: string; status: string; totalAmount: number; paidAmount: number; remainingAmount: number; partyName?: string; party?: { name: string }; _count?: { items: number }; creator?: { name: string } }

/** فهرست فاکتورهای فروش یا خرید */
export default function Sales({ kind }: { kind: 'sales' | 'purchases' }) {
  const nav = useNavigate();
  const isSale = kind === 'sales';
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const dq = useDebounced(search);
  const params = { page, limit: 15, search: dq || undefined, status: status || undefined, from: from || undefined, to: to || undefined };
  const { data, isLoading } = useQuery({ queryKey: [kind, params], queryFn: () => api.get<Inv[]>(`/${kind}`, params) });
  const reset = () => { setPage(1); };
  const { data: mo } = useMoodian(); const qc = useQueryClient(); const { toast } = useUi();
  const showTax = isSale && !!mo?.enabled;
  const sync = useMutation({
    mutationFn: async () => (await api.post<{ inquired: number; confirmed: number; sent: number; failed: { invoiceNumber: string; reason: string }[] }>('/moodian/sync', { limit: 25 })).data,
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['sales'] }); qc.invalidateQueries({ queryKey: ['moodian-settings'] }); toast(`ارسال: ${toFa(r.sent)} | تأیید‌شده: ${toFa(r.confirmed)} | ناموفق: ${toFa(r.failed.length)}`, r.failed.length ? 'error' : 'ok'); },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  return (
    <>
      <PageHead title={isSale ? 'فاکتورهای فروش' : 'فاکتورهای خرید'} sub={isSale ? 'همه‌ی فروش‌های ثبت‌شده' : 'ورود کالا از تأمین‌کنندگان'}>
        {showTax && <button className="btn" disabled={sync.isPending} onClick={() => sync.mutate()}><Icon name="swap" size={17} />{sync.isPending ? 'در حال همگام‌سازی…' : `همگام‌سازی مودیان${mo!.counts.notSent + mo!.counts.pending ? ` (${toFa(mo!.counts.notSent + mo!.counts.pending)})` : ''}`}</button>}
        <Link to={`/${kind}/new`} className="btn btn--primary"><Icon name="plus" size={18} />{isSale ? 'فاکتور فروش جدید' : 'فاکتور خرید جدید'}</Link>
      </PageHead>
      {isSale && <SalesTabs />}
      <section className="sheet" style={isSale ? { borderTop: 0 } : undefined}>
        <div className="filters">
          <Field className="search" label="جستجو"><input className="input" placeholder="شماره فاکتور یا نام مشتری" value={search} onChange={(e) => { setSearch(e.target.value); reset(); }} /></Field>
          <Field label="وضعیت">
            <select className="select" value={status} onChange={(e) => { setStatus(e.target.value); reset(); }}>
              <option value="">همه</option>
              {Object.entries(INVOICE_STATUS).filter(([k]) => k !== 'DRAFT' && k !== 'SENT_TO_TAX_AUTHORITY').map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Field>
          <Field label="از تاریخ"><JalaliDate value={from} onChange={(v) => { setFrom(v); reset(); }} clearable placeholder="—" /></Field>
          <Field label="تا تاریخ"><JalaliDate value={to} onChange={(v) => { setTo(v); reset(); }} clearable placeholder="—" /></Field>
        </div>
        <DataTable rows={data?.data} loading={isLoading} rowKey={(r) => r.id} onRow={(r) => nav(`/${kind}/${r.id}`)}
          empty={<Empty icon="receipt" title="فاکتوری پیدا نشد" hint="فیلترها را تغییر دهید یا فاکتور جدید بزنید" />}
          rowClass={(r) => (r.status === 'CANCELLED' ? 'dim' : '')}
          cols={[
            { key: 'n', title: 'شماره', render: (r) => <span className="sku">{r.invoiceNumber}</span> },
            { key: 'd', title: 'تاریخ', render: (r) => fmtDate(r.date) },
            { key: 'p', title: isSale ? 'مشتری' : 'تأمین‌کننده', render: (r) => r.party?.name ?? r.partyName ?? (isSale ? 'مشتری متفرقه' : '—') },
            { key: 'c', title: 'اقلام', render: (r) => toFa(r._count?.items ?? 0) },
            { key: 's', title: 'وضعیت', render: (r) => <Stamp tone={INVOICE_STATUS[r.status]?.tone ?? 'gray'}>{INVOICE_STATUS[r.status]?.label ?? r.status}</Stamp> },
            ...(showTax ? [{ key: 'tx', title: 'مودیان', render: (r: Inv) => { const t = TAX_STATUS[r.taxStatus ?? 'NOT_SENT']; return r.status === 'CANCELLED' ? '—' : <Stamp tone={t.tone}>{t.label}</Stamp>; } }] : []),
            { key: 'r', title: 'مانده', num: true, render: (r) => (r.status === 'CANCELLED' ? '—' : <span className={r.remainingAmount > 0 ? 't-neg' : ''}>{fmtMoney(r.remainingAmount)}</span>) },
            { key: 't', title: 'مبلغ کل (ریال)', num: true, render: (r) => <b>{fmtMoney(r.totalAmount)}</b> },
          ]} />
        <Pager meta={data?.meta} onPage={setPage} />
      </section>
    </>
  );
}
