import { FormEvent, useState } from 'react';
import { useAuth } from '../lib/auth';
import { Field } from '../components/ui';
import { ApiError, IS_MOCK } from '../lib/api';

export default function Login() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [f, setF] = useState({ phone: IS_MOCK ? '09120000000' : '', password: IS_MOCK ? 'demo1234' : '', name: '', tenantName: '', tenantSlug: '' });
  const [err, setErr] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr([]); setBusy(true);
    try {
      if (mode === 'login') await login(f.phone, f.password);
      else await register({ name: f.name, phone: f.phone, password: f.password, tenantName: f.tenantName, tenantSlug: f.tenantSlug });
    } catch (x) {
      const a = x as ApiError;
      setErr([a.message, ...(a.details ?? [])]);
    } finally { setBusy(false); }
  }

  return (
    <div className="auth">
      <section className="auth__sign">
        <div>
          <span className="plate"><b>IR</b><span>۱۲ ایران ۳۴۵</span></span>
          <div>
            <h1>یدکی‌یار</h1>
            <p>فروش، انبار، چک و حساب مشتری‌ها؛ همه روی یک مسیر. قطعه را با شماره فنی پیدا کن و فاکتور را در چند ثانیه بزن.</p>
          </div>
          <div className="auth__road" />
        </div>
      </section>
      <section className="auth__form">
        <form className="auth__card stack" onSubmit={submit}>
          <div><h2>{mode === 'login' ? 'ورود به فروشگاه' : 'ساخت فروشگاه جدید'}</h2>
            <span className="muted">{mode === 'login' ? 'با شماره موبایل و رمز عبور وارد شوید' : '۳۰ روز آزمایشی، بدون نیاز به کارت بانکی'}</span></div>
          {IS_MOCK && <div className="callout blue sm">حالت پیش‌نمایش: اطلاعات نمونه است و به سرور وصل نیست.</div>}
          {mode === 'register' && <>
            <Field label="نام و نام خانوادگی" required><input className="input" value={f.name} onChange={set('name')} /></Field>
            <Field label="نام فروشگاه" required><input className="input" value={f.tenantName} onChange={set('tenantName')} /></Field>
            <Field label="نشانی اختصاصی (انگلیسی)" required hint="مثلاً ali-parts"><input className="input input--num" value={f.tenantSlug} onChange={set('tenantSlug')} /></Field>
          </>}
          <Field label="شماره موبایل" required><input className="input input--num" inputMode="tel" autoComplete="username" placeholder="09123456789" value={f.phone} onChange={set('phone')} /></Field>
          <Field label="رمز عبور" required><input className="input input--num" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={f.password} onChange={set('password')} /></Field>
          {err.length > 0 && <div className="callout red">{err.map((m) => <div key={m}>{m}</div>)}</div>}
          <button className="btn btn--primary btn--block" disabled={busy}>{busy ? 'در حال ارسال…' : mode === 'login' ? 'ورود' : 'ساخت فروشگاه'}</button>
          <button type="button" className="btn btn--ghost btn--block" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setErr([]); }}>
            {mode === 'login' ? 'فروشگاه ندارید؟ ثبت‌نام کنید' : 'حساب دارید؟ وارد شوید'}
          </button>
        </form>
      </section>
    </div>
  );
}
