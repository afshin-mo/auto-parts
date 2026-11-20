import { Controller, Post, Get, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { tenantContext } from '../../common/tenant-context';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Public()
    @Throttle({ default: { limit: 10, ttl: 60_000 } })
    @Post('login')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'ورود' })
    login(@Body() dto: LoginDto) {
        return tenantContext.asSystem(() => this.authService.login(dto)); // فروشگاه هنوز مشخص نیست
    }

    @Public()
    @Throttle({ default: { limit: 5, ttl: 60_000 } })
    @Post('register')
    @ApiOperation({ summary: 'ثبت‌نام فروشگاه جدید و مدیر آن' })
    register(@Body() dto: RegisterDto) {
        return tenantContext.asSystem(() => this.authService.register(dto)); // فروشگاه تازه ساخته می‌شود
    }

    @Public()
    @Post('refresh')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'دریافت توکن جدید' })
    refresh(@Body('refreshToken') refreshToken: string) {
        return tenantContext.asSystem(() => this.authService.refreshToken(refreshToken));
    }

    @ApiBearerAuth()
    @Get('me')
    @ApiOperation({ summary: 'اطلاعات کاربر جاری' })
    me(@CurrentUser() user: { id: string }) {
        return this.authService.me(user.id);
    }

    @ApiBearerAuth()
    @Post('change-password')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'تغییر رمز عبور' })
    changePassword(@CurrentUser() user: { id: string }, @Body() dto: ChangePasswordDto) {
        return this.authService.changePassword(user.id, dto);
    }
}
