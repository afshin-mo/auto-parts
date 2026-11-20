import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
    private readonly logger = new Logger(AllExceptionsFilter.name);

    catch(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();

        let status = HttpStatus.INTERNAL_SERVER_ERROR;
        let message = 'خطای داخلی سرور';
        let error = 'InternalError';
        let details: string[] | undefined;

        if (exception instanceof HttpException) {
            status = exception.getStatus();
            const res = exception.getResponse() as any;
            const raw = typeof res === 'string' ? res : res.message ?? exception.message;
            if (Array.isArray(raw)) {
                // خطاهای class-validator
                message = 'اطلاعات واردشده معتبر نیست';
                details = raw;
            } else {
                message = raw;
            }
            error = exception.name;
        } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
            status = this.prismaStatus(exception);
            message = this.prismaMessage(exception);
            error = 'DatabaseError';
        } else if (exception instanceof Error) {
            error = exception.name;
        }

        if (status >= 500) {
            this.logger.error({
                message: exception instanceof Error ? exception.message : message,
                path: request.url,
                method: request.method,
                stack: exception instanceof Error ? exception.stack : undefined,
            });
        }

        response.status(status).json({
            success: false,
            error: {
                message,
                details,
                error,
                statusCode: status,
                timestamp: new Date().toISOString(),
                path: request.url,
            },
        });
    }

    private prismaStatus(e: Prisma.PrismaClientKnownRequestError): number {
        switch (e.code) {
            case 'P2002': return HttpStatus.CONFLICT;
            case 'P2025': return HttpStatus.NOT_FOUND;
            default: return HttpStatus.BAD_REQUEST;
        }
    }

    private prismaMessage(e: Prisma.PrismaClientKnownRequestError): string {
        switch (e.code) {
            case 'P2002': return 'رکوردی با همین مشخصات از قبل وجود دارد';
            case 'P2025': return 'رکورد پیدا نشد';
            case 'P2003': return 'این رکورد به اطلاعات دیگری وابسته است';
            default: return `خطای پایگاه داده (${e.code})`;
        }
    }
}
