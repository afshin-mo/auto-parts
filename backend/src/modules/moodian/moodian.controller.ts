import { Body, Controller, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MoodianService } from './moodian.service';
import { SyncDto, UpdateMoodianSettingsDto } from './dto/moodian.dto';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { Perm } from '../../common/decorators/permissions.decorator';

@ApiTags('Moodian')
@ApiBearerAuth()
@Controller('moodian')
export class MoodianController {
    constructor(private readonly service: MoodianService) { }

    @Get('settings') @Perm('moodian.use')
    settings(@TenantId() t: string) { return this.service.getSettings(t); }

    @Put('settings') @Perm('moodian.settings')
    update(@TenantId() t: string, @Body() dto: UpdateMoodianSettingsDto) { return this.service.updateSettings(t, dto); }

    @Post('settings/fetch-server-key') @HttpCode(200) @Perm('moodian.settings')
    @ApiOperation({ summary: 'دریافت کلید عمومی و شناسه‌ی آن از سازمان' })
    fetchKey(@TenantId() t: string) { return this.service.fetchServerKey(t); }

    @Post('settings/test') @HttpCode(200) @Perm('moodian.settings')
    @ApiOperation({ summary: 'آزمون اتصال (دریافت توکن)' })
    test(@TenantId() t: string) { return this.service.testConnection(t); }

    @Get('invoices/:id/preview') @Perm('moodian.use')
    preview(@TenantId() t: string, @Param('id') id: string) { return this.service.preview(t, id); }

    @Post('invoices/:id/send') @HttpCode(200) @Perm('moodian.use')
    @ApiOperation({ summary: 'ارسال فاکتور فروش/برگشتی به سامانه مودیان' })
    send(@TenantId() t: string, @Param('id') id: string) { return this.service.send(t, id); }

    @Post('invoices/:id/inquiry') @HttpCode(200) @Perm('moodian.use')
    inquiry(@TenantId() t: string, @Param('id') id: string) { return this.service.inquire(t, [id]); }

    @Post('sync') @HttpCode(200) @Perm('moodian.use')
    @ApiOperation({ summary: 'استعلام در انتظارها و ارسال فاکتورهای ارسال‌نشده' })
    sync(@TenantId() t: string, @Body() dto: SyncDto) { return this.service.sync(t, dto.limit); }
}
