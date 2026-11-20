import { getBranchId } from './branch';

export const BASE = (import.meta.env.VITE_API_URL as string) || '/api/v1';
export const IS_MOCK = import.meta.env.VITE_MOCK === 'true';

import { ApiError } from './errors';
export { ApiError };

export const tokens = {
  get access() { return localStorage.getItem('accessToken'); },
  get refresh() { return localStorage.getItem('refreshToken'); },
  set(a: string, r: string) { localStorage.setItem('accessToken', a); localStorage.setItem('refreshToken', r); },
  clear() { localStorage.removeItem('accessToken'); localStorage.removeItem('refreshToken'); localStorage.removeItem('lastUser'); },
};

let onUnauthorized: () => void = () => { };
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };

const FIELD_FA: Record<string, string> = {
  name: 'نام', phone: 'موبایل', password: 'رمز عبور', sku: 'کد کالا', unitId: 'واحد', salePrice: 'قیمت فروش',
  purchasePrice: 'قیمت خرید', quantity: 'تعداد', unitPrice: 'قیمت واحد', items: 'ردیف‌ها', amount: 'مبلغ',
  checkNumber: 'شماره چک', bankName: 'بانک', dueDate: 'سررسید', tenantSlug: 'نشانی اختصاصی', tenantName: 'نام فروشگاه',
  reason: 'علت', code: 'کد', modelName: 'نام مدل', yearFrom: 'سال شروع', brandId: 'برند', permissions: 'دسترسی‌ها',
};
/** پیام‌های class-validator انگلیسی‌اند؛ با نام فارسی فیلد خلاصه می‌کنیم */
function humanize(details?: string[]): string[] | undefined {
  return details?.map((d) => {
    const field = d.split(/[ .]/)[0].replace(/\[\d+\]/g, '');
    const fa = FIELD_FA[field];
    return fa ? `مقدار «${fa}» نامعتبر است` : d;
  });
}

type Query = Record<string, string | number | boolean | undefined | null>;

async function rawFetch(method: string, path: string, query?: Query, body?: unknown, auth = true, extra?: Record<string, string>): Promise<Response> {
  const qs = query
    ? Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')
    : '';
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && tokens.access) headers.Authorization = `Bearer ${tokens.access}`;
  const branch = getBranchId();
  if (auth && branch) headers['x-branch-id'] = branch;
  Object.assign(headers, extra);   // مثلاً شعبه‌ی ثبت‌شده در صف فروش آفلاین، نه شعبه‌ی فعلی
  return fetch(`${BASE}${path}${qs ? '?' + qs : ''}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
}

let refreshing: Promise<boolean> | null = null;
async function tryRefresh(): Promise<boolean> {
  if (!tokens.refresh) return false;
  refreshing ??= (async () => {
    try {
      const res = await rawFetch('POST', '/auth/refresh', undefined, { refreshToken: tokens.refresh }, false);
      if (!res.ok) return false;
      const json = await res.json();
      tokens.set(json.data.accessToken, json.data.refreshToken);
      return true;
    } catch { return false; } finally { setTimeout(() => (refreshing = null), 0); }
  })();
  return refreshing;
}

export interface Meta { total: number; page: number; limit: number; totalPages: number }
export interface ApiResult<T> { data: T; meta?: Meta }

async function request<T>(method: string, path: string, query?: Query, body?: unknown, auth = true, extra?: Record<string, string>): Promise<ApiResult<T>> {
  if (IS_MOCK) { const { mockRequest } = await import('../mock/server'); return mockRequest(method, path, query ?? {}, body) as Promise<ApiResult<T>>; }

  let res: Response;
  try { res = await rawFetch(method, path, query, body, auth, extra); }
  catch { throw new ApiError('ارتباط با سرور برقرار نشد. اتصال یا اجرای بکند را بررسی کنید.', 0); }

  if (res.status === 401 && auth && !path.startsWith('/auth/')) {
    if (await tryRefresh()) res = await rawFetch(method, path, query, body, auth, extra);
    else { tokens.clear(); onUnauthorized(); }
  }
  const json = await res.json().catch(() => null);
  if (!res.ok || json?.success === false) {
    const e = json?.error;
    throw new ApiError(e?.message || 'خطای نامشخص از سرور', res.status, humanize(e?.details));
  }
  return { data: json.data as T, meta: json.meta };
}

export const api = {
  get: <T,>(path: string, query?: Query) => request<T>('GET', path, query),
  post: <T,>(path: string, body?: unknown, extraHeaders?: Record<string, string>) => request<T>('POST', path, undefined, body ?? {}, true, extraHeaders),
  patch: <T,>(path: string, body?: unknown) => request<T>('PATCH', path, undefined, body ?? {}),
  put: <T,>(path: string, body?: unknown) => request<T>('PUT', path, undefined, body ?? {}),
  del: <T,>(path: string) => request<T>('DELETE', path),
  login: (phone: string, password: string) => request<any>('POST', '/auth/login', undefined, { phone, password }, false),
  register: (body: unknown) => request<any>('POST', '/auth/register', undefined, body, false),
};
