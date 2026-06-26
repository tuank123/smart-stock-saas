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
  CheckThresholdsDto,
  CreateOrderDto,
  OrderQueryDto,
  PatchOrderDto,
  ReceiveOrderDto,
  UpdateOrderItemDto,
} from './dto/order.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
export class OrdersController {
  constructor(private service: OrdersService) {}

  @Roles(UserRole.SUBE_MUDURU)
  @Post()
  @HttpCode(201)
  create(
    @Body() dto: CreateOrderDto,
    @CurrentUser() user: { tenantId: string; userId: string },
  ) {
    return this.service.createOrder(dto, user);
  }

  @Roles(UserRole.PATRON, UserRole.SUBE_MUDURU)
  @Post('check-thresholds')
  @HttpCode(200)
  async checkThresholds(
    @Body() dto: CheckThresholdsDto,
    @CurrentUser() user: { tenantId: string },
  ) {
    const createdOrders = await this.service.checkAndCreateDraftOrders(user.tenantId, dto);
    return { createdOrders };
  }

  // Must be defined before `:branchId` route — NestJS matches static segments first
  @Roles(UserRole.PATRON, UserRole.SUBE_MUDURU)
  @Get('draft/:branchId')
  listDraft(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @CurrentUser() user: { tenantId: string },
  ) {
    return this.service.listDraftOrders(branchId, user);
  }

  // NOTE: static 'station' segment before :branchId
  @Roles(UserRole.DEPO)
  @Get('station/:branchId')
  stationOrders(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @CurrentUser() user: { tenantId: string },
  ) {
    return this.service.listStationOrders(branchId, user);
  }

  @Roles(UserRole.PATRON, UserRole.SUBE_MUDURU)
  @Get(':branchId')
  list(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Query() query: OrderQueryDto,
    @CurrentUser() user: { tenantId: string },
  ) {
    return this.service.listOrders(branchId, query, user);
  }

  @Roles(UserRole.SUBE_MUDURU)
  @Patch(':orderId')
  update(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: PatchOrderDto,
    @CurrentUser() user: { tenantId: string },
  ) {
    return this.service.updateOrder(orderId, dto, user);
  }

  @Roles(UserRole.SUBE_MUDURU)
  @Patch(':orderId/approve')
  approve(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @CurrentUser() user: { tenantId: string; userId: string },
  ) {
    return this.service.approveOrder(orderId, user);
  }

  @Roles(UserRole.SUBE_MUDURU)
  @Patch(':orderId/cancel')
  cancel(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @CurrentUser() user: { tenantId: string },
  ) {
    return this.service.cancelOrder(orderId, user);
  }

  @Roles(UserRole.DEPO, UserRole.SUBE_MUDURU)
  @Patch(':orderId/receive')
  @HttpCode(200)
  receive(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: ReceiveOrderDto,
    @CurrentUser() user: { tenantId: string; userId: string },
  ) {
    return this.service.receiveOrder(orderId, dto, user);
  }

  @Roles(UserRole.SUBE_MUDURU)
  @Patch(':orderId/items/:itemId')
  updateItem(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateOrderItemDto,
    @CurrentUser() user: { tenantId: string },
  ) {
    return this.service.updateOrderItem(orderId, itemId, dto, user);
  }

  @Roles(UserRole.SUBE_MUDURU)
  @Post(':orderId/resend-whatsapp')
  @HttpCode(200)
  resendWhatsapp(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @CurrentUser() user: { tenantId: string },
  ) {
    return this.service.resendWhatsapp(orderId, user);
  }

  @Roles(UserRole.PATRON, UserRole.SUBE_MUDURU)
  @Get(':orderId/whatsapp-logs')
  whatsappLogs(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @CurrentUser() user: { tenantId: string },
  ) {
    return this.service.listWhatsappLogs(orderId, user);
  }
}
