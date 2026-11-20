import { Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ALL_BRANCHES } from '../lib/branch';
import { useQuery } from '@tanstack/react-query';
import { Icon, IconName } from './Icon';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { fmtDateLong, fmtMoney, ROLES, toFa, fmtSale } from '../lib/format';
import { useDebounced, useOutside, Modal, Loading } from './ui';
import type { LookupHit } from '../lib/queries';
import { OfflineBar } from './OfflineBar';
import { startAutoSync } from '../lib/offline';
import { fitCount } from '../lib/fit';
import { ErrorBoundary } from './ErrorBoundary';

/** corner: در نوار منوی اصلی نمی‌آید (آیکون گوشه‌ی هدر است) ولی در منوی «بیشتر»ِ موبایل هست */
interface NavItem { to: string; label: string; icon: IconName; perms?: string[]; mobile?: boolean; corner?: boolean }
const NAV: NavItem[] = [
  { to: '/', label: 'میز کار', icon: 'gauge', mobile: true },
  { to: '/lookup', label: 'جستجوی قطعه', icon: 'search', perms: ['products.view'], mobile: true },
  { to: '/sales', label: 'فروش', icon: 'receipt', perms: ['sales.view'], mobile: true },
  { to: '/pos', label: 'فروش سریع', icon: 'receipt', perms: ['sales.create'] },
  { to: '/products', label: 'کالاها', icon: 'box', perms: ['products.view'], mobile: true },
  { to: '/inventory', label: 'انبار', icon: 'warehouse', perms: ['inventory.view'] },
  { to: '/duplicates', label: 'کالاهای تکراری', icon: 'box', perms: ['inventory.adjust', 'products.delete'] },
  { to: '/purchases', label: 'خرید', icon: 'truck', perms: ['purchases.view'] },
  { to: '/parties', label: 'طرف‌حساب‌ها', icon: 'users', perms: ['parties.view'] },
  { to: '/debts', label: 'بدهکاران و بستانکاران', icon: 'clock', perms: ['reports.debts'] },
  { to: '/payments', label: 'دریافت و پرداخت', icon: 'wallet', perms: ['payments.view'] },
  { to: '/expenses', label: 'هزینه‌ها', icon: 'tag', perms: ['expenses.view'] },
  { to: '/checks', label: 'چک‌ها', icon: 'cheque', perms: ['checks.view'] },
  { to: '/reports', label: 'گزارش‌ها', icon: 'chart', perms: ['reports.sales', 'reports.products', 'reports.profit', 'reports.debts'] },
  { to: '/catalog', label: 'اطلاعات پایه', icon: 'car' },
  { to: '/import', label: 'انتقال از نرم‌افزار قبلی', icon: 'upload', perms: ['data.import'] },
  { to: '/settings', label: 'تنظیمات', icon: 'cog', corner: true },
];

/**
 * نوار منوی اصلی: هر تعداد آیتم که در عرض جا شد دیده می‌شود و بقیه در «بیشتر ▾» می‌روند، پس در هر مانیتوری همه‌ی گزینه‌ها در دسترس‌اند.
 * عرض‌ها از یک ردیف پنهانِ هم‌قالب اندازه‌گیری می‌شود (قبل از رسم، بدون پرش).
 */
