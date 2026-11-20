import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Icon } from '../components/Icon';
import { PageHead, Loading, Empty, Stamp } from '../components/ui';
import { INVOICE_STATUS, fmtDate, fmtMoney } from '../lib/format';

interface Stmt { party: { id: string; name: string; code: string; partyType: string }; currentBalance: number; entries: { kind: 'INVOICE' | 'PAYMENT'; id: string; date: string; ref: string; description: string; debit: number; credit: number; balance: number }[] }

export default function PartyStatement() {
  const { id } = useParams();
  const { data, isLoading } = useQuery({ queryKey: ['statement', id], queryFn: async () => (await api.get<Stmt>(`/parties/${id}/statement`)).data });
  const nav = useNavigate();
  const cust = data?.party.partyType === 'CUSTOMER';
  // فاکتورهای فروش (یا خرید) همین طرف‌حساب؛ با کلیک، خود فاکتور باز می‌شود
  const kind = cust ? 'sales' : 'purchases';
  const invs = useQuery({ queryKey: ['invoice-list', kind, id], enabled: !!data, queryFn: async () => (await api.get<{ id: string; invoiceNumber: string; date: string; status: string; totalAmount: number; remainingAmount: number }[]>(`/${kind}`, { partyId: id, limit: 100 })).data });
  if (isLoading || !data) return <Loading />;
  const sumD = data.entries.reduce((s, e) => s + e.debit, 0), sumC = data.entries.reduce((s, e) => s + e.credit, 0);
  return (
    <>
      <PageHead title={data.party.name} sub={`صورت‌حساب ${cust ? 'مشتری' : 'تأمین‌کننده'} | کد ${data.party.code}`}>
        <Link to="/parties" className="btn">بازگشت</Link>
        <button className="btn" onClick={() => window.print()}><Icon name="print" size={17} />چاپ</button>
        {cust && <Link to="/payments?party=" className="btn btn--blue" onClick={() => sessionStorage.setItem('payParty', id!)}><Icon name="wallet" size={17} />ثبت دریافت</Link>}
      </PageHead>
      <div className="signs" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        <div className="sign sign--dark"><div className="sign__in"><span className="sign__label">جمع {cust ? 'فروش' : 'خرید'}</span><span className="sign__value num">{fmtMoney(sumD)}</span></div></div>
        <div className="sign sign--blue"><div className="sign__in"><span className="sign__label">جمع {cust ? 'دریافتی' : 'پرداختی'}</span><span className="sign__value num">{fmtMoney(sumC)}</span></div></div>
        <div className={`sign ${data.currentBalance > 0 ? 'sign--red' : 'sign--green'}`}><div className="sign__in"><span className="sign__label">مانده حساب</span><span className="sign__value num">{fmtMoney(Math.abs(data.currentBalance))}<small>{data.currentBalance > 0 ? (cust ? 'بدهکار' : 'بدهکاریم') : data.currentBalance < 0 ? 'بستانکار' : 'تسویه'}</small></span></div></div>
      </div>
      <section className="sheet">
        {data.entries.length === 0 ? <Empty icon="receipt" title="هنوز گردشی ندارد" /> : (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>تاریخ</th><th>شرح</th><th>مرجع</th><th className="n">{cust ? 'بدهکار (فاکتور)' : 'بستانکار (فاکتور)'}</th><th className="n">{cust ? 'بستانکار (دریافت)' : 'بدهکار (پرداخت)'}</th><th className="n">مانده</th></tr></thead>
            <tbody>{data.entries.map((e) => (
              <tr key={e.kind + e.id}>
                <td>{fmtDate(e.date)}</td><td>{e.kind === 'INVOICE' ? <Stamp tone="blue">{e.description}</Stamp> : <Stamp tone="green">{e.description.split(' ')[0]}</Stamp>} <span className="muted sm">{e.kind === 'PAYMENT' ? e.description.split(' ').slice(1).join(' ') : ''}</span></td>
                <td><span className="sku">{e.ref || '—'}</span></td>
                <td className="n">{e.debit ? fmtMoney(e.debit) : ''}</td><td className="n t-pos">{e.credit ? fmtMoney(e.credit) : ''}</td>
                <td className="n strong"><span className={e.balance > 0 ? 't-neg' : ''}>{fmtMoney(Math.abs(e.balance))}</span></td>
              </tr>))}</tbody>
          </table></div>)}
      </section>
      <section className="sheet no-print" style={{ marginTop: 16 }}>
        <div className="sheet__head"><h2>{cust ? 'فاکتورهای فروش' : 'فاکتورهای خرید'}</h2></div>
        {!invs.data?.length ? <Empty icon="receipt" title="فاکتوری ثبت نشده" /> : (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>شماره</th><th>تاریخ</th><th>وضعیت</th><th className="n">مبلغ</th><th className="n">مانده</th></tr></thead>
            <tbody>{invs.data.map((i) => (
              <tr key={i.id} className="clickable" onClick={() => nav(`/${kind}/${i.id}`)}>
                <td><span className="sku">{i.invoiceNumber}</span></td><td>{fmtDate(i.date)}</td>
                <td><Stamp tone={INVOICE_STATUS[i.status]?.tone ?? 'gray'}>{INVOICE_STATUS[i.status]?.label ?? i.status}</Stamp></td>
                <td className="n strong">{fmtMoney(i.totalAmount)}</td><td className="n"><span className={i.remainingAmount > 0 ? 't-neg' : ''}>{fmtMoney(i.remainingAmount)}</span></td>
              </tr>))}</tbody>
          </table></div>)}
      </section>
    </>
  );
}
