import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { Modal, Stamp, useUi, Loading } from './ui';
import { Icon } from './Icon';
import { TAX_STATUS, useMoodian } from '../lib/moodian';
import { useQuery } from '@tanstack/react-query';
import { fmtDate, fmtTime } from '../lib/format';

export interface TaxInfo { id: string; status: string; taxStatus?: string | null; taxAuthorityId?: string | null; taxAuthorityRef?: string | null; taxConfirmationId?: string | null; taxAuthorityError?: string | null; taxAuthoritySentAt?: string | null }

/** وضعیت و عملیات سامانه مودیان برای یک فاکتور فروش یا برگشت از فروش */
export function MoodianPanel({ inv, onChanged }: { inv: TaxInfo; onChanged: () => void }) {
  const { data: s } = useMoodian(); const { toast } = useUi(); const qc = useQueryClient();
  const [preview, setPreview] = useState(false); const [err, setErr] = useState<string[]>([]);
  const pv = useQuery({ queryKey: ['moodian-preview', inv.id, inv.taxStatus], enabled: preview, queryFn: async () => (await api.get<{ issues: string[]; payload: unknown }>(`/moodian/invoices/${inv.id}/preview`)).data });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['moodian-settings'] }); onChanged(); };
  const fail = (e: ApiError) => setErr([e.message, ...(e.details ?? [])]);
  const send = useMutation({ mutationFn: () => api.post(`/moodian/invoices/${inv.id}/send`), onSuccess: () => { toast('برای سامانه مودیان ارسال شد؛ وضعیت را استعلام کنید'); setErr([]); setPreview(false); refresh(); }, onError: fail });
  const inquire = useMutation({ mutationFn: () => api.post<{ status: string; error?: string }[]>(`/moodian/invoices/${inv.id}/inquiry`), onSuccess: (r) => { const st = r.data[0]?.status; toast(st === 'SUCCESS' ? 'فاکتور در سامانه مودیان ثبت شد' : st === 'FAILED' ? 'سازمان فاکتور را رد کرد' : 'هنوز در حال بررسی است'); setErr([]); refresh(); }, onError: fail });

  if (!s || (!s.enabled && !inv.taxStatus)) return null;
  if (inv.status === 'CANCELLED' || inv.status === 'DRAFT') return null;
  const st = TAX_STATUS[inv.taxStatus ?? 'NOT_SENT'];
  const canSend = s.enabled && (!inv.taxStatus || inv.taxStatus === 'FAILED');

  return (
    <section className="sheet no-print" style={{ marginTop: 16 }}>
      <div className="sheet__head"><h2>سامانه مودیان</h2><Stamp tone={st.tone}>{st.label}</Stamp><span className="grow" />
        <button className="btn btn--sm" onClick={() => setPreview(true)}><Icon name="eye" size={15} />پیش‌نمایش بسته</button>
        {inv.taxStatus === 'PENDING' && <button className="btn btn--sm btn--blue" disabled={inquire.isPending} onClick={() => inquire.mutate()}>{inquire.isPending ? 'در حال استعلام…' : 'استعلام وضعیت'}</button>}
        {canSend && <button className="btn btn--sm btn--primary" disabled={send.isPending} onClick={() => send.mutate()}>{send.isPending ? 'در حال ارسال…' : inv.taxStatus === 'FAILED' ? 'اصلاح و ارسال مجدد' : 'ارسال به سامانه مودیان'}</button>}
      </div>
      <div className="sheet__body stack" style={{ gap: 10 }}>
        <dl className="kv">
          <dt>شماره مالیاتی</dt><dd>{inv.taxAuthorityId ? <span className="sku">{inv.taxAuthorityId}</span> : '—'}</dd>
          <dt>شماره پیگیری</dt><dd>{inv.taxAuthorityRef ? <span className="sku">{inv.taxAuthorityRef}</span> : '—'}</dd>
          {inv.taxConfirmationId && <><dt>کد تأیید سازمان</dt><dd><span className="sku">{inv.taxConfirmationId}</span></dd></>}
          {inv.taxAuthoritySentAt && <><dt>زمان ارسال</dt><dd>{fmtDate(inv.taxAuthoritySentAt)} {fmtTime(inv.taxAuthoritySentAt)}</dd></>}
        </dl>
        {inv.taxAuthorityError && <div className={`callout ${inv.taxStatus === 'SUCCESS' ? '' : 'red'} sm`}>{inv.taxAuthorityError}</div>}
        {err.length > 0 && <div className="callout red sm">{err.map((m) => <div key={m}>{m}</div>)}</div>}
      </div>
      {preview && (
        <Modal size="lg" title="پیش‌نمایش بسته‌ی مودیان" onClose={() => setPreview(false)}
          footer={<>{canSend && <button className="btn btn--primary" disabled={!!pv.data?.issues.length || send.isPending} onClick={() => send.mutate()}>ارسال</button>}<button className="btn" onClick={() => setPreview(false)}>بستن</button></>}>
          {!pv.data ? <Loading /> : <div className="stack">
            {pv.data.issues.length > 0 ? <div className="callout red"><b>پیش از ارسال باید اصلاح شود:</b>{pv.data.issues.map((m) => <div key={m}>{m}</div>)}</div> : <div className="callout blue">مشکلی پیدا نشد. مبالغ به ریال در بسته قرار گرفته‌اند.</div>}
            <pre className="ltr" style={{ margin: 0, maxHeight: 340, overflow: 'auto', background: 'var(--concrete)', border: '2px solid var(--line)', padding: 12, fontSize: 12, textAlign: 'left', width: '100%' }}>{JSON.stringify(pv.data.payload, null, 2)}</pre>
          </div>}
        </Modal>
      )}
    </section>
  );
}
