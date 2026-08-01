import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { SmsService } from '../sms/sms.service';
import {
  DailyReportQueryDto,
  InitializeStockDto,
  MovementQueryDto,
  PriceChangeQueryDto,
  RecordSaleDto,
  StockBarcodeQueryDto,
  StockQueryDto,
  UpdateThresholdDto,
  WasteStockDto,
} from './dto/stock.dto';

// Verilen takvim gününü closingTime (HH:mm) saatinde yerel Date olarak kurar.
// Bir "iş günü" D, [D@closingTime, (D+1)@closingTime) aralığıdır.
// closingTime='00:00' iken bu, normal gece yarısı sınırıyla birebir aynı sonucu verir.
function atClosing(year: number, month: number, day: number, closingTime: string): Date {
  const [h, m] = closingTime.split(':').map(Number);
  return new Date(year, month, day, h || 0, m || 0, 0, 0);
}

@Injectable()
export class StockService {
  private readonly logger = new Logger(StockService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private sms: SmsService,
  ) {}

  async initializeStock(dto: InitializeStockDto, user: { tenantId: string }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${user.tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      const existing = await tx.stockLevel.findFirst({
        where: {
          branchId: dto.branchId,
          productId: { in: dto.items.map((i) => i.productId) },
        },
        select: { productId: true },
      });

      if (existing) {
        throw new ConflictException(
          `Ürün (${existing.productId}) için bu şubede stok kaydı zaten mevcut`,
        );
      }

      const levels = await Promise.all(
        dto.items.map((item) => {
          const minThreshold = Math.max(1, Math.floor(item.quantity * 0.2));
          return tx.stockLevel.create({
            data: {
              tenantId: user.tenantId,
              branchId: dto.branchId,
              productId: item.productId,
              quantity: item.quantity,
              minThreshold,
              maxThresholdSet: false,
              thresholdSource: 'AUTO',
            },
          });
        }),
      );

      return levels;
    });
  }

  async listStock(
    branchId: string,
    query: StockQueryDto,
    user: { tenantId: string },
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${user.tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      const levels = await tx.stockLevel.findMany({
        where: { branchId, tenantId: user.tenantId },
        include: {
          product: {
            select: { id: true, sku: true, name: true, unit: true, barcode: true, unitsPerCase: true },
          },
        },
        orderBy: { product: { name: 'asc' } },
      });

      if (query.critical) {
        return levels.filter((l) => l.quantity.lessThan(l.minThreshold));
      }

      return levels;
    });
  }

  async getStockLevel(
    branchId: string,
    productId: string,
    user: { tenantId: string },
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${user.tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      const level = await tx.stockLevel.findUnique({
        where: { productId_branchId: { productId, branchId } },
        include: {
          product: {
            select: { id: true, sku: true, name: true, unit: true, unitsPerCase: true },
          },
        },
      });

      if (!level || level.tenantId !== user.tenantId) {
        throw new NotFoundException('Stok kaydı bulunamadı');
      }

      return level;
    });
  }

  async queryByBarcode(
    query: StockBarcodeQueryDto,
    user: { tenantId: string; branchId: string },
  ) {
    if (!query.barcode && !query.sku && !query.search) {
      throw new BadRequestException('barcode, sku veya search parametresi gereklidir');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${user.tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      const OR: Prisma.ProductWhereInput[] = [];
      if (query.barcode) OR.push({ barcode: query.barcode });
      if (query.sku) OR.push({ sku: query.sku });
      if (query.search) OR.push({ name: { contains: query.search, mode: 'insensitive' } });

      return tx.stockLevel.findMany({
        where: {
          tenantId: user.tenantId,
          branchId: user.branchId,
          product: { OR },
        },
        include: {
          product: { select: { id: true, sku: true, name: true, unit: true, barcode: true, unitsPerCase: true, salePrice: true } },
        },
      });
    });
  }

  async listMovements(
    branchId: string,
    query: MovementQueryDto,
    user: { tenantId: string },
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${user.tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      const where: Prisma.StockMovementWhereInput = { tenantId: user.tenantId, branchId };
      if (query.type) where.movementType = query.type;
      if (query.since) where.createdAt = { gte: new Date(query.since) };

      return tx.stockMovement.findMany({
        where,
        include: {
          product: { select: { id: true, sku: true, name: true, unit: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
    });
  }

  async recordWaste(
    branchId: string,
    dto: WasteStockDto,
    user: { tenantId: string; userId: string },
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${user.tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      const level = await tx.stockLevel.findUnique({
        where: { productId_branchId: { productId: dto.productId, branchId } },
        select: { id: true, tenantId: true },
      });

      if (!level || level.tenantId !== user.tenantId) {
        throw new NotFoundException('Stok kaydı bulunamadı');
      }

      // Store the waste photo. Same pattern as PortalService.uploadPdf: when S3
      // is disabled we only mint a deterministic mock key (no real upload).
      const s3Enabled = this.config.get('S3_ENABLED') === 'true';
      const timestamp = Date.now();
      const photoUrl = s3Enabled
        ? `s3://stokpilot-uploads/waste/${timestamp}.jpg`
        : `mock-s3/waste-${timestamp}.jpg`;

      const [movement] = await Promise.all([
        tx.stockMovement.create({
          data: {
            tenantId: user.tenantId,
            productId: dto.productId,
            branchId,
            movementType: 'WASTE',
            quantity: -dto.quantity,
            createdBy: user.userId,
            notes: dto.reason,
            photoUrl,
          },
          include: {
            product: { select: { id: true, sku: true, name: true, unit: true } },
          },
        }),
        tx.stockLevel.update({
          where: { id: level.id },
          data: { quantity: { decrement: dto.quantity } },
        }),
      ]);

      return movement;
    });
  }

  /**
   * Geçici Kasa — sepet bazlı satış. Tüm kalemler tek bir transaction'da
   * işlenir (referenceId = transactionId ile bağlanır). Bir kalem bile
   * başarısız olursa ($transaction) hiçbir kalem kalıcı olmaz.
   */
  async recordSale(
    branchId: string,
    dto: RecordSaleDto,
    user: { tenantId: string; userId: string; role?: string | null; planId?: string | null },
  ) {
    type SaleMovement = Prisma.StockMovementGetPayload<{
      include: { product: { select: { id: true; sku: true; name: true; unit: true } } };
    }>;

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${user.tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);
      if (user.role === 'PATRON' && user.planId !== 'STARTER') {
        throw new ForbiddenException(
          'Bu işlem yalnızca tek şubeli işletme sahipleri tarafından yapılabilir',
        );
      }

      // Tüm kalemlerin paylaştığı tek satış referansı.
      const transactionId = randomUUID();
      const movements: SaleMovement[] = [];

      for (const item of dto.items) {
        // a. Ürün (salePrice dahil)
        const product = await tx.product.findUnique({
          where: { id: item.productId },
          select: { id: true, name: true, tenantId: true, salePrice: true },
        });
        if (!product || product.tenantId !== user.tenantId) {
          throw new NotFoundException('Ürün bulunamadı');
        }

        // b. Satış fiyatı belirlenmemiş
        if (product.salePrice == null) {
          throw new BadRequestException(
            `${product.name} için satış fiyatı belirlenmemiş, önce fiyat girin`,
          );
        }

        // c. Stok kaydı + yeterlilik
        const level = await tx.stockLevel.findUnique({
          where: { productId_branchId: { productId: item.productId, branchId } },
          select: { id: true, quantity: true },
        });
        if (!level) {
          throw new NotFoundException(`${product.name} için stok kaydı bulunamadı`);
        }
        if (Number(level.quantity) < item.quantity) {
          throw new BadRequestException(
            `${product.name} için yetersiz stok (mevcut: ${level.quantity})`,
          );
        }

        // d. Satış hareketi (fiyatı o anki salePrice ile dondur)
        const movement = await tx.stockMovement.create({
          data: {
            tenantId: user.tenantId,
            productId: item.productId,
            branchId,
            movementType: 'SALE',
            quantity: -item.quantity,
            unitPrice: product.salePrice,
            paymentMethod: dto.paymentMethod,
            cashierSessionId: dto.cashierSessionId ?? null,
            referenceId: transactionId,
            referenceType: 'SALE_TRANSACTION',
            createdBy: user.userId,
          },
          include: {
            product: { select: { id: true, sku: true, name: true, unit: true } },
          },
        });

        // e. Stoktan düş
        await tx.stockLevel.update({
          where: { id: level.id },
          data: { quantity: { decrement: item.quantity } },
        });

        movements.push(movement);
      }

      const totalAmount = movements.reduce(
        (sum, m) => sum + Math.abs(Number(m.quantity)) * Number(m.unitPrice),
        0,
      );

      return {
        transactionId,
        items: movements,
        totalAmount: Math.round(totalAmount * 100) / 100,
        paymentMethod: dto.paymentMethod,
      };
    });

    // Satış commit edildi. Opsiyonel e-fiş SMS'i — transaction DIŞINDA gönderilir;
    // hata satışın başarısını etkilemesin (try/catch ile yutulur).
    let smsSent = false;
    if (dto.customerPhone) {
      const receiptLines = result.items
        .map((m) => {
          const qty = Math.abs(Number(m.quantity));
          const lineTotal = Math.round(qty * Number(m.unitPrice) * 100) / 100;
          return `${m.product.name} x${qty} = ${lineTotal}₺`;
        })
        .join('\n');
      const receiptText = `${receiptLines}\nToplam: ${result.totalAmount}₺, StokPilot'tan teşekkürler`;
      try {
        const smsRes = await this.sms.sendSms(dto.customerPhone, receiptText);
        smsSent = smsRes.success;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`[Sale SMS] Fiş gönderilemedi (${dto.customerPhone}): ${msg}`);
      }
    }

    return { ...result, smsSent };
  }

  // ── Geçici Kasa oturumları ──────────────────────────────────────────────────

  async openCashierSession(
    branchId: string,
    user: { tenantId: string; userId: string; role?: string | null; planId?: string | null },
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${user.tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);
      if (user.role === 'PATRON' && user.planId !== 'STARTER') {
        throw new ForbiddenException(
          'Bu işlem yalnızca tek şubeli işletme sahipleri tarafından yapılabilir',
        );
      }

      // Tek aktif oturum kuralı: yeni oturum açmadan önce bu şubede açık kalmış
      // ne varsa otomatik kapat → asla birden fazla açık oturum kalmaz.
      await tx.cashierSession.updateMany({
        where: { tenantId: user.tenantId, branchId, closedAt: null },
        data: { closedAt: new Date() },
      });

      const session = await tx.cashierSession.create({
        data: { tenantId: user.tenantId, branchId, openedBy: user.userId },
        select: { id: true },
      });
      return { sessionId: session.id };
    });
  }

  async closeCashierSession(
    branchId: string,
    sessionId: string,
    user: { tenantId: string; role?: string | null; planId?: string | null },
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${user.tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);
      if (user.role === 'PATRON' && user.planId !== 'STARTER') {
        throw new ForbiddenException(
          'Bu işlem yalnızca tek şubeli işletme sahipleri tarafından yapılabilir',
        );
      }

      const session = await tx.cashierSession.findUnique({
        where: { id: sessionId },
        select: { id: true, tenantId: true },
      });
      if (!session || session.tenantId !== user.tenantId) {
        throw new NotFoundException('Kasa oturumu bulunamadı');
      }

      await tx.cashierSession.update({
        where: { id: sessionId },
        data: { closedAt: new Date() },
      });
      return { closed: true };
    });
  }

  async listCashierSessions(
    branchId: string,
    user: { tenantId: string; role?: string | null; planId?: string | null },
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${user.tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);
      if (user.role === 'PATRON' && user.planId !== 'STARTER') {
        throw new ForbiddenException(
          'Bu işlem yalnızca tek şubeli işletme sahipleri tarafından yapılabilir',
        );
      }

      const sessions = await tx.cashierSession.findMany({
        where: { tenantId: user.tenantId, branchId },
        orderBy: { openedAt: 'desc' },
        select: { id: true, openedAt: true, closedAt: true },
      });

      const sessionIds = sessions.map((s) => s.id);
      const movements = sessionIds.length
        ? await tx.stockMovement.findMany({
            where: { cashierSessionId: { in: sessionIds }, movementType: 'SALE' },
            orderBy: { createdAt: 'asc' },
            select: {
              cashierSessionId: true,
              productId: true,
              quantity: true,
              unitPrice: true,
              referenceId: true,
              paymentMethod: true,
              createdAt: true,
              product: { select: { name: true } },
            },
          })
        : [];

      // session → product bazında toplam (mevcut).
      const bySession = new Map<
        string,
        Map<string, { productName: string; totalQuantity: number; totalAmount: number }>
      >();
      // session → fiş (referenceId/transactionId) bazında döküm (yeni).
      type Receipt = {
        transactionId: string;
        createdAt: Date;
        paymentMethod: string;
        items: { productName: string; quantity: number; unitPrice: number; lineTotal: number }[];
        total: number;
      };
      const receiptsBySession = new Map<string, Map<string, Receipt>>();

      for (const m of movements) {
        if (!m.cashierSessionId) continue;
        const qty = Math.abs(Number(m.quantity));
        const unitPrice = Number(m.unitPrice ?? 0);
        const amount = qty * unitPrice;

        // ── Ürün bazında toplam ──
        let pmap = bySession.get(m.cashierSessionId);
        if (!pmap) {
          pmap = new Map();
          bySession.set(m.cashierSessionId, pmap);
        }
        const existing = pmap.get(m.productId);
        if (existing) {
          existing.totalQuantity += qty;
          existing.totalAmount += amount;
        } else {
          pmap.set(m.productId, {
            productName: m.product.name,
            totalQuantity: qty,
            totalAmount: amount,
          });
        }

        // ── Fiş bazında döküm ──
        if (m.referenceId) {
          let rmap = receiptsBySession.get(m.cashierSessionId);
          if (!rmap) {
            rmap = new Map();
            receiptsBySession.set(m.cashierSessionId, rmap);
          }
          let receipt = rmap.get(m.referenceId);
          if (!receipt) {
            receipt = {
              transactionId: m.referenceId,
              createdAt: m.createdAt,
              paymentMethod: m.paymentMethod ?? '',
              items: [],
              total: 0,
            };
            rmap.set(m.referenceId, receipt);
          }
          receipt.items.push({
            productName: m.product.name,
            quantity: qty,
            unitPrice,
            lineTotal: Math.round(amount * 100) / 100,
          });
          receipt.total += amount;
        }
      }

      return sessions.map((s) => {
        const pmap = bySession.get(s.id);
        const items = pmap
          ? Array.from(pmap.values()).map((i) => ({
              productName: i.productName,
              totalQuantity: i.totalQuantity,
              totalAmount: Math.round(i.totalAmount * 100) / 100,
            }))
          : [];
        const sessionTotal =
          Math.round(items.reduce((sum, i) => sum + i.totalAmount, 0) * 100) / 100;

        const rmap = receiptsBySession.get(s.id);
        const receipts = rmap
          ? Array.from(rmap.values()).map((r) => ({
              transactionId: r.transactionId,
              createdAt: r.createdAt,
              paymentMethod: r.paymentMethod,
              items: r.items,
              total: Math.round(r.total * 100) / 100,
            }))
          : [];

        return { id: s.id, openedAt: s.openedAt, closedAt: s.closedAt, items, sessionTotal, receipts };
      });
    });
  }

  async getDailyReport(
    branchId: string,
    dto: DailyReportQueryDto,
    user: { tenantId: string; role?: string | null; planId?: string | null },
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${user.tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);
      if (user.role === 'PATRON' && user.planId !== 'STARTER') {
        throw new ForbiddenException(
          'Bu işlem yalnızca tek şubeli işletme sahipleri tarafından yapılabilir',
        );
      }

      // Şubenin kapanış saatine göre iş günü sınırları.
      const branch = await tx.branch.findUnique({
        where: { id: branchId },
        select: { closingTime: true },
      });
      const closingTime = branch?.closingTime ?? '00:00';

      // Hedef gün: dto.date ?? bugün. İş günü = [D@closingTime, (D+1)@closingTime).
      const base = dto.date ? new Date(dto.date) : new Date();
      const y = base.getFullYear();
      const mo = base.getMonth();
      const da = base.getDate();
      const dayStart = atClosing(y, mo, da, closingTime);
      const dayEnd = new Date(atClosing(y, mo, da + 1, closingTime).getTime() - 1);
      const dateStr = `${y}-${String(mo + 1).padStart(2, '0')}-${String(da).padStart(2, '0')}`;

      // O günün SALE hareketleri.
      const movements = await tx.stockMovement.findMany({
        where: {
          tenantId: user.tenantId,
          branchId,
          movementType: 'SALE',
          createdAt: { gte: dayStart, lte: dayEnd },
        },
        select: {
          productId: true,
          quantity: true,
          unitPrice: true,
          cashierSessionId: true,
          product: { select: { id: true, name: true } },
        },
      });

      // Ürün bazında toplam miktar + ciro.
      const byProduct = new Map<
        string,
        { productId: string; productName: string; totalQty: number; totalRevenue: number }
      >();
      // Oturum bazında toplam satış tutarı.
      const revenueBySession = new Map<string, number>();
      let grossRevenue = 0;

      for (const m of movements) {
        const qty = Math.abs(Number(m.quantity));
        const revenue = qty * Number(m.unitPrice ?? 0);
        grossRevenue += revenue;

        const existing = byProduct.get(m.productId);
        if (existing) {
          existing.totalQty += qty;
          existing.totalRevenue += revenue;
        } else {
          byProduct.set(m.productId, {
            productId: m.productId,
            productName: m.product.name,
            totalQty: qty,
            totalRevenue: revenue,
          });
        }

        if (m.cashierSessionId) {
          revenueBySession.set(
            m.cashierSessionId,
            (revenueBySession.get(m.cashierSessionId) ?? 0) + revenue,
          );
        }
      }

      const round2 = (n: number) => Math.round(n * 100) / 100;
      const productList = Array.from(byProduct.values()).map((p) => ({
        productId: p.productId,
        productName: p.productName,
        totalQty: p.totalQty,
        totalRevenue: round2(p.totalRevenue),
      }));

      const topSellers = [...productList].sort((a, b) => b.totalQty - a.totalQty).slice(0, 10);
      const bottomSellers = [...productList].sort((a, b) => a.totalQty - b.totalQty).slice(0, 10);

      // O gün açılan kasa oturumları + oturum toplam satışı.
      const sessions = await tx.cashierSession.findMany({
        where: {
          tenantId: user.tenantId,
          branchId,
          openedAt: { gte: dayStart, lte: dayEnd },
        },
        orderBy: { openedAt: 'desc' },
        select: { id: true, openedAt: true, closedAt: true },
      });

      const cashierSessions = sessions.map((s) => ({
        id: s.id,
        openedAt: s.openedAt,
        closedAt: s.closedAt,
        sessionTotal: round2(revenueBySession.get(s.id) ?? 0),
      }));

      return {
        date: dateStr,
        grossRevenue: round2(grossRevenue),
        topSellers,
        bottomSellers,
        cashierSessions,
      };
    });
  }

  // Son `days` günün (bugün dahil) tarih + toplam ciro özeti.
  async getDailyReportHistory(
    branchId: string,
    days: number,
    user: { tenantId: string; role?: string | null; planId?: string | null },
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${user.tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);
      if (user.role === 'PATRON' && user.planId !== 'STARTER') {
        throw new ForbiddenException(
          'Bu işlem yalnızca tek şubeli işletme sahipleri tarafından yapılabilir',
        );
      }

      // Şubenin kapanış saatine göre iş günü sınırları.
      const branch = await tx.branch.findUnique({
        where: { id: branchId },
        select: { closingTime: true },
      });
      const closingTime = branch?.closingTime ?? '00:00';
      const [ch, cm] = closingTime.split(':').map(Number);
      const closingMs = ((ch || 0) * 60 + (cm || 0)) * 60_000;

      const span = Math.max(1, Math.floor(days) || 10);
      const now = new Date();
      const y = now.getFullYear();
      const mo = now.getMonth();
      const da = now.getDate();
      // İş günü D = [D@closingTime, (D+1)@closingTime). En eski gün: da-(span-1),
      // en yeni gün: bugün. Aralık: [en-eski@closing, (bugün+1)@closing).
      const rangeStart = atClosing(y, mo, da - (span - 1), closingTime);
      const rangeEnd = new Date(atClosing(y, mo, da + 1, closingTime).getTime() - 1);

      const movements = await tx.stockMovement.findMany({
        where: {
          tenantId: user.tenantId,
          branchId,
          movementType: 'SALE',
          createdAt: { gte: rangeStart, lte: rangeEnd },
        },
        select: { quantity: true, unitPrice: true, createdAt: true },
      });

      const fmtDay = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

      // Bir hareketin iş günü etiketi: zaman kapanış saati kadar geri kaydırılıp
      // takvim günü alınır (closingTime='00:00' iken normal takvim gününe eşit).
      const businessDayKey = (x: Date) => fmtDay(new Date(x.getTime() - closingMs));

      const revenueByDay = new Map<string, number>();
      for (const m of movements) {
        const key = businessDayKey(new Date(m.createdAt));
        const revenue = Math.abs(Number(m.quantity)) * Number(m.unitPrice ?? 0);
        revenueByDay.set(key, (revenueByDay.get(key) ?? 0) + revenue);
      }

      const round2 = (n: number) => Math.round(n * 100) / 100;
      // Her iş günü için (satış olmasa bile) kayıt üret; en yeni en üstte.
      const list: { date: string; grossRevenue: number }[] = [];
      for (let i = 0; i < span; i++) {
        const d = new Date(y, mo, da - i);
        const key = fmtDay(d);
        list.push({ date: key, grossRevenue: round2(revenueByDay.get(key) ?? 0) });
      }

      return { days: list };
    });
  }

  async listPriceChanges(
    branchId: string,
    query: PriceChangeQueryDto,
    user: { tenantId: string },
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${user.tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      return tx.priceChangeLog.findMany({
        where: { tenantId: user.tenantId, branchId },
        include: {
          product: { select: { id: true, sku: true, name: true } },
          changer: { select: { id: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: query.limit ?? 50,
        skip: query.offset ?? 0,
      });
    });
  }

  async updateThreshold(
    branchId: string,
    productId: string,
    dto: UpdateThresholdDto,
    user: { tenantId: string },
  ) {
    if (dto.minThreshold === undefined && dto.maxThreshold === undefined) {
      throw new BadRequestException('En az bir eşik değeri girilmelidir');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${user.tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      const level = await tx.stockLevel.findUnique({
        where: { productId_branchId: { productId, branchId } },
        select: { id: true, tenantId: true },
      });

      if (!level || level.tenantId !== user.tenantId) {
        throw new NotFoundException('Stok kaydı bulunamadı');
      }

      const data: Record<string, unknown> = { thresholdSource: 'MANUAL' };
      if (dto.minThreshold !== undefined) data.minThreshold = dto.minThreshold;
      if (dto.maxThreshold !== undefined) {
        data.maxThreshold = dto.maxThreshold;
        data.maxThresholdSet = true;
        data.maxThresholdSetAt = new Date();
      }

      return tx.stockLevel.update({
        where: { id: level.id },
        data,
      });
    });
  }
}
