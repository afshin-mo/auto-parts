import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService, createPrismaService } from './prisma.service';

@Global()
@Module({
    providers: [{ provide: PrismaService, inject: [ConfigService], useFactory: createPrismaService }],
    exports: [PrismaService],
})
export class PrismaModule implements OnApplicationShutdown {
    constructor(@Inject(PrismaService) private prisma: PrismaService) { }
    async onApplicationShutdown() { await this.prisma.$disconnect(); }
}
