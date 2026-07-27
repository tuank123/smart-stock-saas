import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ConfirmReturnDto, ConfirmScanDto, ScanDto } from './dto/ocr.dto';
import { OcrService } from './ocr.service';

@Controller('ocr')
export class OcrController {
  constructor(private service: OcrService) {}

  @Roles(UserRole.SUBE_MUDURU, UserRole.KASIYER, UserRole.DEPO, UserRole.PATRON)
  @Post('scan')
  @HttpCode(201)
  scan(
    @Body() dto: ScanDto,
    @CurrentUser()
    user: { tenantId: string; userId: string; role?: string | null; planId?: string | null },
  ) {
    return this.service.scan(dto, user);
  }

  @Roles(UserRole.SUBE_MUDURU, UserRole.KASIYER, UserRole.DEPO, UserRole.PATRON)
  @Post('scan/:scanId/confirm')
  @HttpCode(200)
  confirm(
    @Param('scanId', ParseUUIDPipe) scanId: string,
    @Body() dto: ConfirmScanDto,
    @CurrentUser()
    user: { tenantId: string; userId: string; role?: string | null; planId?: string | null },
  ) {
    return this.service.confirmScan(scanId, dto, user);
  }

  @Roles(UserRole.SUBE_MUDURU, UserRole.KASIYER, UserRole.DEPO, UserRole.PATRON)
  @Post('scan/:scanId/confirm-return')
  @HttpCode(200)
  confirmReturn(
    @Param('scanId', ParseUUIDPipe) scanId: string,
    @Body() dto: ConfirmReturnDto,
    @CurrentUser()
    user: { tenantId: string; userId: string; role?: string | null; planId?: string | null },
  ) {
    return this.service.confirmReturn(scanId, dto, user);
  }

  @Roles(UserRole.PATRON, UserRole.SUBE_MUDURU)
  @Get('scans/:branchId')
  list(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @CurrentUser() user: { tenantId: string },
  ) {
    return this.service.listScans(branchId, user);
  }
}
