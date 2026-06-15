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
import { ConfirmScanDto, ScanDto } from './dto/ocr.dto';
import { OcrService } from './ocr.service';

@Controller('ocr')
export class OcrController {
  constructor(private service: OcrService) {}

  @Roles(UserRole.SUBE_MUDURU, UserRole.KASIYER, UserRole.DEPO)
  @Post('scan')
  @HttpCode(201)
  scan(
    @Body() dto: ScanDto,
    @CurrentUser() user: { tenantId: string; userId: string },
  ) {
    return this.service.scan(dto, user);
  }

  @Roles(UserRole.SUBE_MUDURU, UserRole.KASIYER, UserRole.DEPO)
  @Post('scan/:scanId/confirm')
  @HttpCode(200)
  confirm(
    @Param('scanId', ParseUUIDPipe) scanId: string,
    @Body() dto: ConfirmScanDto,
    @CurrentUser() user: { tenantId: string; userId: string },
  ) {
    return this.service.confirmScan(scanId, dto, user);
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
