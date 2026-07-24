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
import {
  InitializeStockDto,
  MovementQueryDto,
  PriceChangeQueryDto,
  RecordSaleDto,
  StockBarcodeQueryDto,
  StockQueryDto,
  UpdateThresholdDto,
  WasteStockDto,
} from './dto/stock.dto';
import { StockService } from './stock.service';

@Controller('stock')
export class StockController {
  constructor(private service: StockService) {}

  @Roles(UserRole.PATRON, UserRole.SUBE_MUDURU)
  @Post('initialize')
  @HttpCode(201)
  initialize(
    @Body() dto: InitializeStockDto,
    @CurrentUser() user: { tenantId: string },
  ) {
    return this.service.initializeStock(dto, user);
  }

  // NOTE: static 'query' segment must be defined before :branchId
  @Roles(UserRole.KASIYER, UserRole.DEPO, UserRole.PATRON)
  @Get('query')
  queryStock(
    @Query() query: StockBarcodeQueryDto,
    @CurrentUser() user: { tenantId: string; branchId: string },
  ) {
    return this.service.queryByBarcode(query, user);
  }

  // NOTE: static segments ('movements', 'price-changes') must be defined before :branchId
  @Roles(UserRole.SUBE_MUDURU, UserRole.PATRON)
  @Get('price-changes/:branchId')
  listPriceChanges(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Query() query: PriceChangeQueryDto,
    @CurrentUser() user: { tenantId: string },
  ) {
    return this.service.listPriceChanges(branchId, query, user);
  }

  @Roles(UserRole.SUBE_MUDURU, UserRole.DEPO)
  @Get('movements/:branchId')
  listMovements(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Query() query: MovementQueryDto,
    @CurrentUser() user: { tenantId: string },
  ) {
    return this.service.listMovements(branchId, query, user);
  }

  @Roles(UserRole.PATRON, UserRole.SUBE_MUDURU, UserRole.DEPO)
  @Get(':branchId')
  list(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Query() query: StockQueryDto,
    @CurrentUser() user: { tenantId: string },
  ) {
    return this.service.listStock(branchId, query, user);
  }

  @Roles(UserRole.PATRON, UserRole.SUBE_MUDURU, UserRole.DEPO)
  @Get(':branchId/:productId')
  getOne(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @CurrentUser() user: { tenantId: string },
  ) {
    return this.service.getStockLevel(branchId, productId, user);
  }

  @Roles(UserRole.SUBE_MUDURU)
  @Post(':branchId/waste')
  @HttpCode(201)
  recordWaste(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body() dto: WasteStockDto,
    @CurrentUser() user: { tenantId: string; userId: string },
  ) {
    return this.service.recordWaste(branchId, dto, user);
  }

  // Geçici Kasa — Tek Şubeli PATRON için sepet bazlı satış.
  @Roles(UserRole.PATRON)
  @Post(':branchId/sale')
  @HttpCode(201)
  recordSale(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body() dto: RecordSaleDto,
    @CurrentUser()
    user: { tenantId: string; userId: string; role?: string | null; planId?: string | null },
  ) {
    return this.service.recordSale(branchId, dto, user);
  }

  @Roles(UserRole.SUBE_MUDURU)
  @Patch(':branchId/:productId/threshold')
  updateThreshold(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: UpdateThresholdDto,
    @CurrentUser() user: { tenantId: string },
  ) {
    return this.service.updateThreshold(branchId, productId, dto, user);
  }
}
