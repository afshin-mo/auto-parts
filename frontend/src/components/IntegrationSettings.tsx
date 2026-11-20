import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { Field, Stamp, useUi, Loading } from './ui';
import { useSmsSettings } from '../lib/integrations';
import { fmtDate, fmtTime } from '../lib/format';

export function SmsSettingsCard() {
  const qc = useQueryClient(); const { toast } = useUi(); const { data: s } = useSmsSettings();
  const [f, setF] = useState({ provider: 'log', sender: '', apiKey: '' }); const [to, setTo] = useState(''); const [err, setErr] = useState('');
  const logs = useQuery({ queryKey: ['sms-logs'], queryFn: async () => (await api.get<{ id: string; receptor: string; kind: string; status: string; error?: string; createdAt: string }[]>('/sms/logs', { limit: 5 })).data });
  useEffect(() => { if (s) setF({ provider: s.provider, sender: s.sender, apiKey: '' }); }, [s]);
  const done = () => { qc.invalidateQueries({ queryKey: ['sms-settings'] }); qc.invalidateQueries({ queryKey: ['sms-logs'] }); };
  const fail = (e: ApiError) => setErr(e.message);
  const save = useMutation({ mutationFn: (x?: Record<string, unknown>) => api.put('/sms/settings', { provider: f.provider, sender: f.sender || undefined, apiKey: f.apiKey || undefined, ...x }), onSuccess: () => { toast('تنظیمات پیامک ذخیره شد'); setErr(''); done(); }, onError: fail });
  const test = useMutation({ mutationFn: () => api.post('/sms/test', { receptor: to }), onSuccess: () => { toast('پیامک آزمایشی ارسال شد'); setErr(''); done(); }, onError: fail });
  if (!s) return <Loading />;
  const KIND: Record<string, string> = { TEST: 'آزمایشی', INVOICE: 'فاکتور', REMINDER: 'یادآوری بدهی' };
  return (
    <section className="sheet">
      <div className="sheet__head"><h2>پیامک</h2><span className="grow" /><Stamp tone={s.enabled ? 'green' : 'gray'}>{s.enabled ? 'فعال' : 'غیرفعال'}</Stamp></div>
      <div className="sheet__body stack">
        {!s.encryptionConfigured && <div className="callout red sm">برای ذخیره‌ی امن کلید API، <span className="ltr">ENCRYPTION_KEY</span> باید در بکند تنظیم شود.</div>}
        <div className="grid g2">
          <Field label="سرویس‌دهنده"><select className="select" value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value })}><option value="kavenegar">کاوه‌نگار</option><option value="smsir">SMS.ir</option><option value="log">آزمایشی (بدون ارسال واقعی)</option></select></Field>
          <Field label="شماره خط ارسال‌کننده" hint={f.provider === 'smsir' ? 'فقط عدد' : undefined}><input className="input input--num" value={f.sender} onChange={(e) => setF({ ...f, sender: e.target.value })} /></Field>
          {f.provider !== 'log' && <Field className="span2" label="کلید API" hint={s.hasApiKey ? 'یک کلید ذخیره شده است؛ فقط برای تغییر، کلید جدید را بنویسید' : 'از پنل سرویس‌دهنده بگیرید؛ هرگز دوباره نمایش داده نمی‌شود'}><input className="input input--num" type="password" autoComplete="off" value={f.apiKey} onChange={(e) => setF({ ...f, apiKey: e.target.value })} /></Field>}
        </div>
        {err && <div className="callout red sm">{err}</div>}
        <div className="row wrap">
          <button className="btn btn--primary" disabled={save.isPending} onClick={() => save.mutate(undefined)}>ذخیره</button>
          <span className="grow" />
          <button className={`btn ${s.enabled ? 'btn--danger' : 'btn--blue'}`} onClick={() => save.mutate({ enabled: !s.enabled })}>{s.enabled ? 'غیرفعال‌سازی' : 'فعال‌سازی'}</button>
        </div>
        {s.enabled && <div className="row"><input className="input input--num" placeholder="موبایل برای پیامک آزمایشی" value={to} onChange={(e) => setTo(e.target.value)} /><button className="btn" disabled={!to || test.isPending} onClick={() => test.mutate()}>ارسال آزمایشی</button></div>}
        {logs.data && logs.data.length > 0 && <div><div className="field__label" style={{ marginBottom: 4 }}>آخرین پیامک‌ها</div>
          {logs.data.map((l) => <div key={l.id} className="row sm" style={{ borderBottom: '2px dashed var(--line)', padding: '4px 0' }}><span className="ltr">{l.receptor}</span><span className="muted">{KIND[l.kind] ?? l.kind}</span><span className="grow" /><Stamp tone={l.status === 'SENT' ? 'green' : 'red'}>{l.status === 'SENT' ? 'ارسال شد' : 'ناموفق'}</Stamp><span className="muted">{fmtDate(l.createdAt)} {fmtTime(l.createdAt)}</span></div>)}</div>}
      </div>
    </section>
  );
}
