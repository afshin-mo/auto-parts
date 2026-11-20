import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { PaymentsService } from '../payments/payments.service';
import { PartiesService } from '../parties/parties.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { QueryInvoicesDto, InvoicePaymentDto } from './dto/sales-query.dto';
import { calculateInvoice } from '../../common/utils/invoice-calc';
import { nextInvoiceNumber } from '../../common/utils/invoice-number.util';
import { retryOnUnique } from '../../common/utils/retry.util';
import { buildMeta } from '../../common/dto/pagination.dto';
import { BranchContext, branchFilter, requireActiveBranch } from '../../common/branch.context';
import { resolveWarehouse, invoiceBranchCode } from '../../common/utils/branch.util';

@Injectable()
export class SalesService {
    constructor(
        private prisma: PrismaService,
        private inventory: InventoryService,
        private payments: PaymentsService,
        private parties: PartiesService,
    ) { }

    /** فروشی که با همین clientRequestId قبلاً ثبت شده (ارسال دوباره‌ی فروش آفلاین بعد از قطعی پاسخ) */
    private findByClientRequest(db: Pick<PrismaService, 'invoice'>, tenantId: string, clientRequestId?: string) {
        if (!clientRequestId) return null;
        return db.invoice.findFirst({ where: { tenantId, clientRequestId }, include: { items: { orderBy: { sortOrder: 'asc' } }, party: true } });
    }

