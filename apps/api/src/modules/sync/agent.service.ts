import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AckJobDto, HeartbeatDto, InboundProductDto } from './dto/agent.dto';
import { withTenantContext } from '../../common/utils/tenant-context';
import { DataIntegrityException } from '../../common/exceptions/data-integrity.exception';

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(private prisma: PrismaService) {}

  // Agent için bekleyen OUTBOUND işler (en eski önce).
  async getPendingQueue(branchId: string, tenantId: string) {
    return withTenantContext(this.prisma, { tenantId }, async (tx) => {

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
    return withTenantContext(this.prisma, { tenantId }, async (tx) => {

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
  //
  // Stok miktarı Agent'tan MUTLAK değer olarak gelir (delta değil) — bu yüzden
  // recordWaste/recordSale'deki "yalnızca azalış" ön-kontrolü burada geçerli
  // değil; onun yerine iyimser kilit (eski miktarı WHERE koşuluna koyarak
  // güncelleme) kullanılır: okuma ile yazma arasında başka bir işlem
  // (recordSale, recordWaste, transfer vb.) aynı satırı değiştirirse
  // updateMany 0 satır etkiler, bu da DataIntegrityException ile tüm batch'in
  // (transaction) rollback edilmesini tetikler — Agent bir sonraki
  // senkronizasyonda tekrar dener.
  async inboundSync(
    products: InboundProductDto[],
    branchId: string,
    tenantId: string,
    integrationId: string,
  ) {
    return withTenantContext(this.prisma, { tenantId }, async (tx) => {

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
          const level = await tx.stockLevel.findFirst({
            where: { productId: product.id, branchId },
            select: { id: true, quantity: true },
          });

          if (level) {
            const oldQuantity = Number(level.quantity);
            const delta = p.stockQuantity - oldQuantity;

            if (delta !== 0) {
              const result = await tx.stockLevel.updateMany({
                where: { id: level.id, quantity: oldQuantity },
                data: { quantity: p.stockQuantity, version: { increment: 1 } },
              });

              if (result.count === 0) {
                await this.prisma.errorLog
                  .create({
                    data: {
                      source: 'DATA_INTEGRITY',
                      severity: 'ERROR',
                      message: 'Agent senkronizasyonu sırasında eşzamanlı stok değişikliği tespit edildi',
                      tenantId,
                      branchId,
                      context: {
                        productId: product.id,
                        stockLevelId: level.id,
                        expectedQuantityBefore: oldQuantity,
                        incomingQuantity: p.stockQuantity,
                        integrationId,
                      },
                    },
                  })
                  .catch(() => undefined);

                throw new DataIntegrityException('agent sync detected a concurrent stock level change');
              }

              await tx.stockMovement.create({
                data: {
                  tenantId,
                  productId: product.id,
                  branchId,
                  movementType: 'AGENT_SYNC',
                  quantity: delta,
                  referenceType: 'AGENT_SYNC',
                  referenceId: integrationId,
                  createdBy: null,
                },
              });
            }
          }
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
    return withTenantContext(this.prisma, { tenantId }, async (tx) => {

      await tx.branchIntegration.updateMany({
        where: { branchId, tenantId },
        data: { errorMessage: dto.status?.trim() ? dto.status.trim() : null },
      });

      return { success: true };
    });
  }
}
