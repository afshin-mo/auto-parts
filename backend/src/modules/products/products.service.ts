import { Injectable, NotFoundException, ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductDto, PRODUCT_SORT_FIELDS } from './dto/query-product.dto';
import { AddCompatibilityDto, AddSubstituteDto } from './dto/compat.dto';
import { AddCodeDto, LookupQueryDto, QuickProductDto } from './dto/product-extras.dto';
import { buildMeta, safeSort } from '../../common/dto/pagination.dto';
import { BranchContext } from '../../common/branch.context';
import { resolveWarehouse } from '../../common/utils/branch.util';
import { catalogScope } from '../../common/utils/catalog-scope.util';
import { normalizeCode, normalizeLetters, normalizeName, normalizeText } from '../../common/utils/code-normalize.util';
import { productSearchWhere } from './product-search';
import { syncProductCodes } from './product-codes';

const REFS = { category: true, brand: true, unit: true } as const;
const INV = { select: { quantity: true, availableQuantity: true, warehouse: { select: { id: true, name: true, branchId: true } } } } as const;

type InvRow = { quantity: Prisma.Decimal | number; availableQuantity: Prisma.Decimal | number; warehouse: { id: string; name: string; branchId: string | null } };

/** موجودی را در محدوده‌ی شعبه‌های مجاز جمع می‌زند؛ branchStock فقط شعبه‌ی فعال است */
function withStock<T extends { inventory?: InvRow[] }>(p: T, ctx?: BranchContext) {
    const all = p.inventory ?? [];
    const inScope = ctx
        ? all.filter((i) => (i.warehouse.branchId ? ctx.allowedIds.includes(i.warehouse.branchId) : ctx.unrestricted))
        : all;
    const sum = (rows: InvRow[], k: 'quantity' | 'availableQuantity') => rows.reduce((s, i) => s + Number(i[k]), 0);
    const mine = ctx?.activeId ? inScope.filter((i) => !i.warehouse.branchId || i.warehouse.branchId === ctx.activeId) : inScope;
    return {
        ...p,
        inventory: inScope,
        totalStock: sum(inScope, 'quantity'),
        availableStock: sum(inScope, 'availableQuantity'),
        branchStock: sum(mine, 'quantity'),
        otherBranchStock: sum(inScope, 'quantity') - sum(mine, 'quantity'),
    };
}

/** کاربری که مجوز دیدن قیمت خرید را ندارد، قیمت خرید/عمده را در پاسخ نمی‌بیند (نه فقط در ظاهر UI) */
function hideCost<T extends Record<string, any>>(p: T, canSeeCost: boolean): T {
    if (canSeeCost) return p;
    const { purchasePrice, wholesalePrice, ...rest } = p;
    void purchasePrice; void wholesalePrice;
    return rest as T;
}

@Injectable()
export class ProductsService {
    constructor(private prisma: PrismaService) { }

    private async nextSku(tx: Prisma.TransactionClient | PrismaService, tenantId: string) {
        const last = await tx.product.findFirst({ where: { tenantId, sku: { startsWith: 'P-' } }, orderBy: { sku: 'desc' }, select: { sku: true } });
        const n = last ? parseInt(last.sku.slice(2, 12), 10) : 0;
        return `P-${String((Number.isNaN(n) ? 0 : n) + 1).padStart(6, '0')}`;
    }

