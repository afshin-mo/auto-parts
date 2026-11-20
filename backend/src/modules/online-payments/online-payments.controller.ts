import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, Res } from '@nestjs/common';
import { tenantContext } from '../../common/tenant-context';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { OnlinePaymentsService } from './online-payments.service';
import { CallbackQuery, CreateLinkDto, UpdateGatewaySettingsDto } from './dto/online-payment.dto';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Perm } from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('OnlinePayments')
@Controller('online-payments')
export class OnlinePaymentsController {
    constructor(private readonly service: OnlinePaymentsService) { }

    @ApiBearerAuth() @Get('settings') @Perm('gateway.use')
    settings(@TenantId() t: string) { return this.service.getSettings(t); }

    @ApiBearerAuth() @Put('settings') @Perm('gateway.settings')
    update(@TenantId() t: string, @Body() dto: UpdateGatewaySettingsDto) { return this.service.updateSettings(t, dto); }

    @ApiBearerAuth() @Post('invoice/:id') @HttpCode(200) @Perm('gateway.use')
    createLink(@TenantId() t: string, @CurrentUser() u: { id: string }, @Param('id') id: string, @Body() dto: CreateLinkDto) { return this.service.createLink(t, u.id, id, dto.amount); }

    @ApiBearerAuth() @Get('invoice/:id') @Perm('gateway.use')
    list(@TenantId() t: string, @Param('id') id: string) { return this.service.listForInvoice(t, id); }

    // ───── عمومی (بدون ورود) ─────
    @Public() @Throttle({ default: { limit: 30, ttl: 60_000 } }) @Get('public/:token')
    info(@Param('token') token: string) { return tenantContext.asSystem(() => this.service.publicInfo(token)); }

    @Public() @Throttle({ default: { limit: 10, ttl: 60_000 } }) @Post('public/:token/start') @HttpCode(200)
    start(@Param('token') token: string) { return tenantContext.asSystem(() => this.service.start(token)); }

    @Public() @Throttle({ default: { limit: 30, ttl: 60_000 } }) @Get('callback')
    async callback(@Query() q: CallbackQuery, @Res() res: Response) { res.redirect(302, await tenantContext.asSystem(() => this.service.callback(q.Authority, q.Status))); }
}
