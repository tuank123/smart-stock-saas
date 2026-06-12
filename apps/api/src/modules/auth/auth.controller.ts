import { Controller, Post, Body, Req, Res, HttpCode } from '@nestjs/common';
import { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Public } from '../../common/decorators/public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  /**
   * POST /api/v1/auth/login
   * Login with email and password
   * Returns access token + sets refresh token in HttpOnly cookie
   */
  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { accessToken, refreshToken, user } =
      await this.authService.login(loginDto);

    // Set refresh token in HttpOnly cookie
    response.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return {
      statusCode: 200,
      message: 'Login successful',
      data: {
        accessToken,
        user,
      },
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
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = request.cookies['refreshToken'];

    if (!refreshToken) {
      return {
        statusCode: 401,
        message: 'Refresh token not found',
      };
    }

    const { accessToken, refreshToken: newRefreshToken, user } =
      await this.authService.refreshToken(refreshToken);

    // Set new refresh token in HttpOnly cookie
    response.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return {
      statusCode: 200,
      message: 'Token refreshed successfully',
      data: {
        accessToken,
        user,
      },
    };
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