    async create(tenantId: string, userId: string, dto: CreateProductDto, ctx?: BranchContext) {
        const { initialQuantity, warehouseId, sku: rawSku, ...data } = dto;
        data.name = normalizeName(data.name);
        if (data.nameEn) data.nameEn = normalizeName(data.nameEn);
        if (data.description) data.description = normalizeLetters(data.description);
        if (data.location) data.location = normalizeName(data.location);

        const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
        const count = await this.prisma.product.count({ where: { tenantId, deletedAt: null } });
        if (count >= tenant.maxProducts) {
            throw new ForbiddenException(`سقف تعداد کالاهای طرح شما (${tenant.maxProducts} کالا) پر شده است`);
        }
        if (rawSku && (await this.prisma.product.findFirst({ where: { tenantId, sku: rawSku } }))) {
            throw new ConflictException('کالایی با این کد (SKU) وجود دارد');
        }
        await this.assertRefs(tenantId, data);

        const warehouse = initialQuantity && initialQuantity > 0 && !data.isService
            ? await resolveWarehouse(this.prisma, tenantId, ctx?.activeId ?? null, warehouseId)
            : null;

        // شماره‌ی خودکار ممکن است با درخواست هم‌زمان برخورد کند؛ چند بار تلاش می‌کنیم
        for (let attempt = 0; ; attempt++) {
            try {
                return await this.prisma.$transaction(async (tx) => {
                    const sku = rawSku || (await this.nextSku(tx, tenantId));
                    const product = await tx.product.create({ data: { ...data, sku, tenantId }, include: REFS });
                    await syncProductCodes(tx, tenantId, product.id, product);

                    if (warehouse && initialQuantity) {
                        await tx.inventory.create({
                            data: { tenantId, productId: product.id, warehouseId: warehouse.id, quantity: initialQuantity, availableQuantity: initialQuantity },
                        });
                        await tx.inventoryLot.create({
                            data: { tenantId, productId: product.id, warehouseId: warehouse.id, unitCost: product.purchasePrice, quantity: initialQuantity },
                        });
                        await tx.inventoryTransaction.create({
                            data: {
                                tenantId, productId: product.id, warehouseId: warehouse.id,
                                transactionType: 'ADJUSTMENT_INCREASE', quantity: initialQuantity,
                                unitId: product.unitId, unitCost: product.purchasePrice,
                                totalCost: Number(product.purchasePrice) * initialQuantity,
                                referenceType: 'initial', notes: 'موجودی اولیه', createdBy: userId,
                            },
                        });
                    }
                    return product;
                });
            } catch (e) {
                const unique = e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
                if (!unique) throw e;
                if (rawSku || attempt >= 3) throw new ConflictException('کالایی با این کد (SKU) یا بارکد وجود دارد');
            }
        }
    }

    /** ثبت سریع: فقط نام و قیمت لازم است؛ واحد پیش‌فرض «عدد» و کد خودکار */
    async quick(tenantId: string, userId: string, dto: QuickProductDto, ctx?: BranchContext) {
        let unitId = dto.unitId;
        if (!unitId) {
            const u = await this.prisma.unit.findFirst({ where: { code: 'pcs', tenantId: null } }) ?? await this.prisma.unit.findFirst({ where: { AND: [catalogScope(tenantId)] } });
            if (!u) throw new BadRequestException('هیچ واحدی تعریف نشده است');
            unitId = u.id;
        }
        const { purchasePrice, ...rest } = dto;
        return this.create(tenantId, userId, { ...rest, unitId, purchasePrice: purchasePrice ?? 0 } as CreateProductDto, ctx);
    }

    async findAll(tenantId: string, query: QueryProductDto, ctx: BranchContext, canSeeCost: boolean) {
        const { page = 1, limit = 20, search, categoryId, brandId, vehicleId, isActive, sortOrder = 'desc' } = query;
        const sortBy = safeSort(query.sortBy, PRODUCT_SORT_FIELDS, 'createdAt');

        const where: Prisma.ProductWhereInput = { tenantId, deletedAt: null };
        if (search) Object.assign(where, productSearchWhere(search));
        if (categoryId) where.categoryId = categoryId;
        if (brandId) where.brandId = brandId;
        if (isActive !== undefined) where.isActive = isActive;
        if (vehicleId) where.compatibilities = { some: { vehicleId } };

        const [rows, total] = await this.prisma.$transaction(async (tx) => [
            await tx.product.findMany({
                where,
                include: { ...REFS, inventory: INV },
                orderBy: { [sortBy]: sortOrder },
                skip: (page - 1) * limit,
                take: limit,
            }),
            await tx.product.count({ where }),
        ] as const);
        return { data: rows.map((r) => hideCost(withStock(r, ctx), canSeeCost)), meta: buildMeta(total, page, limit) };
    }

