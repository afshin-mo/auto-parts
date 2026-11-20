import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Icon } from '../components/Icon';
import { DataTable, Pager, PageHead, Stamp, Empty, Field, useDebounced } from '../components/ui';
import { SalesTabs } from '../components/SalesTabs';
import { daysUntil, fmtDate, fmtMoney, toFa } from '../lib/format';

interface Pf { id: string; invoiceNumber: string; date: string; dueDate?: string; status: string; totalAmount: number; partyName?: string; party?: { name: string }; _count?: { items: number } }
export const PF_STATUS: Record<string, { label: string; tone: string }> = { DRAFT: { label: 'باز', tone: 'blue' }, CONFIRMED: { label: 'تبدیل‌شده به فاکتور', tone: 'green' }, CANCELLED: { label: 'ابطال', tone: 'gray' } };

export default function Proformas() {
  const nav = useNavigate(); const [page, setPage] = useState(1); const [state, setState] = useState('OPEN'); const [search, setSearch] = useState(''); const dq = useDebounced(search);
  const params = { page, limit: 15, state: state || undefined, search: dq || undefined };
  const { data, isLoading } = useQuery({ queryKey: ['proformas', params], queryFn: () => api.get<Pf[]>('/proformas', params) });
  return (
    <>
      <PageHead title="پیش‌فاکتورها" sub="قیمت‌دهی به مشتری بدون اثر روی انبار و حساب؛ با یک کلیک به فاکتور تبدیل می‌شود">
        <Link to="/proformas/new" className="btn btn--primary"><Icon name="plus" size={18} />پیش‌فاکتور جدید</Link>
      </PageHead>
      <SalesTabs />
      <section className="sheet" style={{ borderTop: 0 }}>
        <div className="filters">
          <Field className="search" label="جستجو"><input className="input" placeholder="شماره یا نام مشتری" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></Field>
          <Field label="وضعیت"><select className="select" value={state} onChange={(e) => { setState(e.target.value); setPage(1); }}><option value="">همه</option><option value="OPEN">باز</option><option value="CONVERTED">تبدیل‌شده</option><option value="CANCELLED">ابطال‌شده</option></select></Field>
        </div>
        <DataTable rows={data?.data} loading={isLoading} rowKey={(r) => r.id} onRow={(r) => nav(`/proformas/${r.id}`)} empty={<Empty icon="receipt" title="پیش‌فاکتوری نیست" />} rowClass={(r) => (r.status === 'CANCELLED' ? 'dim' : '')}
          cols={[
            { key: 'n', title: 'شماره', render: (r) => <span className="sku">{r.invoiceNumber}</span> },
            { key: 'd', title: 'تاریخ', render: (r) => fmtDate(r.date) },
            { key: 'v', title: 'اعتبار تا', render: (r) => { if (!r.dueDate) return '—'; const d = daysUntil(r.dueDate); return <div>{fmtDate(r.dueDate)}{r.status === 'DRAFT' && d < 0 && <div><Stamp tone="red">منقضی</Stamp></div>}</div>; } },
            { key: 'p', title: 'مشتری', render: (r) => r.party?.name ?? r.partyName ?? 'مشتری متفرقه' },
            { key: 'c', title: 'اقلام', render: (r) => toFa(r._count?.items ?? 0) },
            { key: 's', title: 'وضعیت', render: (r) => <Stamp tone={PF_STATUS[r.status]?.tone}>{PF_STATUS[r.status]?.label}</Stamp> },
            { key: 't', title: 'مبلغ کل (ریال)', num: true, render: (r) => <b>{fmtMoney(r.totalAmount)}</b> },
          ]} />
        <Pager meta={data?.meta} onPage={setPage} />
      </section>
    </>
  );
}
