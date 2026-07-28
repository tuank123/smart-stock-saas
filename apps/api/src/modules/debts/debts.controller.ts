import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  CreateDebtDto,
  RecordCashPaymentDto,
  RecordProductReceiptDto,
  UpdateDebtDto,
} from './dto/debt.dto';
import { DebtsService } from './debts.service';

type DebtUser = {
  tenantId: string;
  userId: string;
  role?: string | null;
  planId?: string | null;
};

@Controller('debts')
export class DebtsController {
  constructor(private service: DebtsService) {}

  // Statik ikinci segmentli route'lar `:branchId`'den önce tanımlanır.
  @Roles(UserRole.SUBE_MUDURU, UserRole.PATRON)
  @Get(':branchId/reminders')
  reminders(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @CurrentUser() user: DebtUser,
  ) {
    return this.service.getReminders(branchId, user);
  }

  @Roles(UserRole.SUBE_MUDURU, UserRole.PATRON)
  @Get(':branchId')
  list(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @CurrentUser() user: DebtUser,
  ) {
    return this.service.listDebts(branchId, user);
  }

  @Roles(UserRole.SUBE_MUDURU, UserRole.PATRON)
  @Post(':branchId')
  @HttpCode(201)
  create(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body() dto: CreateDebtDto,
    @CurrentUser() user: DebtUser,
  ) {
    return this.service.createDebt(branchId, dto, user);
  }

  @Roles(UserRole.SUBE_MUDURU, UserRole.PATRON)
  @Patch(':branchId/mark-viewed')
  @HttpCode(200)
  markViewed(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @CurrentUser() user: DebtUser,
  ) {
    return this.service.markViewed(branchId, user);
  }

  // Statik ikinci segmentli route'lar `:id`'den önce tanımlanır.
  @Roles(UserRole.SUBE_MUDURU, UserRole.PATRON)
  @Patch(':id/cash-payment')
  recordCashPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordCashPaymentDto,
    @CurrentUser() user: DebtUser,
  ) {
    return this.service.recordCashPayment(id, dto, user);
  }

  @Roles(UserRole.SUBE_MUDURU, UserRole.PATRON)
  @Patch(':id/product-receipt')
  recordProductReceipt(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordProductReceiptDto,
    @CurrentUser() user: DebtUser,
  ) {
    return this.service.recordProductReceipt(id, dto, user);
  }

  @Roles(UserRole.SUBE_MUDURU, UserRole.PATRON)
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDebtDto,
    @CurrentUser() user: DebtUser,
  ) {
    return this.service.updateDebt(id, dto, user);
  }
}
