import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateDebtDto,
  RecordCashPaymentDto,
  RecordProductReceiptDto,
  UpdateDebtDto,
} from './dto/debt.dto';

type DebtUser = {
  tenantId: string;
  userId: string;
  role?: string | null;
  planId?: string | null;
};

// productLines JSON eleman şekli.
type ProductLine = {
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
  receivedQuantity: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const VISIT_REMINDER_DAYS = 2;
const RECEIVABLE_REMINDER_DAYS = 15;
const PAID_VISIBLE_DAYS = 3;

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

      // OPEN kayıtlar + son 3 gün içinde tam kapanmış (PAID) kayıtlar gösterilir.
      const paidVisibleThreshold = new Date(Date.now() - PAID_VISIBLE_DAYS * DAY_MS);
      return tx.debt.findMany({
        where: {
          branchId,
          OR: [
            { status: 'OPEN' },
            { status: 'PAID', paidAt: { gte: paidVisibleThreshold } },
          ],
        },
        include: {
          supplier: { select: { id: true, name: true } },
          payments: {
            select: { amount: true, paidAt: true },
            orderBy: { paidAt: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    });
  }

  async createDebt(branchId: string, dto: CreateDebtDto, user: DebtUser) {
    // Nakit/ürün türüne göre zorunlu alan kontrolü.
    if (dto.debtType === 'CASH' && !dto.amount) {
      throw new BadRequestException('Nakit kayıtlar için tutar zorunludur');
    }
    if (dto.debtType === 'PRODUCT' && (!dto.productLines || dto.productLines.length === 0)) {
      throw new BadRequestException('Ürün kayıtları için en az bir ürün satırı zorunludur');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${user.tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);
      this.assertAllowed(user);

      // PRODUCT ise: ürün adlarını çekip yapılandırılmış productLines + özet metin kur.
      let productLines: ProductLine[] | null = null;
      let productDescription: string | null = null;
      if (dto.debtType === 'PRODUCT' && dto.productLines) {
        const ids = dto.productLines.map((l) => l.productId);
        const products = await tx.product.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true, unit: true },
        });
        const byId = new Map(products.map((p) => [p.id, p]));
        productLines = dto.productLines.map((l) => {
          const p = byId.get(l.productId);
          return {
            productId: l.productId,
            productName: p?.name ?? l.productId,
            quantity: l.quantity,
            unit: p?.unit ?? 'adet',
            receivedQuantity: 0,
          };
        });
        productDescription = productLines
          .map((pl) => `${pl.productName} x${pl.quantity}`)
          .join(', ');
      }

      return tx.debt.create({
        data: {
          tenantId: user.tenantId,
          branchId,
          supplierId: dto.supplierId,
          direction: dto.direction,
          debtType: dto.debtType,
          source: 'MANUAL',
          amount: dto.debtType === 'CASH' ? dto.amount : null,
          remainingAmount: dto.debtType === 'CASH' ? dto.amount : null,
          productDescription,
          productLines: productLines ?? undefined,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          notes: dto.notes ?? null,
          createdBy: user.userId,
        },
        include: { supplier: { select: { id: true, name: true } } },
      });
    });
  }

  // Sade alan güncelleyici — durum/ödeme değişiklikleri artık
  // recordCashPayment / recordProductReceipt üzerinden yapılır.
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
          ...(dto.dueDate !== undefined
            ? { dueDate: dto.dueDate ? new Date(dto.dueDate) : null }
            : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes || null } : {}),
        },
        include: { supplier: { select: { id: true, name: true } } },
      });
    });
  }

  // Nakit borca kısmi/tam ödeme kaydeder.
  async recordCashPayment(id: string, dto: RecordCashPaymentDto, user: DebtUser) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${user.tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);
      this.assertAllowed(user);

      const existing = await tx.debt.findFirst({ where: { id } });
      if (!existing) {
        throw new NotFoundException('Borç kaydı bulunamadı');
      }
      if (existing.debtType !== 'CASH') {
        throw new BadRequestException('Bu kayıt nakit türünde değil');
      }

      const current = existing.remainingAmount ?? existing.amount ?? 0;
      const newRemaining = Math.max(0, Number(current) - dto.amount);
      const now = new Date();
      const fullyPaid = newRemaining <= 0;

      // Ödeme hareketini geçmişe kaydet.
      await tx.debtPayment.create({
        data: { debtId: id, amount: dto.amount, createdBy: user.userId },
      });

      return tx.debt.update({
        where: { id },
        data: {
          remainingAmount: newRemaining,
          lastPaymentAmount: dto.amount,
          lastPaymentDate: now,
          ...(fullyPaid ? { status: 'PAID', paidAt: now } : {}),
        },
        include: { supplier: { select: { id: true, name: true } } },
      });
    });
  }

  // Ürün borcuna kısmi/tam teslim alma kaydeder; affectsStock ise farkı stoka ekler.
  async recordProductReceipt(id: string, dto: RecordProductReceiptDto, user: DebtUser) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${user.tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);
      this.assertAllowed(user);

      const existing = await tx.debt.findFirst({ where: { id } });
      if (!existing) {
        throw new NotFoundException('Borç kaydı bulunamadı');
      }
      if (existing.debtType !== 'PRODUCT') {
        throw new BadRequestException('Bu kayıt ürün türünde değil');
      }

      const lines = (existing.productLines as unknown as ProductLine[]) ?? [];
      const receivedById = new Map(
        dto.lines.map((l) => [l.productId, l.receivedQuantity]),
      );

      const updatedLines = lines.map((line) => {
        const incoming = receivedById.get(line.productId);
        if (incoming == null) return line;
        // Eski kayıtlarda receivedQuantity olmayabilir → 0 varsay (NaN'ı önle).
        const currentReceived = line.receivedQuantity ?? 0;
        // Aşırı girişi sınırla: toplam quantity'yi geçmesin.
        const capped = Math.min(line.quantity, currentReceived + incoming);
        const delta = capped - currentReceived; // bu turda gerçekten eklenen
        return { ...line, receivedQuantity: capped, __delta: delta } as ProductLine & {
          __delta: number;
        };
      }) as Array<ProductLine & { __delta?: number }>;

      // affectsStock ise, yalnız bu turda eklenen fark kadar stoğa geri ekle.
      if (existing.affectsStock) {
        for (const line of updatedLines) {
          const delta = line.__delta ?? 0;
          if (delta <= 0) continue;
          await tx.stockLevel.updateMany({
            where: { productId: line.productId, branchId: existing.branchId },
            data: {
              quantity: { increment: delta },
              version: { increment: 1 },
            },
          });
          await tx.stockMovement.create({
            data: {
              tenantId: existing.tenantId,
              productId: line.productId,
              branchId: existing.branchId,
              movementType: 'RETURN_RESOLVED',
              quantity: delta,
              referenceId: existing.id,
              referenceType: 'RETURN_INVOICE',
              notes: 'İade süreci — teslim alınan ürün stoka eklendi',
              createdBy: user.userId,
            },
          });
        }
      }

      // Geçici __delta'yı temizleyip kalıcı satırları oluştur.
      const persistedLines: ProductLine[] = updatedLines.map((l) => ({
        productId: l.productId,
        productName: l.productName,
        quantity: l.quantity,
        unit: l.unit,
        receivedQuantity: l.receivedQuantity ?? 0,
      }));

      const allReceived = persistedLines.every(
        (l) => l.receivedQuantity >= l.quantity,
      );
      const now = new Date();

      return tx.debt.update({
        where: { id },
        data: {
          productLines: persistedLines,
          lastPaymentDate: now,
          ...(allReceived ? { status: 'PAID', paidAt: now } : {}),
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
