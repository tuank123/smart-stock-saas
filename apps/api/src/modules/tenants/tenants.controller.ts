import { Body, Controller, Delete, Headers, HttpCode, Patch, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { setRefreshTokenCookie, buildAuthData } from '../auth/auth-http.util';
import { SignupDto, UpdateTenantDto } from './dto/tenant.dto';
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

  /**
   * PATCH /api/v1/tenants/me
   * Oturum açan PATRON'un kendi işletme bilgilerini (ticari unvan, vergi no) günceller.
   */
  @Roles(UserRole.PATRON)
  @Patch('me')
  updateMyTenant(
    @Body() dto: UpdateTenantDto,
    @CurrentUser() user: { tenantId: string },
  ) {
    return this.service.updateMyTenant(dto, user);
  }

  /**
   * DELETE /api/v1/tenants/me
   * Üyeliği sonlandırır (soft-close): tenant DELETED + tüm kullanıcılar pasif.
   */
  @Roles(UserRole.PATRON)
  @Delete('me')
  closeMyMembership(@CurrentUser() user: { tenantId: string }) {
    return this.service.closeMyMembership(user);
  }
}
