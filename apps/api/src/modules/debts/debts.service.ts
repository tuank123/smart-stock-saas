import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SecurityEventLogger } from '../../common/security-event/security-event.service';
import { assertTenantOwnership } from '../../common/utils/assert-tenant-ownership';
import { withTenantContext } from '../../common/utils/tenant-context';
import { DataIntegrityException } from '../../common/exceptions/data-integrity.exception';
import {
  CreateDebtDto,
  RecordProductReceiptDto,
  UpdateDebtDto,
  CreateLedgerEntryDto,
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
  constructor(
    private prisma: PrismaService,
    private securityEvents: SecurityEventLogger,
  ) {}

  // PATRON yalnızca tek şubeli (STARTER) ise borç işlemi yapabilir.
  private assertAllowed(user: DebtUser) {
    if (user.role === 'PATRON' && user.planId !== 'STARTER') {
      throw new ForbiddenException(
        'Bu işlem yalnızca şube müdürleri veya tek şubeli işletme sahipleri tarafından yapılabilir',
      );
    }
  }

  async listDebts(branchId: string, user: DebtUser) {
    return withTenantContext(this.prisma, { tenantId: user.tenantId }, async (tx) => {
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
            select: { amount: true, paidAt: true, type: true },
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

    return withTenantContext(this.prisma, { tenantId: user.tenantId }, async (tx) => {
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

      const debt = await tx.debt.create({
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

      // Yalnızca PAYABLE/CASH (işletmenin tedarikçiye olan nakit borcu) —
      // tedarikçi bakiyesini besleyen tek senaryo. RECEIVABLE ve PRODUCT
      // manuel kayıtlar bu ledger'ın kapsamı DIŞINDA (görev notları).
      if (dto.direction === 'PAYABLE' && dto.debtType === 'CASH') {
        const owed = debt.remainingAmount ?? debt.amount;
        if (owed != null && Number(owed) > 0) {
          await tx.supplierLedgerEntry.create({
            data: {
              tenantId: user.tenantId,
              branchId,
              supplierId: dto.supplierId,
              type: 'INVOICE',
              amount: owed,
              sourceDebtId: debt.id,
              createdBy: user.userId,
            },
          });
        }
      }

      return debt;
    });
  }

  // Sade alan güncelleyici — CASH borçlar artık dondurulmuş tarihi kayıtlar
  // (bakiye SupplierLedgerEntry'de takip edilir); PRODUCT borçların durum/
  // teslimat değişiklikleri hâlâ recordProductReceipt üzerinden yapılır.
  async updateDebt(id: string, dto: UpdateDebtDto, user: DebtUser) {
    return withTenantContext(this.prisma, { tenantId: user.tenantId }, async (tx) => {
      this.assertAllowed(user);

      const existing = await tx.debt.findFirst({ where: { id } });
      assertTenantOwnership(existing, {
        resourceType: 'Debt',
        resourceId: id,
        user,
        notFoundMessage: 'Borç kaydı bulunamadı',
        securityEvents: this.securityEvents,
      });

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

  // Ürün borcuna kısmi/tam teslim alma kaydeder; affectsStock ise farkı stoka ekler.
  async recordProductReceipt(id: string, dto: RecordProductReceiptDto, user: DebtUser) {
    return withTenantContext(this.prisma, { tenantId: user.tenantId }, async (tx) => {
      this.assertAllowed(user);

      const existing = await tx.debt.findFirst({ where: { id } });
      assertTenantOwnership(existing, {
        resourceType: 'Debt',
        resourceId: id,
        user,
        notFoundMessage: 'Borç kaydı bulunamadı',
        securityEvents: this.securityEvents,
      });
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

      // ── Bütünlük kontrolü: hiçbir satırda teslim alınan, sipariş edileni geçmemeli ──
      // Yukarıdaki Math.min zaten bunu garanti ediyor; bu, olası bir gelecekteki
      // mantık değişikliğine karşı son bir güvenlik ağı.
      const overReceived = persistedLines.find((l) => l.receivedQuantity > l.quantity);
      if (overReceived) {
        await this.prisma.errorLog
          .create({
            data: {
              source: 'DATA_INTEGRITY',
              severity: 'ERROR',
              message: 'Ürün teslimatı tutarsızlığı',
              tenantId: user.tenantId,
              branchId: existing.branchId,
              context: {
                debtId: id,
                productId: overReceived.productId,
                quantity: overReceived.quantity,
                receivedQuantity: overReceived.receivedQuantity,
                productLines: persistedLines,
              },
            },
          })
          .catch(() => undefined);

        throw new DataIntegrityException('product receipt exceeds ordered quantity');
      }

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
    return withTenantContext(this.prisma, { tenantId: user.tenantId }, async (tx) => {
      this.assertAllowed(user);

      const branch = await tx.branch.findFirst({ where: { id: branchId } });
      assertTenantOwnership(branch, {
        resourceType: 'Branch',
        resourceId: branchId,
        user,
        notFoundMessage: 'Şube bulunamadı',
        securityEvents: this.securityEvents,
      });

      await tx.branch.update({
        where: { id: branchId },
        data: { debtsLastViewedAt: new Date() },
      });

      return { success: true };
    });
  }

  async getReminders(branchId: string, user: DebtUser) {
    return withTenantContext(this.prisma, { tenantId: user.tenantId }, async (tx) => {
      this.assertAllowed(user);

      const now = new Date();

      const branch = await tx.branch.findFirst({ where: { id: branchId } });
      assertTenantOwnership(branch, {
        resourceType: 'Branch',
        resourceId: branchId,
        user,
        notFoundMessage: 'Şube bulunamadı',
        securityEvents: this.securityEvents,
      });

      // Hatırlatmalar kapalıysa hiçbir hesaplama yapmadan erken çık.
      if (branch.debtRemindersEnabled === false) {
        return { showVisitReminder: false, receivableReminders: [] };
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

  private round2(n: number): number {
    return Math.round(n * 100) / 100;
  }

  // Tedarikçi bazlı çalışan bakiye + son hareketler. Yalnızca CASH/PAYABLE
  // tarafı besler (bkz. confirmScan/confirmReturn/createDebt) — PRODUCT
  // borçlar (recordProductReceipt) bu ledger'ın tamamen dışında.
  async getSupplierLedger(branchId: string, supplierId: string, user: DebtUser) {
    return withTenantContext(this.prisma, { tenantId: user.tenantId }, async (tx) => {
      this.assertAllowed(user);

      const supplier = await tx.supplier.findFirst({
        where: { id: supplierId },
        select: { id: true, tenantId: true, name: true },
      });
      assertTenantOwnership(supplier, {
        resourceType: 'Supplier',
        resourceId: supplierId,
        user,
        notFoundMessage: 'Tedarikçi bulunamadı',
        securityEvents: this.securityEvents,
      });

      const where = { tenantId: user.tenantId, branchId, supplierId };

      // Bakiye: INVOICE bakiyeyi artırır, diğer her şey (PAYMENT/CIRO_PRIMI/
      // FIRMA_GERI_ODEMESI/IADE_FATURASI) azaltır. Negatife düşebilir —
      // bu bir hata durumu DEĞİL (görev notları).
      const allEntries = await tx.supplierLedgerEntry.findMany({
        where,
        select: { type: true, amount: true },
      });
      const balance = allEntries.reduce(
        (sum, e) => sum + (e.type === 'INVOICE' ? Number(e.amount) : -Number(e.amount)),
        0,
      );

      const recentEntries = await tx.supplierLedgerEntry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 20,
      });

      const recentRebates = await tx.supplierLedgerEntry.findMany({
        where: { ...where, type: { in: ['CIRO_PRIMI', 'FIRMA_GERI_ODEMESI'] } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });

      const recentReturns = await tx.supplierLedgerEntry.findMany({
        where: { ...where, type: 'IADE_FATURASI' },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });

      // Son 4 takvim ayı (bu ay dahil), en eskiden en yeniye. UTC ay
      // sınırları kullanılır — reports.service.ts'teki AYNI yaklaşım.
      const now = new Date();
      const monthStarts = Array.from({ length: 4 }, (_, i) =>
        new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (3 - i), 1)),
      );
      const rangeStart = monthStarts[0];
      const rangeEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

      const rangeEntries = await tx.supplierLedgerEntry.findMany({
        where: { ...where, createdAt: { gte: rangeStart, lt: rangeEnd } },
        select: { type: true, amount: true, createdAt: true },
      });

      const monthlyBreakdown = monthStarts.map((start) => {
        const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
        const inMonth = rangeEntries.filter((e) => e.createdAt >= start && e.createdAt < end);
        const sumOf = (types: string[]) =>
          this.round2(
            inMonth
              .filter((e) => types.includes(e.type))
              .reduce((s, e) => s + Number(e.amount), 0),
          );
        return {
          year: start.getUTCFullYear(),
          month: start.getUTCMonth() + 1,
          invoiceTotal: sumOf(['INVOICE']),
          paymentTotal: sumOf(['PAYMENT']),
          rebateTotal: sumOf(['CIRO_PRIMI', 'FIRMA_GERI_ODEMESI']),
          returnTotal: sumOf(['IADE_FATURASI']),
        };
      });

      return {
        supplierId,
        supplierName: supplier.name,
        balance: this.round2(balance),
        recentEntries,
        recentRebates,
        recentReturns,
        monthlyBreakdown,
      };
    });
  }

  // Tedarikçi bakiyesine elle yeni bir hareket ekler (gerçek ödeme, ciro
  // primi ya da firma geri ödemesi). Üst sınır kontrolü BİLEREK yok —
  // negatif bakiye açıkça izin verilen, beklenen bir senaryo (görev
  // notları); bir üst sınır koymak bu tasarım kararıyla çelişirdi.
  async addSupplierLedgerEntry(
    branchId: string,
    supplierId: string,
    dto: CreateLedgerEntryDto,
    user: DebtUser,
  ) {
    return withTenantContext(this.prisma, { tenantId: user.tenantId }, async (tx) => {
      this.assertAllowed(user);

      const supplier = await tx.supplier.findFirst({
        where: { id: supplierId },
        select: { id: true, tenantId: true },
      });
      assertTenantOwnership(supplier, {
        resourceType: 'Supplier',
        resourceId: supplierId,
        user,
        notFoundMessage: 'Tedarikçi bulunamadı',
        securityEvents: this.securityEvents,
      });

      return tx.supplierLedgerEntry.create({
        data: {
          tenantId: user.tenantId,
          branchId,
          supplierId,
          type: dto.type,
          amount: dto.amount,
          createdBy: user.userId,
        },
      });
    });
  }
}
