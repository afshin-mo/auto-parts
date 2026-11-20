import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { Icon } from '../components/Icon';
import { PageHead, Field, Stamp, useUi, Empty } from '../components/ui';
import { readTable, saveXlsx } from '../lib/xlsx';
import { FIELDS, ImportKind, RECEIVED_TEMPLATE, autoMap, buildRows, looksLikeInvoice, planReceived } from '../lib/importMap';
import { takeHandoff } from '../lib/importHandoff';
import { useAuth } from '../lib/auth';
import { useWarehouses, branchWarehouses } from '../lib/queries';
import { fmtDate, fmtMoney, toFa } from '../lib/format';
import { CHUNK, ImportRes as Res, runReceivedImport, sum } from '../lib/receivedImport';

const KINDS: { key: ImportKind; title: string; sub: string; icon: 'box' | 'users' | 'warehouse' | 'receipt' }[] = [
  { key: 'received', title: 'ورود کالا (فاکتور خرید)', sub: 'ضروری: SKU، فی، تعداد، قیمت کل. هر ردیف یک ورودِ جدا با قیمت خودش؛ قیمت واحد = قیمت کل ÷ تعداد', icon: 'receipt' },
  { key: 'products', title: 'کالاها', sub: 'کد، نام، قیمت‌ها، شماره‌های فنی و معادل، (اختیاری) موجودی', icon: 'box' },
  { key: 'stock', title: 'موجودی انبار', sub: 'موجودی اول دوره‌ی کالاهای ثبت‌شده، به تفکیک انبار', icon: 'warehouse' },
  { key: 'parties', title: 'مشتریان و تأمین‌کنندگان', sub: 'مشخصات و مانده‌ی حساب اول دوره (بدهکار/بستانکار)', icon: 'users' },
];
const SOURCES = ['هلو', 'سپیدار', 'حسابفا', 'طاهر', 'رایان‌هم‌افزا', 'پارسیان', 'اکسل / نرم‌افزار دیگر'];

