import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { Modal, Field, NumInput, Loading, useUi } from './ui';
import { fmtMoney, fmtNum, toFa, PAY_METHOD } from '../lib/format';

interface Ctx { invoiceNumber: string; partyName?: string; items: { originalItemId: string; productName: string; sku: string; soldQuantity: number; returnedQuantity: number; returnableQuantity: number; unitRefund: number }[] }

/** ثبت برگشتی جزئی یا کامل برای فاکتور فروش/خرید */
export function ReturnModal({ kind, invoiceId, hasParty, onClose }: { kind: 'sale' | 'purchase'; invoiceId: string; hasParty: boolean; onClose: () => void }) {
  const nav = useNavigate(); const qc = useQueryClient(); const { toast } = useUi();
  const sale = kind === 'sale';
  const { data } = useQuery({ queryKey: ['returnable', kind, invoiceId], queryFn: async () => (await api.get<Ctx>(`/returns/invoice/${kind}/${invoiceId}/returnable`)).data });
  const [qty, setQty] = useState<Record<string, number | ''>>({});
  const [reason, setReason] = useState(''); const [refund, setRefund] = useState<number | ''>(''); const [method, setMethod] = useState('CASH'); const [err, setErr] = useState('');

  const total = useMemo(() => (data?.items ?? []).reduce((s, i) => s + Math.round(i.unitRefund * Number(qty[i.originalItemId] || 0)), 0), [data, qty]);
  const refundNow = refund === '' ? (hasParty ? 0 : total) : Number(refund);
  const lines = (data?.items ?? []).filter((i) => Number(qty[i.originalItemId]) > 0);
  const bad = (data?.items ?? []).some((i) => Number(qty[i.originalItemId] || 0) > i.returnableQuantity);

  const save = useMutation({
    mutationFn: async () => (await api.post<{ id: string }>(`/returns/invoice/${kind}/${invoiceId}`, {
      reason, items: lines.map((i) => ({ originalItemId: i.originalItemId, quantity: Number(qty[i.originalItemId]) })),
      refundAmount: refundNow || undefined, refundMethod: method,
    })).data,
    onSuccess: (r) => { ['sales', 'purchases', 'returns', 'invoice', 'inventory', 'products', 'dashboard', 'parties', 'payments'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); toast('برگشتی ثبت شد'); nav(`/returns/${r.id}`); },
    onError: (e: ApiError) => setErr([e.message, ...(e.details ?? [])].join(' — ')),
  });

  return (
    <Modal size="lg" title={sale ? 'ثبت برگشت از فروش' : 'ثبت برگشت از خرید'} onClose={onClose}
      footer={<><button className="btn btn--primary" disabled={!lines.length || !reason.trim() || bad || (!hasParty && refundNow !== total) || refundNow > total || save.isPending} onClick={() => { setErr(''); save.mutate(); }}>ثبت برگشتی</button><button className="btn" onClick={onClose}>انصراف</button></>}>
      {!data ? <Loading /> : (
        <div className="stack">
          <div className="callout blue sm">{sale ? 'کالای برگشتی به انبار برمی‌گردد و از بدهی مشتری کم می‌شود.' : 'کالای برگشتی از انبار کم می‌شود و از بدهی ما به تأمین‌کننده کم می‌شود.'} مبلغ هر ردیف با همان تخفیف و مالیات فاکتور اصلی محاسبه می‌شود.</div>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>کالا</th><th className="n">خریداری‌شده</th><th className="n">قبلاً برگشته</th><th style={{ width: 120 }}>تعداد برگشتی</th><th className="n">مبلغ</th></tr></thead>
            <tbody>{data.items.map((i) => (
              <tr key={i.originalItemId} className={i.returnableQuantity <= 0 ? 'dim' : ''}>
                <td><b>{i.productName}</b> <span className="sku">{i.sku}</span></td>
                <td className="n">{fmtNum(i.soldQuantity, 2)}</td><td className="n">{fmtNum(i.returnedQuantity, 2)}</td>
                <td><NumInput decimals disabled={i.returnableQuantity <= 0} value={qty[i.originalItemId] ?? ''} onChange={(v) => setQty({ ...qty, [i.originalItemId]: v })} placeholder={`حداکثر ${toFa(i.returnableQuantity)}`} />
                  {Number(qty[i.originalItemId] || 0) > i.returnableQuantity && <div className="field__err">بیش از مقدار قابل برگشت</div>}</td>
                <td className="n strong">{fmtMoney(Math.round(i.unitRefund * Number(qty[i.originalItemId] || 0)))}</td>
              </tr>))}</tbody>
            <tfoot><tr><td colSpan={4}>جمع مبلغ برگشتی</td><td className="n">{fmtMoney(total)}</td></tr></tfoot>
          </table></div>
          <Field label="علت برگشت" required><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثلاً: خرابی کالا، اشتباه در سفارش" /></Field>
          <div className="grid g3">
            <Field label={sale ? 'بازپرداخت نقدی به مشتری' : 'دریافت وجه از تأمین‌کننده'} hint={hasParty ? 'خالی = فقط از مانده حساب کم شود' : 'برای فاکتور بدون طرف‌حساب باید کل مبلغ نقد شود'}>
              <NumInput money value={refund === '' && !hasParty ? total : refund} onChange={setRefund} placeholder="۰" /></Field>
            <Field label="روش"><select className="select" value={method} onChange={(e) => setMethod(e.target.value)}>{Object.entries(PAY_METHOD).filter(([k]) => k !== 'CHECK').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <div className="chips" style={{ alignSelf: 'end', paddingBottom: 6 }}><button className="chip" onClick={() => setRefund(total)}>کل مبلغ</button><button className="chip" onClick={() => setRefund('')}>بدون بازپرداخت</button></div>
          </div>
          {hasParty && total > 0 && <div className="callout sm">پس از ثبت: <b>{fmtMoney(total - refundNow)}</b> ریال از مانده حساب طرف‌حساب کم می‌شود{refundNow > 0 && <> و <b>{fmtMoney(refundNow)}</b> ریال نقد بازپرداخت می‌شود</>}.</div>}
          {err && <div className="callout red">{err}</div>}
        </div>)}
    </Modal>
  );
}
