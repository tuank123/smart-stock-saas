import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDebtDto, UpdateDebtDto } from './dto/debt.dto';

type DebtUser = {
  tenantId: string;
  userId: string;
  role?: string | null;
  planId?: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const VISIT_REMINDER_DAYS = 2;
const RECEIVABLE_REMINDER_DAYS = 15;

@Injectable()
export class DebtsService {
  constructor(private prisma: PrismaService) {}

  // PATRON yalnızca tek şubeli (STARTER) ise borç işlemi yapabilir.
  private assertAllowed(user: DebtUser) {
    if (user.role === 'PATRON' && user.planId !== 'STARTER') {
      throw new ForbiddenException(
        'Bu işlem yalnızca şube müdürleri veya tek şubeli işletme sahipleri tarafından yapılabilir',
      );
    }
  }

  async listDebts(branchId: string, user: DebtUser) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${user.tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);
      this.assertAllowed(user);

      return tx.debt.findMany({
        where: { branchId },
        include: { supplier: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      });
    });
  }

  async createDebt(branchId: string, dto: CreateDebtDto, user: DebtUser) {
    // Nakit/ürün türüne göre zorunlu alan kontrolü.
    if (dto.debtType === 'CASH' && !dto.amount) {
      throw new BadRequestException('Nakit kayıtlar için tutar zorunludur');
    }
    if (dto.debtType === 'PRODUCT' && !dto.productDescription) {
      throw new BadRequestException('Ürün kayıtları için açıklama zorunludur');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${user.tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);
      this.assertAllowed(user);

      return tx.debt.create({
        data: {
          tenantId: user.tenantId,
          branchId,
          supplierId: dto.supplierId,
          direction: dto.direction,
          debtType: dto.debtType,
          amount: dto.debtType === 'CASH' ? dto.amount : null,
          productDescription: dto.debtType === 'PRODUCT' ? dto.productDescription : null,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          notes: dto.notes ?? null,
          createdBy: user.userId,
        },
        include: { supplier: { select: { id: true, name: true } } },
      });
    });
  }

  async updateDebt(id: string, dto: UpdateDebtDto, user: DebtUser) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${user.tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);
      this.assertAllowed(user);

      const existing = await tx.debt.findFirst({ where: { id } });
      if (!existing) {
        throw new NotFoundException('Borç kaydı bulunamadı');
      }

      return tx.debt.update({
        where: { id },
        data: {
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
          ...(dto.dueDate !== undefined
            ? { dueDate: dto.dueDate ? new Date(dto.dueDate) : null }
            : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes || null } : {}),
        },
        include: { supplier: { select: { id: true, name: true } } },
      });
    });
  }

  async markViewed(branchId: string, user: DebtUser) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${user.tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);
      this.assertAllowed(user);

      const branch = await tx.branch.findFirst({ where: { id: branchId } });
      if (!branch) {
        throw new NotFoundException('Şube bulunamadı');
      }

      await tx.branch.update({
        where: { id: branchId },
        data: { debtsLastViewedAt: new Date() },
      });

      return { success: true };
    });
  }

  async getReminders(branchId: string, user: DebtUser) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${user.tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);
      this.assertAllowed(user);

      const now = new Date();

      const branch = await tx.branch.findFirst({ where: { id: branchId } });
      if (!branch) {
        throw new NotFoundException('Şube bulunamadı');
      }

      // Ziyaret hatırlatması: hiç görüntülenmemiş ya da ≥2 gün önce görüntülenmiş.
      const visitThreshold = new Date(now.getTime() - VISIT_REMINDER_DAYS * DAY_MS);
      const showVisitReminder =
        branch.debtsLastViewedAt == null ||
        branch.debtsLastViewedAt <= visitThreshold;

      // Alacak hatırlatması: açık RECEIVABLE kayıtlar, 15 gündür gösterilmemiş.
      const reminderThreshold = new Date(
        now.getTime() - RECEIVABLE_REMINDER_DAYS * DAY_MS,
      );
      const receivables = await tx.debt.findMany({
        where: {
          branchId,
          status: 'OPEN',
          direction: 'RECEIVABLE',
          OR: [
            { lastReminderShownAt: null },
            { lastReminderShownAt: { lte: reminderThreshold } },
          ],
        },
        include: { supplier: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      });

      const receivableReminders = receivables.map((d) => ({
        debtId: d.id,
        supplierName: d.supplier.name,
        amount: d.amount,
        dueDate: d.dueDate,
      }));

      // Gösterildi olarak işaretle → 15 günlük sayacı sıfırla.
      if (receivables.length > 0) {
        await tx.debt.updateMany({
          where: { id: { in: receivables.map((d) => d.id) } },
          data: { lastReminderShownAt: now },
        });
      }

      return { showVisitReminder, receivableReminders };
    });
  }
}
