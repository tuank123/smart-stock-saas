import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateOrderDto, OrderQueryDto } from './dto/order.dto';

const ORDER_INCLUDE = {
  supplier: { select: { id: true, name: true, whatsappNumber: true } },
  branch: { select: { id: true, name: true } },
  approver: { select: { id: true, email: true } },
  items: {
    include: {
      product: { select: { id: true, sku: true, name: true, unit: true } },
    },
  },
} as const;

const CANCELLABLE = ['DRAFT', 'APPROVED'];

@Injectable()
export class OrdersService {
  constructor(private prisma: PrismaService) {}

  async createOrder(dto: CreateOrderDto, user: { tenantId: string; userId: string }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${user.tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      return tx.purchaseOrder.create({
        data: {
          tenantId: user.tenantId,
          branchId: dto.branchId,
          supplierId: dto.supplierId,
          status: 'DRAFT',
          notes: dto.notes,
          items: {
            create: dto.items.map((item) => ({
              productId: item.productId,
              quantityOrdered: item.quantityOrdered,
              unitPrice: item.unitPrice,
              notes: item.notes,
            })),
          },
        },
        include: ORDER_INCLUDE,
      });
    });
  }

  async listOrders(branchId: string, query: OrderQueryDto, user: { tenantId: string }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${user.tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      const where: { tenantId: string; branchId: string; status?: string } = {
        tenantId: user.tenantId,
        branchId,
      };
      if (query.status) where.status = query.status;

      return tx.purchaseOrder.findMany({
        where,
        include: ORDER_INCLUDE,
        orderBy: { createdAt: 'desc' },
      });
    });
  }

  async approveOrder(orderId: string, user: { tenantId: string; userId: string }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${user.tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      const order = await tx.purchaseOrder.findUnique({
        where: { id: orderId },
        select: { id: true, tenantId: true, status: true },
      });

      if (!order || order.tenantId !== user.tenantId) {
        throw new NotFoundException('Sipariş bulunamadı');
      }
      if (order.status !== 'DRAFT') {
        throw new BadRequestException(`Yalnızca DRAFT siparişler onaylanabilir (mevcut: ${order.status})`);
      }

      return tx.purchaseOrder.update({
        where: { id: orderId },
        data: { status: 'APPROVED', approvedBy: user.userId, approvedAt: new Date() },
        include: ORDER_INCLUDE,
      });
    });
  }

  async cancelOrder(orderId: string, user: { tenantId: string }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${user.tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      const order = await tx.purchaseOrder.findUnique({
        where: { id: orderId },
        select: { id: true, tenantId: true, status: true },
      });

      if (!order || order.tenantId !== user.tenantId) {
        throw new NotFoundException('Sipariş bulunamadı');
      }
      if (!CANCELLABLE.includes(order.status)) {
        throw new BadRequestException(`Bu sipariş iptal edilemez (mevcut: ${order.status})`);
      }

      return tx.purchaseOrder.update({
        where: { id: orderId },
        data: { status: 'CANCELLED' },
        include: ORDER_INCLUDE,
      });
    });
  }
}