    async findOne(tenantId: string, id: string, ctx: BranchContext, canSeeCost: boolean) {
        const product = await this.prisma.product.findFirst({
            where: { id, tenantId, deletedAt: null },
            include: {
                ...REFS,
                codes: { orderBy: { createdAt: 'asc' } },
                inventory: { select: { quantity: true, availableQuantity: true, warehouse: { select: { id: true, name: true, branchId: true } } } },
                compatibilities: { include: { vehicle: { include: { brand: true } } } },
                substitutes: { include: { substitute: { include: { inventory: INV } } }, orderBy: { priority: 'asc' } },
            },
        });
        if (!product) throw new NotFoundException('کالا پیدا نشد');

        const base = withStock(product, ctx);
        return hideCost({
            ...base,
            substitutes: product.substitutes.map((s) => ({ ...s, substitute: hideCost(withStock(s.substitute, ctx), canSeeCost) })),
        }, canSeeCost);
    }

    async update(tenantId: string, id: string, dto: UpdateProductDto) {
        const existing = await this.prisma.product.findFirst({ where: { id, tenantId, deletedAt: null } });
        if (!existing) throw new NotFoundException('کالا پیدا نشد');

        if (dto.sku && dto.sku !== existing.sku) {
            if (await this.prisma.product.findFirst({ where: { tenantId, sku: dto.sku, id: { not: id } } })) {
                throw new ConflictException('کالایی با این کد (SKU) وجود دارد');
            }
        }
        await this.assertRefs(tenantId, dto);
        if (dto.name) dto.name = normalizeName(dto.name);
        if (dto.nameEn) dto.nameEn = normalizeName(dto.nameEn);
        if (dto.description) dto.description = normalizeLetters(dto.description);
        if (dto.location) dto.location = normalizeName(dto.location);

        return this.prisma.$transaction(async (tx) => {
            const updated = await tx.product.update({ where: { id }, data: dto, include: REFS });
            if (['sku', 'partNumber', 'oemCode', 'barcode'].some((k) => k in dto)) await syncProductCodes(tx, tenantId, id, updated);
            return updated;
        });
    }

    async remove(tenantId: string, id: string) {
        const existing = await this.prisma.product.findFirst({ where: { id, tenantId, deletedAt: null } });
        if (!existing) throw new NotFoundException('کالا پیدا نشد');

        // SKU آزاد می‌شود تا بتوان دوباره از همان کد استفاده کرد؛ شماره‌های جستجو هم پاک می‌شوند
        return this.prisma.$transaction(async (tx) => {
            await tx.productCode.deleteMany({ where: { productId: id } });
            return tx.product.update({
                where: { id },
                data: { deletedAt: new Date(), isActive: false, sku: `${existing.sku}__del_${Date.now()}`.slice(0, 100) },
            });
        });
    }

