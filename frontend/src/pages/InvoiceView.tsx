import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { Icon } from '../components/Icon';
import { PageHead, Modal, Field, NumInput, Stamp, Loading, useUi } from '../components/ui';
import { JalaliDate } from '../components/JalaliDate';
import { ReturnModal } from '../components/ReturnModal';
import { MoodianPanel } from '../components/MoodianPanel';
import { useSmsSettings } from '../lib/integrations';
import { PF_STATUS } from './Proformas';
import { useAuth } from '../lib/auth';
import { INVOICE_STATUS, PAY_METHOD, daysUntil, fmtDate, fmtDateMid, fmtMoney, fmtNum, fmtTime, toFa } from '../lib/format';
import { todayISO } from '../lib/jalali';

type Kind = 'sales' | 'purchases' | 'proformas' | 'returns';
interface Inv {
  id: string; invoiceNumber: string; invoiceType: string; date: string; dueDate?: string; status: string; subtotal: number; discountAmount: number; vatAmount: number; vatPercent: number;
  totalAmount: number; paidAmount: number; remainingAmount: number; partyName?: string; notes?: string; createdAt: string;
  party?: { id: string; name: string; mobile?: string; phone?: string; address?: string };
  creator?: { name: string };
  original?: { id: string; invoiceNumber: string; invoiceType: string }; convertedTo?: { id: string; invoiceNumber: string } | null;
  items: { id: string; productName: string; sku: string; quantity: number; unitPrice: number; discountAmount: number; vatAmount: number; totalPrice: number; unit?: { name: string } }[];
  payments?: { id: string; date: string; amount: number; method: string; reference?: string }[];
  taxStatus?: string | null; taxAuthorityId?: string | null; taxAuthorityRef?: string | null; taxConfirmationId?: string | null; taxAuthorityError?: string | null; taxAuthoritySentAt?: string | null;
}

