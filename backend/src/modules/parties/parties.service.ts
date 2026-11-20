import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma, PartyType } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { CreatePartyDto } from './dto/create-party.dto';
import { UpdatePartyDto } from './dto/update-party.dto';
import { QueryPartyDto, PARTY_SORT_FIELDS } from './dto/query-party.dto';
import { buildMeta, safeSort } from '../../common/dto/pagination.dto';

@Injectable()
export class PartiesService {
    constructor(private prisma: PrismaService) { }

    private async nextCode(tenantId: string, type: PartyType) {
        const prefix = type === 'CUSTOMER' ? 'C' : 'S';
        let n = await this.prisma.party.count({ where: { tenantId, partyType: type } });
        for (;;) {
            n += 1;
            const code = `${prefix}-${String(n).padStart(4, '0')}`;
            if (!(await this.prisma.party.findUnique({ where: { tenantId_code: { tenantId, code } } }))) return code;
        }
    }

    /** مشتریِ هم‌نام (بدون توجه به فاصله و حروف) را برمی‌گرداند، وگرنه مشتری جدید می‌سازد؛ برای ثبت خودکار مشتری از روی فاکتور فروش */
    async findOrCreateCustomer(tenantId: string, name: string, nationalId?: string) {
        const clean = name.trim().replace(/\s+/g, ' ');
        const found = await this.prisma.party.findFirst({ where: { tenantId, partyType: 'CUSTOMER', name: { equals: clean, mode: 'insensitive' } } });
        if (found) return found;
        return this.create(tenantId, { partyType: 'CUSTOMER', name: clean, nationalId } as CreatePartyDto);
    }

    async create(tenantId: string, dto: CreatePartyDto) {
        const code = dto.code?.trim() || (await this.nextCode(tenantId, dto.partyType));
        if (await this.prisma.party.findUnique({ where: { tenantId_code: { tenantId, code } } })) {
            throw new ConflictException('طرف حسابی با این کد وجود دارد');
        }
        return this.prisma.party.create({ data: { ...dto, code, tenantId, currentBalance: dto.openingBalance ?? 0 } });
    }

