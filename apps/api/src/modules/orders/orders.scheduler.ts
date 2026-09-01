import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { OrdersService } from './orders.service';
import { withTenantContext } from '../../common/utils/tenant-context';

@Injectable()
export class OrdersScheduler {
  private readonly logger = new Logger(OrdersScheduler.name);

  constructor(
    private prisma: PrismaService,
    private ordersService: OrdersService,
  ) {}

  @Cron('0 3 * * *')
  async handleAutoPoCreation() {
    this.logger.log('[AutoPO] Otomatik sipariş kontrolü başladı');

    const tenants = await withTenantContext(this.prisma, { isSuperAdmin: true }, async (tx) => {
      return tx.tenant.findMany({
        where: { status: 'ACTIVE', deletedAt: null },
        select: { id: true, companyName: true },
      });
    });

    let totalCreated = 0;
    for (const tenant of tenants) {
      try {
        const count = await this.ordersService.checkAndCreateDraftOrders(tenant.id);
        if (count > 0) {
          this.logger.log(`[AutoPO] ${tenant.companyName}: ${count} DRAFT PO oluşturuldu`);
          totalCreated += count;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`[AutoPO] ${tenant.companyName} hata: ${msg}`);

        // Sessizce yalnızca Logger'a düşerse, hiç DRAFT PO oluşmayan bir gün
        // kimse fark etmeden geçer — admin panelinde görünür olsun.
        this.prisma.errorLog
          .create({
            data: {
              source: 'SCHEDULED_JOB',
              severity: 'ERROR',
              message: `Otomatik sipariş oluşturma başarısız: ${tenant.companyName}`,
              stackTrace: err instanceof Error ? (err.stack ?? null) : null,
              tenantId: tenant.id,
              context: { job: 'AutoPoCreation', tenantId: tenant.id, error: msg },
            },
          })
          .catch(() => undefined);
      }
    }

    this.logger.log(`[AutoPO] Tamamlandı. Toplam ${totalCreated} DRAFT PO oluşturuldu`);
  }
}
