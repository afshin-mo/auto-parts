import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { Icon } from '../components/Icon';
import { PageHead, Field, NumInput, Stamp, useDebounced, useUi } from '../components/ui';
import { ScanButton } from '../components/BarcodeScanner';
import { PartyPicker } from '../components/PartyPicker';
import { useAuth } from '../lib/auth';
import { JalaliDate } from '../components/JalaliDate';
import { calcInvoice } from '../lib/calc';
import { Party, Product, LookupHit, useWarehouses, branchWarehouses } from '../lib/queries';
import { useVat } from '../lib/vat';
import { fmtMoney, fmtNum, toFa, PAY_METHOD, fmtSale } from '../lib/format';
import { addDaysISO, todayISO } from '../lib/jalali';

interface Lot { id: string; unitCost: number; quantity: number; supplierName?: string | null }
interface Line { uid: string; lotId?: string; cost?: number; whStock?: number; productId: string; name: string; sku: string; unit?: string; stock: number; isService: boolean; unitPrice: number | ''; quantity: number | ''; discountPercent: number | '' }

export default function InvoiceForm({ kind }: { kind: 'sales' | 'purchases' | 'proformas' }) {
  const isProforma = kind === 'proformas';
  const isSale = kind !== 'purchases';
  const [validUntil, setValidUntil] = useState(addDaysISO(todayISO(), 7));
  const nav = useNavigate(); const { toast } = useUi();
  const [sp] = useSearchParams();
  const { branchId, branch } = useAuth();
  const whs = branchWarehouses(useWarehouses().data, branchId);
  const allBranches = branchId === 'all';
  const [altFor, setAltFor] = useState<LookupHit | null>(null);
  const [lotFor, setLotFor] = useState<{ p: Product | LookupHit; lots: Lot[] } | null>(null);
  // بهای تمام‌شده: به‌صورت پیش‌فرض قیمتِ خرید را هنگام فروش می‌پرسیم؛ با «میانگین موزون» (تنظیمات) نمی‌پرسیم
  const tenant = useQuery({ queryKey: ['tenant'], queryFn: async () => (await api.get<{ settings?: { costMethod?: string } }>('/tenants/current')).data });
  const askLot = isSale && !isProforma && tenant.data?.settings?.costMethod !== 'AVERAGE';
  const [party, setParty] = useState<Party | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [date, setDate] = useState(todayISO());
  const [warehouseId, setWarehouseId] = useState('');
  const vat = useVat();
  const [discount, setDiscount] = useState<number | ''>('');
  const [paid, setPaid] = useState<number | ''>('');
  const [paidTouched, setPaidTouched] = useState(false);
  const [method, setMethod] = useState('CASH');
  const [notes, setNotes] = useState('');
  const [supplierInv, setSupplierInv] = useState('');
  const [updatePrice, setUpdatePrice] = useState(true);
  const [search, setSearch] = useState(''); const [idx, setIdx] = useState(0);
  const [errs, setErrs] = useState<string[]>([]);
  const dq = useDebounced(search, 200);
  const searchRef = useRef<HTMLInputElement>(null);

  const { data: hits } = useQuery({ queryKey: ['posearch', dq], enabled: dq.length >= 1, queryFn: async () => (await api.get<LookupHit[]>('/products/lookup', { q: dq, limit: 8 })).data });

  // افزودن کالا از آدرس ?product=ID (مثلاً از لیست کم‌موجودی)
  useEffect(() => { const pid = sp.get('product') ?? sp.get('add'); if (pid) api.get<Product>(`/products/${pid}`).then((r) => add(r.data)); /* eslint-disable-next-line */ }, []);

  const addLine = (p: Product | LookupHit, stock: number, lot?: Lot, whStock?: number) => {
    setAltFor(null); setLotFor(null);
    setLines((ls) => {
      // فروش: هر ردیف قیمت یک سطر؛ خرید: فقط هم‌قیمت‌ها یک سطر (قیمت متفاوت = سطر جدا = ردیف موجودی جدا)
      const i = ls.findIndex((l) => l.productId === p.id && (isSale ? l.lotId === lot?.id : Number(l.unitPrice) === Number(p.purchasePrice)));
      if (i >= 0) return ls.map((l, k) => (k === i ? { ...l, quantity: Number(l.quantity || 0) + 1 } : l));
      return [...ls, { uid: Math.random().toString(36).slice(2), lotId: lot?.id, cost: lot?.unitCost, whStock, productId: p.id, name: p.name, sku: p.sku, unit: p.unit?.name, stock, isService: p.isService, unitPrice: isSale ? p.salePrice || '' : p.purchasePrice, quantity: 1, discountPercent: isSale && party?.discountPercent ? party.discountPercent : '' }];
    });
    setSearch(''); setIdx(0); searchRef.current?.focus();
  };
  const add = async (p: Product | LookupHit) => {
    const stock = p.branchStock ?? p.totalStock;
    if (isSale && !isProforma && !p.isService && stock <= 0) {
      const alts = (p as LookupHit).alternatives;
      toast(`«${p.name}» در این شعبه ناموجود است${p.otherBranchStock ? ' (در شعبه‌ی دیگر موجود است)' : ''}`, 'error');
      if (alts?.length) setAltFor(p as LookupHit);
      return;
    }
    if (askLot && !p.isService) {
      const lots = (await api.get<{ lots: Lot[] }>('/inventory/lots', { productId: p.id, warehouseId: warehouseId || undefined })).data.lots;
      const whStock = lots.reduce((n, l) => n + Number(l.quantity), 0);
      if (lots.length > 1) { setLotFor({ p, lots }); setSearch(''); return; }   // چند قیمت: از کاربر بپرس
      if (lots.length === 1) return addLine(p, lots[0].quantity, lots[0], whStock);
    }
    addLine(p, stock);
  };
  // بارکدخوان‌ها بعد از اسکن سریع Enter می‌زنند، قبل از آن‌که نتیجه‌ی جستجو بیاید؛ پس خودمان مستقیم می‌پرسیم
  const enterSearch = async () => {
    const term = search.trim(); if (!term) return;
    const fresh = term === dq && hits ? hits : (await api.get<LookupHit[]>('/products/lookup', { q: term, limit: 8 })).data;
    const pick = fresh[term === dq ? idx : 0];
    if (pick) add(pick); else toast('کالایی پیدا نشد', 'error');
  };
  const upd = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));

  const vatPercent = vat.percent;
  const calc = useMemo(() => calcInvoice(lines.map((l) => ({ quantity: Number(l.quantity || 0), unitPrice: Number(l.unitPrice || 0), discountPercent: Number(l.discountPercent || 0) })), { discountAmount: Number(discount || 0), vatPercent }), [lines, discount, vatPercent]);

  // مبلغ دریافتی تا وقتی کاربر دست نزده، برابر کل فاکتور است
  useEffect(() => { if (!paidTouched && !isProforma) setPaid(calc.total); }, [calc.total, paidTouched, isProforma]);

  const overStock = isSale && !isProforma ? lines.filter((l) => !l.isService && Number(l.quantity) > l.stock) : [];
  const remaining = calc.total - Number(paid || 0);
  const needParty = !isProforma && remaining > 0 && !party;
  const valid = !allBranches && lines.length > 0 && lines.every((l) => Number(l.quantity) > 0 && (isSale ? Number(l.unitPrice) > 0 : l.unitPrice !== '')) && !vat.missing && overStock.length === 0 && !needParty && Number(paid || 0) <= calc.total;

  // Ctrl+Enter = ثبت فاکتور
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && validRef.current && !save.isPending) { e.preventDefault(); setErrs([]); save.mutate(); } };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
    // eslint-disable-next-line
  }, []);
  const validRef = useRef(false); validRef.current = valid;

  const save = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        partyId: party?.id, date, vatPercent, notes: notes || undefined, discountAmount: Number(discount || 0) || undefined,
        ...(isProforma ? { validUntil } : { warehouseId: warehouseId || undefined, paidAmount: Number(paid || 0), paymentMethod: method }),
        items: lines.map((l) => ({ productId: l.productId, lotId: l.lotId, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice), discountPercent: Number(l.discountPercent || 0) })),
      };
      if (!isSale) { body.supplierInvoiceNumber = supplierInv || undefined; body.updatePurchasePrice = updatePrice; }
      return (await api.post<{ id: string }>(`/${kind}`, body)).data;
    },
    onSuccess: (inv) => { toast('فاکتور ثبت شد'); nav(`/${kind}/${inv.id}`); },
    onError: (e: ApiError) => { setErrs([e.message, ...(e.details ?? [])]); window.scrollTo({ top: 0, behavior: 'smooth' }); },
  });

  return (
    <>
      <PageHead title={isProforma ? 'پیش‌فاکتور جدید' : isSale ? 'فاکتور فروش جدید' : 'فاکتور خرید جدید'} sub={isProforma ? 'بدون اثر روی انبار و حساب مشتری؛ بعداً به فاکتور تبدیل می‌شود' : isSale ? 'کالا را با نام یا شماره فنی پیدا کنید و Enter بزنید' : 'ورود کالا به انبار و ثبت بدهی تأمین‌کننده'} />
      {allBranches && <div className="callout red" style={{ marginBottom: 14 }}>حالت «همه‌ی شعبه‌ها» فقط برای مشاهده است؛ برای ثبت فاکتور از بالای صفحه یک شعبه انتخاب کنید.</div>}
      {branch && !allBranches && (whs.length === 0) && <div className="callout red" style={{ marginBottom: 14 }}>برای شعبه‌ی «{branch.name}» انبار تعریف نشده است.</div>}
      {errs.length > 0 && <div className="callout red" style={{ marginBottom: 14 }}>{errs.map((m) => <div key={m}>{m}</div>)}</div>}
      <div className="pos">
        <div className="stack">
          <section className="sheet">
            <div style={{ position: 'relative' }}>
              <div className="row" style={{ padding: 12, background: 'var(--concrete)', borderBottom: '2px solid var(--asphalt)' }}>
                <input ref={searchRef} className="input grow" style={{ height: 50, fontSize: 17 }} autoFocus placeholder="نام کالا، SKU، شماره فنی یا بارکد را بنویسید و Enter بزنید…" value={search}
                  onChange={(e) => { setSearch(e.target.value); setIdx(0); }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, (hits?.length ?? 1) - 1)); }
                    if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
                    if (e.key === 'Enter') { e.preventDefault(); enterSearch(); }
                  }} />
                <ScanButton onCode={async (c) => { const r = (await api.get<LookupHit[]>('/products/lookup', { q: c, limit: 3 })).data; if (r[0]) add(r[0]); else toast('کالایی با این بارکد پیدا نشد', 'error'); }} />
              </div>
              {altFor && (
                <div className="callout" style={{ margin: 12 }}>
                  <div className="row"><b className="grow">«{altFor.name}» ناموجود است — جایگزین‌های پیشنهادی:</b><button className="btn btn--sm btn--icon" onClick={() => setAltFor(null)} aria-label="بستن"><Icon name="x" size={14} /></button></div>
                  {altFor.alternatives.map((a) => (
                    <div key={a.product.id} className="row wrap" style={{ padding: '6px 0' }}>
                      <span className="sku">{a.product.sku}</span><span className="grow">{a.product.name}<div className="muted sm">{a.reason}</div></span>
                      <span className="stock num">{toFa(a.product.branchStock ?? a.product.totalStock)}</span><b className="num">{fmtSale(a.product.salePrice)}</b>
                      <button className="btn btn--sm btn--primary" onClick={() => add(a.product)}>افزودن</button>
                    </div>
                  ))}
                </div>
              )}
              {lotFor && (
                <div className="callout" style={{ margin: 12 }}>
                  <div className="row"><b className="grow">«{lotFor.p.name}» با چند قیمت خرید در انبار است — از کدام قیمت فروخته شود؟</b><button className="btn btn--sm btn--icon" onClick={() => setLotFor(null)} aria-label="بستن"><Icon name="x" size={14} /></button></div>
                  {lotFor.lots.map((l) => (
                    <div key={l.id} className="row wrap" style={{ padding: '6px 0' }}>
                      <span className="grow">قیمت خرید: <b className="num">{fmtMoney(l.unitCost)}</b>{l.supplierName && <span className="muted sm"> · {l.supplierName}</span>}</span>
                      <span className="stock num">موجود: {toFa(l.quantity)}</span>
                      <button className="btn btn--sm btn--primary" onClick={() => addLine(lotFor.p, l.quantity, l, lotFor.lots.reduce((n, x) => n + Number(x.quantity), 0))}>انتخاب</button>
                    </div>
                  ))}
                </div>
              )}
              {dq.length >= 1 && hits && (
                <div className="hits">
                  {hits.length === 0 && <div className="muted" style={{ padding: 14 }}>کالایی پیدا نشد</div>}
                  {hits.map((p, i) => (
                    <button key={p.id} className={`hit ${i === idx ? 'on' : ''}`} onClick={() => add(p)}>
                      <span className="sku">{p.sku}</span>
                      <span className="hit__name">{p.name}<div className="hit__meta">{[p.brand?.name, p.oemCode && `OEM ${p.oemCode}`, p.location && `محل ${p.location}`].filter(Boolean).join(' | ')}</div></span>
                      {!p.isService && (() => { const st = p.branchStock ?? p.totalStock; return <span className={`stock num ${st <= 0 ? 'out' : st <= p.minStock ? 'low' : ''}`}>{st <= 0 ? (p.otherBranchStock ? `شعبه‌ی دیگر: ${toFa(p.otherBranchStock)}` : 'ناموجود') : toFa(st)}</span>; })()}
                      <b className="num">{isSale ? fmtSale(p.salePrice) : fmtMoney(p.purchasePrice)}</b>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {lines.length === 0 ? (
              <div className="empty"><Icon name="receipt" size={46} /><strong>فاکتور خالی است</strong><div>اولین کالا را از کادر بالا جستجو کنید</div></div>
            ) : (
              <div className="tbl-wrap"><table className="tbl">
                <thead><tr><th>کالا</th><th style={{ width: 110 }}>تعداد</th><th style={{ width: 150 }}>قیمت واحد</th><th style={{ width: 90 }}>تخفیف ٪</th><th className="n" style={{ width: 130 }}>جمع ردیف</th><th style={{ width: 44 }} /></tr></thead>
                <tbody>{lines.map((l, i) => (
                  <tr key={l.uid}>
                    <td><div className="strong">{l.name}</div><div className="row sm" style={{ gap: 8 }}><span className="sku">{l.sku}</span>{isSale && !l.isService && <span className={`stock ${l.stock < Number(l.quantity) ? 'out' : ''} sm`}>{l.lotId ? 'موجود با این قیمت' : 'موجود'}: {toFa(l.stock)}</span>}{isSale && !l.isService && l.lotId && <span className="muted sm">موجودی انبار: {toFa(l.whStock ?? l.stock)}</span>}{l.lotId && <span className="muted sm">قیمت خرید: {fmtMoney(l.cost)}</span>}</div></td>
                    <td><NumInput decimals value={l.quantity} onChange={(v) => upd(i, { quantity: v })} /></td>
                    <td><NumInput money value={l.unitPrice} onChange={(v) => upd(i, { unitPrice: v })} /></td>
                    <td><NumInput decimals value={l.discountPercent} onChange={(v) => upd(i, { discountPercent: v === '' ? '' : Math.min(100, v) })} placeholder="۰" /></td>
                    <td className="n strong">{fmtMoney(calc.items[i]?.net)}</td>
                    <td><button className="btn btn--sm btn--icon btn--danger" onClick={() => setLines((ls) => ls.filter((_, k) => k !== i))} aria-label="حذف ردیف"><Icon name="trash" size={15} /></button></td>
                  </tr>))}</tbody>
              </table></div>
            )}
            {overStock.length > 0 && <div className="callout red" style={{ margin: 12 }}>تعداد درخواستی از موجودی بیشتر است: {overStock.map((l) => l.name).join('، ')}</div>}
          </section>
          <section className="sheet"><div className="sheet__body grid g2">
            <Field label="توضیحات فاکتور" className="span2"><textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} style={{ minHeight: 60 }} /></Field>
          </div></section>
        </div>

        <aside className="pos__side stack">
          <section className="sheet"><div className="sheet__body stack">
            <Field label={isSale ? 'مشتری' : 'تأمین‌کننده'}><PartyPicker type={isSale ? 'CUSTOMER' : 'SUPPLIER'} value={party} onChange={(p) => { setParty(p); if (isSale && p?.discountPercent) setLines((ls) => ls.map((l) => (l.discountPercent === '' ? { ...l, discountPercent: p.discountPercent! } : l))); }} /></Field>
            <div className="grid g2">
              <Field label="تاریخ فاکتور"><JalaliDate value={date} onChange={setDate} /></Field>
              {isProforma
                ? <Field label="اعتبار تا"><JalaliDate value={validUntil} onChange={setValidUntil} /></Field>
                : <Field label={isSale ? 'انبار خروج' : 'انبار ورود'}><select className="select" value={warehouseId} onChange={(e) => { setWarehouseId(e.target.value); if (lines.some((l) => l.lotId)) { setLines([]); setLotFor(null); toast('انبار عوض شد؛ چون قیمت‌ها به انبار وابسته‌اند، ردیف‌ها پاک شد', 'error'); } }}><option value="">پیش‌فرض شعبه</option>{whs.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>}
            </div>
            {!isSale && <Field label="شماره فاکتور تأمین‌کننده"><input className="input input--num" value={supplierInv} onChange={(e) => setSupplierInv(e.target.value)} /></Field>}
          </div></section>

          <section className="sheet"><div className="sheet__body">
            <div className="totals" style={{ width: '100%' }}>
              <div><span>جمع اقلام</span><b className="num">{fmtMoney(calc.subtotal)}</b></div>
              <div className="row"><span className="grow">تخفیف کل</span><div style={{ width: 130 }}><NumInput money value={discount} onChange={setDiscount} placeholder="۰" /></div></div>
              <div><label className="check"><input type="checkbox" checked={vat.on} onChange={(e) => vat.setOn(e.target.checked)} />مالیات بر ارزش افزوده</label>{vat.on && <span className="row" style={{ gap: 4 }}><NumInput value={vat.raw} onChange={vat.setPercent} placeholder="درصد" /><span>٪</span></span>}<b className="num">{fmtMoney(calc.vatAmount)}</b></div>
              <div className="grand"><span>قابل پرداخت</span><span className="num">{fmtMoney(calc.total)}</span></div>
            </div>
            <div className="stack" style={{ marginTop: 14 }}>
              {!isProforma && <>
              <div className="grid g2">
                <Field label={isSale ? 'دریافتی' : 'پرداختی'}><NumInput money value={paid} onChange={(v) => { setPaid(v); setPaidTouched(true); }} /></Field>
                <Field label="روش"><select className="select" value={method} onChange={(e) => setMethod(e.target.value)}>{Object.entries(PAY_METHOD).filter(([k]) => k !== 'CHECK').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
              </div>
              <div className="chips">
                <button className="chip" onClick={() => { setPaid(calc.total); setPaidTouched(true); }}>تسویه کامل</button>
                <button className="chip" onClick={() => { setPaid(Math.round(calc.total / 2)); setPaidTouched(true); }}>نصف</button>
                <button className="chip" onClick={() => { setPaid(0); setPaidTouched(true); }}>نسیه</button>
              </div>
              {remaining > 0 && <div className={`callout ${needParty ? 'red' : ''}`}>{needParty ? 'برای نسیه ابتدا ' + (isSale ? 'مشتری' : 'تأمین‌کننده') + ' را انتخاب کنید' : <>مانده حساب این فاکتور: <b>{fmtMoney(remaining)}</b> ریال</>}</div>}
              {!isSale && <label className="check sm"><input type="checkbox" checked={updatePrice} onChange={(e) => setUpdatePrice(e.target.checked)} />قیمت خرید کالاها با این فاکتور به‌روز شود</label>}
              </>}
              <button className="btn btn--primary btn--block" style={{ height: 52, fontSize: 17 }} disabled={!valid || save.isPending} onClick={() => { setErrs([]); save.mutate(); }}>
                {save.isPending ? 'در حال ثبت…' : isProforma ? 'ثبت پیش‌فاکتور' : isSale ? 'ثبت فاکتور فروش' : 'ثبت فاکتور خرید'}
              </button>
              <div className="muted sm" style={{ textAlign: 'center' }}>{toFa(lines.length)} ردیف | {fmtNum(lines.reduce((s, l) => s + Number(l.quantity || 0), 0), 2)} عدد</div>
            </div>
          </div></section>
        </aside>
      </div>
    </>
  );
}
