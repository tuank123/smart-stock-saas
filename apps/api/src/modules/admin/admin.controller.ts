import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminService } from './admin.service';
import {
  ListErrorsQueryDto,
  ListTenantsQueryDto,
  UpdateTenantStatusDto,
} from './dto/admin.dto';

// Platform sahibi (SUPER_ADMIN) yönetim uçları.
@Controller('admin')
export class AdminController {
  constructor(private service: AdminService) {}

  @Roles(UserRole.SUPER_ADMIN)
  @Get('tenants')
  listTenants(@Query() query: ListTenantsQueryDto) {
    return this.service.listTenants(query);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Get('tenants/:id')
  getTenantDetail(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getTenantDetail(id);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Patch('tenants/:id/status')
  @HttpCode(200)
  updateTenantStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTenantStatusDto,
  ) {
    return this.service.updateTenantStatus(id, dto);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Get('stats')
  getStats() {
    return this.service.getStats();
  }

  // ── Hata kayıtları ────────────────────────────────────────────────────────
  // Statik 'errors/unresolved-count' route'u dinamik segmentlerden önce.
  @Roles(UserRole.SUPER_ADMIN)
  @Get('errors/unresolved-count')
  getUnresolvedErrorCount() {
    return this.service.getUnresolvedErrorCount();
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Get('errors')
  listErrors(@Query() query: ListErrorsQueryDto) {
    return this.service.listErrors(query);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Patch('errors/:id/resolve')
  @HttpCode(200)
  resolveError(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.resolveError(id);
  }
}