    // ---------- جستجوی سریع با شماره فنی + کالاهای مشابه ----------
    /**
     * جستجوی یکپارچه: شماره‌ی دقیق/پیشوندی/بخشی (نرمال‌شده)، یا نام (همه‌ی کلمات)، با فیلتر خودرو و دسته.
     * خروجی هر کالا موجودی شعبه‌ی فعال و سایر شعبه‌ها را دارد و (در صورت درخواست) فهرست جایگزین‌ها:
     *  ۱) جایگزین ثبت‌شده  ۲) هم‌شماره (کالای دیگر با همان شماره‌ی فنی)  ۳) هم‌دسته و سازگار با همان خودرو.
     */
    async lookup(tenantId: string, q: LookupQueryDto, ctx: BranchContext, canSeeCost: boolean) {
        const limit = Math.min(q.limit ?? 20, 50);
        const term = (q.q ?? '').trim();
        const norm = normalizeCode(term);
        const base: Prisma.ProductWhereInput = {
            tenantId, deletedAt: null, isActive: true,
            ...(q.vehicleId ? { compatibilities: { some: { vehicleId: q.vehicleId } } } : {}),
            ...(q.categoryId ? { categoryId: q.categoryId } : {}),
        };
        const rank = new Map<string, { r: number; by: string }>();
        const put = (id: string, r: number, by: string) => { const c = rank.get(id); if (!c || r < c.r) rank.set(id, { r, by }); };

        if (term) {
            const cap = 200;
            if (norm) {
                const exact = await this.prisma.productCode.findMany({ where: { tenantId, codeNorm: norm, product: base }, select: { productId: true }, take: cap });
                exact.forEach((c) => put(c.productId, 1, 'code-exact'));
                if (norm.length >= 3) {
                    const pre = await this.prisma.productCode.findMany({ where: { tenantId, codeNorm: { startsWith: norm }, product: base }, select: { productId: true }, take: cap });
                    pre.forEach((c) => put(c.productId, 2, 'code-prefix'));
                }
                if (norm.length >= 4) {
                    const part = await this.prisma.productCode.findMany({ where: { tenantId, codeNorm: { contains: norm }, product: base }, select: { productId: true }, take: cap });
                    part.forEach((c) => put(c.productId, 3, 'code-partial'));
                }
            }
            // هر کلمه در نام، سریال، کد، بارکد یا مارک (برند) پیدا شود؛ «500655 PT6» و «لنت PA5» هم کار می‌کنند
            const byTokens = await this.prisma.product.findMany({ where: { ...base, ...productSearchWhere(term) }, select: { id: true }, take: cap });
            byTokens.forEach((p) => put(p.id, 4, 'name'));
        }

        let ids: string[];
        if (term) {
            ids = [...rank.keys()];
            if (!ids.length) return { data: [], meta: { total: 0 } };
        } else if (q.vehicleId || q.categoryId) {
            ids = (await this.prisma.product.findMany({ where: base, select: { id: true }, orderBy: { name: 'asc' }, take: 200 })).map((p) => p.id);
        } else {
            return { data: [], meta: { total: 0 } };
        }

        const rows = await this.prisma.product.findMany({
            where: { id: { in: ids }, tenantId },
            include: {
                ...REFS, inventory: INV,
                codes: { select: { type: true, code: true } },
                compatibilities: { take: 4, include: { vehicle: { include: { brand: { select: { name: true } } } } } },
            },
        });
        const shaped = rows.map((r) => ({ ...withStock(r, ctx), matchedBy: rank.get(r.id)?.by ?? 'filter', _rank: rank.get(r.id)?.r ?? 9 }));
        shaped.sort((a, b) => a._rank - b._rank || Number(b.branchStock > 0) - Number(a.branchStock > 0) || a.name.localeCompare(b.name, 'fa'));
        const top = shaped.slice(0, limit);

        const alt = q.alternatives === 'false' ? null : await this.alternativesFor(tenantId, top.map((p) => p.id), ctx, canSeeCost);
        const data = top.map(({ _rank, ...p }) => hideCost({ ...p, alternatives: alt?.get(p.id) ?? [] }, canSeeCost));
        // { data, meta } تا TransformInterceptor آن را باز کند و فرانت آرایه بگیرد (قبلاً شیء می‌رسید و .map خطا می‌داد)
        return { data, meta: { total: shaped.length } };
    }

