import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../database/prisma/prisma.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
    constructor(private prisma: PrismaService) { }

    @Public()
    @Get()
    async check() {
        await this.prisma.$queryRaw`SELECT 1`;
        return { status: 'ok', uptime: Math.round(process.uptime()) };
    }
}
