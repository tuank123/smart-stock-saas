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
import { CreateOrderDto, OrderQueryDto } from './dto/order.dto';
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
  @Get(':branchId')
  list(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Query() query: OrderQueryDto,
    @CurrentUser() user: { tenantId: string },
  ) {
    return this.service.listOrders(branchId, query, user);
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
}
