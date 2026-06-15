import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SyncService } from '../sync/sync.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
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

  constructor(
    private prisma: PrismaService,
    private whatsapp: WhatsappService,
    private sync: SyncService,
  ) {}

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
    const approved = await this.prisma.$transaction(async (tx) => {
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

    // Fire-and-forget: WhatsApp + log — hata PO onayını engellemez
    this.dispatchWhatsapp(approved, user.tenantId).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[WhatsApp] Dispatch hatası: ${msg}`);
    });

    // Enqueue sync jobs for each PO item (fire-and-forget)
    this.enqueuePOSync(approved, user).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[Sync] Enqueue hatası: ${msg}`);
    });

    return approved;
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

  async resendWhatsapp(orderId: string, user: { tenantId: string }): Promise<{ success: boolean }> {
    const order = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${user.tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      const o = await tx.purchaseOrder.findUnique({
        where: { id: orderId },
        include: ORDER_INCLUDE,
      });
      if (!o || o.tenantId !== user.tenantId) throw new NotFoundException('Sipariş bulunamadı');
      if (o.status !== 'APPROVED') {
        throw new BadRequestException(`Yalnızca APPROVED siparişlerde tekrar gönderilebilir (mevcut: ${o.status})`);
      }
      return o;
    });

    const result = await this.sendAndLog(order, user.tenantId);
    return { success: result.success };
  }

  async listWhatsappLogs(orderId: string, user: { tenantId: string }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${user.tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      return tx.whatsappMessageLog.findMany({
        where: { poId: orderId, tenantId: user.tenantId },
        orderBy: { createdAt: 'desc' },
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
        const existingDraft = await tx.purchaseOrder.findFirst({
          where: {
            branchId: level.branchId,
            status: 'DRAFT',
            items: { some: { productId: level.productId } },
          },
          select: { id: true },
        });
        if (existingDraft) continue;

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

  // ── Private helpers ────────────────────────────────────────────────

  private async enqueuePOSync(
    order: { id: string; branchId: string; supplierId: string; items: { productId: string; quantityOrdered: { toString(): string } }[]; branch?: { name?: string } | null; supplier?: { name?: string } | null },
    user: { tenantId: string; userId: string },
  ) {
    // Get branch's adapter type from integration
    const integration = await this.prisma.branchIntegration.findUnique({
      where: { branchId: order.branchId },
      select: { adapterType: true },
    });
    const adapterType = integration?.adapterType ?? 'UNKNOWN';

    for (const item of order.items) {
      await this.sync.addToQueue({
        tenantId:      user.tenantId,
        branchId:      order.branchId,
        operationType: 'STOCK_READ',
        payload:       { poId: order.id, productId: item.productId, quantity: item.quantityOrdered.toString() },
        adapterType,
        createdBy:     user.userId,
      });
    }
  }

  private async dispatchWhatsapp(
    order: Awaited<ReturnType<typeof this.prisma.purchaseOrder.update>> & {
      supplier: { name: string; whatsappNumber: string };
      branch: { name: string };
      items: { quantityOrdered: { toString(): string }; product: { name: string; unit: string } }[];
    },
    tenantId: string,
  ): Promise<void> {
    const result = await this.sendAndLog(order, tenantId);
    if (!result.success) {
      this.logger.warn(`[WhatsApp] Gönderim başarısız: ${result.error}`);
    }
  }

  private async sendAndLog(
    order: {
      id: string;
      branchId: string;
      supplierId: string;
      supplier: { name: string; whatsappNumber: string };
      branch: { name: string };
      items: { quantityOrdered: { toString(): string }; product: { name: string; unit: string } }[];
    },
    tenantId: string,
  ) {
    const items = order.items.map((i) => ({
      name: i.product.name,
      quantity: i.quantityOrdered.toString(),
      unit: i.product.unit,
    }));

    const result = await this.whatsapp.sendOrderMessage({
      poId: order.id,
      supplierPhone: order.supplier.whatsappNumber,
      supplierName: order.supplier.name,
      branchName: order.branch.name,
      items,
    });

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET app.tenant_id = '${tenantId}'`);
        await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

        await tx.whatsappMessageLog.create({
          data: {
            tenantId,
            branchId: order.branchId,
            supplierId: order.supplierId,
            poId: order.id,
            messageBody: result.messageBody,
            whatsappNumber: order.supplier.whatsappNumber,
            status: result.success ? 'SENT' : 'FAILED',
            sentAt: result.success ? new Date() : null,
            errorMessage: result.error ?? null,
          },
        });
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[WhatsApp] Log kaydedilemedi: ${msg}`);
    }

    return result;
  }
}
