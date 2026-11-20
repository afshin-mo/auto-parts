import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Icon } from '../components/Icon';
import { PageHead, Stamp, Loading, Empty } from '../components/ui';
import { useAuth } from '../lib/auth';
import { CHECK_STATUS, INVOICE_STATUS, daysUntil, fmtCompact, fmtDate, fmtDateMid, fmtMoney, fmtNum, toFa, dateToISODay } from '../lib/format';
import { weekdayIndex, todayISO } from '../lib/jalali';

interface Dash {
  today: { total: number; count: number }; month: { total: number; count: number }; receivable: number; payable: number; lowStockCount: number;
  dueChecks: { id: string; checkNumber: string; checkType: string; amount: number; dueDate: string; party?: { name: string }; partyName?: string }[];
  recentInvoices: { id: string; invoiceNumber: string; date: string; totalAmount: number; status: string; partyName?: string; party?: { name: string } }[];
  salesLast30Days: { date: string; total: number }[];
}

export default function Dashboard() {
  const { user, has } = useAuth();
  const nav = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ['dashboard'], queryFn: async () => (await api.get<Dash>('/reports/dashboard')).data });
  if (isLoading || !data) return <Loading />;

  const max = Math.max(...data.salesLast30Days.map((d) => d.total), 1);
  const total30 = data.salesLast30Days.reduce((s, d) => s + d.total, 0);
  const today = todayISO();
  const showMoney = has('reports.sales', 'reports.profit');

  return (
    <>
      <PageHead title={`سلام ${user?.name?.split(' ')[0] ?? ''}`} sub="خلاصه‌ی وضعیت فروشگاه در یک نگاه">
        <Link to="/sales/new" className="btn btn--yellow"><Icon name="plus" size={18} />فاکتور فروش جدید</Link>
      </PageHead>

      <div className="signs">
        <div className="sign sign--green"><div className="sign__in">
          <span className="sign__label"><Icon name="receipt" size={16} />فروش امروز</span>
          <span className="sign__value num">{fmtNum(data.today.total)}<small>ریال</small></span>
          <span className="sign__sub">{toFa(data.today.count)} فاکتور</span>
        </div></div>
        <div className="sign sign--blue"><div className="sign__in">
          <span className="sign__label"><Icon name="chart" size={16} />فروش این ماه</span>
          <span className="sign__value num">{fmtCompact(data.month.total)}<small>ریال</small></span>
          <span className="sign__sub">{toFa(data.month.count)} فاکتور از اول ماه شمسی</span>
        </div></div>
        {showMoney ? (
          <div className="sign sign--dark"><div className="sign__in">
            <span className="sign__label"><Icon name="wallet" size={16} />طلب از مشتریان</span>
            <span className="sign__value num">{fmtCompact(data.receivable)}<small>ریال</small></span>
            <span className="sign__sub">بدهی ما به تأمین‌کنندگان: {fmtCompact(data.payable)}</span>
          </div></div>
        ) : (
          <div className="sign sign--dark"><div className="sign__in"><span className="sign__label">میانگین فاکتور امروز</span>
            <span className="sign__value num">{fmtNum(data.today.count ? data.today.total / data.today.count : 0)}<small>ریال</small></span></div></div>
        )}
        <Link to="/inventory?tab=low" style={{ color: 'inherit', textDecoration: 'none' }} className="sign sign--yellow">
          <div className="sign__in">
            <span className="sign__label"><Icon name="alert" size={16} />کم‌موجودی</span>
            <span className="sign__value num">{toFa(data.lowStockCount)}<small>کالا</small></span>
            <span className="sign__sub">به حداقل موجودی رسیده یا کمتر است</span>
          </div>
        </Link>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)', alignItems: 'start' }}>
        <section className="sheet">
          <div className="sheet__head"><h2>فروش ۳۰ روز اخیر</h2><span className="muted grow">جمع: {fmtMoney(total30)} ریال</span></div>
          <div className="sheet__body">
            <div className="bars" dir="rtl">
              {data.salesLast30Days.map((d) => {
                const iso = dateToISODay(d.date);
                return (
                  <div key={d.date} className={`bar ${iso === today ? 'today' : weekdayIndex(iso) === 6 ? 'fri' : ''}`} style={{ height: `${Math.max(1.5, (d.total / max) * 100)}%` }}>
                    <span>{fmtDateMid(d.date)} — {fmtMoney(d.total)}</span>
                  </div>
                );
              })}
            </div>
            <div className="bars-axis"><span>۳۰ روز پیش</span><span className="row" style={{ gap: 14 }}><i style={{ width: 10, height: 10, background: 'var(--line-strong)', display: 'inline-block' }} /> جمعه <i style={{ width: 10, height: 10, background: 'var(--sign-blue)', display: 'inline-block' }} /> امروز</span><span>امروز</span></div>
          </div>
        </section>

        <section className="sheet">
          <div className="sheet__head"><h2>چک‌های نزدیک سررسید</h2></div>
          {data.dueChecks.length === 0 ? <Empty icon="cheque" title="چک سررسیدی نداریم" hint="۷ روز آینده خلوت است" /> : (
            <div>
              {data.dueChecks.map((c) => {
                const d = daysUntil(c.dueDate);
                return (
                  <div key={c.id} className="row" style={{ padding: '10px 16px', borderBottom: '2px dashed var(--line)' }}>
                    <div className="grow">
                      <div className="strong">{c.party?.name ?? c.partyName ?? '—'}</div>
                      <div className="muted sm">{c.checkType === 'RECEIVED' ? 'دریافتی' : 'پرداختی'} | {fmtDate(c.dueDate)}</div>
                    </div>
                    <div style={{ textAlign: 'end' }}>
                      <div className="strong num">{fmtMoney(c.amount)}</div>
                      <Stamp tone={d < 0 ? 'red' : d <= 2 ? 'amber' : 'blue'}>{d < 0 ? `${toFa(-d)} روز گذشته` : d === 0 ? 'امروز' : `${toFa(d)} روز دیگر`}</Stamp>
                    </div>
                  </div>
                );
              })}
              <div className="sheet__foot"><Link to="/checks">همه‌ی چک‌ها ←</Link></div>
            </div>
          )}
        </section>
      </div>

      <section className="sheet" style={{ marginTop: 16 }}>
        <div className="sheet__head"><h2>آخرین فاکتورها</h2><span className="grow" /><Link to="/sales" className="btn btn--sm">همه‌ی فاکتورها</Link></div>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>شماره</th><th>تاریخ</th><th>مشتری</th><th>وضعیت</th><th className="n">مبلغ (ریال)</th></tr></thead>
          <tbody>{data.recentInvoices.map((i) => (
            <tr key={i.id} className="clickable" onClick={() => nav(`/sales/${i.id}`)}>
              <td><span className="sku">{i.invoiceNumber}</span></td><td>{fmtDate(i.date)}</td><td>{i.party?.name ?? i.partyName ?? 'مشتری متفرقه'}</td>
              <td><Stamp tone={INVOICE_STATUS[i.status]?.tone ?? 'gray'}>{INVOICE_STATUS[i.status]?.label ?? i.status}</Stamp></td>
              <td className="n strong">{fmtMoney(i.totalAmount)}</td>
            </tr>))}</tbody>
        </table></div>
      </section>
    </>
  );
}
