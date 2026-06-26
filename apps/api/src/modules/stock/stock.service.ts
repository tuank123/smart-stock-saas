import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  InitializeStockDto,
  MovementQueryDto,
  PriceChangeQueryDto,
  StockBarcodeQueryDto,
  StockQueryDto,
  UpdateThresholdDto,
  WasteStockDto,
} from './dto/stock.dto';

@Injectable()
export class StockService {
  constructor(private prisma: PrismaService) {}

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
          product: { select: { id: true, sku: true, name: true, unit: true, barcode: true, unitsPerCase: true } },
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
