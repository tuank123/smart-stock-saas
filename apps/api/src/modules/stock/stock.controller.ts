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
  StockBarcodeQueryDto,
  StockQueryDto,
  UpdateThresholdDto,
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
  @Roles(UserRole.KASIYER, UserRole.DEPO)
  @Get('query')
  queryStock(
    @Query() query: StockBarcodeQueryDto,
    @CurrentUser() user: { tenantId: string; branchId: string },
  ) {
    return this.service.queryByBarcode(query, user);
  }

  // NOTE: 'movements' static segment before :branchId to avoid collision
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
