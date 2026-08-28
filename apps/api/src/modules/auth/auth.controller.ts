import { Controller, Post, Get, Patch, Body, Req, Res, HttpCode, Headers } from '@nestjs/common';
import { Response, Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { VerifyPasswordDto } from './dto/verify-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { setRefreshTokenCookie, buildAuthData } from './auth-http.util';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  /**
   * POST /api/v1/auth/login
   * Login with email and password
   * Returns access token + sets refresh token in HttpOnly cookie
   */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() loginDto: LoginDto,
    @Headers('x-client-platform') clientPlatform: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { accessToken, refreshToken, user } =
      await this.authService.login(loginDto, request.ip);

    // Cookie is always set (web relies on it; harmless for native).
    setRefreshTokenCookie(response, refreshToken);

    return {
      statusCode: 200,
      message: 'Login successful',
      data: buildAuthData(accessToken, refreshToken, user, clientPlatform),
    };
  }

  /**
   * POST /api/v1/auth/refresh
   * Refresh access token using refresh token from cookie
   */
  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() request: Request,
    @Body() dto: RefreshTokenDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const cookieToken = request.cookies['refreshToken'];
    const bodyToken = dto?.refreshToken;
    // Prefer the cookie (web); fall back to the body token (native client).
    const refreshToken = cookieToken ?? bodyToken;

    if (!refreshToken) {
      return {
        statusCode: 401,
        message: 'Refresh token not found',
      };
    }

    const { accessToken, refreshToken: newRefreshToken, user } =
      await this.authService.refreshToken(refreshToken);

    // Set new refresh token in HttpOnly cookie (unchanged for web).
    setRefreshTokenCookie(response, newRefreshToken);

    // If the request supplied the token in the body (native client), also
    // return the rotated refresh token so it can be re-stored client-side.
    const fromBody = !!bodyToken;

    return {
      statusCode: 200,
      message: 'Token refreshed successfully',
      data: {
        accessToken,
        ...(fromBody ? { refreshToken: newRefreshToken } : {}),
        user,
      },
    };
  }

  /**
   * GET /api/v1/auth/me
   */
  @Get('me')
  me(
    @CurrentUser() user: { userId: string; email: string; tenantId: string; role: string; branchId: string | null },
  ) {
    return this.authService.getMe(user.userId, user.tenantId);
  }

  /**
   * PATCH /api/v1/auth/change-password
   */
  @Patch('change-password')
  changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: { userId: string; tenantId: string },
  ) {
    return this.authService.changePassword(user.userId, user.tenantId, dto);
  }

  /**
   * POST /api/v1/auth/verify-password
   * Giriş yapmış herhangi bir kullanıcı; şifresini doğrular. Yanlışsa exception
   * fırlatmaz, { valid: false } döner (frontend kendi mesajını gösterir).
   */
  @Post('verify-password')
  @HttpCode(200)
  verifyPassword(
    @Body() dto: VerifyPasswordDto,
    @CurrentUser() user: { userId: string; tenantId: string },
  ) {
    return this.authService.verifyPassword(user.userId, user.tenantId, dto.password);
  }

  /**
   * POST /api/v1/auth/forgot-password
   * Şifre sıfırlama bağlantısı ister. E-posta kayıtlı olmasa bile aynı mesajı
   * döner (kullanıcı numaralandırmasını önlemek için).
   */
  @Public()
  @Throttle({ default: { limit: 3, ttl: 900_000 } })
  @Post('forgot-password')
  @HttpCode(200)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  /**
   * POST /api/v1/auth/reset-password
   * E-postadaki token ile yeni şifre belirler.
   */
  @Public()
  @Post('reset-password')
  @HttpCode(200)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  /**
   * POST /api/v1/auth/verify-email
   * E-postadaki token ile adresi doğrular.
   */
  @Public()
  @Post('verify-email')
  @HttpCode(200)
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.token);
  }

  /**
   * POST /api/v1/auth/resend-verification
   * JWT gerektirir — giriş yapmış ama e-postası doğrulanmamış kullanıcı çağırır.
   */
  @Throttle({ default: { limit: 3, ttl: 900_000 } })
  @Post('resend-verification')
  @HttpCode(200)
  resendVerification(@CurrentUser() user: { userId: string }) {
    return this.authService.resendVerification(user.userId);
  }

  /**
   * POST /api/v1/auth/logout
   * Logout and blacklist refresh token
   */
  @Post('logout')
  @HttpCode(200)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = request.cookies['refreshToken'];

    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }

    // Clear cookie
    response.clearCookie('refreshToken');

    return {
      statusCode: 200,
      message: 'Logout successful',
    };
  }
}
