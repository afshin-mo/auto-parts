import { Controller, Get, Patch, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { Perm } from '../../common/decorators/permissions.decorator';

@ApiTags('Tenants')
@ApiBearerAuth()
@Controller('tenants')
export class TenantsController {
    constructor(private readonly service: TenantsService) { }

    @Get('current')
    getCurrent(@TenantId() tenantId: string) {
        return this.service.getCurrent(tenantId);
    }

    @Patch('current')
    @Perm('settings.manage')
    update(@TenantId() tenantId: string, @Body() dto: UpdateTenantDto) {
        return this.service.update(tenantId, dto);
    }
}
