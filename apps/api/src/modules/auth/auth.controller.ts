import { Controller, Post, Get, Patch, Body, Req, Res, HttpCode, Headers } from '@nestjs/common';
import { Response, Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
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
    @Res({ passthrough: true }) response: Response,
  ) {
    const { accessToken, refreshToken, user } =
      await this.authService.login(loginDto);

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
    @CurrentUser() user: { userId: string },
  ) {
    return this.authService.changePassword(user.userId, dto);
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
