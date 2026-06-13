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
import { CreateBranchDto, CreateIntegrationDto } from './dto/branch.dto';
import { BranchesService } from './branches.service';

@Controller('branches')
export class BranchesController {
  constructor(private service: BranchesService) {}

  @Roles(UserRole.PATRON)
  @Post()
  @HttpCode(201)
  create(
    @Body() dto: CreateBranchDto,
    @CurrentUser() user: { tenantId: string },
  ) {
    return this.service.createBranch(dto, user);
  }

  @Roles(UserRole.PATRON, UserRole.SUBE_MUDURU)
  @Get()
  list(@CurrentUser() user: { tenantId: string }) {
    return this.service.listBranches(user);
  }

  @Roles(UserRole.PATRON)
  @Post(':branchId/integration')
  @HttpCode(201)
  createIntegration(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body() dto: CreateIntegrationDto,
    @CurrentUser() user: { tenantId: string },
  ) {
    return this.service.createIntegration(branchId, dto, user);
  }

  @Roles(UserRole.PATRON, UserRole.SUBE_MUDURU)
  @Get(':branchId/integration')
  getIntegration(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @CurrentUser() user: { tenantId: string },
  ) {
    return this.service.getIntegration(branchId, user);
  }
}

@Controller('integrations')
export class IntegrationsController {
  constructor(private service: BranchesService) {}

  @Roles(UserRole.PATRON)
  @Get('adapters')
  listAdapters() {
    return this.service.listAdapters();
  }
}
