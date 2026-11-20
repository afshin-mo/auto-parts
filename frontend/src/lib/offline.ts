import { useSyncExternalStore } from 'react';
import { api, ApiError, BASE, IS_MOCK } from './api';
import { getBranchId } from './branch';
import type { Product } from './queries';

/**
 * فروش سریع آفلاین: فهرست کالا در IndexedDB، فروش‌ها در صف، ارسال بعد از اتصال.
 * هر فروش یک clientRequestId دارد و بکند ارسال دوباره‌ی آن را فاکتور تکراری نمی‌کند.
 * ثبت سریع کالا هم بدون اینترنت ذخیره و بعد از اتصال (قبل از فروش‌ها) ارسال می‌شود.
 * shortcut: فروش با چک ندارد؛ موجودی و قیمت‌های آفلاین تقریبی‌اند و اگر سرور کم‌موجودی ببیند فروش «ارسال‌نشده» می‌ماند؛
 * کالای ثبت‌شده‌ی آفلاین بعد از ارسال و دریافت دوباره‌ی کالاها قابل فروش است؛ اگر پاسخ سرور گم شود ارسال دوباره ممکن است کالای تکراری بسازد.
 */

export interface CatalogLot { id: string; cost: number; qty: number }
export interface CatalogItem { id: string; sku: string; name: string; salePrice: number; isService: boolean; stock: number; unit?: string; keys: string; /** ردیف‌های قیمت خرید در انبار پیش‌فرض شعبه */ lots?: CatalogLot[] }
export interface CatalogMeta { syncedAt: number; tenantId: string; branchId: string | null; count: number; /** AVERAGE = هنگام فروش قیمت پرسیده نمی‌شود */ costMethod?: string }
export interface QueuedLine { productId: string; name: string; sku: string; quantity: number; unitPrice: number; lotId?: string }
export interface QueuedProduct { id: string; tenantId: string; branchId: string | null; createdAt: string; status: 'pending' | 'failed'; error?: string; name: string; body: Record<string, unknown> }
export interface QueuedSale {
  clientRequestId: string; tenantId: string; userId: string; branchId: string; createdAt: string;
  status: 'pending' | 'failed'; error?: string; total: number; partyId?: string; partyName?: string; lines: QueuedLine[]; payload: Record<string, unknown>;
}
export interface FlushResult { clientRequestId: string; invoiceNumber?: string; error?: string }
export interface Scope { tenantId: string; userId: string }

// ───────── IndexedDB ─────────
let dbp: Promise<IDBDatabase> | null = null;
const openDb = () => (dbp ??= new Promise<IDBDatabase>((resolve, reject) => {
  const r = indexedDB.open('yadaki-offline', 2);
  r.onupgradeneeded = () => {
    const d = r.result; const has = (n: string) => d.objectStoreNames.contains(n);
    if (!has('catalog')) d.createObjectStore('catalog', { keyPath: 'id' });
    if (!has('queue')) d.createObjectStore('queue', { keyPath: 'clientRequestId' });
    if (!has('meta')) d.createObjectStore('meta');
    if (!has('pq')) d.createObjectStore('pq', { keyPath: 'id' });
  };
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
}));
const req = <T,>(r: IDBRequest<T>) => new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

