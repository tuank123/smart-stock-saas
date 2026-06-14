import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateTransferDto, TransferQueryDto } from './dto/transfer.dto';
import { TransfersService } from './transfers.service';

@Controller('transfers')
export class TransfersController {
  constructor(private service: TransfersService) {}

  @Roles(UserRole.SUBE_MUDURU)
  @Post()
  @HttpCode(201)
  create(
    @Body() dto: CreateTransferDto,
    @CurrentUser() user: { tenantId: string; userId: string },
  ) {
    return this.service.createTransfer(dto, user);
  }

  @Roles(UserRole.PATRON, UserRole.SUBE_MUDURU)
  @Get(':branchId')
  list(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Query() query: TransferQueryDto,
    @CurrentUser() user: { tenantId: string },
  ) {
    return this.service.listTransfers(branchId, query, user);
  }

  @Roles(UserRole.SUBE_MUDURU)
  @Patch(':transferId/approve')
  approve(
    @Param('transferId', ParseUUIDPipe) transferId: string,
    @CurrentUser() user: { tenantId: string; userId: string; branchId?: string | null },
  ) {
    return this.service.approveTransfer(transferId, user);
  }

  @Roles(UserRole.SUBE_MUDURU)
  @Patch(':transferId/reject')
  reject(
    @Param('transferId', ParseUUIDPipe) transferId: string,
    @CurrentUser() user: { tenantId: string; userId: string; branchId?: string | null },
  ) {
    return this.service.rejectTransfer(transferId, user);
  }

  @Roles(UserRole.SUBE_MUDURU)
  @Patch(':transferId/dispatch')
  dispatch(
    @Param('transferId', ParseUUIDPipe) transferId: string,
    @CurrentUser() user: { tenantId: string; userId: string },
  ) {
    return this.service.dispatchTransfer(transferId, user);
  }

  @Roles(UserRole.SUBE_MUDURU)
  @Patch(':transferId/receive')
  receive(
    @Param('transferId', ParseUUIDPipe) transferId: string,
    @CurrentUser() user: { tenantId: string; userId: string },
  ) {
    return this.service.receiveTransfer(transferId, user);
  }
}
