import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { ChecksService } from './checks.service';
import { CreateCheckDto, QueryChecksDto, BounceCheckDto } from './dto/create-check.dto';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { BranchCtx } from '../../common/decorators/branch.decorator';
import { BranchContext } from '../../common/branch.context';
import { Perm } from '../../common/decorators/permissions.decorator';

class DueQuery {
    @Type(() => Number) @IsInt() @Min(0) @Max(365) @IsOptional()
    days?: number = 7;
}

@ApiTags('Checks')
@ApiBearerAuth()
@Controller('checks')
export class ChecksController {
    constructor(private readonly checksService: ChecksService) { }

    @Post()
    @Perm('checks.manage')
    create(@TenantId() tenantId: string, @BranchCtx() ctx: BranchContext, @Body() dto: CreateCheckDto) {
        return this.checksService.createCheck(tenantId, dto, ctx);
    }

    @Get()
    @Perm('checks.view')
    findAll(@TenantId() tenantId: string, @BranchCtx() ctx: BranchContext, @Query() query: QueryChecksDto) {
        return this.checksService.findAll(tenantId, query, ctx);
    }

    @Get('due')
    @Perm('checks.view')
    @ApiOperation({ summary: 'چک‌های نزدیک سررسید' })
    due(@TenantId() tenantId: string, @BranchCtx() ctx: BranchContext, @Query() q: DueQuery) {
        return this.checksService.getDueChecks(tenantId, ctx, q.days ?? 7);
    }

    @Get(':id')
    @Perm('checks.view')
    findOne(@TenantId() tenantId: string, @BranchCtx() ctx: BranchContext, @Param('id') id: string) {
        return this.checksService.findOne(tenantId, id, ctx);
    }

    @Post(':id/cash')
    @Perm('checks.manage')
    @ApiOperation({ summary: 'وصول چک' })
    cash(@TenantId() tenantId: string, @CurrentUser() user: { id: string }, @BranchCtx() ctx: BranchContext, @Param('id') id: string) {
        return this.checksService.cashCheck(tenantId, user.id, id, ctx);
    }

    @Post(':id/bounce')
    @Perm('checks.manage')
    @ApiOperation({ summary: 'برگشت چک' })
    bounce(@TenantId() tenantId: string, @BranchCtx() ctx: BranchContext, @Param('id') id: string, @Body() dto: BounceCheckDto) {
        return this.checksService.bounceCheck(tenantId, id, dto.reason, ctx);
    }

    @Post(':id/cancel')
    @Perm('checks.manage')
    cancel(@TenantId() tenantId: string, @BranchCtx() ctx: BranchContext, @Param('id') id: string) {
        return this.checksService.cancelCheck(tenantId, id, ctx);
    }
}
