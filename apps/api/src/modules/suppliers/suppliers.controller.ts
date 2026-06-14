import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateSupplierDto, LinkBranchSupplierDto } from './dto/supplier.dto';
import { SuppliersService } from './suppliers.service';

@Controller('suppliers')
export class SuppliersController {
  constructor(private service: SuppliersService) {}

  @Roles(UserRole.SUBE_MUDURU)
  @Post()
  @HttpCode(201)
  create(
    @Body() dto: CreateSupplierDto,
    @CurrentUser() user: { tenantId: string },
  ) {
    return this.service.createSupplier(dto, user);
  }

  @Roles(UserRole.SUBE_MUDURU)
  @Post(':supplierId/branches/:branchId')
  @HttpCode(201)
  linkBranch(
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body() dto: LinkBranchSupplierDto,
    @CurrentUser() user: { tenantId: string },
  ) {
    return this.service.linkBranch(supplierId, branchId, dto, user);
  }

  @Roles(UserRole.PATRON, UserRole.SUBE_MUDURU)
  @Get()
  list(@CurrentUser() user: { tenantId: string }) {
    return this.service.listSuppliers(user);
  }
}
