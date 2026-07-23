import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';

import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import {
  CreateBranchDto,
  GenerateSetupCodeDto,
  ConnectAgentDto,
} from './dto/branch.dto';
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
  list(@CurrentUser() user: { tenantId: string; branchId?: string | null; role?: string | null }) {
    return this.service.listBranches(user);
  }

  @Roles(UserRole.PATRON, UserRole.SUBE_MUDURU)
  @Get(':branchId')
  getOne(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @CurrentUser() user: { tenantId: string; branchId?: string | null; role?: string | null },
  ) {
    return this.service.getBranch(branchId, user);
  }

  // Agent kurulum kodu üret (BranchIntegration'ı PENDING_INSTALL olarak hazırlar).
  @Roles(UserRole.PATRON)
  @Post(':branchId/integration/setup-code')
  @HttpCode(201)
  generateSetupCode(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body() dto: GenerateSetupCodeDto,
    @CurrentUser() user: { tenantId: string },
  ) {
    return this.service.generateSetupToken(branchId, dto, user);
  }

  // PUBLIC — Agent, kurulum koduyla kendini şubeye bağlar.
  // Rate-limit: dakikada 10 deneme (brute-force koruması).
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('agent-connect')
  @HttpCode(200)
  agentConnect(@Body() dto: ConnectAgentDto) {
    return this.service.connectAgent(dto);
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
