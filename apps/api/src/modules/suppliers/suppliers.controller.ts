import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateSupplierDto, LinkBranchSupplierDto, UpdateSupplierDto } from './dto/supplier.dto';
import { SuppliersService } from './suppliers.service';

@Controller('suppliers')
export class SuppliersController {
  constructor(private service: SuppliersService) {}

  @Roles(UserRole.PATRON, UserRole.SUBE_MUDURU)
  @Post()
  @HttpCode(201)
  create(
    @Body() dto: CreateSupplierDto,
    @CurrentUser() user: { tenantId: string },
  ) {
    return this.service.createSupplier(dto, user);
  }

  @Roles(UserRole.PATRON, UserRole.SUBE_MUDURU)
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

  @Roles(UserRole.PATRON, UserRole.SUBE_MUDURU)
  @Get(':supplierId')
  getOne(
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @CurrentUser() user: { tenantId: string },
  ) {
    return this.service.getSupplier(supplierId, user);
  }

  @Roles(UserRole.PATRON, UserRole.SUBE_MUDURU)
  @Patch(':supplierId')
  update(
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @Body() dto: UpdateSupplierDto,
    @CurrentUser() user: { tenantId: string },
  ) {
    return this.service.updateSupplier(supplierId, dto, user);
  }
}