    async createSale(tenantId: string, userId: string, dto: CreateSaleDto, ctx: BranchContext) {
        const replay = await this.findByClientRequest(this.prisma, tenantId, dto.clientRequestId);
        if (replay) return replay;
        const branchId = requireActiveBranch(ctx);
        const { partyId, items } = dto;
        const vatPercent = dto.vatPercent ?? 9;

        // --- اعتبارسنجی‌ها ---
        let party = partyId ? await this.prisma.party.findFirst({ where: { id: partyId, tenantId, isActive: true } }) : null;
        if (partyId && !party) throw new NotFoundException('مشتری پیدا نشد');
        if (party && party.partyType !== 'CUSTOMER') throw new BadRequestException('برای فاکتور فروش باید مشتری انتخاب شود، نه تأمین‌کننده');

        const warehouse = await resolveWarehouse(this.prisma, tenantId, branchId, dto.warehouseId);

        const ids = [...new Set(items.map((i) => i.productId))];
        const products = await this.prisma.product.findMany({ where: { id: { in: ids }, tenantId, deletedAt: null } });
        const byId = new Map(products.map((p) => [p.id, p]));
        for (const id of ids) if (!byId.has(id)) throw new NotFoundException('یکی از کالاهای فاکتور پیدا نشد');
        const inactive = products.find((p) => !p.isActive);
        if (inactive) throw new BadRequestException(`کالای «${inactive.name}» غیرفعال است`);

        // --- محاسبه ---
        const calc = calculateInvoice(items, {
            discountPercent: dto.discountPercent,
            discountAmount: dto.discountAmount,
            vatPercent,
        });
        const total = calc.totalAmount;
        const paid = dto.payInFull ? total : dto.paidAmount ?? 0;

        if (paid > total) throw new BadRequestException('مبلغ دریافتی از جمع فاکتور بیشتر است');
        if (!party && paid < total) throw new BadRequestException('برای فروش نسیه ابتدا مشتری را انتخاب کنید');
        if (party?.creditLimit && Number(party.creditLimit) > 0) {
            const projected = Number(party.currentBalance) + (total - paid);
            if (projected > Number(party.creditLimit)) {
                throw new BadRequestException(`سقف اعتبار مشتری (${Number(party.creditLimit)}) رد می‌شود؛ مانده پس از فاکتور: ${projected}`);
            }
        }

        // نام مشتریِ تایپ‌شده در فاکتور، خودکار به لیست مشتریان اضافه می‌شود (قانون نسیه بالا با همان partyId اولیه سنجیده شد)
        if (!party && dto.partyName?.trim()) party = await this.parties.findOrCreateCustomer(tenantId, dto.partyName, dto.partyNationalId);

        const date = dto.date ? new Date(dto.date) : new Date();
        const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { settings: true } });
        const costMethod = (tenant.settings as { costMethod?: string } | null)?.costMethod === 'AVERAGE' ? 'AVERAGE' : undefined;

        return retryOnUnique(() =>
            this.prisma.$transaction(async (tx) => {
                // دو ارسال هم‌زمان با یک کلید: دومی بعد از retryOnUnique همین فاکتور را می‌یابد
                const dup = await this.findByClientRequest(tx, tenantId, dto.clientRequestId);
                if (dup) return dup;
                const invoiceNumber = await nextInvoiceNumber(tx, tenantId, 'SALE', date, await invoiceBranchCode(tx, branchId));

                const invoice = await tx.invoice.create({
                    data: {
                        tenantId, invoiceNumber, invoiceType: 'SALE', status: 'CONFIRMED', branchId, warehouseId: warehouse.id, clientRequestId: dto.clientRequestId,
                        date, dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
                        partyId: party?.id, partyName: party?.name ?? dto.partyName, partyNationalId: party?.nationalId ?? dto.partyNationalId,
                        subtotal: calc.subtotal,
                        discountAmount: calc.invoiceDiscount,
                        discountPercent: dto.discountAmount ? 0 : dto.discountPercent ?? 0,
                        vatAmount: calc.vatAmount, vatPercent,
                        totalAmount: total, paidAmount: 0, remainingAmount: total,
                        notes: dto.notes, internalNotes: dto.internalNotes,
                        createdBy: userId,
                        items: {
                            create: items.map((it, i) => {
                                const p = byId.get(it.productId)!;
                                const c = calc.items[i];
                                return {
                                    tenantId, productId: p.id, productName: p.name, sku: p.sku, unitId: p.unitId,
                                    quantity: it.quantity, unitPrice: it.unitPrice,
                                    discountAmount: c.lineDiscount, discountPercent: it.discountPercent ?? 0,
                                    vatAmount: c.vat, vatPercent, totalPrice: c.total,
                                    notes: it.notes, sortOrder: i,
                                };
                            }),
                        },
                    },
                });

                const rows = await tx.invoiceItem.findMany({ where: { invoiceId: invoice.id }, orderBy: { sortOrder: 'asc' }, select: { id: true } });
                for (let i = 0; i < items.length; i++) {
                    const it = items[i];
                    const p = byId.get(it.productId)!;
                    if (p.isService) continue;
                    await this.inventory.applyMovement(tx, {
                        referenceItemId: rows[i].id,
                        tenantId, userId, productId: p.id, warehouseId: warehouse.id,
                        type: 'SALE', direction: 'OUT', quantity: it.quantity,
                        // بهای تمام‌شده (برای سود) از ردیف قیمتِ انتخاب‌شده می‌آید؛ در حالت میانگین موزون lotId نادیده گرفته می‌شود
                        unitId: p.unitId, unitCost: Number(p.purchasePrice), lotId: costMethod ? undefined : it.lotId, costMethod,
                        referenceType: 'invoice', referenceId: invoice.id,
                    });
                }

                if (party) {
                    await tx.party.update({ where: { id: party.id }, data: { currentBalance: { increment: total } } });
                }
                if (paid > 0) {
                    await this.payments.record(tx, {
                        tenantId, userId, direction: 'RECEIVED', method: dto.paymentMethod ?? 'CASH',
                        amount: paid, partyId: party?.id, invoiceId: invoice.id, date, branchId,
                        reference: dto.paymentReference,
                    });
                }

                return tx.invoice.findUniqueOrThrow({
                    where: { id: invoice.id },
                    include: { items: { orderBy: { sortOrder: 'asc' } }, party: true },
                });
            }),
        );
    }

    async findAll(tenantId: string, q: QueryInvoicesDto, ctx: BranchContext) {
        const { page = 1, limit = 20, status, partyId, from, to, search } = q;
        const where: Prisma.InvoiceWhereInput = { tenantId, invoiceType: 'SALE', deletedAt: null, AND: [branchFilter(ctx)] };
        if (status) where.status = status;
        if (partyId) where.partyId = partyId;
        if (from || to) where.date = { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) };
        if (search) {
            where.OR = [
                { invoiceNumber: { contains: search, mode: 'insensitive' } },
                { partyName: { contains: search, mode: 'insensitive' } },
            ];
        }

        const [data, total] = await this.prisma.$transaction(async (tx) => [
            await tx.invoice.findMany({
                where,
                include: {
                    party: { select: { id: true, name: true, code: true } },
                    creator: { select: { id: true, name: true } },
                    _count: { select: { items: true } },
                },
                orderBy: [{ date: 'desc' }, { invoiceNumber: 'desc' }],
                skip: (page - 1) * limit,
                take: limit,
            }),
            await tx.invoice.count({ where }),
        ] as const);
        return { data, meta: buildMeta(total, page, limit) };
    }

    async findOne(tenantId: string, id: string, ctx: BranchContext) {
        const invoice = await this.prisma.invoice.findFirst({
            where: { id, tenantId, invoiceType: 'SALE', deletedAt: null, AND: [branchFilter({ ...ctx, activeId: null })] },
            include: {
                party: true,
                creator: { select: { id: true, name: true, phone: true } },
                items: { include: { unit: true }, orderBy: { sortOrder: 'asc' } },
                payments: { orderBy: { date: 'asc' } },
                checks: true,
            },
        });
        if (!invoice) throw new NotFoundException('فاکتور پیدا نشد');
        return invoice;
    }

    addPayment(tenantId: string, userId: string, id: string, dto: InvoicePaymentDto, ctx: BranchContext) {
        return this.prisma.$transaction(async (tx) => {
            const invoice = await tx.invoice.findFirst({ where: { id, tenantId, invoiceType: 'SALE', deletedAt: null, AND: [branchFilter({ ...ctx, activeId: null })] } });
            if (!invoice) throw new NotFoundException('فاکتور پیدا نشد');
            return this.payments.record(tx, {
                tenantId, userId, direction: 'RECEIVED', method: dto.method, amount: dto.amount,
                invoiceId: id, partyId: invoice.partyId, branchId: invoice.branchId,
                date: dto.date ? new Date(dto.date) : undefined, reference: dto.reference, notes: dto.notes,
            });
        });
    }

    /**
     * لغو فاکتور: کالا به همان انبارِ خروج برمی‌گردد، بدهی مشتری به اندازه‌ی کل فاکتور کم می‌شود
     * و پرداخت‌های انجام‌شده به‌صورت اعتبار برای مشتری باقی می‌ماند.
     */
    async cancelInvoice(tenantId: string, userId: string, id: string, reason: string, ctx: BranchContext) {
        const invoice = await this.prisma.invoice.findFirst({
            where: { id, tenantId, invoiceType: 'SALE', deletedAt: null, AND: [branchFilter({ ...ctx, activeId: null })] },
        });
        if (!invoice) throw new NotFoundException('فاکتور پیدا نشد');
        if (invoice.status === 'CANCELLED') throw new BadRequestException('فاکتور قبلاً لغو شده است');
        if (invoice.taxStatus === 'PENDING' || invoice.taxStatus === 'SUCCESS') {
            throw new BadRequestException('این فاکتور به سامانه مودیان ارسال شده؛ برای اصلاح، فاکتور برگشتی صادر کنید');
        }
        if (invoice.status === 'SENT_TO_TAX_AUTHORITY') {
            throw new BadRequestException('فاکتور به سامانه مودیان ارسال شده؛ برای ابطال باید فاکتور برگشتی صادر شود');
        }

        if (await this.prisma.invoice.count({ where: { originalInvoiceId: id, status: { not: 'CANCELLED' }, deletedAt: null } }) > 0) {
            throw new BadRequestException('برای این فاکتور برگشتی ثبت شده؛ لغو کامل ممکن نیست');
        }
        return this.prisma.$transaction(async (tx) => {
            const movements = await tx.inventoryTransaction.findMany({
                where: { tenantId, referenceType: 'invoice', referenceId: id, transactionType: 'SALE' },
            });
            for (const m of movements) {
                await this.inventory.applyMovement(tx, {
                    tenantId, userId, productId: m.productId, warehouseId: m.warehouseId,
                    type: 'SALE_RETURN', direction: 'IN', quantity: Math.abs(Number(m.quantity)),
                    unitId: m.unitId, unitCost: Number(m.unitCost),
                    referenceType: 'invoice', referenceId: id, notes: `لغو فاکتور ${invoice.invoiceNumber}: ${reason}`,
                });
            }
            if (invoice.partyId) {
                await tx.party.update({ where: { id: invoice.partyId }, data: { currentBalance: { decrement: Number(invoice.totalAmount) } } });
            }
            return tx.invoice.update({
                where: { id },
                data: {
                    status: 'CANCELLED',
                    remainingAmount: 0,
                    internalNotes: `${invoice.internalNotes ?? ''}\nلغو شد: ${reason}`.trim(),
                },
            });
        });
    }
}