    async findAll(tenantId: string, query: QueryPartyDto) {
        const { page = 1, limit = 20, search, partyType, city, withBalance, sortOrder = 'desc' } = query;
        const sortBy = safeSort(query.sortBy, PARTY_SORT_FIELDS, 'createdAt');

        const where: Prisma.PartyWhereInput = { tenantId };
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { code: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search } },
                { mobile: { contains: search } },
            ];
        }
        if (partyType) where.partyType = partyType;
        if (city) where.city = city;
        if (withBalance) where.currentBalance = { not: 0 };

        const [data, total] = await this.prisma.$transaction(async (tx) => [
            await tx.party.findMany({ where, orderBy: { [sortBy]: sortOrder }, skip: (page - 1) * limit, take: limit }),
            await tx.party.count({ where }),
        ] as const);
        return { data, meta: buildMeta(total, page, limit) };
    }

    async findOne(tenantId: string, id: string) {
        const party = await this.prisma.party.findFirst({
            where: { id, tenantId },
            include: {
                invoices: { where: { deletedAt: null }, orderBy: { date: 'desc' }, take: 10 },
                checks: { orderBy: { dueDate: 'desc' }, take: 10 },
            },
        });
        if (!party) throw new NotFoundException('طرف حساب پیدا نشد');
        return party;
    }

    async update(tenantId: string, id: string, dto: UpdatePartyDto) {
        const existing = await this.prisma.party.findFirst({ where: { id, tenantId } });
        if (!existing) throw new NotFoundException('طرف حساب پیدا نشد');

        if (dto.code && dto.code !== existing.code) {
            if (await this.prisma.party.findUnique({ where: { tenantId_code: { tenantId, code: dto.code } } })) {
                throw new ConflictException('طرف حسابی با این کد وجود دارد');
            }
        }
        // تغییر مانده‌ی اول دوره، مانده‌ی جاری را هم به همان اندازه جابه‌جا می‌کند
        const delta = dto.openingBalance !== undefined ? dto.openingBalance - Number(existing.openingBalance) : 0;
        return this.prisma.party.update({
            where: { id },
            data: { ...dto, ...(delta ? { currentBalance: { increment: delta } } : {}) },
        });
    }

    async remove(tenantId: string, id: string) {
        const existing = await this.prisma.party.findFirst({ where: { id, tenantId } });
        if (!existing) throw new NotFoundException('طرف حساب پیدا نشد');

        const [invoices, payments, checks] = await this.prisma.$transaction(async (tx) => [
            await tx.invoice.count({ where: { partyId: id } }),
            await tx.payment.count({ where: { partyId: id } }),
            await tx.check.count({ where: { partyId: id } }),
        ] as const);
        if (invoices + payments + checks > 0) {
            throw new ConflictException('این طرف حساب فاکتور، پرداخت یا چک دارد؛ به‌جای حذف، آن را غیرفعال کنید');
        }
        return this.prisma.party.delete({ where: { id } });
    }

    /** مانده از روی دفتر: جمع فاکتورهای معتبر منهای جمع پرداخت‌ها */
    async getBalance(tenantId: string, partyId: string) {
        const party = await this.prisma.party.findFirst({ where: { id: partyId, tenantId } });
        if (!party) throw new NotFoundException('طرف حساب پیدا نشد');

        const ledger = await this.buildLedger(tenantId, party);
        const calculated = ledger.length ? ledger[ledger.length - 1].balance : 0;
        return {
            partyId,
            partyName: party.name,
            currentBalance: Number(party.currentBalance),
            calculatedBalance: calculated,
            inSync: Math.round(calculated) === Math.round(Number(party.currentBalance)),
        };
    }

    /** صورت‌حساب: فاکتورها و پرداخت‌ها به ترتیب تاریخ با مانده‌ی جاری */
    async getStatement(tenantId: string, partyId: string) {
        const party = await this.prisma.party.findFirst({ where: { id: partyId, tenantId } });
        if (!party) throw new NotFoundException('طرف حساب پیدا نشد');
        const entries = await this.buildLedger(tenantId, party);
        return {
            party: { id: party.id, name: party.name, code: party.code, partyType: party.partyType },
            currentBalance: Number(party.currentBalance),
            entries,
        };
    }

    private async buildLedger(tenantId: string, party: { id: string; partyType: PartyType; openingBalance: Prisma.Decimal; createdAt: Date }) {
        const partyId = party.id, partyType = party.partyType;
        const cust = partyType === 'CUSTOMER';
        const baseType = cust ? 'SALE' : 'PURCHASE';
        const retType = cust ? 'SALE_RETURN' : 'PURCHASE_RETURN';
        const [invoices, payments] = await this.prisma.$transaction(async (tx) => [
            await tx.invoice.findMany({
                where: { tenantId, partyId, invoiceType: { in: [baseType, retType] }, deletedAt: null, status: { not: 'CANCELLED' } },
                select: { id: true, invoiceNumber: true, invoiceType: true, date: true, totalAmount: true },
            }),
            await tx.payment.findMany({
                where: { tenantId, partyId },
                select: { id: true, date: true, amount: true, method: true, direction: true, reference: true, notes: true },
            }),
        ] as const);

        const rows = [
            ...invoices.map((i) => {
                const isRet = i.invoiceType === retType;
                return {
                    kind: 'INVOICE' as const, id: i.id, date: i.date, ref: i.invoiceNumber,
                    description: isRet ? (cust ? 'برگشت از فروش' : 'برگشت از خرید') : cust ? 'فاکتور فروش' : 'فاکتور خرید',
                    debit: isRet ? 0 : Number(i.totalAmount), credit: isRet ? Number(i.totalAmount) : 0,
                };
            }),
            ...payments.map((p) => {
                // دریافت از مشتری / پرداخت به تأمین‌کننده = کاهش مانده؛ جهت مخالف (بازپرداخت) = افزایش مانده
                const reduces = cust ? p.direction === 'RECEIVED' : p.direction === 'PAID';
                const label = reduces ? (cust ? 'دریافت' : 'پرداخت') : 'بازپرداخت';
                return {
                    kind: 'PAYMENT' as const, id: p.id, date: p.date, ref: p.reference ?? '',
                    description: `${label} (${p.method})${p.notes ? ' - ' + p.notes : ''}`,
                    method: p.method, debit: reduces ? 0 : Number(p.amount), credit: reduces ? Number(p.amount) : 0,
                };
            }),
        ].sort((a, b) => a.date.getTime() - b.date.getTime());

        const opening = Number(party.openingBalance);
        if (opening !== 0) {
            rows.unshift({
                kind: 'OPENING' as never, id: 'opening', date: rows[0]?.date ?? party.createdAt, ref: '', description: 'مانده‌ی اول دوره',
                debit: opening > 0 ? opening : 0, credit: opening < 0 ? -opening : 0,
            } as (typeof rows)[number]);
        }
        let balance = 0;
        return rows.map((r) => {
            balance += r.debit - r.credit;
            return { ...r, balance };
        });
    }
}
