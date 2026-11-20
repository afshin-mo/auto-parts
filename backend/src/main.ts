import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import compression from 'compression';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { tenantContext } from './common/tenant-context';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    const config = app.get(ConfigService);

    app.use(tenantContext.middleware);
    app.use(helmet());
    app.use(compression());
    app.enableCors({
        origin: (config.get<string[]>('cors.origins') ?? []).map((o) => o.trim()),
        credentials: true,
    });

    const apiPrefix = config.get<string>('apiPrefix') || 'api';
    app.setGlobalPrefix(apiPrefix);
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
            transformOptions: { enableImplicitConversion: true },
        }),
    );

    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new LoggingInterceptor(), new TransformInterceptor());
    app.enableShutdownHooks();

    if (config.get('swagger.enabled')) {
        const doc = new DocumentBuilder()
            .setTitle('Auto Parts API')
            .setDescription('API سامانه مدیریت فروشگاه قطعات یدکی')
            .setVersion('1.0')
            .addBearerAuth()
            .build();
        SwaggerModule.setup(`${apiPrefix}/docs`, app, SwaggerModule.createDocument(app, doc));
    }

    const port = config.get<number>('port') || 3000;
    await app.listen(port);
    console.log(`API:     http://localhost:${port}/${apiPrefix}/v1`);
    if (config.get('swagger.enabled')) console.log(`Swagger: http://localhost:${port}/${apiPrefix}/docs`);
}

bootstrap();
