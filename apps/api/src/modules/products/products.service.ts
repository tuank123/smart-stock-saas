import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProductDto, PatchUnitsPerCaseDto, ProductQueryDto } from './dto/product.dto';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  async createProduct(dto: CreateProductDto, user: { tenantId: string }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${user.tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      try {
        return await tx.product.create({
          data: {
            tenantId: user.tenantId,
            categoryId: dto.categoryId,
            sku: dto.sku,
            name: dto.name,
            unit: dto.unit,
            barcode: dto.barcode,
            variants: (dto.variants as Prisma.InputJsonValue) ?? [],
          },
          include: { category: { select: { id: true, name: true } } },
        });
      } catch (e: any) {
        if (e.code === 'P2002') {
          throw new ConflictException(`'${dto.sku}' SKU'su bu tenant'ta zaten mevcut`);
        }
        throw e;
      }
    });
  }

  async listProducts(query: ProductQueryDto, user: { tenantId: string }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${user.tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      const where: Prisma.ProductWhereInput = {
        tenantId: user.tenantId,
        deletedAt: null,
        isActive: query.isActive !== undefined ? query.isActive : true,
      };

      if (query.categoryId) where.categoryId = query.categoryId;

      if (query.search) {
        where.OR = [
          { name: { contains: query.search, mode: 'insensitive' } },
          { sku: { contains: query.search, mode: 'insensitive' } },
          { barcode: { contains: query.search, mode: 'insensitive' } },
        ];
      }

      return tx.product.findMany({
        where,
        include: { category: { select: { id: true, name: true } } },
        orderBy: { name: 'asc' },
      });
    });
  }

  async getProduct(id: string, user: { tenantId: string }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${user.tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      const product = await tx.product.findUnique({
        where: { id },
        include: { category: { select: { id: true, name: true } } },
      });

      if (!product || product.tenantId !== user.tenantId || product.deletedAt) {
        throw new NotFoundException('Ürün bulunamadı');
      }

      return product;
    });
  }

  async updateUnitsPerCase(
    productId: string,
    dto: PatchUnitsPerCaseDto,
    user: { tenantId: string },
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${user.tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      const product = await tx.product.findUnique({ where: { id: productId } });
      if (!product || product.tenantId !== user.tenantId || product.deletedAt) {
        throw new NotFoundException('Ürün bulunamadı');
      }

      return tx.product.update({
        where: { id: productId },
        data: { unitsPerCase: dto.unitsPerCase },
        include: { category: { select: { id: true, name: true } } },
      });
    });
  }
}
