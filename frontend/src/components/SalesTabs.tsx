import { NavLink } from 'react-router-dom';

export function SalesTabs() {
  const items: [string, string][] = [['/sales', 'فاکتورهای فروش'], ['/proformas', 'پیش‌فاکتورها'], ['/returns', 'برگشتی‌ها']];
  return (
    <div className="tabs no-print" style={{ marginBottom: 0 }}>
      {items.map(([to, label]) => <NavLink key={to} to={to} className={({ isActive }) => `tab ${isActive ? 'on' : ''}`} style={{ textDecoration: 'none' }}>{label}</NavLink>)}
    </div>
  );
}
