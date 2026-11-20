import { ChangeEvent, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { Modal, useUi } from './ui';
import { Icon } from './Icon';
import { PRODUCT_COLUMNS, csvToProducts, downloadFile, toCSV, ParsedImport } from '../lib/csv';
import { readTable, saveXlsx } from '../lib/xlsx';
import { fmtMoney, toFa } from '../lib/format';
import { FIELDS, RECEIVED_TEMPLATE, ReceivedPlan, autoMap, buildRows, looksLikeInvoice, planReceived } from '../lib/importMap';
import { ImportRes, runReceivedImport } from '../lib/receivedImport';

interface Result { dryRun: boolean; created: number; updated: number; skipped: number; errors: { row: number; sku: string; message: string }[]; createdBrands: string[]; createdCategories: string[]; merged?: number }

export function ImportProducts({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient(); const { toast } = useUi();
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [fileName, setFileName] = useState('');
  const [update, setUpdate] = useState(false);
  const [check, setCheck] = useState<Result | null>(null);
  const [err, setErr] = useState('');
  const [plan, setPlan] = useState<{ plan: ReceivedPlan; file: string } | null>(null);
  const [done, setDone] = useState<ImportRes | null>(null);
  const [busy, setBusy] = useState(false);

  const run = useMutation({
    mutationFn: async (dryRun: boolean) => (await api.post<Result>('/products/import', { rows: parsed!.rows, updateExisting: update, dryRun })).data,
    onSuccess: (r) => {
      if (r.dryRun) { setCheck(r); return; }
      qc.invalidateQueries({ queryKey: ['products'] }); qc.invalidateQueries({ queryKey: ['brands'] }); qc.invalidateQueries({ queryKey: ['categories'] }); qc.invalidateQueries({ queryKey: ['inventory'] });
      toast(`${toFa(r.created)} کالا اضافه و ${toFa(r.updated)} کالا به‌روز شد`); onClose();
    },
    onError: (e: ApiError) => setErr([e.message, ...(e.details ?? [])].join(' — ')),
  });

  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    setErr(''); setCheck(null); setFileName(f.name);
    try {
      const table = await readTable(f);
      if (table.length < 2) throw new Error('فایل خالی است یا فقط سطر عنوان دارد');
      if (looksLikeInvoice(table[0])) {   // ورود کالا: همین‌جا انجام می‌شود (بدون رفتن به صفحه‌ی دیگر)؛ SKU تکراری با قیمت متفاوت = ورودِ جدید
        const map = autoMap('received', table[0]);
        const missing = FIELDS.received.filter((d) => d.required && map[d.key] === undefined).map((d) => d.title);
        if (missing.length) throw new Error(`ستون‌های ضروری پیدا نشد: ${missing.join('، ')}`);
        setParsed(null); setDone(null); setPlan({ plan: planReceived(buildRows('received', table.slice(1), map, {}).map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !k.startsWith('__bad_'))))), file: f.name });
        return;
      }
      setPlan(null); setDone(null);
      const p = csvToProducts(table);
      if (p.missing.length) throw new Error(`ستون‌های ضروری پیدا نشد: ${p.missing.join('، ')}`);
      if (!p.rows.length) throw new Error('هیچ ردیفی با «کد کالا» پیدا نشد');
      setParsed(p);
    } catch (x) { setParsed(null); setErr((x as Error).message); }
  };

  const runInvoice = async () => {
    if (!plan) return;
    setBusy(true); setErr('');
    try {
      const r = await runReceivedImport(plan.plan, { dryRun: false, fileName: plan.file });
      setDone(r);
      for (const k of ['products', 'brands', 'categories', 'inventory']) qc.invalidateQueries({ queryKey: [k] });
      toast(`${toFa(plan.plan.lines)} ورود ثبت شد`);
    } catch (e) { setErr([(e as ApiError).message, ...((e as ApiError).details ?? [])].join(' — ')); }
    finally { setBusy(false); }
  };

  const sample: (string | number)[][] = [
    PRODUCT_COLUMNS.map((c) => c.title),
    ['BP-206-F', 'لنت جلو پژو ۲۰۶', 'ست', 'لنت ترمز', 'فرامکس', 520000, 680000, 640000, 6, 24, '425230', '', '', 'A-1-1', 6, '2720000166053'],
    ['OF-206', 'فیلتر روغن پژو ۲۰۶', 'عدد', 'فیلتر روغن', 'ساکت', 78000, 110000, '', 20, 85, '1109.AL', '', '', 'B-1-1', '', ''],
  ];
  const template = () => downloadFile('نمونه-تعریف-کالا.csv', toCSV(sample));
  const templateXlsx = () => saveXlsx('نمونه-تعریف-کالا.xlsx', sample);
  // قالب اصلی: ورود کالا با فاکتور خرید (هر ردیف یک ورودِ جدا با قیمت خودش)
  const invoiceTemplateXlsx = () => saveXlsx('نمونه-ورود-کالا-فاکتور-خرید.xlsx', [RECEIVED_TEMPLATE]);
  const invoiceTemplateCsv = () => downloadFile('نمونه-ورود-کالا-فاکتور-خرید.csv', toCSV([RECEIVED_TEMPLATE]));

  return (
    <Modal size="lg" title="ورود گروهی کالا از فایل" onClose={onClose}
      footer={<>
        {plan && !done && <button className="btn btn--primary" disabled={busy || !plan.plan.lines} onClick={runInvoice}>{busy ? 'در حال ثبت…' : `ثبت ${toFa(plan.plan.lines)} ورود`}</button>}
        {!plan && !check && <button className="btn btn--blue" disabled={!parsed || run.isPending} onClick={() => { setErr(''); run.mutate(true); }}>{run.isPending ? 'در حال بررسی…' : 'بررسی فایل'}</button>}
        {!plan && check && <button className="btn btn--primary" disabled={run.isPending || (check.created + check.updated === 0)} onClick={() => { setErr(''); run.mutate(false); }}>{run.isPending ? 'در حال ورود…' : `ورود ${toFa(check.created + check.updated)} ردیف`}</button>}
        <button className="btn" onClick={onClose}>{done ? 'بستن' : 'انصراف'}</button>
      </>}>
      <div className="stack">
        <div className="callout blue sm">
          <b>ورود کالا با موجودی:</b> ستون‌های ضروری فقط <b>SKU، فی، تعداد، قیمت کل</b> است؛ شماره فنی، برند، نام کالا، تخفیف و تأمین‌کننده اختیاری‌اند. هر ردیف یک ورودِ جدید است: SKU تکراری با قیمت متفاوت ردّ نمی‌شود و ردیف موجودیِ جدا (با قیمت خودش، برای سود و زیان) می‌گیرد؛ هم‌قیمت فقط به همان ردیف اضافه می‌شود. قیمت واحد = قیمت کل ÷ تعداد.
          <div className="row wrap" style={{ marginTop: 8 }}><button className="btn btn--sm btn--primary" onClick={invoiceTemplateXlsx}><Icon name="receipt" size={15} />نمونه‌ی اکسل (ورود کالا)</button><button className="btn btn--sm" onClick={invoiceTemplateCsv}><Icon name="receipt" size={15} />نمونه‌ی CSV (ورود کالا)</button></div>
          <div style={{ marginTop: 10 }}>فقط <b>تعریف کالا</b> (بدون فاکتور): ستون‌های ضروری <b>کد کالا و نام کالا</b>؛ واحد، دسته و برند با نام شناخته می‌شوند.</div>
          <div className="row wrap" style={{ marginTop: 6 }}><button className="btn btn--sm" onClick={templateXlsx}><Icon name="receipt" size={15} />نمونه‌ی اکسل (تعریف کالا)</button><button className="btn btn--sm" onClick={template}><Icon name="receipt" size={15} />نمونه‌ی CSV (تعریف کالا)</button></div>
        </div>
        <label className="btn" style={{ alignSelf: 'flex-start', cursor: 'pointer' }}>
          <Icon name="plus" size={17} />{fileName || 'انتخاب فایل'}
          <input type="file" accept=".xlsx,.csv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={pick} hidden />
        </label>
        {plan && !done && <div className="stack" style={{ gap: 8 }}>
          <div className="callout sm"><b>{toFa(plan.plan.lines)}</b> ردیف ورود ← <b>{toFa(plan.plan.products.length)}</b> SKU یکتا · مجموع تعداد <b>{toFa(plan.plan.totalQty)}</b> · مجموع بهای خرید <b>{fmtMoney(Math.round(plan.plan.totalCost))}</b> ریال
            {plan.plan.multiPrice > 0 && <div className="muted sm"><b>{toFa(plan.plan.multiPrice)}</b> SKU با چند قیمت آمده؛ هر قیمت یک ردیف موجودی جدا می‌شود.</div>}
            {plan.plan.skipped.length > 0 && <div className="t-neg">{toFa(plan.plan.skipped.length)} ردیف نامعتبر نادیده گرفته می‌شود (مثلاً: {plan.plan.skipped[0].reason}، ردیف {toFa(plan.plan.skipped[0].row + 2)} فایل)</div>}</div>
          <div className="tbl-wrap" style={{ maxHeight: 220, overflow: 'auto', border: '2px solid var(--line)' }}><table className="tbl">
            <thead><tr><th>SKU</th><th className="n">تعداد</th><th className="n">قیمت هر واحد</th><th>تأمین‌کننده</th></tr></thead>
            <tbody>{plan.plan.stock.slice(0, 8).map((r, i) => <tr key={i}><td><span className="sku">{String(r.code)}</span></td><td className="n">{toFa(String(r.quantity))}</td><td className="n">{fmtMoney(Number(r.unitCost))}</td><td className="muted">{String(r.supplier ?? '—')}</td></tr>)}</tbody>
          </table></div>
        </div>}
        {plan && done && <div className="stack" style={{ gap: 8 }}>
          <div className="callout green sm">ثبت شد: <b>{toFa(plan.plan.lines)}</b> ورود · مجموع <b>{toFa(done.totalQuantityChange ?? 0)}</b> عدد به انبار اضافه شد · کالای جدید: <b>{toFa(done.created ?? 0)}</b></div>
          {done.errors.length > 0 && <div className="callout red sm" style={{ maxHeight: 180, overflow: 'auto' }}><b>ردیف‌های دارای خطا وارد نشدند:</b>{done.errors.slice(0, 50).map((e, i) => <div key={i}>ردیف {toFa(e.row)} (<span className="ltr">{e.key ?? e.sku}</span>): {e.message}</div>)}</div>}
        </div>}
        {parsed && !check && <>
          <div className="row wrap"><b>{toFa(parsed.rows.length)}</b> ردیف خوانده شد.
            {parsed.unknownHeaders.length > 0 && <span className="muted sm">ستون‌های نادیده‌گرفته‌شده: {parsed.unknownHeaders.join('، ')}</span>}</div>
          <div className="tbl-wrap" style={{ maxHeight: 220, overflow: 'auto', border: '2px solid var(--line)' }}><table className="tbl">
            <thead><tr><th>کد</th><th>نام</th><th>دسته</th><th className="n">قیمت فروش</th><th className="n">موجودی اولیه</th></tr></thead>
            <tbody>{parsed.rows.slice(0, 6).map((r, i) => <tr key={i}><td><span className="sku">{String(r.sku)}</span></td><td>{String(r.name ?? '')}</td><td>{String(r.category ?? '')}</td><td className="n">{r.salePrice !== undefined ? toFa(String(r.salePrice)) : ''}</td><td className="n">{r.initialQuantity !== undefined ? toFa(String(r.initialQuantity)) : ''}</td></tr>)}</tbody>
          </table></div>
          <label className="check"><input type="checkbox" checked={update} onChange={(e) => setUpdate(e.target.checked)} />اگر کد کالا از قبل وجود داشت، قیمت و مشخصات آن به‌روز شود (وگرنه رد می‌شود)</label>
        </>}
        {check && <div className="stack" style={{ gap: 10 }}>
          <div className="row wrap" style={{ gap: 18 }}>
            <span>جدید: <b className="t-pos">{toFa(check.created)}</b></span><span>به‌روزرسانی: <b>{toFa(check.updated)}</b></span>
            <span>ردشده (کالا از قبل بود و تعداد نداشت): <b>{toFa(check.skipped)}</b></span>{!!check.merged && <span>ادغام‌شده (چند ردیف یک کالا): <b>{toFa(check.merged)}</b></span>}<span>خطا: <b className={check.errors.length ? 't-neg' : ''}>{toFa(check.errors.length)}</b></span>
          </div>
          {(check.createdBrands.length > 0 || check.createdCategories.length > 0) && <div className="callout sm">
            {check.createdBrands.length > 0 && <div>برندهای جدید: {check.createdBrands.join('، ')}</div>}
            {check.createdCategories.length > 0 && <div>دسته‌های جدید: {check.createdCategories.join('، ')}</div>}</div>}
          {check.errors.length > 0 && <div className="callout red sm" style={{ maxHeight: 180, overflow: 'auto' }}>
            <b>ردیف‌های دارای خطا وارد نمی‌شوند:</b>
            {check.errors.slice(0, 50).map((e) => <div key={e.row}>ردیف {toFa(e.row)} (<span className="ltr">{e.sku}</span>): {e.message}</div>)}</div>}
          <button className="btn btn--sm" style={{ alignSelf: 'flex-start' }} onClick={() => setCheck(null)}>تغییر فایل یا گزینه‌ها</button>
        </div>}
        {err && <div className="callout red">{err}</div>}
      </div>
    </Modal>
  );
}
