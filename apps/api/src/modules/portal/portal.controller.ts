import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { SendOtpDto, UploadDto, VerifyOtpDto } from './dto/portal.dto';
import { PortalService } from './portal.service';

// ─── MANAGER ENDPOINTS (JWT required) ────────────────────────────────────────

@Controller()
export class PortalController {
  constructor(private service: PortalService) {}

  @Roles(UserRole.PATRON, UserRole.SUBE_MUDURU)
  @Post('branches/:branchId/portal')
  async createPortal(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @CurrentUser() user: { tenantId: string },
  ) {
    const portal = await this.service.createPortal(branchId, user.tenantId);
    return {
      subdomain: portal.subdomain,
      portalUrl: `https://${portal.subdomain}.stokpilot.com`,
      portalId: portal.id,
    };
  }

  @Roles(UserRole.SUBE_MUDURU)
  @Get('portal/uploads/:branchId')
  listUploads(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @CurrentUser() user: { tenantId: string },
  ) {
    return this.service.listUploads(branchId, user.tenantId);
  }

  @Roles(UserRole.SUBE_MUDURU)
  @Patch('portal/uploads/:uploadId/approve')
  approveUpload(
    @Param('uploadId', ParseUUIDPipe) uploadId: string,
    @CurrentUser() user: { tenantId: string; userId: string },
  ) {
    return this.service.approveUpload(uploadId, user.userId, user.tenantId);
  }

  @Roles(UserRole.SUBE_MUDURU)
  @Patch('portal/uploads/:uploadId/reject')
  rejectUpload(
    @Param('uploadId', ParseUUIDPipe) uploadId: string,
    @CurrentUser() user: { tenantId: string; userId: string },
  ) {
    return this.service.rejectUpload(uploadId, user.userId, user.tenantId);
  }

  // ─── PUBLIC ENDPOINTS (no JWT) ─────────────────────────────────────────────

  @Public()
  @Get('portal/:subdomain/info')
  async getInfo(@Param('subdomain') subdomain: string) {
    const portal = await this.service.getPortalBySubdomain(subdomain);
    return {
      branchName: (portal as any).branch?.name ?? '',
      portalActive: portal.isActive,
    };
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 300_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('portal/:subdomain/otp/send')
  async sendOtp(
    @Param('subdomain') subdomain: string,
    @Body() dto: SendOtpDto,
  ) {
    const portal = await this.service.getPortalBySubdomain(subdomain);
    await this.service.sendOtp(dto.phone, portal.id);
    return { message: 'OTP gönderildi' };
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('portal/:subdomain/otp/verify')
  async verifyOtp(
    @Param('subdomain') subdomain: string,
    @Body() dto: VerifyOtpDto,
  ) {
    const portal = await this.service.getPortalBySubdomain(subdomain);
    const ok = await this.service.verifyOtp(dto.phone, dto.otp, portal.id);
    if (!ok) throw new UnauthorizedException('Geçersiz OTP');
    const sessionToken = this.service.issueSessionToken(dto.phone, portal.id);
    return { verified: true, sessionToken };
  }

  @Public()
  @Post('portal/:subdomain/upload')
  async upload(
    @Param('subdomain') subdomain: string,
    @Body() dto: UploadDto,
  ) {
    const record = await this.service.uploadPdf(subdomain, dto);
    return { uploadId: record.id, status: record.status };
  }
}
