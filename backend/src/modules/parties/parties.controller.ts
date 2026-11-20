import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PartiesService } from './parties.service';
import { CreatePartyDto } from './dto/create-party.dto';
import { UpdatePartyDto } from './dto/update-party.dto';
import { QueryPartyDto } from './dto/query-party.dto';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { Perm } from '../../common/decorators/permissions.decorator';

@ApiTags('Parties')
@ApiBearerAuth()
@Controller('parties')
export class PartiesController {
    constructor(private readonly partiesService: PartiesService) { }

    @Post()
    @Perm('parties.create')
    @ApiOperation({ summary: 'ایجاد مشتری یا تأمین‌کننده' })
    create(@TenantId() tenantId: string, @Body() dto: CreatePartyDto) {
        return this.partiesService.create(tenantId, dto);
    }

    @Get()
    @Perm('parties.view')
    findAll(@TenantId() tenantId: string, @Query() query: QueryPartyDto) {
        return this.partiesService.findAll(tenantId, query);
    }

    @Get(':id')
    @Perm('parties.view')
    findOne(@TenantId() tenantId: string, @Param('id') id: string) {
        return this.partiesService.findOne(tenantId, id);
    }

    @Get(':id/balance')
    @Perm('parties.view')
    getBalance(@TenantId() tenantId: string, @Param('id') id: string) {
        return this.partiesService.getBalance(tenantId, id);
    }

    @Get(':id/statement')
    @Perm('parties.view')
    @ApiOperation({ summary: 'صورت‌حساب طرف حساب' })
    getStatement(@TenantId() tenantId: string, @Param('id') id: string) {
        return this.partiesService.getStatement(tenantId, id);
    }

    @Patch(':id')
    @Perm('parties.edit')
    update(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: UpdatePartyDto) {
        return this.partiesService.update(tenantId, id, dto);
    }

    @Delete(':id')
    @Perm('parties.delete')
    remove(@TenantId() tenantId: string, @Param('id') id: string) {
        return this.partiesService.remove(tenantId, id);
    }
}
