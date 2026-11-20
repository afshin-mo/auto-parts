import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { Stamp, useUi, NumInput } from './ui';
import { Icon } from './Icon';
import { useGatewaySettings, useSmsSettings } from '../lib/integrations';
import { fmtDate, fmtMoney } from '../lib/format';

interface Link { id: string; amount: number; status: string; publicToken: string; refId?: string; createdAt: string; paidAt?: string; expiresAt: string }
const ST: Record<string, { label: string; tone: string }> = { CREATED: { label: 'ایجاد شده', tone: 'blue' }, PENDING: { label: 'در درگاه', tone: 'amber' }, PAID: { label: 'پرداخت شد', tone: 'green' }, FAILED: { label: 'ناموفق', tone: 'red' } };

/** لینک پرداخت آنلاین برای یک فاکتور فروش */
export function OnlinePayPanel({ invoiceId, remaining, hasMobile, onPaid }: { invoiceId: string; remaining: number; hasMobile: boolean; onPaid: () => void }) {
  const { data: g } = useGatewaySettings(); const { data: sms } = useSmsSettings(); const { toast } = useUi(); const qc = useQueryClient();
  const [amount, setAmount] = useState<number | ''>(''); const [err, setErr] = useState('');
  const links = useQuery({ queryKey: ['paylinks', invoiceId], enabled: !!g?.enabled, queryFn: async () => (await api.get<Link[]>(`/online-payments/invoice/${invoiceId}`)).data });
  const url = (t: string) => `${window.location.origin}/pay/${t}`;
  const create = useMutation({ mutationFn: async () => (await api.post<{ url: string }>(`/online-payments/invoice/${invoiceId}`, { amount: amount === '' ? undefined : amount })).data, onSuccess: () => { setAmount(''); setErr(''); qc.invalidateQueries({ queryKey: ['paylinks', invoiceId] }); toast('لینک پرداخت ساخته شد'); }, onError: (e: ApiError) => setErr(e.message) });
  const smsSend = useMutation({ mutationFn: (token: string) => api.post(`/sms/invoice/${invoiceId}`, { payUrl: url(token) }), onSuccess: () => toast('پیامک همراه لینک پرداخت ارسال شد'), onError: (e: ApiError) => toast(e.message, 'error') });
  const copy = async (t: string) => { await navigator.clipboard?.writeText(url(t)); toast('لینک کپی شد'); };
  const paid = !!links.data?.some((l) => l.status === 'PAID');
  // وقتی یکی از لینک‌ها پرداخت شد، فاکتور (مانده و وضعیت) دوباره خوانده می‌شود
  useEffect(() => { if (paid) onPaid(); /* eslint-disable-next-line */ }, [paid]);
  if (!g?.enabled) return null;
  return (
    <section className="sheet no-print" style={{ marginTop: 16 }}>
      <div className="sheet__head"><h2>پرداخت آنلاین</h2><span className="grow" />
        {remaining > 0 && <><div style={{ width: 150 }}><NumInput money value={amount} onChange={setAmount} placeholder={`مانده ${fmtMoney(remaining)}`} /></div>
          <button className="btn btn--sm btn--blue" disabled={create.isPending} onClick={() => create.mutate()}><Icon name="link" size={15} />ساخت لینک پرداخت</button></>}
      </div>
      <div className="sheet__body stack" style={{ gap: 8 }}>
        {err && <div className="callout red sm">{err}</div>}
        {!links.data?.length && <div className="muted">هنوز لینکی ساخته نشده. لینک را برای مشتری بفرستید تا با کارت بانکی پرداخت کند.</div>}
        {links.data?.map((l) => (
          <div key={l.id} className="row wrap" style={{ borderBottom: '2px dashed var(--line)', paddingBottom: 8 }}>
            <Stamp tone={ST[l.status]?.tone}>{ST[l.status]?.label}</Stamp><b className="num">{fmtMoney(l.amount)}</b><span className="muted sm">{fmtDate(l.createdAt)}</span>
            {l.refId && <span className="sku">پیگیری {l.refId}</span>}<span className="grow" />
            {l.status !== 'PAID' && <><button className="btn btn--sm" onClick={() => copy(l.publicToken)}>کپی لینک</button>
              {sms?.enabled && hasMobile && <button className="btn btn--sm" disabled={smsSend.isPending} onClick={() => smsSend.mutate(l.publicToken)}>ارسال با پیامک</button>}</>}
          </div>))}
      </div>
    </section>
  );
}
