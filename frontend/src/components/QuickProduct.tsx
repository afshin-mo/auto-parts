import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { Modal, Field, NumInput, useUi } from './ui';
import { ScanButton } from './BarcodeScanner';
import { useAuth } from '../lib/auth';
import { useBrands, useCategories, categoryPath, branchWarehouses, useWarehouses } from '../lib/queries';
import { toFa } from '../lib/format';
import { enqueueProduct, flushQueue, isOnline } from '../lib/offline';

const BLANK = { name: '', salePrice: '' as number | '', purchasePrice: '' as number | '', initialQuantity: '' as number | '', oemCode: '', barcode: '', location: '' };

/**
 * ثبت سریع کالا: فقط نام و قیمت فروش لازم است (کد کالا و واحد خودکار).
 * «ذخیره و بعدی» فرم را پاک می‌کند ولی دسته و برند را نگه می‌دارد تا ثبت پشت‌سرهم سریع باشد.
 * بارکدخوان USB مثل صفحه‌کلید عمل می‌کند: روی فیلد بارکد بزنید و اسکن کنید (Enter ذخیره می‌کند).
 */
export function QuickProduct({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient(); const { toast } = useUi(); const { has, branchId, user } = useAuth();
  const cats = useCategories().data, brands = useBrands().data, whs = useWarehouses().data;
  const [f, setF] = useState({ ...BLANK });
  const [sticky, setSticky] = useState({ categoryId: '', brandId: '', warehouseId: '' });
  const [count, setCount] = useState(0);
  const [err, setErr] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);
  const seeCost = has('products.viewCost');
  useEffect(() => { nameRef.current?.focus(); }, [count]);

  const save = useMutation({
    mutationFn: async (_keepOpen: boolean) => {
      const body: Record<string, unknown> = { name: f.name.trim(), salePrice: f.salePrice === '' ? 0 : f.salePrice };
      if (f.purchasePrice !== '') body.purchasePrice = f.purchasePrice;
      if (f.initialQuantity !== '') body.initialQuantity = f.initialQuantity;
      for (const k of ['oemCode', 'barcode', 'location'] as const) if (f[k].trim()) body[k] = f[k].trim();
      for (const [k, v] of Object.entries(sticky)) if (v) body[k] = v;
      // بدون اینترنت (یا قطع‌شدن شبکه حین ارسال): روی همین دستگاه ذخیره می‌شود و بعد از اتصال خودکار ارسال می‌شود
      const queue = async () => { await enqueueProduct({ id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`, tenantId: user!.tenantId, branchId, createdAt: new Date().toISOString(), status: 'pending', name: String(body.name), body }); return { queued: true }; };
      if (!isOnline()) return queue();
      try { await api.post('/products/quick', body); return { queued: false }; }
      catch (e) { if (e instanceof ApiError) throw e; return queue(); }
    },
    onSuccess: (r, keepOpen) => {
      qc.invalidateQueries({ queryKey: ['products'] });
      setCount((c) => c + 1); setErr(''); setF({ ...BLANK });
      toast(r.queued ? 'اینترنت نیست؛ کالا ذخیره شد و بعد از اتصال ثبت می‌شود' : 'کالا ثبت شد');
      if (r.queued && isOnline()) void flushQueue({ tenantId: user!.tenantId, userId: user!.id });
      if (!keepOpen) onClose();
    },
    onError: (e: ApiError) => setErr([e.message, ...(e.details ?? [])].join(' — ')),
  });
  const ready = f.name.trim().length > 0 && !save.isPending;
  const submit = (keep: boolean) => ready && save.mutate(keep);
  const enter = (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); submit(true); } };

  return (
    <Modal title={count ? `ثبت سریع کالا — ${toFa(count)} کالا ثبت شد` : 'ثبت سریع کالا'} onClose={onClose}
      footer={<>
        <button className="btn btn--primary" disabled={!ready} onClick={() => submit(true)}>ذخیره و بعدی (Enter)</button>
        <button className="btn" disabled={!ready} onClick={() => submit(false)}>ذخیره و بستن</button>
        <button className="btn" onClick={onClose}>{count ? 'پایان' : 'انصراف'}</button>
      </>}>
      <div className="stack" onKeyDown={enter}>
        <Field label="نام کالا" required><input ref={nameRef} className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="مثلاً: لنت جلو پژو ۲۰۶" /></Field>
        <div className="grid g3">
          <Field label="قیمت فروش (ریال)" hint="اختیاری؛ هنگام فروش تعیین می‌شود"><NumInput money value={f.salePrice} onChange={(v) => setF({ ...f, salePrice: v })} /></Field>
          {seeCost && <Field label="قیمت خرید"><NumInput money value={f.purchasePrice} onChange={(v) => setF({ ...f, purchasePrice: v })} /></Field>}
          <Field label="موجودی اولیه"><NumInput decimals value={f.initialQuantity} onChange={(v) => setF({ ...f, initialQuantity: v })} /></Field>
        </div>
        <div className="grid g3">
          <Field label="شماره فنی / OEM"><input className="input input--num" value={f.oemCode} onChange={(e) => setF({ ...f, oemCode: e.target.value })} /></Field>
          <Field label="بارکد"><div className="row"><input className="input input--num grow" value={f.barcode} onChange={(e) => setF({ ...f, barcode: e.target.value })} /><ScanButton onCode={(c) => setF((x) => ({ ...x, barcode: c }))} /></div></Field>
          <Field label="محل در انبار"><input className="input input--num" placeholder="A-2-3" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></Field>
        </div>
        <div className="grid g3" style={{ background: 'var(--concrete)', padding: 10 }}>
          <Field label="دسته (ثابت می‌ماند)"><select className="select" value={sticky.categoryId} onChange={(e) => setSticky({ ...sticky, categoryId: e.target.value })}><option value="">—</option>{cats?.filter((c) => c.level > 1 || !cats.some((k) => k.parentId === c.id)).map((c) => <option key={c.id} value={c.id}>{categoryPath(cats, c.id)}</option>)}</select></Field>
          <Field label="برند (ثابت می‌ماند)"><select className="select" value={sticky.brandId} onChange={(e) => setSticky({ ...sticky, brandId: e.target.value })}><option value="">—</option>{brands?.filter((b) => b.kind === 'PART').map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
          <Field label="انبار موجودی"><select className="select" value={sticky.warehouseId} onChange={(e) => setSticky({ ...sticky, warehouseId: e.target.value })}><option value="">پیش‌فرض شعبه</option>{branchWarehouses(whs, branchId).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>
        </div>
        {err && <div className="callout red">{err}</div>}
      </div>
    </Modal>
  );
}