export default function ImportWizard() {
  const { toast } = useUi(); const qc = useQueryClient(); const { branch, branchId } = useAuth();
  const whs = branchWarehouses(useWarehouses().data, branchId);
  const [step, setStep] = useState(1);
  const [kind, setKind] = useState<ImportKind>('products');
  const [source, setSource] = useState('');
  const [fileName, setFileName] = useState('');
  const [table, setTable] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [map, setMap] = useState<Record<string, number>>({});
  const [updateExisting, setUpdateExisting] = useState(false);
  const [defaultType, setDefaultType] = useState<'CUSTOMER' | 'SUPPLIER'>('CUSTOMER');
  const [partyOwes, setPartyOwes] = useState(true);
  const [mode, setMode] = useState<'SET' | 'ADD'>('ADD');
  const [warehouseId, setWarehouseId] = useState('');
  const [res, setRes] = useState<Res | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const defs = FIELDS[kind];

  const history = useQuery({ queryKey: ['import-history'], queryFn: async () => (await api.get<{ id: string; kind: string; source?: string; fileName?: string; created: number; updated: number; failed: number; createdAt: string }[]>('/data-import/history')).data });

  const { rows, badCells } = useMemo(() => {
    if (step < 3) return { rows: [] as Record<string, unknown>[], badCells: 0 };
    const built = buildRows(kind, table, map, { defaultType, balanceMeansPartyOwes: partyOwes });
    let bad = 0;
    const clean = built.map((r) => { const o: Record<string, unknown> = {}; for (const [k, v] of Object.entries(r)) { if (k.startsWith('__bad_')) bad++; else o[k] = v; } return o; });
    return { rows: clean, badCells: bad };
  }, [step, kind, table, map, defaultType, partyOwes]);
  const plan = useMemo(() => (kind === 'received' ? planReceived(rows) : null), [kind, rows]);
  const missing = defs.filter((f) => f.required && map[f.key] === undefined).map((f) => f.title);
  // قیمت خرید = قیمت کل ÷ تعداد بدون ستون «قیمت کل» ممکن نیست؛ بی‌صدا به «قیمت واحد» برنگردیم
  const hasBalanceCols = kind === 'parties' && (map.balance !== undefined);
  const needsType = kind === 'parties' && map.partyType === undefined;

  const pick = async (f?: File | null, forceKind?: ImportKind) => {
    if (!f) return;
    const k = forceKind ?? kind;
    setErr(''); setRes(null);
    try {
      const t = await readTable(f);
      if (t.length < 2) throw new Error('فایل خالی است یا فقط سطر عنوان دارد');
      const [h, ...body] = t;
      setFileName(f.name); setHeaders(h.map((x, i) => x.trim() || `ستون ${i + 1}`)); setTable(body); setMap(autoMap(k, h)); setStep(3);
    } catch (e) { setErr((e as Error).message); }
  };

  // فایلی که از دیالوگ «ورود از فایل» در صفحه‌ی کالاها آمده؛ بدون انتخاب دوباره ادامه می‌دهیم
  useEffect(() => { const f = takeHandoff(); if (f) { setKind('received'); void pick(f, 'received'); } }, []);

  const runReceived = async (dryRun: boolean) => {
    if (!plan) return;
    setBusy(true); setErr('');
    try {
      setRes(await runReceivedImport(plan, { dryRun, updateExisting, warehouseId: warehouseId || undefined, source: source || undefined, fileName: fileName || undefined }));
      if (!dryRun) {
        for (const k of ['products', 'inventory', 'brands', 'categories', 'import-history']) qc.invalidateQueries({ queryKey: [k] });
        toast('ورود کالا انجام شد'); setStep(5);
      } else setStep(4);
    } catch (e) { setErr([(e as ApiError).message, ...((e as ApiError).details ?? [])].join(' — ')); }
    finally { setBusy(false); }
  };

  const run = async (dryRun: boolean) => {
    if (kind === 'received') return runReceived(dryRun);
    setBusy(true); setErr('');
    const agg: Res = { errors: [], createdBrands: [], createdCategories: [] };
    try {
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const common = { dryRun, source: source || undefined, fileName: fileName || undefined };
        const body = kind === 'products' ? { rows: chunk, updateExisting, ...common }
          : kind === 'parties' ? { rows: chunk, defaultType, updateExisting, ...common }
          : { rows: chunk, mode, warehouseId: warehouseId || undefined, ...common };
        const r = (await api.post<Res>(`/data-import/${kind}`, body)).data;
        agg.created = sum(agg.created, r.created); agg.updated = sum(agg.updated, r.updated); agg.skipped = sum(agg.skipped, r.skipped); agg.unchanged = sum(agg.unchanged, r.unchanged); agg.merged = sum(agg.merged, r.merged);
        agg.totalOpeningDebit = sum(agg.totalOpeningDebit, r.totalOpeningDebit); agg.totalOpeningCredit = sum(agg.totalOpeningCredit, r.totalOpeningCredit); agg.totalQuantityChange = sum(agg.totalQuantityChange, r.totalQuantityChange);
        agg.createdBrands!.push(...(r.createdBrands ?? [])); agg.createdCategories!.push(...(r.createdCategories ?? []));
        agg.errors.push(...r.errors.map((e) => ({ ...e, row: e.row + i })));
      }
      setRes({ ...agg, createdBrands: [...new Set(agg.createdBrands)], createdCategories: [...new Set(agg.createdCategories)] });
      if (!dryRun) {
        for (const k of ['products', 'inventory', 'parties', 'brands', 'categories', 'import-history']) qc.invalidateQueries({ queryKey: [k] });
        toast('انتقال انجام شد');
        setStep(5);
      } else setStep(4);
    } catch (e) { setErr([(e as ApiError).message, ...((e as ApiError).details ?? [])].join(' — ')); }
    finally { setBusy(false); }
  };

  const reset = () => { setStep(1); setTable([]); setHeaders([]); setMap({}); setRes(null); setFileName(''); setErr(''); };
  const template = () => saveXlsx(`نمونه-${kind}.xlsx`, [kind === 'received' ? RECEIVED_TEMPLATE : defs.map((d) => d.title)]);
  const importable = kind === 'received' ? (plan?.stock.length ?? 0) : res ? sum(res.created, res.updated) : 0;

  return (
    <>
      <PageHead title="انتقال از نرم‌افزار قبلی" sub="فایل اکسل/CSV نرم‌افزار قبلی را بدهید؛ ستون‌ها خودکار تطبیق داده می‌شوند و قبل از ورود، همه‌چیز پیش‌بررسی می‌شود." />
      <div className="callout blue sm" style={{ marginBottom: 14 }}>
        <b>ترتیب پیشنهادی:</b> ۱) کالاها ← ۲) موجودی انبار (اگر در فایل کالاها نبود) ← ۳) مشتریان و تأمین‌کنندگان با مانده‌ی اول دوره.
        {branch && <> موجودی‌ها در شعبه‌ی «<b>{branch.name}</b>» ثبت می‌شوند؛ برای شعبه‌ی دیگر ابتدا آن را بالای صفحه انتخاب کنید.</>}
        {' '}فاکتورهای قدیمی به‌صورت سند منتقل نمی‌شوند؛ فقط مانده‌ی اول دوره‌ی حساب‌ها. برای فاکتورهای خرید دریافتی، گزینه‌ی «فاکتور خرید دریافتی» کالا و موجودی را می‌سازد.
      </div>

      <div className="tabs" style={{ marginBottom: 14 }}>{['نوع داده', 'فایل', 'تطبیق ستون‌ها', 'بررسی', 'پایان'].map((t, i) => <span key={t} className={`tab ${step === i + 1 ? 'on' : ''}`} style={{ cursor: 'default' }}>{toFa(i + 1)}. {t}</span>)}</div>

      {step === 1 && (
        <section className="grid g3">
          {KINDS.map((k) => (
            <button key={k.key} className="sheet" style={{ textAlign: 'start', padding: 18, cursor: 'pointer', borderColor: kind === k.key ? 'var(--sign-green)' : undefined, borderWidth: kind === k.key ? 3 : 2 }} onClick={() => { setKind(k.key); setStep(2); }}>
              <Icon name={k.icon} size={30} /><h3 style={{ margin: '8px 0 4px' }}>{k.title}</h3><div className="muted sm">{k.sub}</div>
            </button>
          ))}
        </section>
      )}

      {step === 2 && (
        <section className="sheet"><div className="sheet__body stack">
          <h3>{KINDS.find((k) => k.key === kind)?.title}</h3>
          <Field label="نرم‌افزار قبلی (برای سابقه، اختیاری)">
            <input className="input" list="srcs" value={source} onChange={(e) => setSource(e.target.value)} placeholder="مثلاً هلو" /><datalist id="srcs">{SOURCES.map((s) => <option key={s} value={s} />)}</datalist>
          </Field>
          <label className="btn btn--primary" style={{ alignSelf: 'flex-start', cursor: 'pointer' }}><Icon name="upload" size={17} />انتخاب فایل اکسل (.xlsx) یا CSV
            <input type="file" hidden accept=".xlsx,.csv,.txt" onChange={(e) => pick(e.target.files?.[0])} /></label>
          <div className="muted sm">در نرم‌افزار قبلی از گزارش «لیست کالا / مشتریان / موجودی» خروجی اکسل بگیرید. ردیف اول فایل باید عنوان ستون‌ها باشد. فایل‌های <span className="ltr">.xls</span> قدیمی را ابتدا در اکسل به <span className="ltr">.xlsx</span> ذخیره کنید.</div>
          <div className="row wrap"><button className="btn btn--sm" onClick={template}><Icon name="receipt" size={15} />دانلود فایل نمونه</button><button className="btn btn--sm" onClick={() => setStep(1)}>بازگشت</button></div>
          {err && <div className="callout red">{err}</div>}
        </div></section>
      )}

      {step === 3 && (
        <section className="sheet">
          <div className="sheet__head"><h2>تطبیق ستون‌های «{fileName}»</h2><span className="muted sm">{toFa(table.length)} ردیف</span></div>
          <div className="sheet__body stack">
            {kind !== 'received' && looksLikeInvoice(headers) && <div className="callout blue sm">این فایل شبیه <b>فاکتور خرید</b> است (سریال، تعداد، قیمت کل). برای اینکه قیمت خرید = قیمت کل ÷ تعداد حساب شود و کالای تکراری با چند قیمت خطا ندهد، از «فاکتور خرید دریافتی» استفاده کنید. <button className="btn btn--sm btn--primary" onClick={() => { setKind('received'); setMap(autoMap('received', headers)); }}>ادامه با فاکتور خرید دریافتی</button></div>}
            <div className="tbl-wrap"><table className="tbl">
              <thead><tr><th>فیلد در یدکی‌یار</th><th>ستون فایل شما</th><th>نمونه‌ی مقدار</th></tr></thead>
              <tbody>{defs.map((f) => (
                <tr key={f.key}>
                  <td className="strong">{f.title}{f.required && <b className="t-neg"> *</b>}</td>
                  <td><select className="select" value={map[f.key] ?? ''} onChange={(e) => { const v = e.target.value; setMap((m) => { const n = { ...m }; if (v === '') delete n[f.key]; else n[f.key] = Number(v); return n; }); }}>
                    <option value="">— نادیده —</option>{headers.map((h, i) => <option key={i} value={i}>{h}</option>)}</select></td>
                  <td className="muted sm">{map[f.key] !== undefined ? table.slice(0, 3).map((r) => r[map[f.key]]).filter(Boolean).join(' ، ') : ''}</td>
                </tr>))}</tbody>
            </table></div>

            {kind === 'received' && plan && <>
              <div className="grid g3">
                <label className="check"><input type="checkbox" checked={updateExisting} onChange={(e) => setUpdateExisting(e.target.checked)} />اگر کالا از قبل بود، نام و قیمت خریدش با این فایل جایگزین شود (موجودی در هر حال اضافه می‌شود)</label>
                <Field label="انبار ورود (اگر ستون انبار نیست)"><select className="select" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}><option value="">پیش‌فرض شعبه</option>{whs.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>
              </div>
              <div className="callout blue sm">
                <b>کد کالا = سریال-مارک</b> (مثلاً <span className="num">500655-PT6</span>)؛ چون یک سریال با مارک‌های مختلف، کالای جداست. سریال در «شماره قطعه سازنده» و مارک در «برند» ذخیره می‌شود و هر دو در جستجو پیدا می‌شوند. <b>قیمت فروش</b> ثبت نمی‌شود؛ هنگام فاکتور فروش تعیین می‌شود.
              </div>
              <div className="tbl-wrap"><table className="tbl">
                <thead><tr><th>کد کالا</th><th>نام</th><th>سریال</th><th>مارک</th><th className="n">قیمت خرید (ریال)</th></tr></thead>
                <tbody>{plan.products.slice(0, 6).map((p) => <tr key={String(p.sku)}><td className="num">{String(p.sku)}</td><td>{String(p.name)}</td><td className="num">{String(p.partNumber)}</td><td>{String(p.brand ?? '')}</td><td className="num">{fmtMoney(Number(p.purchasePrice))}</td></tr>)}</tbody>
              </table></div>
              <div className="callout sm">{toFa(plan.lines)} قلم فاکتور ← <b>{toFa(plan.products.length)}</b> کالای یکتا · مجموع تعداد <b>{toFa(plan.totalQty)}</b> · مجموع بهای خرید <b>{fmtMoney(Math.round(plan.totalCost))}</b> ریال
                {plan.multiPrice > 0 && <div className="muted sm"><b>{toFa(plan.multiPrice)}</b> کالا در فایل با چند قیمت آمده (مثلاً خرید نقدی و اعتباری): خطا نیست؛ هر ورود با قیمت خودش ثبت می‌شود و قیمت خرید کالا همان جدیدترین فاکتور است.</div>}
                {plan.skipped.length > 0 && <div className="t-neg">{toFa(plan.skipped.length)} ردیف نامعتبر نادیده گرفته می‌شود (مثلاً: {plan.skipped[0].reason}، ردیف {toFa(plan.skipped[0].row + 2)} فایل)</div>}</div>
            </>}
            {kind === 'products' && <label className="check"><input type="checkbox" checked={updateExisting} onChange={(e) => setUpdateExisting(e.target.checked)} />اگر کد کالا از قبل بود، قیمت و مشخصاتش به‌روز شود (تعداد فایل در هر حال به‌عنوان ورودِ جدید با قیمت همان ردیف اضافه می‌شود)</label>}
            {kind === 'parties' && <div className="grid g3">
              {needsType && <Field label="نوع همه‌ی ردیف‌ها"><select className="select" value={defaultType} onChange={(e) => setDefaultType(e.target.value as 'CUSTOMER' | 'SUPPLIER')}><option value="CUSTOMER">مشتری</option><option value="SUPPLIER">تأمین‌کننده</option></select></Field>}
              {hasBalanceCols && <Field label="در ستون «مانده»، عدد مثبت یعنی" hint="تا مانده‌ها درست علامت بخورند"><select className="select" value={partyOwes ? '1' : '0'} onChange={(e) => setPartyOwes(e.target.value === '1')}><option value="1">طرف‌حساب بدهکار است (به ما بدهکار)</option><option value="0">طرف‌حساب بستانکار است (ما بدهکاریم)</option></select></Field>}
              <label className="check" style={{ alignSelf: 'end' }}><input type="checkbox" checked={updateExisting} onChange={(e) => setUpdateExisting(e.target.checked)} />اگر از قبل بود، مشخصاتش به‌روز شود (مانده تغییر نمی‌کند)</label>
            </div>}
            {kind === 'stock' && <div className="grid g3">
              <Field label="روش ثبت"><select className="select" value={mode} onChange={(e) => setMode(e.target.value as 'SET' | 'ADD')}><option value="ADD">ورود جدید: هر ردیف فایل یک ورودِ جدا (با قیمت خودش) اضافه شود</option><option value="SET">انبارگردانی: موجودیِ همان قیمت «همین عدد» شود</option></select></Field>
              <Field label="انبار پیش‌فرض (اگر ستون انبار نیست)"><select className="select" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}><option value="">پیش‌فرض شعبه</option>{whs.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>
            </div>}

            {missing.length > 0 && <div className="callout red">ستون ضروری تطبیق داده نشده: {missing.join('، ')}</div>}
            {badCells > 0 && <div className="callout sm">{toFa(badCells)} خانه‌ی عددی خوانده نشد و نادیده گرفته می‌شود.</div>}
            <div className="muted sm">{toFa(kind === 'received' ? plan?.lines ?? 0 : rows.length)} ردیف معتبر آماده است.</div>
            {err && <div className="callout red">{err}</div>}
            <div className="row wrap">
              <button className="btn btn--blue" disabled={missing.length > 0 || !(kind === 'received' ? plan?.lines : rows.length) || busy} onClick={() => run(true)}>{busy ? 'در حال بررسی…' : 'بررسی بدون ذخیره'}</button>
              <button className="btn" onClick={reset}>شروع دوباره</button>
            </div>
          </div>
        </section>
      )}

      {step === 4 && res && (
        <section className="sheet"><div className="sheet__body stack">
          <h3>نتیجه‌ی بررسی (هنوز چیزی ذخیره نشده)</h3>
          <div className="row wrap" style={{ gap: 20 }}>
            {res.created !== undefined && <span>جدید: <b className="t-pos">{toFa(res.created)}</b></span>}
            <span>به‌روزرسانی: <b>{toFa(res.updated ?? 0)}</b></span>
            {res.skipped !== undefined && <span>ردشده (کالا از قبل بود): <b>{toFa(res.skipped)}</b></span>}{!!res.merged && <span>ادغام‌شده (چند ردیف یک کالا): <b>{toFa(res.merged)}</b></span>}
            {res.unchanged !== undefined && <span>بدون تغییر: <b>{toFa(res.unchanged)}</b></span>}
            <span>خطا: <b className={res.errors.length ? 't-neg' : ''}>{toFa(res.errors.length)}</b></span>
          </div>
          {kind === 'parties' && <div className="callout sm">جمع مانده‌ی بدهکاران (مشتری): <b>{toFa((res.totalOpeningDebit ?? 0).toLocaleString('en-US'))}</b> — جمع مانده‌ی بستانکاران: <b>{toFa((res.totalOpeningCredit ?? 0).toLocaleString('en-US'))}</b>. اگر با نرم‌افزار قبلی نمی‌خواند، علامت مانده را در مرحله‌ی قبل عوض کنید.</div>}
          {kind === 'received' && plan && <div className="callout sm">پس از ساخت کالاها، <b>{toFa(plan.lines)}</b> ورود موجودی (جمعاً <b>{toFa(res.totalQuantityChange ?? 0)}</b> عدد) با بهای خرید هر فاکتور ثبت می‌شود. «ردشده» یعنی کالا از قبل بوده (موجودی‌اش در هر حال اضافه می‌شود).</div>}
          {kind === 'stock' && <div className="callout sm">مجموع تغییر موجودی: <b>{toFa(res.totalQuantityChange ?? 0)}</b> عدد</div>}
          {(res.createdBrands?.length || res.createdCategories?.length) ? <div className="callout sm">{!!res.createdBrands?.length && <div>برندهای جدید: {res.createdBrands.join('، ')}</div>}{!!res.createdCategories?.length && <div>دسته‌های جدید: {res.createdCategories.join('، ')}</div>}</div> : null}
          {res.errors.length > 0 && <div className="callout red sm" style={{ maxHeight: 240, overflow: 'auto' }}><b>ردیف‌های دارای خطا وارد نمی‌شوند:</b>{res.errors.slice(0, 100).map((e, i) => <div key={i}>{kind !== 'received' && <>ردیف {toFa(e.row + 1)} </>}{(e.key ?? e.sku) && <>(<span className="ltr">{e.key ?? e.sku}</span>)</>}: {e.message}</div>)}</div>}
          {err && <div className="callout red">{err}</div>}
          <div className="row wrap">
            <button className="btn btn--primary" disabled={busy || (kind === 'stock' ? (res.updated ?? 0) === 0 : importable === 0)} onClick={() => run(false)}>{busy ? 'در حال ورود…' : 'ورود نهایی'}</button>
            <button className="btn" onClick={() => setStep(3)}>بازگشت و اصلاح</button>
          </div>
        </div></section>
      )}

      {step === 5 && res && (
        <section className="sheet"><div className="sheet__body stack">
          <h3 className="t-pos">انتقال انجام شد</h3>
          <div className="row wrap" style={{ gap: 20 }}>{res.created !== undefined && <span>جدید: <b>{toFa(res.created)}</b></span>}<span>به‌روزرسانی: <b>{toFa(res.updated ?? 0)}</b></span><span>خطا: <b>{toFa(res.errors.length)}</b></span></div>
          {res.errors.length > 0 && <div className="callout red sm" style={{ maxHeight: 240, overflow: 'auto' }}><b>این ردیف‌ها وارد نشدند:</b>{res.errors.slice(0, 100).map((e, i) => <div key={i}>{kind !== 'received' && <>ردیف {toFa(e.row + 1)} </>}{(e.key ?? e.sku) && <>(<span className="ltr">{e.key ?? e.sku}</span>)</>}: {e.message}</div>)}</div>}
          <div className="row wrap"><button className="btn btn--primary" onClick={reset}>انتقال داده‌ی دیگر</button></div>
        </div></section>
      )}

      <section className="sheet" style={{ marginTop: 18 }}>
        <div className="sheet__head"><h2>سابقه‌ی انتقال‌ها</h2></div>
        {!history.data?.length ? <Empty icon="upload" title="هنوز انتقالی انجام نشده" /> : (
          <div className="tbl-wrap"><table className="tbl tbl--cards"><thead><tr><th>تاریخ</th><th>نوع</th><th>نرم‌افزار</th><th>فایل</th><th className="n">جدید</th><th className="n">به‌روز</th><th className="n">خطا</th></tr></thead>
            <tbody>{history.data.map((h) => <tr key={h.id}><td data-label="تاریخ">{fmtDate(h.createdAt)}</td><td data-label="نوع"><Stamp tone="gray">{KINDS.find((k) => k.key === h.kind)?.title ?? h.kind}</Stamp></td><td data-label="نرم‌افزار">{h.source ?? '—'}</td><td data-label="فایل" className="muted sm">{h.fileName ?? '—'}</td><td data-label="جدید" className="n">{toFa(h.created)}</td><td data-label="به‌روز" className="n">{toFa(h.updated)}</td><td data-label="خطا" className="n">{toFa(h.failed)}</td></tr>)}</tbody></table></div>
        )}
      </section>
    </>
  );
}
