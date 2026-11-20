import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Icon } from '../components/Icon';
import { PageHead, DataTable, Empty, Stamp } from '../components/ui';
import { RemindModal } from '../components/RemindModal';
import { useAuth } from '../lib/auth';
import { saveXlsx } from '../lib/xlsx';
import { fmtCompact, fmtDate, fmtMoney, toFa } from '../lib/format';

type Buckets = { current: number; d1_30: number; d31_60: number; d61_90: number; d90plus: number };
interface Row { id: string; name: string; code: string; mobile?: string; partyType: 'CUSTOMER' | 'SUPPLIER'; balance: number; buckets: Buckets; oldestOverdueDays: number; lastPaymentAt: string | null; creditLimit: number | null }
interface Side { totals: Record<string, number>; rows: Row[] }
interface Debts { debtors: Side; creditors: Side }

const B: { key: keyof Buckets; label: string; color: string }[] = [
  { key: 'current', label: 'سررسید نشده', color: 'var(--sign-green)' }, { key: 'd1_30', label: '۱ تا ۳۰ روز', color: '#9bc53d' },
  { key: 'd31_60', label: '۳۱ تا ۶۰ روز', color: 'var(--reflect)' }, { key: 'd61_90', label: '۶۱ تا ۹۰ روز', color: '#f08a24' }, { key: 'd90plus', label: 'بیش از ۹۰ روز', color: 'var(--alert)' },
];
const OVERDUE = [['', 'همه'], ['1', 'سررسید گذشته'], ['30', 'بیش از ۳۰ روز'], ['60', 'بیش از ۶۰ روز'], ['90', 'بیش از ۹۰ روز']];

export default function Debts() {
  const { has } = useAuth();
  const [side, setSide] = useState<'debtors' | 'creditors'>('debtors');
  const [q, setQ] = useState(''); const [minDays, setMinDays] = useState(''); const [remind, setRemind] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ['debts'], queryFn: async () => (await api.get<Debts>('/reports/debts')).data });
  const cur = data?.[side];
  const rows = useMemo(() => (cur?.rows ?? []).filter((r) => (!q || r.name.includes(q) || (r.mobile ?? '').includes(q)) && (!minDays || r.oldestOverdueDays >= Number(minDays))), [cur, q, minDays]);
  const total = cur?.totals.total ?? 0;
  const overdue = total - (cur?.totals.current ?? 0);
  const isDebtors = side === 'debtors';

  const exportXlsx = () => saveXlsx(isDebtors ? 'بدهکاران.xlsx' : 'بستانکاران.xlsx', [
    ['نام', 'کد', 'موبایل', 'مانده', ...B.map((b) => b.label), 'آخرین پرداخت'],
    ...rows.map((r) => [r.name, r.code, r.mobile ?? '', r.balance, ...B.map((b) => Math.round(r.buckets[b.key])), r.lastPaymentAt ? fmtDate(r.lastPaymentAt) : '']),
  ]);

  return (
    <>
      <PageHead title="بدهکاران و بستانکاران" sub="چه کسانی به ما بدهکارند و ما به چه کسانی؛ با سن بدهی (تقریبی، به روش اولین‌ورودی‌اولین‌خروجی)">
        {isDebtors && has('sms.remind') && <button className="btn" onClick={() => setRemind(true)}>یادآوری با پیامک</button>}
        <button className="btn" onClick={exportXlsx}><Icon name="receipt" size={17} />خروجی اکسل</button>
      </PageHead>

      <div className="signs">
        <button className={`sign sign--${isDebtors ? 'red' : 'dark'}`} style={{ cursor: 'pointer', textAlign: 'start' }} onClick={() => setSide('debtors')}>
          <div className="sign__in"><span className="sign__label">بدهکاران (طلب ما)</span><span className="sign__value num">{fmtCompact(data?.debtors.totals.total ?? 0)}</span><span className="sign__sub">{toFa(data?.debtors.rows.length ?? 0)} نفر</span></div></button>
        <button className={`sign sign--${!isDebtors ? 'yellow' : 'dark'}`} style={{ cursor: 'pointer', textAlign: 'start' }} onClick={() => setSide('creditors')}>
          <div className="sign__in"><span className="sign__label">بستانکاران (بدهی ما)</span><span className="sign__value num">{fmtCompact(data?.creditors.totals.total ?? 0)}</span><span className="sign__sub">{toFa(data?.creditors.rows.length ?? 0)} نفر</span></div></button>
        <div className="sign sign--blue"><div className="sign__in"><span className="sign__label">سررسید گذشته</span><span className="sign__value num">{fmtCompact(overdue)}</span><span className="sign__sub">{total ? toFa(Math.round((overdue / total) * 100)) : '۰'}٪ از این گروه</span></div></div>
      </div>

      <section className="sheet" style={{ margin: '16px 0' }}>
        <div className="sheet__head"><h2>سن بدهی — {isDebtors ? 'بدهکاران' : 'بستانکاران'}</h2></div>
        <div className="sheet__body stack" style={{ gap: 10 }}>
          <div className="debt-bar" role="img" aria-label="نمودار سن بدهی">{B.map((b) => <i key={b.key} title={b.label} style={{ width: `${total ? ((cur?.totals[b.key] ?? 0) / total) * 100 : 0}%`, background: b.color }} />)}</div>
          <div className="row wrap" style={{ gap: 18 }}>{B.map((b) => <span key={b.key} className="row sm" style={{ gap: 6 }}><i style={{ width: 12, height: 12, background: b.color, border: '1px solid var(--asphalt)', display: 'inline-block' }} />{b.label}: <b className="num">{fmtCompact(cur?.totals[b.key] ?? 0)}</b></span>)}</div>
        </div>
      </section>

      <section className="sheet">
        <div className="filters">
          <div className="field search"><span className="field__label">جستجو</span><input className="input" placeholder="نام یا موبایل…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="field"><span className="field__label">سررسید</span><select className="select" value={minDays} onChange={(e) => setMinDays(e.target.value)}>{OVERDUE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        </div>
        <DataTable rows={rows} loading={isLoading} rowKey={(r) => r.id} empty={<Empty icon="check" title={isDebtors ? 'بدهکاری ثبت نشده' : 'بستانکاری ثبت نشده'} />}
          cols={[
            { key: 'n', title: 'نام', render: (r) => <Link to={`/parties/${r.id}`} className="strong">{r.name}</Link> },
            { key: 't', title: 'نوع', render: (r) => <Stamp tone="gray">{r.partyType === 'CUSTOMER' ? 'مشتری' : 'تأمین‌کننده'}</Stamp> },
            { key: 'm', title: 'موبایل', render: (r) => r.mobile ? <a className="ltr" href={`tel:${r.mobile}`}>{r.mobile}</a> : '—' },
            { key: 'bal', title: 'مانده (ریال)', num: true, render: (r) => <b className={`num ${isDebtors ? 't-neg' : ''}`}>{fmtMoney(r.balance)}</b> },
            ...B.map((b) => ({ key: b.key, title: b.label, num: true, render: (r: Row) => r.buckets[b.key] ? <span className="num" style={b.key === 'd90plus' ? { color: 'var(--alert)', fontWeight: 700 } : undefined}>{fmtMoney(Math.round(r.buckets[b.key]))}</span> : <span className="muted">—</span> })),
            { key: 'lp', title: 'آخرین پرداخت', render: (r) => <span className="muted sm">{r.lastPaymentAt ? fmtDate(r.lastPaymentAt) : 'هرگز'}</span> },
          ]} />
      </section>
      {remind && <RemindModal onClose={() => setRemind(false)} />}
    </>
  );
}
