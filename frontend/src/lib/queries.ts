import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export interface Unit { id: string; name: string; code: string }
export interface Brand { id: string; name: string; kind: string; code: string; country?: string }
export interface Category { id: string; name: string; parentId: string | null; level: number }
export interface Warehouse { id: string; name: string; code: string; isDefault: boolean; isActive: boolean; address?: string; branchId?: string | null; branch?: { id: string; name: string; code: string } | null }
export interface Vehicle { id: string; modelName: string; yearFrom: number; yearTo?: number | null; engineType?: string; brand: Brand; brandId: string }

const opt = { staleTime: 5 * 60_000 };
export const useUnits = () => useQuery({ queryKey: ['units'], queryFn: async () => (await api.get<Unit[]>('/units')).data, ...opt });
export const useBrands = () => useQuery({ queryKey: ['brands'], queryFn: async () => (await api.get<Brand[]>('/brands')).data, ...opt });
export const useCategories = () => useQuery({ queryKey: ['categories'], queryFn: async () => (await api.get<Category[]>('/categories')).data, ...opt });
export const useWarehouses = () => useQuery({ queryKey: ['warehouses'], queryFn: async () => (await api.get<Warehouse[]>('/warehouses')).data, ...opt });
/** انبارهای شعبه‌ی فعال (یا همه، در حالت «همه‌ی شعبه‌ها») */
export function branchWarehouses(all: Warehouse[] | undefined, branchId: string | null) {
  const act = (all ?? []).filter((w) => w.isActive);
  return !branchId || branchId === 'all' ? act : act.filter((w) => !w.branchId || w.branchId === branchId);
}
export const useVehicles = () => useQuery({ queryKey: ['vehicles'], queryFn: async () => (await api.get<Vehicle[]>('/vehicles')).data, ...opt });

export const vehicleLabel = (v: Vehicle) => `${v.brand?.name ?? ''} ${v.modelName}`.trim();

/** نام دسته با مسیر والد: «ترمز › لنت ترمز» */
export function categoryPath(cats: Category[] | undefined, id?: string | null): string {
  if (!cats || !id) return '';
  const c = cats.find((x) => x.id === id);
  if (!c) return '';
  const p = c.parentId ? cats.find((x) => x.id === c.parentId) : null;
  return p ? `${p.name} › ${c.name}` : c.name;
}

export interface Product {
  id: string; sku: string; name: string; nameEn?: string; partNumber?: string; oemCode?: string; barcode?: string; description?: string;
  categoryId?: string; brandId?: string; unitId: string; purchasePrice: number; salePrice: number; wholesalePrice?: number;
  minStock: number; maxStock?: number; location?: string; warrantyMonths?: number; isActive: boolean; isService: boolean;
  totalStock: number; availableStock: number; category?: Category; brand?: Brand; unit?: Unit;
  /** موجودی شعبه‌ی فعال و سایر شعبه‌ها */
  branchStock?: number; otherBranchStock?: number;
  inventory?: { quantity: number; availableQuantity: number; warehouse: { id: string; name: string; branchId: string | null } }[];
  codes?: { id?: string; type: string; code: string; note?: string }[];
}
export interface LookupAlt { reason: string; product: Product }
export interface LookupHit extends Product { matchedBy: string; alternatives: LookupAlt[]; compatibilities?: { vehicle: Vehicle }[] }
export interface Party { id: string; code: string; name: string; partyType: 'CUSTOMER' | 'SUPPLIER'; mobile?: string; phone?: string; city?: string; address?: string; currentBalance: number; openingBalance?: number; creditLimit?: number; discountPercent?: number; paymentTerms?: number; notes?: string; isActive: boolean; nationalId?: string; economicCode?: string; email?: string }
