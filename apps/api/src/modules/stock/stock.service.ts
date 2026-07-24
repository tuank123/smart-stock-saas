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
  InitializeStockDto,
  MovementQueryDto,
  PriceChangeQueryDto,
  RecordSaleDto,
  StockBarcodeQueryDto,
  StockQueryDto,
  UpdateThresholdDto,
  WasteStockDto,
} from './dto/stock.dto';

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