async function write(stores: string[], fn: (t: IDBTransaction) => void): Promise<void> {
  const t = (await openDb()).transaction(stores, 'readwrite');
  const done = new Promise<void>((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
  fn(t);
  return done;
}
const getAll = async <T,>(store: string): Promise<T[]> => req((await openDb()).transaction(store).objectStore(store).getAll() as IDBRequest<T[]>);
const putQueue = (s: QueuedSale) => write(['queue'], (t) => { t.objectStore('queue').put(s); });
const delQueue = (id: string) => write(['queue'], (t) => { t.objectStore('queue').delete(id); });

export const getCatalog = () => getAll<CatalogItem>('catalog');
export async function getCatalogMeta(): Promise<CatalogMeta | null> {
  return ((await req((await openDb()).transaction('meta').objectStore('meta').get('catalog'))) as CatalogMeta | undefined) ?? null;
}

// ───────── جستجوی محلی ─────────
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹', AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
export const normalize = (s: string) => s.toLowerCase().replace(/[۰-۹٠-٩]/g, (d) => String(FA_DIGITS.includes(d) ? FA_DIGITS.indexOf(d) : AR_DIGITS.indexOf(d)))
  .replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\u200c/g, ' ').replace(/\s+/g, ' ').trim();

function toItem(p: Product): CatalogItem {
  const codes = [p.sku, p.name, p.nameEn, p.partNumber, p.oemCode, p.barcode, ...(p.codes ?? []).map((c) => c.code)].filter(Boolean).join(' ');
  return { id: p.id, sku: p.sku, name: p.name, salePrice: Number(p.salePrice), isService: p.isService, stock: Number(p.branchStock ?? p.totalStock ?? 0), unit: p.unit?.name, keys: normalize(codes) };
}

/** کد/بارکد دقیق اول، بعد هر کالایی که همه‌ی کلمات جستجو را دارد */
export function searchCatalog(items: CatalogItem[], q: string, limit = 8): CatalogItem[] {
  const nq = normalize(q); if (!nq) return [];
  const tokens = nq.split(' ');
  const exact = items.filter((i) => normalize(i.sku) === nq || i.keys.split(' ').includes(nq));
  const rest = items.filter((i) => !exact.includes(i) && tokens.every((t) => i.keys.includes(t)));
  return [...exact, ...rest].slice(0, limit);
}

// ───────── همگام‌سازی کالاها ─────────
export async function syncCatalog(scope: Scope, onProgress?: (page: number, pages: number) => void): Promise<CatalogMeta> {
  const items: CatalogItem[] = [];
  let page = 1, pages = 1;
  do {
    const r = await api.get<Product[]>('/products', { page, limit: 100, isActive: true, sortBy: 'name', sortOrder: 'asc' });
    pages = r.meta?.totalPages ?? 1;
    items.push(...r.data.map(toItem));
    onProgress?.(page, pages);
  } while (++page <= pages);
  // ردیف‌های قیمت خرید و روش بهای تمام‌شده؛ اگر دریافت نشد، فروش بدون پرسیدن قیمت (قدیمی‌ترین قیمت) انجام می‌شود
  let costMethod: string | undefined;
  try {
    const lots = (await api.get<{ lots: { id: string; productId: string; unitCost: number; quantity: number }[] }>('/inventory/lots/all')).data.lots;
    const by = new Map<string, CatalogLot[]>();
    for (const l of lots) (by.get(l.productId) ?? by.set(l.productId, []).get(l.productId)!).push({ id: l.id, cost: Number(l.unitCost), qty: Number(l.quantity) });
    items.forEach((i) => { i.lots = by.get(i.id); });
  } catch { /* بدون دسترسی/شبکه */ }
  try { costMethod = (await api.get<{ settings?: { costMethod?: string } }>('/tenants/current')).data.settings?.costMethod; } catch { /* ignore */ }
  const meta: CatalogMeta = { syncedAt: Date.now(), tenantId: scope.tenantId, branchId: getBranchId(), count: items.length, costMethod };
  // جایگزینی یک‌جا؛ اگر وسط کار خطا بیاید، فهرست قبلی دست‌نخورده می‌ماند
  await write(['catalog', 'meta'], (t) => { const c = t.objectStore('catalog'); c.clear(); items.forEach((i) => c.put(i)); t.objectStore('meta').put(meta, 'catalog'); });
  return meta;
}

// ───────── مشتریان (برای انتخاب در فروش سریع، حتی آفلاین) ─────────
export interface CachedCustomer { id: string; name: string; mobile?: string }
export async function getCustomers(): Promise<CachedCustomer[]> {
  return ((await req((await openDb()).transaction('meta').objectStore('meta').get('customers'))) as CachedCustomer[] | undefined) ?? [];
}
export async function syncCustomers(): Promise<CachedCustomer[]> {
  const all: CachedCustomer[] = []; let page = 1, pages = 1;
  do {
    const r = await api.get<{ id: string; name: string; mobile?: string }[]>('/parties', { page, limit: 100, partyType: 'CUSTOMER', sortBy: 'name', sortOrder: 'asc' });
    pages = r.meta?.totalPages ?? 1;
    all.push(...r.data.map((c) => ({ id: c.id, name: c.name, mobile: c.mobile })));
  } while (++page <= pages);
  await write(['meta'], (t) => { t.objectStore('meta').put(all, 'customers'); });
  return all;
}

// ───────── صف فروش ─────────
export const listQueue = async (): Promise<QueuedSale[]> => (await getAll<QueuedSale>('queue')).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
export async function enqueueSale(s: QueuedSale) { await putQueue(s); await refreshCounts(); }
export async function discardSale(id: string) { await delQueue(id); await refreshCounts(); }
export async function retrySale(id: string) {
  const s = (await listQueue()).find((x) => x.clientRequestId === id);
  if (s) await putQueue({ ...s, status: 'pending', error: undefined });
  await refreshCounts();
}

// ───────── صف ثبت کالا ─────────
export const listProductQueue = async (): Promise<QueuedProduct[]> => (await getAll<QueuedProduct>('pq')).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
export async function enqueueProduct(p: QueuedProduct) { await write(['pq'], (t) => { t.objectStore('pq').put(p); }); await refreshCounts(); }
export async function discardProduct(id: string) { await write(['pq'], (t) => { t.objectStore('pq').delete(id); }); await refreshCounts(); }

let flushing: Promise<FlushResult[]> | null = null;
/** ارسال به‌ترتیب؛ خطای شبکه/سرور/احراز هویت صف را نگه می‌دارد و متوقف می‌شود، خطای ۴xx همان فروش را «ارسال‌نشده» علامت می‌زند */
export function flushQueue(scope: Scope): Promise<FlushResult[]> {
  return (flushing ??= (async () => {
    const out: FlushResult[] = [];
    // اول کالاهای ثبت‌شده‌ی آفلاین، بعد فروش‌ها
    for (const p of (await listProductQueue()).filter((x) => x.status === 'pending' && x.tenantId === scope.tenantId)) {
      try { await api.post('/products/quick', p.body, p.branchId ? { 'x-branch-id': p.branchId } : undefined); await discardProduct(p.id); }
      catch (e) {
        const rejected = e instanceof ApiError && e.status >= 400 && e.status < 500 && ![401, 408, 429].includes(e.status);
        if (!rejected) return out;
        await write(['pq'], (t) => { t.objectStore('pq').put({ ...p, status: 'failed', error: (e as ApiError).message }); });
      }
    }
    const pending = (await listQueue()).filter((s) => s.status === 'pending' && s.tenantId === scope.tenantId);
    for (const s of pending) {
      try {
        const r = await api.post<{ invoiceNumber: string }>('/sales', s.payload, { 'x-branch-id': s.branchId });
        await delQueue(s.clientRequestId);
        out.push({ clientRequestId: s.clientRequestId, invoiceNumber: r.data.invoiceNumber });
      } catch (e) {
        const rejected = e instanceof ApiError && e.status >= 400 && e.status < 500 && ![401, 408, 429].includes(e.status);
        if (!rejected) break;
        await putQueue({ ...s, status: 'failed', error: e.message });
        out.push({ clientRequestId: s.clientRequestId, error: e.message });
      }
    }
    return out;
  })().finally(() => { flushing = null; void refreshCounts(); }));
}

// ───────── وضعیت قابل‌مشاهده در UI ─────────
interface Snap { online: boolean; pending: number; failed: number }
// «آنلاین» یعنی سرور (بک‌اند) در دسترس است، نه اینکه کامپیوتر به اینترنت وصل باشد؛ با بک‌اند لوکال، قطعیِ اینترنت اثری ندارد
let snap: Snap = { online: true, pending: 0, failed: 0 };
export const isOnline = () => snap.online;
const listeners = new Set<() => void>();
const set = (p: Partial<Snap>) => { const n = { ...snap, ...p }; if (n.online !== snap.online || n.pending !== snap.pending || n.failed !== snap.failed) { snap = n; listeners.forEach((l) => l()); } };
export async function refreshCounts() {
  try { const q = [...(await listQueue()), ...(await listProductQueue())]; set({ pending: q.filter((s) => s.status === 'pending').length, failed: q.filter((s) => s.status === 'failed').length }); } catch { /* IndexedDB در دسترس نیست */ }
}
export const useOffline = () => useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => snap);

/** سرور در دسترس است؟ هر پاسخ HTTP (حتی خطا) یعنی بله؛ فقط قطعی شبکه/خاموشی سرور یعنی نه */
export async function probe(): Promise<boolean> {
  if (IS_MOCK) return true;
  let ok = true;
  try { await fetch(`${BASE}/health`, { cache: 'no-store', signal: AbortSignal.timeout(4000) }); } catch { ok = false; }
  set({ online: ok });
  return ok;
}

/** با ورود کاربر شروع می‌شود: وضعیت سرور را هر ۱۰ ثانیه می‌سنجد و هر ۳۰ ثانیه (و با برگشتن) صف را می‌فرستد */
export function startAutoSync(scope: Scope): () => void {
  const tick = async () => { if (snap.pending > 0 && (await probe())) void flushQueue(scope); };
  const check = () => { void probe().then((ok) => { if (ok) void tick(); }); };
  window.addEventListener('online', check); window.addEventListener('offline', check);
  const t1 = window.setInterval(check, 10_000);
  const t2 = window.setInterval(() => void tick(), 30_000);
  check(); void refreshCounts().then(tick);
  return () => { window.removeEventListener('online', check); window.removeEventListener('offline', check); window.clearInterval(t1); window.clearInterval(t2); };
}
