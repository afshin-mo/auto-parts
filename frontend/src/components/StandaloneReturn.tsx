import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { Modal, Field, NumInput } from './ui';
import { ProductPicker } from './ProductPicker';
import { PartyPicker } from './PartyPicker';
import { Icon } from './Icon';
import { calcInvoice } from '../lib/calc';
import { Party, Product } from '../lib/queries';
import { fmtMoney, PAY_METHOD } from '../lib/format';

interface Line { productId: string; name: string; sku: string; quantity: number | ''; unitPrice: number | '' }

/** برگشتی مستقل از فاکتور اصلی: قابل ارسال به سامانه مودیان نیست (فاکتور مرجع ندارد) */
export function StandaloneReturn({ onClose }: { onClose: () => void }) {
  const nav = useNavigate(); const qc = useQueryClient();
  const [kind, setKind] = useState<'sale' | 'purchase'>('sale');
  const [party, setParty] = useState<Party | null>(null); const [lines, setLines] = useState<Line[]>([]);
  const [picker, setPicker] = useState<Product | null>(null);
  const [vatOn, setVatOn] = useState(true); const [reason, setReason] = useState('');
  const [refund, setRefund] = useState<number | ''>(''); const [method, setMethod] = useState('CASH'); const [err, setErr] = useState('');
  const sale = kind === 'sale';

  const calc = useMemo(() => calcInvoice(lines.map((l) => ({ quantity: Number(l.quantity || 0), unitPrice: Number(l.unitPrice || 0), discountPercent: 0 })), { vatPercent: vatOn ? 9 : 0 }), [lines, vatOn]);
  const refundNow = refund === '' ? (party ? 0 : calc.total) : Number(refund);
  const valid = lines.length > 0 && lines.every((l) => Number(l.quantity) > 0 && l.unitPrice !== '') && reason.trim() && refundNow <= calc.total && (!!party || refundNow === calc.total) && (kind === 'purchase' ? true : true);

  const add = (p: Product) => { setPicker(null); setLines((ls) => ls.some((l) => l.productId === p.id) ? ls : [...ls, { productId: p.id, name: p.name, sku: p.sku, quantity: 1, unitPrice: sale ? p.salePrice : p.purchasePrice }]); };
  const save = useMutation({
    mutationFn: async () => (await api.post<{ id: string }>(`/returns/standalone/${kind}`, { partyId: party?.id, reason, vatPercent: vatOn ? 9 : 0, refundAmount: refundNow || undefined, refundMethod: method, items: lines.map((l) => ({ productId: l.productId, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) })) })).data,
    onSuccess: (r) => { ['returns', 'inventory', 'products', 'parties', 'dashboard'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); nav(`/returns/${r.id}`); },
    onError: (e: ApiError) => setErr([e.message, ...(e.details ?? [])].join(' — ')),
  });

  return (
    <Modal size="lg" title="برگشتی بدون فاکتور اصلی" onClose={onClose}
      footer={<><button className="btn btn--primary" disabled={!valid || save.isPending} onClick={() => { setErr(''); save.mutate(); }}>ثبت برگشتی</button><button className="btn" onClick={onClose}>انصراف</button></>}>
      <div className="stack">
        <div className="callout sm">این برگشتی به فاکتوری ارجاع ندارد و <b>به سامانه مودیان ارسال نمی‌شود</b>. اگر فاکتور اصلی را دارید، از صفحه‌ی همان فاکتور «ثبت برگشتی» بزنید.</div>
        <div className="chips"><button className={`chip ${sale ? 'on' : ''}`} onClick={() => { setKind('sale'); setParty(null); setLines([]); }}>برگشت از فروش (مشتری)</button><button className={`chip ${!sale ? 'on' : ''}`} onClick={() => { setKind('purchase'); setParty(null); setLines([]); }}>برگشت از خرید (تأمین‌کننده)</button></div>
        <Field label={sale ? 'مشتری' : 'تأمین‌کننده'}><PartyPicker type={sale ? 'CUSTOMER' : 'SUPPLIER'} value={party} onChange={setParty} /></Field>
        <Field label="افزودن کالا"><ProductPicker value={picker} onChange={(p) => (p ? add(p) : setPicker(null))} /></Field>
        {lines.length > 0 && <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>کالا</th><th style={{ width: 110 }}>تعداد</th><th style={{ width: 150 }}>مبلغ هر واحد</th><th className="n">جمع</th><th style={{ width: 44 }} /></tr></thead>
          <tbody>{lines.map((l, i) => <tr key={l.productId}><td><b>{l.name}</b> <span className="sku">{l.sku}</span></td>
            <td><NumInput decimals value={l.quantity} onChange={(v) => setLines((ls) => ls.map((x, k) => (k === i ? { ...x, quantity: v } : x)))} /></td>
            <td><NumInput money value={l.unitPrice} onChange={(v) => setLines((ls) => ls.map((x, k) => (k === i ? { ...x, unitPrice: v } : x)))} /></td>
            <td className="n strong">{fmtMoney(calc.items[i]?.total)}</td>
            <td><button className="btn btn--sm btn--icon btn--danger" onClick={() => setLines((ls) => ls.filter((_, k) => k !== i))}><Icon name="trash" size={14} /></button></td></tr>)}</tbody>
          <tfoot><tr><td colSpan={3}><label className="check"><input type="checkbox" checked={vatOn} onChange={(e) => setVatOn(e.target.checked)} />مالیات ۹٪ ({fmtMoney(calc.vatAmount)})</label></td><td className="n">{fmtMoney(calc.total)}</td><td /></tr></tfoot></table></div>}
        <Field label="علت برگشت" required><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <div className="grid g3">
          <Field label={sale ? 'بازپرداخت نقدی به مشتری' : 'دریافت وجه از تأمین‌کننده'} hint={party ? 'خالی = فقط از مانده حساب کم شود' : 'بدون طرف‌حساب، کل مبلغ نقد می‌شود'}><NumInput money value={refund === '' && !party ? calc.total : refund} onChange={setRefund} placeholder="۰" /></Field>
          <Field label="روش"><select className="select" value={method} onChange={(e) => setMethod(e.target.value)}>{Object.entries(PAY_METHOD).filter(([k]) => k !== 'CHECK').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        </div>
        {err && <div className="callout red">{err}</div>}
      </div>
    </Modal>
  );
}
