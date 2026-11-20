import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { api, ApiError } from '../lib/api';
import { calcInvoice } from '../lib/calc';
import { fmtDate, fmtMoney, fmtTime, toFa, fmtSale } from '../lib/format';
import { useVat } from '../lib/vat';
import {
  CatalogItem, CatalogLot, CatalogMeta, QueuedSale, discardSale, enqueueSale, flushQueue, getCatalog, getCatalogMeta, getCustomers, isOnline, listQueue, normalize, syncCustomers, CachedCustomer, retrySale, searchCatalog, syncCatalog, useOffline,
} from '../lib/offline';
import { Icon } from '../components/Icon';
import { Empty, Modal, NumInput, PageHead, Stamp, useUi } from '../components/ui';

interface Line { uid: string; lotId?: string; cost?: number; productId: string; name: string; sku: string; isService: boolean; stock: number; unitPrice: number | ''; quantity: number | '' }
interface Done { id: string; total: number; lines: QueuedSale['lines']; createdAt: string; invoiceNumber?: string; error?: string; partyName?: string; vatPercent: number }

const STALE_MS = 6 * 3600_000;
const newId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** چاپ بدون دست‌زدن به CSS چاپ برنامه: HTML رسید در یک iframe پنهان چاپ می‌شود */
function printReceipt(shop: string, d: Done) {
  const rows = d.lines.map((l) => `<tr><td>${esc(l.name)}</td><td>${toFa(l.quantity)}</td><td>${fmtMoney(l.unitPrice)}</td><td>${fmtMoney(Math.round(l.quantity * l.unitPrice))}</td></tr>`).join('');
  const html = `<html dir="rtl"><head><meta charset="utf-8"><style>body{font:13px sans-serif;margin:8mm}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px dashed #999;padding:4px;text-align:right}h3,p{margin:4px 0}</style></head><body>
    <h3>${esc(shop)}</h3><p>${fmtDate(d.createdAt)} ${fmtTime(d.createdAt)}</p>
    ${d.partyName ? `<p>مشتری: <b>${esc(d.partyName)}</b></p>` : ''}
    <p>${d.invoiceNumber ? `فاکتور ${esc(d.invoiceNumber)}` : '<b>رسید موقت</b> — شماره‌ی فاکتور بعد از ارسال به سرور ثبت می‌شود'}</p>
    <table><tr><th>کالا</th><th>تعداد</th><th>قیمت</th><th>مبلغ</th></tr>${rows}</table>
    <p><b>${d.vatPercent ? `جمع با مالیات ${toFa(d.vatPercent)}٪ (برآورد)` : 'جمع (برآورد)'}: ${fmtMoney(d.total)}</b></p></body></html>`;
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;width:0;height:0;border:0';
  document.body.appendChild(f);
  f.contentDocument!.open(); f.contentDocument!.write(html); f.contentDocument!.close();
  f.contentWindow!.focus(); f.contentWindow!.print();
  setTimeout(() => f.remove(), 2000);
}