    private async alternativesFor(tenantId: string, ids: string[], ctx: BranchContext, canSeeCost: boolean) {
        const out = new Map<string, { reason: string; product: any }[]>();
        if (!ids.length) return out;
        const reasons = new Map<string, Map<string, string>>(); // productId -> (altId -> reason)
        const add = (pid: string, altId: string, reason: string) => {
            if (pid === altId) return;
            const m = reasons.get(pid) ?? new Map<string, string>();
            if (!m.has(altId)) m.set(altId, reason);
            reasons.set(pid, m);
        };

        // ۱) جایگزین‌های ثبت‌شده (دوطرفه)
        const subs = await this.prisma.productSubstitute.findMany({ where: { OR: [{ productId: { in: ids } }, { substituteId: { in: ids } }] }, orderBy: { priority: 'asc' } });
        subs.forEach((s) => { add(s.productId, s.substituteId, 'جایگزین ثبت‌شده'); add(s.substituteId, s.productId, 'جایگزین ثبت‌شده'); });

        // ۲) هم‌شماره: کالای دیگری که یکی از شماره‌های فنی‌اش با این کالا برابر است
        const mine = await this.prisma.productCode.findMany({ where: { productId: { in: ids } }, select: { productId: true, codeNorm: true } });
        const norms = [...new Set(mine.map((c) => c.codeNorm))];
        if (norms.length) {
            const same = await this.prisma.productCode.findMany({
                where: { tenantId, codeNorm: { in: norms }, productId: { notIn: [] }, product: { deletedAt: null, isActive: true } },
                select: { productId: true, codeNorm: true },
            });
            const byNorm = new Map<string, string[]>();
            same.forEach((c) => byNorm.set(c.codeNorm, [...(byNorm.get(c.codeNorm) ?? []), c.productId]));
            mine.forEach((c) => (byNorm.get(c.codeNorm) ?? []).forEach((alt) => add(c.productId, alt, 'هم‌شماره (شماره‌ی فنی یکسان)')));
        }

        // ۳) هم‌دسته و سازگار با همان خودرو — فقط برای کالاهایی که هنوز جایگزینی ندارند
        const lacking = ids.filter((id) => !(reasons.get(id)?.size));
        if (lacking.length) {
            const ps = await this.prisma.product.findMany({
                where: { id: { in: lacking } },
                select: { id: true, categoryId: true, compatibilities: { select: { vehicleId: true } } },
            });
            for (const p of ps.slice(0, 15)) {
                const vids = p.compatibilities.map((c) => c.vehicleId);
                if (!p.categoryId || !vids.length) continue;
                const near = await this.prisma.product.findMany({
                    where: { tenantId, deletedAt: null, isActive: true, id: { not: p.id }, categoryId: p.categoryId, compatibilities: { some: { vehicleId: { in: vids } } } },
                    select: { id: true }, take: 5,
                });
                near.forEach((n) => add(p.id, n.id, 'هم‌دسته و سازگار با همان خودرو'));
            }
        }

        const allAlt = [...new Set([...reasons.values()].flatMap((m) => [...m.keys()]))];
        if (!allAlt.length) return out;
        const prods = await this.prisma.product.findMany({
            where: { id: { in: allAlt }, tenantId, deletedAt: null, isActive: true },
            include: { brand: true, unit: true, inventory: INV },
        });
        const byId = new Map(prods.map((p) => [p.id, hideCost(withStock(p, ctx), canSeeCost)]));
        for (const [pid, m] of reasons) {
            const list = [...m.entries()].map(([id, reason]) => ({ reason, product: byId.get(id) })).filter((x) => x.product);
            // موجودها اول
            list.sort((a, b) => Number((b.product as any).branchStock > 0) - Number((a.product as any).branchStock > 0));
            out.set(pid, list.slice(0, 6));
        }
        return out;
    }

    // ---------- شماره‌های فنی اضافه (معادل، برند دیگر) ----------
    async addCode(tenantId: string, id: string, dto: AddCodeDto) {
        await this.ensureProduct(tenantId, id);
        const codeNorm = normalizeCode(dto.code);
        if (!codeNorm) throw new BadRequestException('شماره نامعتبر است');
        try {
            return await this.prisma.productCode.create({
                data: { tenantId, productId: id, type: dto.type ?? 'AFTERMARKET', code: dto.code.trim(), codeNorm, note: dto.note },
            });
        } catch (e) {
            if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('این شماره قبلاً برای همین کالا ثبت شده است');
            throw e;
        }
    }