function Lanes({ items, alsoSales }: { items: NavItem[]; alsoSales: boolean }) {
  const { pathname } = useLocation();
  const navRef = useRef<HTMLElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const itemsKey = items.map((n) => n.to).join('|');
  const [fit, setFit] = useState(items.length);
  const [open, setOpen] = useState(false);
  useOutside(moreRef, () => setOpen(false));
  useEffect(() => setOpen(false), [pathname]);

  useLayoutEffect(() => {
    const nav = navRef.current, m = measureRef.current;
    if (!nav || !m) return;
    const calc = () => {
      const widths = Array.from(m.children, (c) => (c as HTMLElement).offsetWidth);
      const moreW = widths.pop() ?? 0;                                   // آخرین فرزند همیشه دکمه‌ی «بیشتر» است
      const cs = getComputedStyle(nav);
      setFit(fitCount(widths, moreW, nav.clientWidth - parseFloat(cs.paddingLeft || '0') - parseFloat(cs.paddingRight || '0')));
    };
    calc();
    const ro = new ResizeObserver(calc);                                 // تغییر اندازه‌ی پنجره و بارشدن فونت
    ro.observe(nav); ro.observe(m);
    return () => ro.disconnect();
  }, [itemsKey]);   // کلید پایدار؛ آرایه‌ی items در هر رندر جدید ساخته می‌شود

  const isActive = (n: NavItem) => (n.to === '/' ? pathname === '/' : pathname === n.to || pathname.startsWith(n.to + '/')) || (n.to === '/sales' && alsoSales);
  const shown = items.slice(0, fit), hidden = items.slice(fit);
  return (
    <nav className="lanes" aria-label="بخش‌ها" ref={navRef}>
      {shown.map((n) => (
        <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive: a }) => `lane ${a || (n.to === '/sales' && alsoSales) ? 'active' : ''}`}>
          <Icon name={n.icon} size={19} />{n.label}
        </NavLink>
      ))}
      {hidden.length > 0 && (
        <div className="lane-more" ref={moreRef} onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}>
          <button className={`lane ${hidden.some(isActive) ? 'active' : ''}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            <Icon name="menu" size={19} />بیشتر ▾
          </button>
          {open && (
            <div className="lane-menu" role="menu">
              {hidden.map((n) => (
                <NavLink key={n.to} to={n.to} role="menuitem" className={() => `lane-menu__it ${isActive(n) ? 'active' : ''}`}>
                  <Icon name={n.icon} size={19} />{n.label}
                </NavLink>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="lanes__measure" ref={measureRef} aria-hidden="true">
        {items.map((n) => <span key={n.to} className="lane"><Icon name={n.icon} size={19} />{n.label}</span>)}
        <span className="lane"><Icon name="menu" size={19} />بیشتر ▾</span>
      </div>
    </nav>
  );
}

/** انتخاب شعبه‌ی فعال (فقط اگر کاربر به بیش از یک شعبه دسترسی دارد) */
function BranchSwitcher() {
  const { user, branchId, setBranch } = useAuth();
  if (!user || user.branches.length < 2) return user?.branches[0] ? <span className="branchchip hide-sm"><Icon name="building" size={16} />{user.branches[0].name}</span> : null;
  return (
    <label className="branchchip">
      <Icon name="building" size={16} />
      <select aria-label="شعبه‌ی فعال" value={branchId ?? ''} onChange={(e) => e.target.value !== branchId && setBranch(e.target.value)}>
        {user.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        <option value={ALL_BRANCHES}>همه‌ی شعبه‌ها (فقط مشاهده)</option>
      </select>
    </label>
  );
}

/** نوار پایین موبایل: چهار بخش پرکاربرد + «بیشتر» */
function MobileNav({ items, alsoSales }: { items: NavItem[]; alsoSales: boolean }) {
  const [more, setMore] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setMore(false), [pathname]);
  const main = items.filter((n) => n.mobile).slice(0, 4);
  return (
    <>
      <nav className="tabbar" aria-label="ناوبری موبایل">
        {main.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `tabbar__it ${isActive || (n.to === '/sales' && alsoSales) ? 'active' : ''}`}><Icon name={n.icon} size={22} /><span>{n.label}</span></NavLink>
        ))}
        <button className="tabbar__it" onClick={() => setMore(true)}><Icon name="menu" size={22} /><span>بیشتر</span></button>
      </nav>
      {more && (
        <Modal title="همه‌ی بخش‌ها" onClose={() => setMore(false)}>
          <div className="moregrid">{items.map((n) => <NavLink key={n.to} to={n.to} end={n.to === '/'} className="moregrid__it"><Icon name={n.icon} size={22} />{n.label}</NavLink>)}</div>
        </Modal>
      )}
    </>
  );
}

function GlobalSearch() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const dq = useDebounced(q.trim(), 250);
  const nav = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useOutside(ref, () => setOpen(false));

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); input.current?.focus(); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const { data } = useQuery({
    queryKey: ['gsearch', dq], enabled: dq.length >= 2,
    queryFn: async () => (await api.get<LookupHit[]>('/products/lookup', { q: dq, limit: 8, alternatives: 'false' })).data,
  });
  const go = (p: LookupHit) => { setOpen(false); setQ(''); nav(`/products?open=${p.id}`); };

  return (
    <div className="gsearch" ref={ref}>
      <input ref={input} value={q} placeholder="جستجوی شماره فنی، کد OEM، نام یا بارکد کالا…"
        onChange={(e) => { setQ(e.target.value); setOpen(true); setIdx(0); }} onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, (data?.length ?? 1) - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
          if (e.key === 'Enter' && data?.[idx]) go(data[idx]);
          if (e.key === 'Escape') setOpen(false);
        }} />
      <Icon name="search" />
      {open && dq.length >= 2 && (
        <div className="gresults">
          {!data?.length && <div style={{ padding: 14 }} className="muted">موردی پیدا نشد</div>}
          {data?.map((p, i) => (
            <button key={p.id} className={i === idx ? 'on' : ''} onClick={() => go(p)}>
              <span className="sku">{p.sku}</span>
              <span className="grow strong">{p.name}</span>
              <span className="muted sm">{p.isService ? '' : `${toFa(p.branchStock ?? p.totalStock)} موجود · `}{fmtSale(p.salePrice)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Layout() {
  const { user, logout, has } = useAuth();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const alsoSales = pathname.startsWith('/proformas') || pathname.startsWith('/returns');
  const items = NAV.filter((n) => !n.perms || has(...n.perms));
  useEffect(() => (user ? startAutoSync({ tenantId: user.tenantId, userId: user.id }) : undefined), [user]);
  return (
    <div className="app">
      <header className="gantry">
        <div className="gantry__panel">
          <NavLink to="/" className="brand">
            <span className="brand__plate">
              <svg width="26" height="26" viewBox="0 0 64 64" fill="none"><circle cx="32" cy="32" r="16" stroke="#f2c417" strokeWidth="8" /><circle cx="32" cy="32" r="4" fill="#fff" /></svg>
            </span>
            <span><div className="brand__name">یدکی‌یار</div><div className="brand__shop">{user?.tenantName}</div></span>
          </NavLink>
          <GlobalSearch />
          <BranchSwitcher />
          <div className="gmeta"><strong>{fmtDateLong(new Date())}</strong><span className="hide-sm">تقویم شمسی</span></div>
          <div className="userchip">
            <div className="userchip__av">{user?.name?.[0]}</div>
            <div className="hide-sm"><div className="strong">{user?.name}</div><small>{user?.roleName ?? ROLES[user?.role ?? ''] ?? user?.role}</small></div>
            <NavLink to="/settings" className={({ isActive }) => `linkbtn ${isActive ? 'active' : ''}`} title="تنظیمات" aria-label="تنظیمات"><Icon name="cog" size={20} /></NavLink>
            <button className="linkbtn" title="خروج" onClick={() => { logout(); nav('/login'); }}><Icon name="out" size={20} /></button>
          </div>
        </div>
        <div style={{ height: 10 }} />
      </header>
      <Lanes items={items.filter((n) => !n.corner)} alsoSales={alsoSales} />
      <main className="page"><OfflineBar /><ErrorBoundary key={pathname}><Suspense fallback={<Loading />}><Outlet /></Suspense></ErrorBoundary></main>
      <MobileNav items={items} alsoSales={alsoSales} />
    </div>
  );
}
