import { Controller, Get, Post, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';
import { WithdrawalsService } from './withdrawals.service';
import { CreateWithdrawalDto, QueryWithdrawalsDto } from './withdrawals.dto';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { BranchCtx } from '../../common/decorators/branch.decorator';
import { BranchContext } from '../../common/branch.context';
import { Perm } from '../../common/decorators/permissions.decorator';

class RangeQuery { @IsDateString() @IsOptional() from?: string; @IsDateString() @IsOptional() to?: string; }

@ApiTags('Withdrawals')
@ApiBearerAuth()
@Controller('withdrawals')
export class WithdrawalsController {
    constructor(private readonly service: WithdrawalsService) { }

    @Post() @Perm('withdrawals.manage') create(@TenantId() t: string, @CurrentUser() u: { id: string }, @BranchCtx() ctx: BranchContext, @Body() dto: CreateWithdrawalDto) { return this.service.create(t, u.id, dto, ctx); }
    @Get() @Perm('withdrawals.view') findAll(@TenantId() t: string, @BranchCtx() ctx: BranchContext, @Query() q: QueryWithdrawalsDto) { return this.service.findAll(t, q, ctx); }
    @Get('summary') @Perm('withdrawals.view') summary(@TenantId() t: string, @BranchCtx() ctx: BranchContext, @Query() q: RangeQuery) { return this.service.summary(t, ctx, q.from, q.to); }
    @Delete(':id') @Perm('withdrawals.manage') remove(@TenantId() t: string, @BranchCtx() ctx: BranchContext, @Param('id') id: string) { return this.service.remove(t, id, ctx); }
}
