import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { PageHead, Field, Loading, Empty, DataTable } from '../components/ui';
import { useAuth } from '../lib/auth';
import { JalaliDate } from '../components/JalaliDate';
import { currentMonthStartISO, currentYearStartISO, todayISO, addDaysISO } from '../lib/jalali';
import { fmtCompact, fmtDate, fmtMoney, fmtNum, toFa } from '../lib/format';

interface Sales { rows: { label: string; count: number; total: number; vat: number; discount: number }[]; totals: { count: number; total: number; vat: number; discount: number } }
interface Profit { revenue: number; cogs: number; grossProfit: number; expenses: number; netProfit: number; marginPercent: number }
interface Top { productId: string; name: string; sku: string; quantity: number; revenue: number }
interface Mover { productId: string; sku: string; name: string; stock: number; soldQty: number; lastSaleAt: string | null; daysSinceLastSale: number | null; stockValue: number; turnover: number | null; coverDays: number | null }
interface Movers { days: number; summary: { fastCount: number; slowCount: number; deadCount: number; deadStockValue: number; totalSoldQty: number }; fast: Mover[]; slow: Mover[]; dead: Mover[] }
interface Recv { total: number; parties: { id: string; name: string; currentBalance: number; mobile?: string }[] }

function MoversReport({ from, to }: { from: string; to: string }) {
  const [tab, setTab] = useState<'fast' | 'slow' | 'dead'>('fast');
  const { data, isLoading } = useQuery({ queryKey: ['rep-movers', from, to], queryFn: async () => (await api.get<Movers>('/reports/product-movers', { from, to, limit: 100 })).data });
  const TABS = [['fast', 'پرفروش', data?.summary.fastCount], ['slow', 'کم‌فروش', data?.summary.slowCount], ['dead', 'بی‌گردش (راکد)', data?.summary.deadCount]] as const;
  return (
    <section className="sheet" style={{ marginTop: 16 }}>
      <div className="sheet__head"><h2>گردش کالا</h2><span className="muted sm">بر اساس فروش واقعی انبار در همین بازه ({toFa(data?.days ?? 0)} روز)</span></div>
      <div className="sheet__body stack" style={{ gap: 12 }}>
        <div className="muted sm">پرفروش = کالاهایی که روی هم ۸۰٪ فروش را می‌سازند · کم‌فروش = بقیه‌ی کالاهای فروخته‌شده · بی‌گردش = موجودی دارد ولی در بازه نفروخته؛ سرمایه‌ی خوابیده: <b className="t-neg">{fmtMoney(data?.summary.deadStockValue ?? 0)}</b> ریال</div>
        <div className="tabs">{TABS.map(([k, l, n]) => <button key={k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{l} ({toFa(n ?? 0)})</button>)}</div>
        <DataTable rows={data?.[tab]} loading={isLoading} rowKey={(r) => r.productId} empty={<Empty icon="chart" title="موردی نیست" hint="بازه‌ی زمانی را بلندتر کنید" />}
          cols={[
            { key: 'sku', title: 'کد', render: (r) => <span className="sku">{r.sku}</span> },
            { key: 'name', title: 'نام کالا', render: (r) => <span className="strong">{r.name}</span> },
            { key: 'sold', title: 'فروش (عدد)', num: true, render: (r) => fmtNum(r.soldQty, 1) },
            { key: 'stock', title: 'موجودی', num: true, render: (r) => fmtNum(r.stock, 1) },
            { key: 'cover', title: 'کفایت موجودی (روز)', num: true, render: (r) => r.coverDays === null ? '—' : toFa(r.coverDays) },
            { key: 'last', title: 'آخرین فروش', render: (r) => r.lastSaleAt ? <span className="muted sm">{fmtDate(r.lastSaleAt)} ({toFa(r.daysSinceLastSale ?? 0)} روز پیش)</span> : <span className="muted sm">هرگز</span> },
            { key: 'val', title: 'ارزش موجودی', num: true, render: (r) => fmtMoney(r.stockValue) },
          ]} />
      </div>
    </section>
  );
}

export default function Reports() {
  const { has } = useAuth();
  const [from, setFrom] = useState(currentMonthStartISO()); const [to, setTo] = useState(todayISO()); const [group, setGroup] = useState<'day' | 'month'>('day');
  const range = { from, to };
  const sales = useQuery({ enabled: has('reports.sales'), queryKey: ['rep-sales', from, to, group], queryFn: async () => (await api.get<Sales>('/reports/sales', { ...range, groupBy: group })).data });
  const profit = useQuery({ enabled: has('reports.profit'), queryKey: ['rep-profit', from, to], queryFn: async () => (await api.get<Profit>('/reports/profit', range)).data });
  const top = useQuery({ enabled: has('reports.products'), queryKey: ['rep-top', from, to], queryFn: async () => (await api.get<Top[]>('/reports/top-products', { ...range, limit: 8 })).data });
  const recv = useQuery({ enabled: has('reports.debts'), queryKey: ['rep-recv'], queryFn: async () => (await api.get<Recv>('/reports/receivables', { type: 'CUSTOMER' })).data });
  const presets: [string, () => void][] = [
    ['۷ روز اخیر', () => { setFrom(addDaysISO(todayISO(), -6)); setTo(todayISO()); setGroup('day'); }],
    ['این ماه', () => { setFrom(currentMonthStartISO()); setTo(todayISO()); setGroup('day'); }],
    ['۳۰ روز اخیر', () => { setFrom(addDaysISO(todayISO(), -29)); setTo(todayISO()); setGroup('day'); }],
    ['امسال', () => { setFrom(currentYearStartISO()); setTo(todayISO()); setGroup('month'); }],
  ];
  const maxRow = Math.max(...(sales.data?.rows.map((r) => r.total) ?? [1]), 1);
  const maxTop = Math.max(...(top.data?.map((t) => t.revenue) ?? [1]), 1);

  return (
    <>
      <PageHead title="گزارش‌ها" sub="فروش، سود و حساب‌های باز در بازه‌ی دلخواه (تاریخ شمسی)" />
      <section className="sheet" style={{ marginBottom: 16 }}>
        <div className="filters">
          <Field label="از تاریخ"><JalaliDate value={from} onChange={(v) => v && setFrom(v)} /></Field>
          <Field label="تا تاریخ"><JalaliDate value={to} onChange={(v) => v && setTo(v)} /></Field>
          <Field label="گروه‌بندی"><select className="select" value={group} onChange={(e) => setGroup(e.target.value as 'day' | 'month')}><option value="day">روزانه</option><option value="month">ماهانه</option></select></Field>
          <div className="chips" style={{ paddingBottom: 6 }}>{presets.map(([l, fn]) => <button key={l} className="chip" onClick={fn}>{l}</button>)}</div>
        </div>
      </section>
      <div className="signs">
        <div className="sign sign--green"><div className="sign__in"><span className="sign__label">جمع فروش</span><span className="sign__value num">{fmtCompact(sales.data?.totals.total ?? 0)}</span><span className="sign__sub">{toFa(sales.data?.totals.count ?? 0)} فاکتور</span></div></div>
        <div className="sign sign--blue"><div className="sign__in"><span className="sign__label">سود ناخالص</span><span className="sign__value num">{fmtCompact(profit.data?.grossProfit ?? 0)}</span><span className="sign__sub">حاشیه سود {toFa(profit.data?.marginPercent ?? 0)}٪</span></div></div>
        <div className="sign sign--dark"><div className="sign__in"><span className="sign__label">بهای تمام‌شده</span><span className="sign__value num">{fmtCompact(profit.data?.cogs ?? 0)}</span><span className="sign__sub">کالای فروخته‌شده</span></div></div>
        <div className="sign sign--yellow"><div className="sign__in"><span className="sign__label">مالیات ارزش افزوده</span><span className="sign__value num">{fmtCompact(sales.data?.totals.vat ?? 0)}</span><span className="sign__sub">تخفیف داده‌شده: {fmtCompact(sales.data?.totals.discount ?? 0)}</span></div></div>
      </div>
      <section className="sheet" style={{ marginBottom: 16 }}>
        <div className="sheet__head"><h2>صورت سود و زیان</h2><span className="muted sm">فروش خالص پس از کسر برگشتی‌ها</span></div>
        <div className="sheet__body"><div className="totals" style={{ width: '100%', maxWidth: 520, marginInlineStart: 0 }}>
          <div><span>فروش خالص (بدون مالیات)</span><b className="num">{fmtMoney(profit.data?.revenue ?? 0)}</b></div>
          <div><span>بهای تمام‌شده کالای فروخته‌شده</span><b className="num">- {fmtMoney(profit.data?.cogs ?? 0)}</b></div>
          <div><span>سود ناخالص</span><b className="num">{fmtMoney(profit.data?.grossProfit ?? 0)}</b></div>
          <div><span>هزینه‌ها (اجاره، حقوق و …)</span><b className="num">- {fmtMoney(profit.data?.expenses ?? 0)}</b></div>
          <div className="grand"><span>سود خالص</span><span className={`num ${(profit.data?.netProfit ?? 0) < 0 ? 't-neg' : 't-pos'}`}>{fmtMoney(profit.data?.netProfit ?? 0)}</span></div>
        </div></div>
      </section>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)', alignItems: 'start' }}>
        <section className="sheet">
          <div className="sheet__head"><h2>فروش {group === 'day' ? 'روزانه' : 'ماهانه'}</h2></div>
          {sales.isLoading ? <Loading /> : !sales.data?.rows.length ? <Empty icon="chart" title="در این بازه فروشی نیست" /> :
            <div className="tbl-wrap" style={{ maxHeight: 460, overflow: 'auto' }}><table className="tbl"><thead><tr><th>{group === 'day' ? 'روز' : 'ماه'}</th><th className="n">فاکتور</th><th></th><th className="n">فروش (ریال)</th></tr></thead>
              <tbody>{sales.data.rows.map((r) => <tr key={r.label}><td>{toFa(r.label)}</td><td className="n">{toFa(r.count)}</td><td style={{ width: '32%' }}><div className="hbar"><i style={{ width: `${(r.total / maxRow) * 100}%` }} /></div></td><td className="n strong">{fmtMoney(r.total)}</td></tr>)}</tbody>
              <tfoot><tr><td>جمع</td><td className="n">{toFa(sales.data.totals.count)}</td><td /><td className="n">{fmtMoney(sales.data.totals.total)}</td></tr></tfoot></table></div>}
        </section>
        <div className="stack">
          <section className="sheet"><div className="sheet__head"><h2>پرفروش‌ترین کالاها</h2></div>
            {top.isLoading ? <Loading /> : !top.data?.length ? <Empty title="داده‌ای نیست" /> : <div className="sheet__body stack" style={{ gap: 10 }}>{top.data.map((t, i) => (
              <div key={t.productId}><div className="row"><b>{toFa(i + 1)}.</b><span className="grow strong">{t.name}</span><span className="muted sm">{fmtNum(t.quantity, 1)} عدد</span></div>
                <div className="row"><div className="hbar grow"><i style={{ width: `${(t.revenue / maxTop) * 100}%`, background: 'var(--sign-green)' }} /></div><b className="num sm">{fmtMoney(t.revenue)}</b></div></div>))}</div>}
          </section>
          <section className="sheet"><div className="sheet__head"><h2>مطالبات از مشتریان</h2><span className="grow" /><b className="num t-neg">{fmtMoney(recv.data?.total ?? 0)}</b></div>
            {!recv.data?.parties.length ? <Empty icon="check" title="مطالبه‌ای نداریم" /> : <div>{recv.data.parties.filter((p) => p.currentBalance > 0).slice(0, 8).map((p) => <div key={p.id} className="row" style={{ padding: '8px 16px', borderBottom: '2px dashed var(--line)' }}><span className="grow">{p.name}</span><b className="num t-neg">{fmtMoney(p.currentBalance)}</b></div>)}</div>}
          </section>
        </div>
      </div>
      {has('reports.products') && <MoversReport from={from} to={to} />}
    </>
  );
}
