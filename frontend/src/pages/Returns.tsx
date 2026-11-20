import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { DataTable, Pager, PageHead, Stamp, Empty, Field, useDebounced } from '../components/ui';
import { SalesTabs } from '../components/SalesTabs';
import { StandaloneReturn } from '../components/StandaloneReturn';
import { Icon } from '../components/Icon';
import { useAuth } from '../lib/auth';
import { fmtDate, fmtMoney, toFa } from '../lib/format';

interface Ret { id: string; invoiceNumber: string; invoiceType: string; date: string; totalAmount: number; paidAmount: number; notes?: string; partyName?: string; party?: { name: string }; original?: { id: string; invoiceNumber: string }; _count?: { items: number } }

export default function Returns() {
  const nav = useNavigate(); const { has } = useAuth(); const [open, setOpen] = useState(false); const [page, setPage] = useState(1); const [kind, setKind] = useState(''); const [search, setSearch] = useState(''); const dq = useDebounced(search);
  const params = { page, limit: 15, kind: kind || undefined, search: dq || undefined };
  const { data, isLoading } = useQuery({ queryKey: ['returns', params], queryFn: () => api.get<Ret[]>('/returns', params) });
  return (
    <>
      <PageHead title="فاکتورهای برگشتی" sub="برگشت از فروش (مشتری) و برگشت از خرید (تأمین‌کننده)">
        {has('returns.create') && <button className="btn" onClick={() => setOpen(true)}><Icon name="plus" size={17} />برگشتی بدون فاکتور</button>}
      </PageHead>
      <SalesTabs />
      <section className="sheet" style={{ borderTop: 0 }}>
        <div className="filters">
          <Field className="search" label="جستجو"><input className="input" placeholder="شماره یا نام طرف‌حساب" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></Field>
          <Field label="نوع"><select className="select" value={kind} onChange={(e) => { setKind(e.target.value); setPage(1); }}><option value="">همه</option><option value="sale">برگشت از فروش</option><option value="purchase">برگشت از خرید</option></select></Field>
        </div>
        <DataTable rows={data?.data} loading={isLoading} rowKey={(r) => r.id} onRow={(r) => nav(`/returns/${r.id}`)} empty={<Empty icon="receipt" title="برگشتی ثبت نشده" hint="از صفحه‌ی هر فاکتور می‌توانید برگشتی ثبت کنید" />}
          cols={[
            { key: 'n', title: 'شماره', render: (r) => <span className="sku">{r.invoiceNumber}</span> },
            { key: 't', title: 'نوع', render: (r) => <Stamp tone={r.invoiceType === 'SALE_RETURN' ? 'amber' : 'blue'}>{r.invoiceType === 'SALE_RETURN' ? 'برگشت از فروش' : 'برگشت از خرید'}</Stamp> },
            { key: 'd', title: 'تاریخ', render: (r) => fmtDate(r.date) },
            { key: 'p', title: 'طرف‌حساب', render: (r) => r.party?.name ?? r.partyName ?? '—' },
            { key: 'o', title: 'فاکتور اصلی', render: (r) => r.original ? <span className="sku">{r.original.invoiceNumber}</span> : '—' },
            { key: 'c', title: 'اقلام', render: (r) => toFa(r._count?.items ?? 0) },
            { key: 'a', title: 'مبلغ (ریال)', num: true, render: (r) => <b>{fmtMoney(r.totalAmount)}</b> },
          ]} />
        <Pager meta={data?.meta} onPage={setPage} />
      </section>
      {open && <StandaloneReturn onClose={() => setOpen(false)} />}
    </>
  );
}
