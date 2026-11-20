import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SmsService } from './sms.service';
import { InvoiceSmsDto, QuerySmsDto, RemindDto, TestSmsDto, UpdateSmsSettingsDto } from './dto/sms.dto';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Perm } from '../../common/decorators/permissions.decorator';

@ApiTags('SMS')
@ApiBearerAuth()
@Controller('sms')
export class SmsController {
    constructor(private readonly service: SmsService) { }

    @Get('settings') @Perm('sms.use')
    settings(@TenantId() t: string) { return this.service.getSettings(t); }

    @Put('settings') @Perm('sms.settings')
    update(@TenantId() t: string, @Body() dto: UpdateSmsSettingsDto) { return this.service.updateSettings(t, dto); }

    @Post('test') @HttpCode(200) @Perm('sms.settings')
    test(@TenantId() t: string, @CurrentUser() u: { id: string }, @Body() dto: TestSmsDto) { return this.service.test(t, u.id, dto.receptor); }

    @Post('invoice/:id') @HttpCode(200) @Perm('sms.use')
    invoice(@TenantId() t: string, @CurrentUser() u: { id: string }, @Param('id') id: string, @Body() dto: InvoiceSmsDto) { return this.service.sendInvoice(t, u.id, id, dto.payUrl); }

    @Post('remind') @HttpCode(200) @Perm('sms.remind')
    remind(@TenantId() t: string, @CurrentUser() u: { id: string }, @Body() dto: RemindDto) { return this.service.remindDebtors(t, u.id, dto); }

    @Get('logs') @Perm('sms.remind')
    logs(@TenantId() t: string, @Query() q: QuerySmsDto) { return this.service.logs(t, q); }
}