    async removeCode(tenantId: string, id: string, codeId: string) {
        await this.ensureProduct(tenantId, id);
        const c = await this.prisma.productCode.findFirst({ where: { id: codeId, productId: id } });
        if (!c) throw new NotFoundException('شماره پیدا نشد');
        if (['SKU', 'PART_NUMBER', 'OEM', 'BARCODE'].includes(c.type)) {
            throw new BadRequestException('این شماره از فیلدهای خود کالا می‌آید؛ آن را از فرم ویرایش کالا تغییر دهید');
        }
        await this.prisma.productCode.delete({ where: { id: codeId } });
        return { removed: true };
    }

    // ---------- سازگاری با خودرو ----------
    async addCompatibility(tenantId: string, id: string, dto: AddCompatibilityDto) {
        await this.ensureProduct(tenantId, id);
        if (!(await this.prisma.vehicle.findFirst({ where: { id: dto.vehicleId, AND: [catalogScope(tenantId)] } }))) {
            throw new NotFoundException('خودرو پیدا نشد');
        }
        return this.prisma.productVehicleCompatibility.upsert({
            where: { productId_vehicleId: { productId: id, vehicleId: dto.vehicleId } },
            create: { tenantId, productId: id, ...dto },
            update: { position: dto.position, notes: dto.notes },
            include: { vehicle: { include: { brand: true } } },
        });
    }

    async removeCompatibility(tenantId: string, id: string, vehicleId: string) {
        await this.ensureProduct(tenantId, id);
        await this.prisma.productVehicleCompatibility.deleteMany({ where: { productId: id, vehicleId } });
        return { removed: true };
    }

    // ---------- کالای جایگزین ----------
    async addSubstitute(tenantId: string, id: string, dto: AddSubstituteDto) {
        if (id === dto.substituteId) throw new BadRequestException('کالا نمی‌تواند جایگزین خودش باشد');
        await this.ensureProduct(tenantId, id);
        await this.ensureProduct(tenantId, dto.substituteId);
        return this.prisma.productSubstitute.upsert({
            where: { productId_substituteId: { productId: id, substituteId: dto.substituteId } },
            create: { tenantId, productId: id, ...dto },
            update: { priority: dto.priority, reason: dto.reason },
            include: { substitute: true },
        });
    }

    async removeSubstitute(tenantId: string, id: string, substituteId: string) {
        await this.ensureProduct(tenantId, id);
        await this.prisma.productSubstitute.deleteMany({ where: { productId: id, substituteId } });
        return { removed: true };
    }

    private async ensureProduct(tenantId: string, id: string) {
        const p = await this.prisma.product.findFirst({ where: { id, tenantId, deletedAt: null }, select: { id: true } });
        if (!p) throw new NotFoundException('کالا پیدا نشد');
    }

    /** برند، دسته و واحد باید سیستمی یا متعلق به همین فروشگاه باشند (نه فروشگاه دیگر) */
    private async assertRefs(tenantId: string, data: { categoryId?: string; brandId?: string; unitId?: string }) {
        const scope = { AND: [catalogScope(tenantId)] };
        if (data.categoryId && !(await this.prisma.category.findFirst({ where: { id: data.categoryId, ...scope } }))) throw new NotFoundException('دسته‌بندی پیدا نشد');
        if (data.brandId && !(await this.prisma.brand.findFirst({ where: { id: data.brandId, ...scope } }))) throw new NotFoundException('برند پیدا نشد');
        if (data.unitId && !(await this.prisma.unit.findFirst({ where: { id: data.unitId, ...scope } }))) throw new NotFoundException('واحد پیدا نشد');
    }
}
