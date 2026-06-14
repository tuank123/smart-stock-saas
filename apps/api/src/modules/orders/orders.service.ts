import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CheckThresholdsDto, CreateOrderDto, OrderQueryDto, UpdateOrderItemDto } from './dto/order.dto';

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
  private readonly logger = new Logger(OrdersService.name);

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

  async checkAndCreateDraftOrders(
    tenantId: string,
    dto?: CheckThresholdsDto,
  ): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      const levels = await tx.stockLevel.findMany({
        where: {
          tenantId,
          ...(dto?.branchId ? { branchId: dto.branchId } : {}),
        },
        include: {
          product: { select: { id: true, name: true } },
        },
      });

      const belowThreshold = levels.filter((l) => l.quantity.lte(l.minThreshold));

      let created = 0;

      for (const level of belowThreshold) {
        // Skip if DRAFT PO already exists for this branch+product
        const existingDraft = await tx.purchaseOrder.findFirst({
          where: {
            branchId: level.branchId,
            status: 'DRAFT',
            items: { some: { productId: level.productId } },
          },
          select: { id: true },
        });
        if (existingDraft) continue;

        // Find primary supplier for this branch
        const branchSupplier = await tx.branchSupplier.findFirst({
          where: { branchId: level.branchId, isPrimary: true },
          select: { supplierId: true },
        });
        if (!branchSupplier) {
          this.logger.warn(
            `[AutoPO] Birincil tedarikçi yok — branch=${level.branchId} product=${level.productId}`,
          );
          continue;
        }

        // Calculate quantity to order
        let quantityOrdered: number;
        if (!level.maxThresholdSet || !level.maxThreshold) {
          quantityOrdered = level.minThreshold.times(2).toNumber();
        } else {
          quantityOrdered = level.maxThreshold.minus(level.quantity).toNumber();
        }
        if (quantityOrdered <= 0) continue;

        await tx.purchaseOrder.create({
          data: {
            tenantId,
            branchId: level.branchId,
            supplierId: branchSupplier.supplierId,
            status: 'DRAFT',
            notes: `Otomatik — ${level.product.name} stok eşiği aşıldı`,
            items: {
              create: [{ productId: level.productId, quantityOrdered }],
            },
          },
        });

        created++;
      }

      return created;
    });
  }

  async listDraftOrders(branchId: string, user: { tenantId: string }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${user.tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      return tx.purchaseOrder.findMany({
        where: { tenantId: user.tenantId, branchId, status: 'DRAFT' },
        include: ORDER_INCLUDE,
        orderBy: { createdAt: 'desc' },
      });
    });
  }

  async updateOrderItem(
    orderId: string,
    itemId: string,
    dto: UpdateOrderItemDto,
    user: { tenantId: string },
  ) {
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
        throw new BadRequestException(`Yalnızca DRAFT siparişler düzenlenebilir (mevcut: ${order.status})`);
      }

      const item = await tx.purchaseOrderItem.findFirst({
        where: { id: itemId, poId: orderId },
        select: { id: true },
      });
      if (!item) throw new NotFoundException('Sipariş kalemi bulunamadı');

      return tx.purchaseOrderItem.update({
        where: { id: itemId },
        data: { quantityOrdered: dto.quantityOrdered },
        include: { product: { select: { id: true, sku: true, name: true, unit: true } } },
      });
    });
  }
}
