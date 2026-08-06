import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AckJobDto, HeartbeatDto, InboundProductDto } from './dto/agent.dto';

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(private prisma: PrismaService) {}

  // Agent için bekleyen OUTBOUND işler (en eski önce).
  async getPendingQueue(branchId: string, tenantId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      return tx.syncQueue.findMany({
        where: { tenantId, branchId, status: 'PENDING', direction: 'OUTBOUND' },
        orderBy: { createdAt: 'asc' },
        take: 20,
        select: {
          id: true,
          operationType: true,
          payload: true,
          adapterType: true,
          createdAt: true,
        },
      });
    });
  }

  // Agent bir işi tamamladığında sonucu bildirir.
  async ackJob(id: string, dto: AckJobDto, branchId: string, tenantId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      const job = await tx.syncQueue.findFirst({
        where: { id, branchId, tenantId },
        select: { id: true },
      });
      if (!job) {
        throw new NotFoundException('Sync işi bulunamadı');
      }

      await tx.syncQueue.update({
        where: { id },
        data: {
          status: dto.success ? 'SUCCESS' : 'FAILED',
          processedAt: new Date(),
          errorMessage: dto.success ? null : (dto.errorMessage ?? null),
        },
      });

      return { success: true };
    });
  }

  // Barkod sisteminden okunan ürün verisini StokPilot'a aktarır (inbound).
  async inboundSync(
    products: InboundProductDto[],
    branchId: string,
    tenantId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      let updated = 0;
      const notFound: string[] = [];

      for (const p of products) {
        const product = await tx.product.findFirst({
          where: { tenantId, barcode: p.barcode },
          select: { id: true },
        });
        if (!product) {
          notFound.push(p.barcode);
          continue;
        }

        if (p.price != null) {
          await tx.product.update({
            where: { id: product.id },
            data: { salePrice: p.price },
          });
        }

        if (p.stockQuantity != null) {
          await tx.stockLevel.updateMany({
            where: { productId: product.id, branchId },
            data: { quantity: p.stockQuantity, version: { increment: 1 } },
          });
        }

        updated++;
      }

      await tx.branchIntegration.updateMany({
        where: { branchId, tenantId },
        data: { lastReadSyncAt: new Date() },
      });

      return { updated, notFound };
    });
  }

  // Agent canlılık bildirimi: hata varsa yaz, yoksa temizle (updatedAt otomatik).
  async heartbeat(dto: HeartbeatDto, branchId: string, tenantId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      await tx.branchIntegration.updateMany({
        where: { branchId, tenantId },
        data: { errorMessage: dto.status?.trim() ? dto.status.trim() : null },
      });

      return { success: true };
    });
  }
}
