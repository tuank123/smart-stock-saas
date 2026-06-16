import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(private prisma: PrismaService) {}

  // ─── HELPERS ─────────────────────────────────────────────────────────────

  private toDateOnly(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }

  private dayRange(date: Date): { gte: Date; lt: Date } {
    const start = this.toDateOnly(date);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return { gte: start, lt: end };
  }

  private monthRange(year: number, month: number): { gte: Date; lt: Date } {
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));
    return { gte: start, lt: end };
  }

  // ─── DAILY REPORT ────────────────────────────────────────────────────────

  async generateDailyReport(tenantId: string, dateStr?: string) {
    const date = dateStr ? new Date(dateStr) : new Date();
    const reportDate = this.toDateOnly(date);
    const range = this.dayRange(date);

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      const branches = await tx.branch.findMany({
        where: { tenantId, isActive: true, deletedAt: null },
        select: { id: true, name: true },
      });

      const branchData = await Promise.all(
        branches.map(async (b) => {
          const [orders, criticalStock, movementsIn, movementsOut] = await Promise.all([
            tx.purchaseOrder.findMany({
              where: { tenantId, branchId: b.id, createdAt: range },
              include: { items: { select: { quantityOrdered: true, unitPrice: true } } },
            }),
            tx.stockLevel.count({
              where: { tenantId, branchId: b.id, quantity: { lte: tx.stockLevel.fields.minThreshold } as any },
            }),
            tx.stockMovement.count({
              where: { tenantId, branchId: b.id, createdAt: range, quantity: { gt: 0 } },
            }),
            tx.stockMovement.count({
              where: { tenantId, branchId: b.id, createdAt: range, quantity: { lt: 0 } },
            }),
          ]);

          const approvedOrders = orders.filter((o) => o.status === 'APPROVED' || o.status === 'SENT');
          const approvedValue = approvedOrders.reduce((sum, o) => {
            const orderTotal = o.items.reduce((s, i) => {
              const price = i.unitPrice ? new Prisma.Decimal(i.unitPrice) : new Prisma.Decimal(0);
              return s + price.times(i.quantityOrdered).toNumber();
            }, 0);
            return sum + orderTotal;
          }, 0);

          // Critical stock: quantity <= minThreshold (raw SQL for correct comparison)
          const criticalRaw = await tx.$queryRaw<{ cnt: bigint }[]>`
            SELECT COUNT(*) as cnt FROM stock_levels
            WHERE tenant_id = ${tenantId}::uuid
              AND branch_id = ${b.id}::uuid
              AND quantity <= min_threshold
          `;
          const criticalCount = Number(criticalRaw[0]?.cnt ?? 0);

          return {
            branchId: b.id,
            branchName: b.name,
            totalOrders: orders.length,
            approvedOrdersValue: Math.round(approvedValue * 100) / 100,
            criticalStockCount: criticalCount,
            stockMovementsIn: movementsIn,
            stockMovementsOut: movementsOut,
          };
        }),
      );

      const anomalies = await tx.priceChangeLog.findMany({
        where: { tenantId, createdAt: range, anomalyFlag: true },
        select: {
          id: true, productId: true, oldPrice: true, newPrice: true,
          changePct: true, anomalyFlag: true, createdAt: true,
        },
      });

      const totals = branchData.reduce(
        (acc, b) => ({
          totalOrders: acc.totalOrders + b.totalOrders,
          totalApprovedValue: acc.totalApprovedValue + b.approvedOrdersValue,
          totalCriticalStock: acc.totalCriticalStock + b.criticalStockCount,
          totalMovementsIn: acc.totalMovementsIn + b.stockMovementsIn,
          totalMovementsOut: acc.totalMovementsOut + b.stockMovementsOut,
        }),
        { totalOrders: 0, totalApprovedValue: 0, totalCriticalStock: 0, totalMovementsIn: 0, totalMovementsOut: 0 },
      );

      const payload: Prisma.JsonObject = {
        date: reportDate.toISOString().slice(0, 10),
        branches: branchData as unknown as Prisma.JsonArray,
        totals: totals as unknown as Prisma.JsonObject,
        anomalies: anomalies.map((a) => ({
          ...a,
          oldPrice: a.oldPrice.toNumber(),
          newPrice: a.newPrice.toNumber(),
          changePct: a.changePct.toNumber(),
          createdAt: a.createdAt.toISOString(),
        })) as unknown as Prisma.JsonArray,
      };

      return tx.scheduledReport.upsert({
        where: { tenantId_reportType_reportDate: { tenantId, reportType: 'DAILY', reportDate } },
        update: { payload, generatedAt: new Date() },
        create: { tenantId, reportType: 'DAILY', reportDate, payload },
      });
    });
  }

  // ─── MONTHLY REPORT ──────────────────────────────────────────────────────

  async generateMonthlyReport(tenantId: string, year: number, month: number) {
    const reportDate = this.toDateOnly(new Date(Date.UTC(year, month - 1, 1)));
    const range = this.monthRange(year, month);

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      const branches = await tx.branch.findMany({
        where: { tenantId, isActive: true, deletedAt: null },
        select: { id: true, name: true },
      });

      const branchComparison = await Promise.all(
        branches.map(async (b) => {
          const [orderCount, movementCount] = await Promise.all([
            tx.purchaseOrder.count({ where: { tenantId, branchId: b.id, createdAt: range } }),
            tx.stockMovement.count({ where: { tenantId, branchId: b.id, createdAt: range } }),
          ]);
          const criticalRaw = await tx.$queryRaw<{ cnt: bigint }[]>`
            SELECT COUNT(*) as cnt FROM stock_levels
            WHERE tenant_id = ${tenantId}::uuid AND branch_id = ${b.id}::uuid
              AND quantity <= min_threshold
          `;
          return {
            branchId: b.id,
            branchName: b.name,
            orderCount,
            stockMovementCount: movementCount,
            criticalStockCount: Number(criticalRaw[0]?.cnt ?? 0),
          };
        }),
      );

      const [totalOrders, totalMovements, priceAnomalies] = await Promise.all([
        tx.purchaseOrder.count({ where: { tenantId, createdAt: range } }),
        tx.stockMovement.count({ where: { tenantId, createdAt: range } }),
        tx.priceChangeLog.count({ where: { tenantId, createdAt: range, anomalyFlag: true } }),
      ]);

      const existingDailyReports = await tx.scheduledReport.findMany({
        where: { tenantId, reportType: 'DAILY', reportDate: range },
        select: { id: true, reportDate: true },
      });

      const payload: Prisma.JsonObject = {
        year,
        month,
        period: `${year}-${String(month).padStart(2, '0')}`,
        branchComparison: branchComparison as unknown as Prisma.JsonArray,
        totals: { totalOrders, totalMovements, priceAnomalies } as unknown as Prisma.JsonObject,
        dailyReportCount: existingDailyReports.length,
      };

      return tx.scheduledReport.upsert({
        where: { tenantId_reportType_reportDate: { tenantId, reportType: 'MONTHLY', reportDate } },
        update: { payload, generatedAt: new Date() },
        create: { tenantId, reportType: 'MONTHLY', reportDate, payload },
      });
    });
  }

  // ─── LIST / DETAIL ───────────────────────────────────────────────────────

  async listReports(tenantId: string, type?: string, unreadOnly?: boolean) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      const where: Prisma.ScheduledReportWhereInput = { tenantId };
      if (type) where.reportType = type;
      if (unreadOnly) where.isRead = false;

      return tx.scheduledReport.findMany({
        where,
        orderBy: { reportDate: 'desc' },
        select: {
          id: true, reportType: true, reportDate: true,
          generatedAt: true, isRead: true, readAt: true, pdfUrl: true,
        },
      });
    });
  }

  async getReport(reportId: string, tenantId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      const report = await tx.scheduledReport.findUnique({ where: { id: reportId } });
      if (!report || report.tenantId !== tenantId) return null;

      if (!report.isRead) {
        return tx.scheduledReport.update({
          where: { id: reportId },
          data: { isRead: true, readAt: new Date() },
        });
      }
      return report;
    });
  }

  // ─── ANOMALIES ───────────────────────────────────────────────────────────

  async detectPriceAnomalies(tenantId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);

      return tx.priceChangeLog.findMany({
        where: { tenantId, anomalyFlag: true, createdAt: { gte: cutoff } },
        include: { product: { select: { name: true, sku: true } } },
        orderBy: { createdAt: 'desc' },
      });
    });
  }

  // ─── SCHEDULER HELPER ────────────────────────────────────────────────────

  async generateDailyForAllTenants(date?: Date): Promise<number> {
    const tenants = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'true'`);
      return tx.tenant.findMany({
        where: { status: 'ACTIVE', deletedAt: null },
        select: { id: true },
      });
    });

    let generated = 0;
    for (const t of tenants) {
      try {
        await this.generateDailyReport(t.id, date?.toISOString().slice(0, 10));
        generated++;
      } catch (err) {
        this.logger.error(`[DailyReport] tenant=${t.id}: ${(err as Error).message}`);
      }
    }
    return generated;
  }

  async generateMonthlyForAllTenants(year: number, month: number): Promise<number> {
    const tenants = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'true'`);
      return tx.tenant.findMany({
        where: { status: 'ACTIVE', deletedAt: null },
        select: { id: true },
      });
    });

    let generated = 0;
    for (const t of tenants) {
      try {
        await this.generateMonthlyReport(t.id, year, month);
        generated++;
      } catch (err) {
        this.logger.error(`[MonthlyReport] tenant=${t.id}: ${(err as Error).message}`);
      }
    }
    return generated;
  }
}