export default function InvoiceView({ kind }: { kind: Kind }) {
  const { id } = useParams(); const nav = useNavigate(); const qc = useQueryClient();
  const { has } = useAuth(); const { toast } = useUi();
  const { data: inv, isLoading } = useQuery({ queryKey: ['invoice', kind, id], queryFn: async () => (await api.get<Inv>(`/${kind}/${id}`)).data });
  const { data: shop } = useQuery({ queryKey: ['tenant'], queryFn: async () => (await api.get<{ name: string; address?: string; phone?: string; city?: string }>('/tenants/current')).data });
  const regular = kind === 'sales' || kind === 'purchases';
  const { data: smsCfg } = useSmsSettings();
  const rets = useQuery({ queryKey: ['returns', 'of', id], enabled: regular, queryFn: async () => (await api.get<{ id: string; invoiceNumber: string; date: string; totalAmount: number; notes?: string }[]>('/returns', { originalInvoiceId: id, limit: 50 })).data });

  const [modal, setModal] = useState<null | 'pay' | 'cancel' | 'return' | 'convert'>(null);
  const [amount, setAmount] = useState<number | ''>(''); const [method, setMethod] = useState('CASH'); const [pdate, setPdate] = useState(todayISO()); const [ref, setRef] = useState(''); const [reason, setReason] = useState('');
  const sendSms = useMutation({ mutationFn: () => api.post(`/sms/invoice/${id}`, {}), onSuccess: () => toast('پیامک برای مشتری ارسال شد'), onError: (e: ApiError) => toast(e.message, 'error') });
  const refresh = () => ['invoice', 'sales', 'purchases', 'proformas', 'returns', 'dashboard', 'inventory', 'products', 'parties'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

  const addPay = useMutation({ mutationFn: () => api.post(`/${kind}/${id}/payments`, { method, amount: Number(amount), date: pdate, reference: ref || undefined }),
    onSuccess: () => { toast('پرداخت ثبت شد'); setModal(null); refresh(); }, onError: (e: ApiError) => toast(e.message, 'error') });
  const doCancel = useMutation({ mutationFn: () => api.post(`/${kind}/${id}/cancel`, { reason }),
    onSuccess: () => { toast('فاکتور لغو و موجودی اصلاح شد'); setModal(null); refresh(); }, onError: (e: ApiError) => { toast(e.message, 'error'); setModal(null); } });
  const cancelPf = useMutation({ mutationFn: () => api.post(`/proformas/${id}/cancel`), onSuccess: () => { toast('پیش‌فاکتور ابطال شد'); refresh(); }, onError: (e: ApiError) => toast(e.message, 'error') });
  const convert = useMutation({ mutationFn: async () => (await api.post<{ id: string }>(`/proformas/${id}/convert`, { paidAmount: Number(amount || 0), paymentMethod: method, date: pdate })).data,
    onSuccess: (s) => { toast('به فاکتور فروش تبدیل شد'); refresh(); nav(`/sales/${s.id}`); }, onError: (e: ApiError) => toast(e.message, 'error') });

  if (isLoading || !inv) return <Loading />;
  const isPf = kind === 'proformas', isRet = kind === 'returns';
  const saleSide = kind === 'sales' || isPf || inv.invoiceType === 'SALE_RETURN';
  const title = isPf ? 'پیش‌فاکتور' : isRet ? (inv.invoiceType === 'SALE_RETURN' ? 'فاکتور برگشت از فروش' : 'فاکتور برگشت از خرید') : kind === 'sales' ? 'فاکتور فروش' : 'فاکتور خرید';
  const status = isPf ? PF_STATUS[inv.status] : INVOICE_STATUS[inv.status];
  const cancelled = inv.status === 'CANCELLED';
  const hasReturns = (rets.data?.length ?? 0) > 0;
  const canPay = regular && !cancelled && inv.remainingAmount > 0 && has(kind === 'sales' ? 'sales.receive' : 'purchases.pay');
  const backTo = isPf ? '/proformas' : isRet ? '/returns' : `/${kind}`;
  const expired = isPf && inv.status === 'DRAFT' && inv.dueDate && daysUntil(inv.dueDate) < 0;

  return (
    <>
      <PageHead title={title} sub={inv.invoiceNumber}>
        <button className="btn" onClick={() => nav(backTo)}>بازگشت</button>
        <button className="btn" onClick={() => window.print()}><Icon name="print" size={17} />چاپ</button>
        {isPf && inv.status === 'DRAFT' && has('proformas.manage') && <>
          <button className="btn btn--primary" onClick={() => { setAmount(0); setModal('convert'); }}><Icon name="check" size={17} />تبدیل به فاکتور فروش</button>
          <button className="btn btn--danger" onClick={() => cancelPf.mutate()}>ابطال</button></>}
        {kind === 'sales' && !cancelled && smsCfg?.enabled && (inv.party?.mobile || inv.party?.phone) && <button className="btn" disabled={sendSms.isPending} onClick={() => sendSms.mutate()}>پیامک به مشتری</button>}
        {canPay && <button className="btn btn--blue" onClick={() => { setAmount(inv.remainingAmount); setModal('pay'); }}><Icon name="wallet" size={17} />{kind === 'sales' ? 'ثبت دریافت' : 'ثبت پرداخت'}</button>}
        {regular && !cancelled && inv.status !== 'DRAFT' && has('returns.create') && <button className="btn" onClick={() => setModal('return')}><Icon name="undo" size={17} />ثبت برگشتی</button>}
        {regular && !cancelled && has(kind === 'sales' ? 'sales.cancel' : 'purchases.cancel') && !hasReturns && <button className="btn btn--danger" onClick={() => setModal('cancel')}>لغو فاکتور</button>}
      </PageHead>

      {expired && <div className="callout red no-print" style={{ marginBottom: 14 }}>اعتبار این پیش‌فاکتور تمام شده است؛ پیش از تبدیل، قیمت‌ها را با قیمت روز مقایسه کنید.</div>}
      {isPf && inv.convertedTo && <div className="callout blue no-print" style={{ marginBottom: 14 }}>این پیش‌فاکتور به فاکتور <Link to={`/sales/${inv.convertedTo.id}`}><span className="sku">{inv.convertedTo.invoiceNumber}</span></Link> تبدیل شده است.</div>}

      <div className="invoice">
        <div className="invoice__top">
          <div>
            <div className="invoice__title">{title}</div>
            <div style={{ marginTop: 8 }} className="strong">{shop?.name}</div>
            <div className="muted sm">{[shop?.city, shop?.address].filter(Boolean).join('، ')}{shop?.phone && <> | تلفن <span className="ltr">{shop.phone}</span></>}</div>
          </div>
          <dl className="kv" style={{ alignContent: 'start' }}>
            <dt>شماره</dt><dd><span className="sku">{inv.invoiceNumber}</span></dd>
            <dt>تاریخ</dt><dd>{fmtDateMid(inv.date)}</dd>
            {isPf && inv.dueDate && <><dt>اعتبار تا</dt><dd>{fmtDateMid(inv.dueDate)}</dd></>}
            <dt>ثبت</dt><dd>{fmtDate(inv.createdAt)} {fmtTime(inv.createdAt)}</dd>
            <dt>وضعیت</dt><dd><Stamp tone={status?.tone ?? 'gray'}>{status?.label ?? inv.status}</Stamp></dd>
            {inv.creator && <><dt>صادرکننده</dt><dd>{inv.creator.name}</dd></>}
            {inv.taxStatus === 'SUCCESS' && inv.taxAuthorityId && <><dt>شماره مالیاتی</dt><dd><span className="sku">{inv.taxAuthorityId}</span></dd></>}
            {isRet && inv.original && <><dt>فاکتور اصلی</dt><dd><Link to={`/${inv.original.invoiceType === 'SALE' ? 'sales' : 'purchases'}/${inv.original.id}`}><span className="sku">{inv.original.invoiceNumber}</span></Link></dd></>}
          </dl>
        </div>
        <div className="row" style={{ marginBottom: 14, alignItems: 'flex-start' }}>
          <dl className="kv grow">
            <dt>{saleSide ? 'مشتری' : 'تأمین‌کننده'}</dt>
            <dd>{inv.party ? <Link to={`/parties/${inv.party.id}`}>{inv.party.name}</Link> : inv.partyName ?? (saleSide ? 'مشتری متفرقه' : '—')}</dd>
            {inv.party?.mobile && <><dt>تلفن</dt><dd className="ltr">{inv.party.mobile}</dd></>}
            {inv.party?.address && <><dt>نشانی</dt><dd>{inv.party.address}</dd></>}
          </dl>
          {cancelled && <span className="seal">{isPf ? 'باطل شد' : 'لغو شد'}</span>}
        </div>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>#</th><th>شرح کالا</th><th className="n">تعداد</th><th className="n">قیمت واحد</th><th className="n">تخفیف</th><th className="n">مالیات</th><th className="n">جمع (ریال)</th></tr></thead>
          <tbody>{inv.items.map((it, i) => (
            <tr key={it.id}><td>{toFa(i + 1)}</td><td><div className="strong">{it.productName}</div><span className="sku">{it.sku}</span></td>
              <td className="n">{fmtNum(it.quantity, 2)} {it.unit?.name}</td><td className="n">{fmtMoney(it.unitPrice)}</td><td className="n">{fmtMoney(it.discountAmount)}</td><td className="n">{fmtMoney(it.vatAmount)}</td><td className="n strong">{fmtMoney(it.totalPrice)}</td></tr>))}</tbody>
        </table></div>
        <div className="row" style={{ marginTop: 18, alignItems: 'flex-start' }}>
          <div className="grow">{inv.notes && <><div className="muted sm">{isRet ? 'علت برگشت' : 'توضیحات'}</div><div>{inv.notes}</div></>}</div>
          <div className="totals">
            <div><span>جمع اقلام</span><b className="num">{fmtMoney(inv.subtotal)}</b></div>
            {inv.discountAmount > 0 && !isRet && <div><span>تخفیف کل</span><b className="num">- {fmtMoney(inv.discountAmount)}</b></div>}
            <div><span>مالیات ({toFa(inv.vatPercent)}٪)</span><b className="num">{fmtMoney(inv.vatAmount)}</b></div>
            <div className="grand"><span>{isRet ? 'مبلغ برگشتی' : 'مبلغ کل'}</span><span className="num">{fmtMoney(inv.totalAmount)}</span></div>
            {!isPf && <><div><span>{isRet ? 'بازپرداخت‌شده' : 'پرداخت‌شده'}</span><b className="num t-pos">{fmtMoney(inv.paidAmount)}</b></div>
              <div><span>{isRet ? 'کسر از مانده حساب' : 'مانده'}</span><b className={`num ${!isRet && inv.remainingAmount > 0 ? 't-neg' : ''}`}>{fmtMoney(inv.remainingAmount)}</b></div></>}
          </div>
        </div>
      </div>

      {(kind === 'sales' || (isRet && inv.invoiceType === 'SALE_RETURN')) && <div className="no-print"><MoodianPanel inv={inv} onChanged={refresh} /></div>}

      {hasReturns && (
        <section className="sheet no-print" style={{ marginTop: 16 }}>
          <div className="sheet__head"><h2>برگشتی‌های این فاکتور</h2></div>
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>شماره</th><th>تاریخ</th><th>علت</th><th className="n">مبلغ</th></tr></thead>
            <tbody>{rets.data!.map((r) => <tr key={r.id} className="clickable" onClick={() => nav(`/returns/${r.id}`)}><td><span className="sku">{r.invoiceNumber}</span></td><td>{fmtDate(r.date)}</td><td className="muted">{r.notes}</td><td className="n strong">{fmtMoney(r.totalAmount)}</td></tr>)}</tbody></table></div>
        </section>
      )}
      {regular && (inv.payments?.length ?? 0) > 0 && (
        <section className="sheet no-print" style={{ marginTop: 16 }}>
          <div className="sheet__head"><h2>پرداخت‌های این فاکتور</h2></div>
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>تاریخ</th><th>روش</th><th>مرجع</th><th className="n">مبلغ</th></tr></thead>
            <tbody>{inv.payments!.map((p) => <tr key={p.id}><td>{fmtDate(p.date)}</td><td>{PAY_METHOD[p.method]}</td><td className="muted">{p.reference ?? '—'}</td><td className="n strong">{fmtMoney(p.amount)}</td></tr>)}</tbody></table></div>
        </section>
      )}

      {modal === 'return' && <ReturnModal kind={kind === 'sales' ? 'sale' : 'purchase'} invoiceId={inv.id} hasParty={!!inv.party} onClose={() => setModal(null)} />}
      {(modal === 'pay' || modal === 'convert') && <Modal size="sm" title={modal === 'convert' ? 'تبدیل به فاکتور فروش' : kind === 'sales' ? 'ثبت دریافت' : 'ثبت پرداخت'} onClose={() => setModal(null)}
        footer={<><button className="btn btn--primary" disabled={(modal === 'pay' && !amount) || addPay.isPending || convert.isPending} onClick={() => (modal === 'pay' ? addPay.mutate() : convert.mutate())}>{modal === 'convert' ? 'تبدیل و صدور فاکتور' : 'ثبت'}</button><button className="btn" onClick={() => setModal(null)}>انصراف</button></>}>
        <div className="stack">
          {modal === 'convert'
            ? <div className="callout blue sm">با تبدیل، کالاها از انبار کم و فاکتور فروش با همین قیمت‌ها صادر می‌شود. اگر موجودی کافی نباشد، تبدیل انجام نمی‌شود.</div>
            : <div className="callout blue">مانده فاکتور: <b>{fmtMoney(inv.remainingAmount)}</b> ریال</div>}
          <Field label={modal === 'convert' ? 'مبلغ دریافتی همین حالا (اختیاری)' : 'مبلغ'} required={modal === 'pay'}><NumInput money value={amount} onChange={setAmount} autoFocus placeholder="۰" /></Field>
          {modal === 'convert' && <div className="chips"><button className="chip" onClick={() => setAmount(inv.totalAmount)}>تسویه کامل</button><button className="chip" onClick={() => setAmount(0)}>نسیه</button></div>}
          <div className="grid g2">
            <Field label="روش"><select className="select" value={method} onChange={(e) => setMethod(e.target.value)}>{Object.entries(PAY_METHOD).filter(([k]) => k !== 'CHECK').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <Field label="تاریخ"><JalaliDate value={pdate} onChange={setPdate} /></Field>
          </div>
          {modal === 'pay' && <Field label="شماره پیگیری / فیش"><input className="input input--num" value={ref} onChange={(e) => setRef(e.target.value)} /></Field>}
        </div></Modal>}
      {modal === 'cancel' && <Modal size="sm" title="لغو فاکتور" onClose={() => setModal(null)}
        footer={<><button className="btn btn--danger" disabled={!reason.trim() || doCancel.isPending} onClick={() => doCancel.mutate()}>لغو فاکتور</button><button className="btn" onClick={() => setModal(null)}>انصراف</button></>}>
        <div className="stack">
          <div className="callout">{kind === 'sales' ? 'کالاها به انبار برمی‌گردند' : 'کالاها از انبار کم می‌شوند (در صورت موجود بودن)'} و بدهی طرف‌حساب اصلاح می‌شود. این کار برگشت‌پذیر نیست. برای برگشت بخشی از کالاها از «ثبت برگشتی» استفاده کنید.</div>
          <Field label="علت لغو" required><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus /></Field>
        </div></Modal>}
    </>
  );
}
