import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { Loading, Stamp } from '../components/ui';
import { fmtDateMid, fmtMoney } from '../lib/format';

interface Info { shopName: string; invoiceNumber: string; customerName: string | null; amount: number; status: string; paidAt?: string; refId?: string | null }

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100%', background: 'var(--sign-green)', padding: 18, display: 'grid', placeItems: 'center' }}>
      <div style={{ border: '5px solid #fff', borderRadius: 18, padding: '30px 26px', width: '100%', maxWidth: 460, color: '#fff' }}>
        <div className="brand__name" style={{ fontFamily: 'var(--font-display)', fontSize: 30 }}>یدکی‌یار</div>
        <div style={{ background: '#fff', color: 'var(--ink)', borderRadius: 8, padding: 20, marginTop: 14 }}>{children}</div>
      </div>
    </div>
  );
}

/** صفحه‌ی عمومی پرداخت برای مشتری (بدون ورود) */
export function PayPage() {
  const { token } = useParams(); const nav = useNavigate(); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const { data, isLoading, error } = useQuery({ queryKey: ['pay', token], queryFn: async () => (await api.get<Info>(`/online-payments/public/${token}`)).data });
  const go = async () => {
    setBusy(true); setErr('');
    try {
      const url = (await api.post<{ payUrl: string }>(`/online-payments/public/${token}/start`)).data.payUrl;
      if (url.startsWith(window.location.origin)) nav(url.slice(window.location.origin.length)); else window.location.href = url; // درگاه بیرونی
    }
    catch (e) { setErr((e as ApiError).message); setBusy(false); }
  };
  if (isLoading) return <Frame><Loading /></Frame>;
  if (error || !data) return <Frame><h2 style={{ fontSize: 24 }}>لینک پرداخت پیدا نشد</h2><p className="muted">لینک نامعتبر است یا حذف شده. با فروشگاه تماس بگیرید.</p></Frame>;
  return (
    <Frame>
      <div className="muted sm">پرداخت فاکتور به</div><h2 style={{ fontSize: 26 }}>{data.shopName}</h2>
      <dl className="kv" style={{ margin: '14px 0' }}><dt>شماره فاکتور</dt><dd><span className="sku">{data.invoiceNumber}</span></dd>{data.customerName && <><dt>مشتری</dt><dd>{data.customerName}</dd></>}</dl>
      <div className="bigsum num">{fmtMoney(data.amount)} <small className="muted" style={{ fontSize: 16, fontFamily: 'var(--font)' }}>تومان</small></div>
      <div style={{ marginTop: 16 }}>
        {data.status === 'PAID' ? <div className="callout" style={{ background: 'var(--green-bg)', borderColor: 'var(--ok)' }}><Stamp tone="green">پرداخت شد</Stamp> {data.paidAt && fmtDateMid(data.paidAt)}{data.refId && <div className="sm">شماره پیگیری: <span className="ltr strong">{data.refId}</span></div>}</div>
          : data.status === 'EXPIRED' ? <div className="callout red">مهلت این لینک تمام شده است. از فروشگاه لینک جدید بخواهید.</div>
          : <><button className="btn btn--primary btn--block" style={{ height: 52, fontSize: 17 }} disabled={busy} onClick={go}>{busy ? 'در حال انتقال به درگاه…' : 'پرداخت آنلاین'}</button>
            <div className="muted sm" style={{ marginTop: 8, textAlign: 'center' }}>پرداخت از طریق درگاه امن بانکی زرین‌پال انجام می‌شود.</div></>}
        {err && <div className="callout red" style={{ marginTop: 10 }}>{err}</div>}
      </div>
    </Frame>
  );
}

export function PayResult() {
  const [sp] = useSearchParams(); const ok = sp.get('status') === 'ok'; const token = sp.get('token');
  const { data } = useQuery({ queryKey: ['pay', token], enabled: !!token, queryFn: async () => (await api.get<Info>(`/online-payments/public/${token}`)).data });
  return (
    <Frame>
      <h2 style={{ fontSize: 28, color: ok ? 'var(--ok)' : 'var(--alert)' }}>{ok ? 'پرداخت با موفقیت انجام شد' : 'پرداخت انجام نشد'}</h2>
      {ok && data ? <dl className="kv" style={{ marginTop: 12 }}><dt>فروشگاه</dt><dd>{data.shopName}</dd><dt>فاکتور</dt><dd><span className="sku">{data.invoiceNumber}</span></dd><dt>مبلغ</dt><dd>{fmtMoney(data.amount)} تومان</dd>{data.refId && <><dt>شماره پیگیری</dt><dd className="ltr">{data.refId}</dd></>}</dl>
        : <p className="muted">{ok ? '' : 'مبلغی از حساب شما کسر نشده یا در صورت کسر، ظرف ۷۲ ساعت توسط بانک بازگردانده می‌شود. می‌توانید دوباره از لینک پرداخت تلاش کنید.'}</p>}
      {token && !ok && <a className="btn btn--primary btn--block" style={{ marginTop: 14 }} href={`/pay/${token}`}>تلاش دوباره</a>}
    </Frame>
  );
}
