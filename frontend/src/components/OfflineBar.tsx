import { Link } from 'react-router-dom';
import { toFa } from '../lib/format';
import { useOffline } from '../lib/offline';

/** نوار وضعیت اتصال و صف فروش آفلاین؛ وقتی همه‌چیز عادی است نمایش داده نمی‌شود */
export function OfflineBar() {
  const { online, pending, failed } = useOffline();
  if (online && !pending && !failed) return null;
  return (
    <div className={`callout no-print ${failed ? 'red' : ''}`} role="status" style={{ margin: '8px 16px' }}>
      {!online && <b>ارتباط با سرور قطع است. </b>}
      {!online && 'فروش سریع با کالاهای ذخیره‌شده کار می‌کند؛ بقیه‌ی بخش‌ها تا برگشت ارتباط با سرور در دسترس نیستند. '}
      {pending > 0 && <span>{toFa(pending)} مورد (فروش/کالا) در انتظار ارسال. </span>}
      {failed > 0 && <b>{toFa(failed)} مورد ارسال نشد. </b>}
      {(pending > 0 || failed > 0) && <Link to="/pos">مشاهده‌ی صف</Link>}
    </div>
  );
}
