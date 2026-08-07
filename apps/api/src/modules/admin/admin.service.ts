import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TenantPlan, TenantStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ListErrorsQueryDto,
  ListTenantsQueryDto,
  UpdateTenantStatusDto,
} from './dto/admin.dto';

const DAY_MS = 24 * 60 * 60 * 1000;
// Platform (super-admin) tenant'ı liste ve istatistiklerden hariç tutulur.
const PLATFORM_TAX_NUMBER = 'PLATFORM-0000000000';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  // Tüm tenant'ları listeler (RLS bypass — platform sahibi tüm tenant'ları görür).
  async listTenants(query: ListTenantsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.TenantWhereInput = {
      taxNumber: { not: PLATFORM_TAX_NUMBER },
    };
    // includeTest gönderilmedikçe test hesaplarını gizle.
    if (!query.includeTest) where.isTest = false;
    if (query.search) {
      where.OR = [
        { companyName: { contains: query.search, mode: 'insensitive' } },
        { taxNumber: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.status) where.status = query.status as TenantStatus;
    if (query.planId) where.planId = query.planId as TenantPlan;

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'true'`);

      const [items, total] = await Promise.all([
        tx.tenant.findMany({
          where,
          select: {
            id: true,
            companyName: true,
            taxNumber: true,
            planId: true,
            status: true,
            createdAt: true,
            _count: { select: { users: true, branches: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        tx.tenant.count({ where }),
      ]);

      const tenants = items.map((t) => ({
        id: t.id,
        companyName: t.companyName,
        taxNumber: t.taxNumber,
        planId: t.planId,
        status: t.status,
        createdAt: t.createdAt,
        userCount: t._count.users,
        branchCount: t._count.branches,
      }));

      return { items: tenants, total, page, pageSize };
    });
  }

  // Tek tenant detayı: tüm alanlar + kullanıcılar + şubeler.
  async getTenantDetail(tenantId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'true'`);

      const tenant = await tx.tenant.findUnique({
        where: { id: tenantId },
        include: {
          users: {
            select: {
              id: true,
              email: true,
              fullName: true,
              role: true,
              isActive: true,
              lastLoginAt: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'asc' },
          },
          branches: {
            select: { id: true, name: true, address: true, phone: true },
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      if (!tenant) {
        throw new NotFoundException('Tenant bulunamadı');
      }

      return tenant;
    });
  }

  // Tenant durumunu günceller. SUSPENDED/DELETED olunca kullanıcılar pasifleşir;
  // ACTIVE'e dönüşte kullanıcılar bilinçli olarak yeniden aktive EDİLMEZ.
  async updateTenantStatus(tenantId: string, dto: UpdateTenantStatusDto) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'true'`);

      const existing = await tx.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true },
      });
      if (!existing) {
        throw new NotFoundException('Tenant bulunamadı');
      }

      const closing = dto.status === 'SUSPENDED' || dto.status === 'DELETED';

      const tenant = await tx.tenant.update({
        where: { id: tenantId },
        data: {
          status: dto.status,
          // Sonlandırılıyorsa closedAt set, ACTIVE'e dönüyorsa temizle.
          closedAt: closing ? new Date() : null,
        },
        select: { id: true, companyName: true, status: true, planId: true },
      });

      if (closing) {
        await tx.user.updateMany({
          where: { tenantId },
          data: { isActive: false },
        });
      }

      return tenant;
    });
  }

  // Platform geneli istatistikler.
  async getStats() {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'true'`);

      const since7d = new Date(Date.now() - 7 * DAY_MS);
      // Platform VE test hesapları tüm istatistiklerden hariç.
      const notPlatform: Prisma.TenantWhereInput = {
        taxNumber: { not: PLATFORM_TAX_NUMBER },
        isTest: false,
      };

      const [
        totalTenants,
        byStatus,
        byPlan,
        newLast7Days,
        totalUsers,
        closedLast7Days,
        activeByPlan,
        failedSyncJobs,
      ] = await Promise.all([
        tx.tenant.count({ where: notPlatform }),
        tx.tenant.groupBy({ by: ['status'], _count: { _all: true }, where: notPlatform }),
        tx.tenant.groupBy({ by: ['planId'], _count: { _all: true }, where: notPlatform }),
        tx.tenant.count({ where: { ...notPlatform, createdAt: { gte: since7d } } }),
        tx.user.count({
          where: { tenant: { taxNumber: { not: PLATFORM_TAX_NUMBER }, isTest: false } },
        }),
        tx.tenant.count({ where: { ...notPlatform, closedAt: { gte: since7d } } }),
        tx.tenant.groupBy({
          by: ['planId'],
          _count: { _all: true },
          where: { ...notPlatform, status: 'ACTIVE' },
        }),
        tx.syncQueue.count({ where: { status: 'FAILED' } }),
      ]);

      const statusBreakdown: Record<string, number> = {
        ACTIVE: 0,
        SUSPENDED: 0,
        DELETED: 0,
      };
      for (const row of byStatus) statusBreakdown[row.status] = row._count._all;

      const planBreakdown: Record<string, number> = {
        STARTER: 0,
        PROFESSIONAL: 0,
        ENTERPRISE: 0,
      };
      for (const row of byPlan) planBreakdown[row.planId] = row._count._all;

      // Tahmini aylık gelir: aktif STARTER×1750 + aktif PROFESSIONAL×2000.
      // ENTERPRISE fiyatı belirsiz olduğundan dahil edilmez.
      const PLAN_PRICE: Record<string, number> = { STARTER: 1750, PROFESSIONAL: 2000 };
      let estimatedMonthlyRevenue = 0;
      for (const row of activeByPlan) {
        estimatedMonthlyRevenue += (PLAN_PRICE[row.planId] ?? 0) * row._count._all;
      }

      return {
        totalTenants,
        statusBreakdown,
        planBreakdown,
        newLast7Days,
        totalUsers,
        closedLast7Days,
        estimatedMonthlyRevenue,
        failedSyncJobs,
      };
    });
  }

  // ── Hata kayıtları (ErrorLog — RLS'siz sistem tablosu, doğrudan erişim) ───────

  async listErrors(query: ListErrorsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.ErrorLogWhereInput = {};
    if (query.source) where.source = query.source;
    if (query.severity) where.severity = query.severity;
    if (query.resolved === 'true') where.resolved = true;
    else if (query.resolved === 'false') where.resolved = false;

    const [items, total] = await Promise.all([
      this.prisma.errorLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.errorLog.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async resolveError(errorId: string) {
    const existing = await this.prisma.errorLog.findUnique({
      where: { id: errorId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Hata kaydı bulunamadı');
    }
    return this.prisma.errorLog.update({
      where: { id: errorId },
      data: { resolved: true, resolvedAt: new Date() },
    });
  }

  // Sidebar badge'i için hafif sorgu — çözülmemiş hata sayısı.
  async getUnresolvedErrorCount() {
    const count = await this.prisma.errorLog.count({ where: { resolved: false } });
    return { count };
  }
}