export default function QuickSale() {
  const { user, branchId } = useAuth();
  const { toast, confirm } = useUi();
  const off = useOffline();
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [meta, setMeta] = useState<CatalogMeta | null>(null);
  const [syncing, setSyncing] = useState('');
  const [q, setQ] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [method, setMethod] = useState<'CASH' | 'CARD' | 'TRANSFER' | 'CREDIT'>('CASH');
  const [partyName, setPartyName] = useState('');
  const [paidNow, setPaidNow] = useState<number | ''>('');
  const [customers, setCustomers] = useState<CachedCustomer[]>([]);
  // اگر نام تایپ‌شده دقیقاً یکی از مشتریان ثبت‌شده باشد، همان مشتری انتخاب می‌شود
  const customer = useMemo(() => customers.find((c) => normalize(c.name) === normalize(partyName)), [customers, partyName]);
  const vat = useVat();
  const [done, setDone] = useState<Done | null>(null);
  const [lotFor, setLotFor] = useState<{ p: CatalogItem; lots: CatalogLot[] } | null>(null);
  const [queue, setQueue] = useState<QueuedSale[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const scope = useMemo(() => ({ tenantId: user!.tenantId, userId: user!.id }), [user]);
  const canSell = !!branchId && branchId !== 'all';

  const reloadQueue = useCallback(() => { void listQueue().then(setQueue); }, []);
  useEffect(reloadQueue, [reloadQueue, off.pending, off.failed]);

  const sync = useCallback(async () => {
    setSyncing('در حال دریافت کالاها…');
    try {
      const m = await syncCatalog(scope, (p, n) => setSyncing(`در حال دریافت کالاها… ${toFa(p)} از ${toFa(n)}`));
      setMeta(m); setItems(await getCatalog());
    } catch (e) { toast(e instanceof ApiError ? e.message : 'دریافت کالاها انجام نشد', 'error'); }
    finally { setSyncing(''); }
  }, [scope, toast]);

  useEffect(() => {
    void (async () => {
      void getCustomers().then(setCustomers);
      if (isOnline()) void syncCustomers().then(setCustomers).catch(() => { /* دسترسی/شبکه */ });
      const m = await getCatalogMeta();
      const mine = m && m.tenantId === scope.tenantId && m.branchId === branchId;
      if (mine) { setMeta(m); setItems(await getCatalog()); }
      if (!isOnline() || !canSell) return;
      // کالای تازه‌ثبت‌شده (از هر صفحه‌ای): اگر تعداد کالاهای سرور با فهرست این دستگاه فرق دارد، دوباره دریافت کن
      let changed = false;
      if (mine) try { changed = (await api.get('/products', { page: 1, limit: 1, isActive: true })).meta?.total !== m.count; } catch { /* آفلاین */ }
      if (!mine || changed || Date.now() - m.syncedAt > STALE_MS) void sync();
    })();
  }, [scope, branchId, canSell, sync]);

  // موجودی مؤثر = موجودیِ آخرین دریافت − فروش‌های هنوز ارسال‌نشده‌ی همین شعبه
  const reserved = useMemo(() => {
    const m = new Map<string, number>();
    const bump = (k: string, n: number) => m.set(k, (m.get(k) ?? 0) + n);
    for (const s of queue) if (s.status === 'pending' && s.branchId === branchId) for (const l of s.lines) { bump(`p:${l.productId}`, l.quantity); if (l.lotId) bump(`l:${l.lotId}`, l.quantity); }
    return m;
  }, [queue, branchId]);
  const hits = useMemo(() => searchCatalog(items, q), [items, q]);

  const addLine = (p: CatalogItem, lot?: CatalogLot) => {
    const left = lot ? lot.qty - (reserved.get(`l:${lot.id}`) ?? 0) : p.stock - (reserved.get(`p:${p.id}`) ?? 0);
    const inCart = lines.filter((l) => l.productId === p.id && (!lot || l.lotId === lot.id)).reduce((n, l) => n + Number(l.quantity || 0), 0);
    if (!p.isService && left - inCart <= 0) { toast(`«${p.name}»${lot ? ' با این قیمت' : ''} موجودی ندارد (بر اساس آخرین دریافت کالاها)`, 'error'); return; }
    setLotFor(null);
    setLines((ls) => ls.some((l) => l.productId === p.id && l.lotId === lot?.id)
      ? ls.map((l) => (l.productId === p.id && l.lotId === lot?.id ? { ...l, quantity: Number(l.quantity || 0) + 1 } : l))
      : [...ls, { uid: newId(), lotId: lot?.id, cost: lot?.cost, productId: p.id, name: p.name, sku: p.sku, isService: p.isService, stock: left, unitPrice: p.salePrice || '', quantity: 1 }]);
    if (!p.salePrice) toast(`قیمت «${p.name}» ثبت نشده؛ قیمت فروش را در سبد وارد کنید`);
    setQ(''); searchRef.current?.focus();
  };
  // کالایی که با چند قیمت خرید در انبار است: قیمت را از فروشنده می‌پرسیم (با میانگین موزون نمی‌پرسیم)
  const add = (p: CatalogItem) => {
    const lots = meta?.costMethod === 'AVERAGE' || p.isService ? [] : (p.lots ?? []).filter((l) => l.qty - (reserved.get(`l:${l.id}`) ?? 0) > 0);
    if (lots.length > 1) { setLotFor({ p, lots }); setQ(''); return; }
    addLine(p, lots[0]);
  };

  const valid = lines.filter((l) => Number(l.quantity) > 0 && Number(l.unitPrice) > 0);
  const calc = calcInvoice(valid.map((l) => ({ quantity: Number(l.quantity), unitPrice: Number(l.unitPrice), discountPercent: 0 })), { vatPercent: vat.percent });

  const submit = async () => {
    if (!valid.length || valid.length !== lines.length) { toast('تعداد و قیمت همه‌ی ردیف‌ها را کامل کنید', 'error'); return; }
    if (vat.missing) { toast('درصد مالیات بر ارزش افزوده را بنویسید یا مالیات را خاموش کنید', 'error'); return; }
    if (method === 'CREDIT' && !customer) { toast('فروش نسیه فقط برای مشتریِ ثبت‌شده است؛ مشتری را از لیست انتخاب کنید', 'error'); return; }
    if (method === 'CREDIT' && Number(paidNow || 0) >= calc.total) { toast('برای فروش نسیه، مبلغ پرداختی باید کمتر از جمع فاکتور باشد', 'error'); return; }
    const createdAt = new Date().toISOString(); const id = newId();
    const who = customer ? { partyId: customer.id } : { partyName: partyName.trim() || undefined };
    const pay = method === 'CREDIT' ? { paymentMethod: 'CASH', payInFull: false, paidAmount: Number(paidNow || 0) } : { paymentMethod: method, payInFull: true };
    const sale: QueuedSale = {
      clientRequestId: id, tenantId: scope.tenantId, userId: scope.userId, branchId: branchId!, createdAt, status: 'pending', total: calc.total, partyId: customer?.id, partyName: customer?.name ?? (partyName.trim() || undefined),
      lines: valid.map((l) => ({ productId: l.productId, lotId: l.lotId, name: l.name, sku: l.sku, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) })),
      payload: { clientRequestId: id, items: valid.map((l) => ({ productId: l.productId, lotId: l.lotId, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) })), vatPercent: vat.percent, ...who, ...pay, date: createdAt },
    };
    await enqueueSale(sale);                                   // اول ذخیره، بعد ارسال؛ هیچ فروشی با بسته‌شدن تب گم نمی‌شود
    const res = isOnline() ? (await flushQueue(scope)).find((r) => r.clientRequestId === id) : undefined;
    setDone({ id, total: calc.total, lines: sale.lines, createdAt, invoiceNumber: res?.invoiceNumber, error: res?.error, partyName: sale.partyName, vatPercent: vat.percent });
    setLines([]); setPartyName(''); setPaidNow(''); reloadQueue();
  };

  const retryAll = async (id: string) => { await retrySale(id); if (isOnline()) await flushQueue(scope); reloadQueue(); };
  const waiting = queue.filter((s) => s.status === 'pending').length;

  return (
    <>
      <PageHead title="فروش سریع" sub="فروش نقدی بدون مشتری؛ بدون اینترنت هم کار می‌کند و بعد از اتصال ارسال می‌شود">
        <button className="btn" disabled={!!syncing || !off.online || !canSell} onClick={() => void sync()}><Icon name="swap" size={16} />به‌روزرسانی کالاها</button>
      </PageHead>

      {!canSell && <div className="callout red">برای فروش، یک شعبه‌ی مشخص را از بالای صفحه انتخاب کنید.</div>}
      {syncing && <div className="callout blue">{syncing}</div>}
      {canSell && !syncing && !items.length && <div className="callout">{off.online ? 'کالایی دریافت نشده است.' : 'فهرست کالا روی این دستگاه نیست. یک بار با اینترنت این صفحه را باز کنید.'}</div>}
      {meta && <div className="muted sm" style={{ marginBottom: 8 }}>{toFa(meta.count)} کالا · آخرین دریافت: {fmtDate(new Date(meta.syncedAt).toISOString())} {fmtTime(new Date(meta.syncedAt).toISOString())}</div>}

      <section className="sheet">
        <div className="sheet__body stack">
          <div style={{ position: 'relative' }}>
            <input ref={searchRef} className="input" autoFocus placeholder="نام، کد یا بارکد کالا…" value={q} disabled={!canSell || !items.length}
              onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && hits[0]) add(hits[0]); }} />
            {q && <div className="hits" style={{ position: 'absolute', insetInline: 0, zIndex: 30 }}>
              {!hits.length && <div className="muted" style={{ padding: 12 }}>کالایی پیدا نشد</div>}
              {hits.map((p) => <button key={p.id} className="hit" onClick={() => add(p)}><span className="sku">{p.sku}</span><span className="hit__name">{p.name}</span><span className="muted sm">{fmtSale(p.salePrice)}</span></button>)}
            </div>}
          </div>

          {!lines.length ? <Empty icon="receipt" title="سبد خالی است" hint="کالا را جستجو یا بارکد را اسکن کنید و Enter بزنید" /> : (
            <div className="tbl-wrap"><table className="tbl"><thead><tr><th>کالا</th><th>تعداد</th><th>قیمت</th><th>مبلغ</th><th /></tr></thead>
              <tbody>{lines.map((l, i) => (
                <tr key={l.uid}>
                  <td className="strong">{l.name}<div className="muted sm">{l.sku}{l.lotId && <> · قیمت خرید: {fmtMoney(l.cost)}</>}</div></td>
                  <td><NumInput decimals value={l.quantity} onChange={(v) => setLines((ls) => ls.map((x, k) => (k === i ? { ...x, quantity: v } : x)))} /></td>
                  <td><NumInput money value={l.unitPrice} onChange={(v) => setLines((ls) => ls.map((x, k) => (k === i ? { ...x, unitPrice: v } : x)))} /></td>
                  <td className="num">{fmtMoney(Math.round(Number(l.quantity || 0) * Number(l.unitPrice || 0)))}</td>
                  <td><button className="btn btn--sm btn--icon" onClick={() => setLines((ls) => ls.filter((_, k) => k !== i))}><Icon name="x" size={14} /></button></td>
                </tr>))}</tbody></table></div>
          )}

          <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
            <input className="input" style={{ maxWidth: 240 }} list="qs-customers" placeholder="مشتری (انتخاب از لیست یا نام)" value={partyName} maxLength={120} onChange={(e) => setPartyName(e.target.value)} aria-label="مشتری" />
            <datalist id="qs-customers">{customers.map((c) => <option key={c.id} value={c.name}>{c.mobile}</option>)}</datalist>
            {customer && <span className="stamp green">مشتری ثبت‌شده</span>}
            <select className="select" value={method} onChange={(e) => setMethod(e.target.value as typeof method)}><option value="CASH">نقد</option><option value="CARD">کارتخوان</option><option value="TRANSFER">کارت‌به‌کارت / انتقال</option><option value="CREDIT">نسیه</option></select>
            {method === 'CREDIT' && <span className="row" style={{ gap: 4 }}><NumInput money value={paidNow} onChange={setPaidNow} placeholder="پرداختی الان (اختیاری)" /></span>}
            <label className="check"><input type="checkbox" checked={vat.on} onChange={(e) => vat.setOn(e.target.checked)} />مالیات بر ارزش افزوده</label>
            {vat.on && <span className="row" style={{ gap: 4 }}><NumInput value={vat.raw} onChange={vat.setPercent} placeholder="درصد" /><span>٪</span></span>}
            <span className="grow" />
            <div style={{ textAlign: 'end' }}>{vat.on && <div className="muted sm">مالیات {fmtMoney(calc.vatAmount)}</div>}<div className="muted sm">{vat.percent ? `جمع با مالیات ${toFa(vat.percent)}٪` : 'جمع'} (برآورد)</div><b className="num" style={{ fontSize: 20 }}>{fmtMoney(calc.total)}</b></div>
            <button className="btn btn--primary" disabled={!lines.length || valid.length !== lines.length || !canSell || vat.missing} onClick={() => void submit()}><Icon name="check" size={16} />ثبت فروش</button>
          </div>
        </div>
      </section>

      {queue.length > 0 && <section className="sheet" style={{ marginTop: 16 }}>
        <div className="sheet__head"><h2>صف ارسال</h2><span className="grow" /><span className="muted sm">{toFa(waiting)} در انتظار</span></div>
        <div className="tbl-wrap"><table className="tbl"><tbody>{queue.map((s) => (
          <tr key={s.clientRequestId} className={s.status === 'failed' ? '' : 'dim'}>
            <td>{fmtDate(s.createdAt)} {fmtTime(s.createdAt)}{s.partyName && <b> — {s.partyName}</b>}<div className="muted sm">{s.lines.map((l) => `${l.name}×${toFa(l.quantity)}`).join('، ')}</div></td>
            <td className="num">{fmtMoney(s.total)}</td>
            <td>{s.status === 'pending' ? <Stamp tone="amber">در انتظار ارسال</Stamp> : <div><Stamp tone="red">ارسال نشد</Stamp><div className="muted sm">{s.error}</div></div>}</td>
            <td className="actions">{s.status === 'failed' && <>
              <button className="btn btn--sm" onClick={() => void retryAll(s.clientRequestId)}>تلاش دوباره</button>{' '}
              <button className="btn btn--sm btn--danger" onClick={async () => { if (await confirm('این فروش از صف حذف شود؟ (پول دریافت‌شده را خودتان باید تطبیق دهید)', { ok: 'حذف' })) { await discardSale(s.clientRequestId); reloadQueue(); } }}>حذف</button></>}</td>
          </tr>))}</tbody></table></div>
      </section>}

      {lotFor && <Modal size="sm" title={`«${lotFor.p.name}» — از کدام قیمت خرید فروخته شود؟`} onClose={() => setLotFor(null)} footer={<button className="btn" onClick={() => setLotFor(null)}>انصراف</button>}>
        <div className="stack">{lotFor.lots.map((l) => <div key={l.id} className="row"><span className="grow">قیمت خرید: <b className="num">{fmtMoney(l.cost)}</b></span><span className="stock num">موجود: {toFa(l.qty - (reserved.get(`l:${l.id}`) ?? 0))}</span><button className="btn btn--sm btn--primary" onClick={() => addLine(lotFor.p, l)}>انتخاب</button></div>)}</div>
      </Modal>}

      {done && <Modal size="sm" title={done.invoiceNumber ? 'فروش ثبت شد' : done.error ? 'فروش ارسال نشد' : 'فروش ذخیره شد'} onClose={() => setDone(null)}
        footer={<><button className="btn btn--primary" onClick={() => setDone(null)}>فروش جدید</button><button className="btn" onClick={() => printReceipt(user!.tenantName, done)}><Icon name="print" size={16} />چاپ رسید</button></>}>
        <div className="stack">
          {done.invoiceNumber && <div className="callout blue">شماره‌ی فاکتور: <b>{done.invoiceNumber}</b></div>}
          {!done.invoiceNumber && !done.error && <div className="callout">{off.online ? 'ارسال به سرور در جریان است.' : 'اینترنت قطع است؛ فروش روی همین دستگاه ذخیره شد و بعد از اتصال خودکار ارسال می‌شود.'}</div>}
          {done.error && <div className="callout red">{done.error}<div className="muted sm">فروش در «صف ارسال» نگه داشته شد؛ می‌توانید بعداً دوباره تلاش کنید.</div></div>}
          <div className="row"><span className="grow">جمع (برآورد)</span><b className="num">{fmtMoney(done.total)}</b></div>
          <Link className="muted sm" to="/sales" onClick={() => setDone(null)}>فهرست فاکتورهای فروش</Link>
        </div>
      </Modal>}
    </>
  );
}
