import { Controller, Get, Post, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto, QueryExpensesDto } from './dto/expense.dto';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { BranchCtx } from '../../common/decorators/branch.decorator';
import { BranchContext } from '../../common/branch.context';
import { Perm } from '../../common/decorators/permissions.decorator';

class RangeQuery { @IsDateString() @IsOptional() from?: string; @IsDateString() @IsOptional() to?: string; }

@ApiTags('Expenses')
@ApiBearerAuth()
@Controller('expenses')
export class ExpensesController {
    constructor(private readonly service: ExpensesService) { }

    @Post() @Perm('expenses.manage') create(@TenantId() t: string, @CurrentUser() u: { id: string }, @BranchCtx() ctx: BranchContext, @Body() dto: CreateExpenseDto) { return this.service.create(t, u.id, dto, ctx); }
    @Get() @Perm('expenses.view') findAll(@TenantId() t: string, @BranchCtx() ctx: BranchContext, @Query() q: QueryExpensesDto) { return this.service.findAll(t, q, ctx); }
    @Get('summary') @Perm('expenses.view') summary(@TenantId() t: string, @BranchCtx() ctx: BranchContext, @Query() q: RangeQuery) { return this.service.summary(t, ctx, q.from, q.to); }
    @Delete(':id') @Perm('expenses.manage') remove(@TenantId() t: string, @BranchCtx() ctx: BranchContext, @Param('id') id: string) { return this.service.remove(t, id, ctx); }
}
