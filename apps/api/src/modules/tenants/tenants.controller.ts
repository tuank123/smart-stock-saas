import { Body, Controller, Headers, HttpCode, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { setRefreshTokenCookie, buildAuthData } from '../auth/auth-http.util';
import { SignupDto } from './dto/tenant.dto';
import { TenantsService } from './tenants.service';

@Controller('tenants')
export class TenantsController {
  constructor(private service: TenantsService) {}

  /**
   * POST /api/v1/tenants/signup
   * Public işletme kaydı: Tenant + ilk Branch + PATRON kullanıcısı oluşturur ve
   * kullanıcıyı otomatik giriş yaptırır (login ile aynı cookie/header davranışı).
   */
  @Public()
  @Post('signup')
  @HttpCode(201)
  async signup(
    @Body() dto: SignupDto,
    @Headers('x-client-platform') clientPlatform: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { accessToken, refreshToken, user } = await this.service.signup(dto);

    // login ile aynı: cookie her zaman set edilir, native ise body'ye de eklenir.
    setRefreshTokenCookie(response, refreshToken);

    return {
      statusCode: 201,
      message: 'İşletme kaydı başarılı',
      data: buildAuthData(accessToken, refreshToken, user, clientPlatform),
    };
  }
}
