import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { Field, Stamp, useUi, Loading } from './ui';
import { useMoodian } from '../lib/moodian';
import { useUnits } from '../lib/queries';
import { fmtDate, fmtTime, toFa } from '../lib/format';

export function MoodianSettings() {
  const qc = useQueryClient(); const { toast } = useUi();
  const { data: s } = useMoodian(); const units = useUnits().data;
  const [f, setF] = useState({ environment: 'sandbox', memoryId: '', economicCode: '', privateKey: '' });
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tone: 'blue' | 'red'; text: string } | null>(null);

  useEffect(() => { if (s) { setF({ environment: s.environment, memoryId: s.memoryId, economicCode: s.economicCode, privateKey: '' }); setCodes({ pcs: '1627', ...s.unitCodes }); } }, [s]);
  const done = () => qc.invalidateQueries({ queryKey: ['moodian-settings'] });
  const fail = (e: ApiError) => setMsg({ tone: 'red', text: [e.message, ...(e.details ?? [])].join(' — ') });

  const save = useMutation({
    mutationFn: (extra?: Record<string, unknown>) => api.put('/moodian/settings', { environment: f.environment, memoryId: f.memoryId || undefined, economicCode: f.economicCode || undefined, privateKey: f.privateKey || undefined, unitCodes: codes, ...extra }),
    onSuccess: () => { toast('تنظیمات مودیان ذخیره شد'); setMsg(null); done(); }, onError: fail,
  });
  const fetchKey = useMutation({ mutationFn: () => api.post('/moodian/settings/fetch-server-key'), onSuccess: () => { toast('کلید عمومی سازمان دریافت شد'); setMsg(null); done(); }, onError: fail });
  const test = useMutation({ mutationFn: () => api.post<{ environment: string }>('/moodian/settings/test'), onSuccess: (r) => { setMsg({ tone: 'blue', text: `اتصال موفق بود (محیط ${r.data.environment === 'sandbox' ? 'آزمایشی' : 'اصلی'}) و توکن دریافت شد.` }); done(); }, onError: fail });

  if (!s) return <Loading />;
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const step = (n: number, ok: boolean, label: string) => <div className="row" style={{ gap: 8 }}><Stamp tone={ok ? 'green' : 'gray'}>{toFa(n)}</Stamp><span className={ok ? 'strong' : 'muted'}>{label}</span></div>;

  return (
    <section className="sheet">
      <div className="sheet__head"><h2>اتصال به سامانه مودیان</h2><span className="grow" />
        <Stamp tone={s.enabled ? 'green' : 'gray'}>{s.enabled ? 'فعال' : 'غیرفعال'}</Stamp></div>
      <div className="sheet__body stack">
        {!s.encryptionConfigured && <div className="callout red sm">برای ذخیره‌ی امن کلید خصوصی، متغیر <span className="ltr">ENCRYPTION_KEY</span> باید در بکند تنظیم شود (<span className="ltr">openssl rand -hex 32</span>).</div>}
        <div className="callout blue sm">
          این اتصال با روش «شناسه یکتای حافظه مالیاتی + کلید خصوصی» (نسخه ۱ API) کار می‌کند. ابتدا در <b>محیط آزمایشی</b> سازمان آزمون کنید؛ فقط وقتی همه‌چیز تأیید شد به محیط اصلی بروید.
        </div>
        <div className="stack" style={{ gap: 6 }}>
          {step(1, !!(s.memoryId && s.economicCode), 'شناسه حافظه مالیاتی و شماره اقتصادی')}
          {step(2, s.hasPrivateKey, 'کلید خصوصی (رمزشده ذخیره می‌شود)')}
          {step(3, s.hasServerKey, 'کلید عمومی سازمان')}
          {step(4, s.enabled, 'فعال‌سازی')}
        </div>
        <div className="grid g2">
          <Field label="محیط"><select className="select" value={f.environment} onChange={set('environment')}><option value="sandbox">آزمایشی (sandbox)</option><option value="production">اصلی (production)</option></select></Field>
          <Field label="شناسه یکتای حافظه مالیاتی" hint="۶ کاراکتر؛ همان نام کاربری شما در سامانه"><input className="input input--num" maxLength={6} value={f.memoryId} onChange={set('memoryId')} /></Field>
          <Field label="شماره اقتصادی فروشنده"><input className="input input--num" value={f.economicCode} onChange={set('economicCode')} /></Field>
          <Field label="شناسه کلید سازمان"><input className="input input--num" readOnly value={s.serverKeyId || '—'} /></Field>
          <Field className="span2" label="کلید خصوصی (PEM)" hint={s.hasPrivateKey ? 'یک کلید ذخیره شده است؛ فقط برای تغییر، کلید جدید را بچسبانید' : 'متن کامل کلید خصوصی را بچسبانید. هرگز دوباره نمایش داده نمی‌شود.'}>
            <textarea className="textarea input--num" style={{ minHeight: 90 }} placeholder="-----BEGIN PRIVATE KEY-----" value={f.privateKey} onChange={set('privateKey')} /></Field>
        </div>
        <div>
          <div className="field__label" style={{ marginBottom: 6 }}>کد واحد اندازه‌گیری در فهرست سازمان</div>
          <div className="grid g3">{units?.map((u) => <Field key={u.id} label={u.name}><input className="input input--num" placeholder={u.code === 'pcs' ? '1627' : 'کد مالیاتی'} value={codes[u.code] ?? ''} onChange={(e) => setCodes({ ...codes, [u.code]: e.target.value.replace(/\D/g, '') })} /></Field>)}</div>
          <div className="muted sm" style={{ marginTop: 4 }}>کد «عدد» ۱۶۲۷ است. کد بقیه‌ی واحدها را از فهرست رسمی سازمان وارد کنید؛ ردیف‌هایی که واحدشان کد ندارد ارسال نمی‌شوند.</div>
        </div>
        {msg && <div className={`callout ${msg.tone === 'red' ? 'red' : 'blue'}`}>{msg.text}</div>}
        {s.lastError && !msg && <div className="callout red sm">آخرین خطا: {s.lastError}</div>}
        <div className="row wrap">
          <button className="btn btn--primary" disabled={save.isPending} onClick={() => save.mutate(undefined)}>ذخیره</button>
          <button className="btn" disabled={!s.hasPrivateKey || fetchKey.isPending} onClick={() => fetchKey.mutate()}>دریافت کلید از سازمان</button>
          <button className="btn" disabled={!s.hasPrivateKey || test.isPending} onClick={() => test.mutate()}>آزمون اتصال</button>
          <span className="grow" />
          <button className={`btn ${s.enabled ? 'btn--danger' : 'btn--blue'}`} disabled={save.isPending || (!s.enabled && !s.ready)} onClick={() => save.mutate({ enabled: !s.enabled })}>{s.enabled ? 'غیرفعال‌سازی' : 'فعال‌سازی ارسال'}</button>
        </div>
        <div className="row wrap sm muted" style={{ gap: 18 }}>
          <span>ارسال‌نشده: <b>{toFa(s.counts.notSent)}</b></span><span>در انتظار: <b>{toFa(s.counts.pending)}</b></span><span>ثبت‌شده: <b>{toFa(s.counts.success)}</b></span><span>رد شده: <b>{toFa(s.counts.failed)}</b></span>
          {s.lastSyncAt && <span>آخرین همگام‌سازی: {fmtDate(s.lastSyncAt)} {fmtTime(s.lastSyncAt)}</span>}
        </div>
      </div>
    </section>
  );
}
