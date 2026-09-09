import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SecurityEventLogger } from '../../common/security-event/security-event.service';
import { assertTenantOwnership } from '../../common/utils/assert-tenant-ownership';
import { withTenantContext } from '../../common/utils/tenant-context';
import { findFuzzyMatches } from '../../common/utils/fuzzyMatch';

// Substring araması sonuç bulamazsa fuzzy fallback için taranacak aday üst sınırı.
const FUZZY_CANDIDATE_LIMIT = 500;
const FUZZY_RESULT_LIMIT = 10;
import { CreateProductDto, PatchUnitsPerCaseDto, ProductQueryDto } from './dto/product.dto';

@Injectable()
export class ProductsService {
  constructor(
    private prisma: PrismaService,
    private securityEvents: SecurityEventLogger,
  ) {}

  async createProduct(dto: CreateProductDto, user: { tenantId: string }) {
    return withTenantContext(this.prisma, { tenantId: user.tenantId }, async (tx) => {

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
    return withTenantContext(this.prisma, { tenantId: user.tenantId }, async (tx) => {

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

      const page = query.page ?? 1;
      const pageSize = query.pageSize ?? 50;

      const [items, total] = await Promise.all([
        tx.product.findMany({
          where,
          include: { category: { select: { id: true, name: true } } },
          orderBy: { name: 'asc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        tx.product.count({ where }),
      ]);

      // Substring araması sonuç bulamadıysa (yalnızca bu durumda — her aramada
      // yüzlerce ürünü çekip skorlamak performans regresyonuna yol açar) tenant'ın
      // adaylarını çekip JS tarafında fuzzy skorla. Fuzzy eşleştirme SQL seviyesinde
      // yapılamadığı için bu, OCR/WhatsApp akışlarıyla aynı desen.
      if (total === 0 && query.search) {
        const { OR: _search, ...candidateWhere } = where;

        const candidates = await tx.product.findMany({
          where: candidateWhere,
          include: { category: { select: { id: true, name: true } } },
          take: FUZZY_CANDIDATE_LIMIT,
        });

        const matches = findFuzzyMatches(
          query.search,
          candidates.map((c) => ({ id: c.id, name: c.name })),
          70,
          FUZZY_RESULT_LIMIT,
        );

        const byId = new Map(candidates.map((c) => [c.id, c]));
        const fuzzyItems = matches
          .map((m) => byId.get(m.id))
          .filter((c): c is (typeof candidates)[number] => c !== undefined);

        return {
          items: fuzzyItems,
          total: fuzzyItems.length,
          page: 1,
          pageSize: fuzzyItems.length,
          matchType: 'fuzzy' as const,
        };
      }

      return { items, total, page, pageSize, matchType: 'exact' as const };
    });
  }

  async getProduct(id: string, user: { tenantId: string }) {
    return withTenantContext(this.prisma, { tenantId: user.tenantId }, async (tx) => {

      const product = await tx.product.findUnique({
        where: { id },
        include: { category: { select: { id: true, name: true } } },
      });

      // Yumuşak-silinmiş ürün gerçekten "yok" sayılır (cross-tenant değil) —
      // assertTenantOwnership'e bu durumda null geçilir ki loglanmasın.
      assertTenantOwnership(product?.deletedAt ? null : product, {
        resourceType: 'Product',
        resourceId: id,
        user,
        notFoundMessage: 'Ürün bulunamadı',
        securityEvents: this.securityEvents,
      });

      return product;
    });
  }

  async updateUnitsPerCase(
    productId: string,
    dto: PatchUnitsPerCaseDto,
    user: { tenantId: string; role?: string | null; planId?: string | null },
  ) {
    // Çok-şubeli PATRON bu işlemi yapamaz — yalnız SUBE_MUDURU veya tek şubeli PATRON.
    if (user.role === 'PATRON' && user.planId !== 'STARTER') {
      throw new ForbiddenException(
        'Bu işlem yalnızca şube müdürleri veya tek şubeli işletme sahipleri tarafından yapılabilir',
      );
    }

    return withTenantContext(this.prisma, { tenantId: user.tenantId }, async (tx) => {

      const product = await tx.product.findUnique({ where: { id: productId } });
      assertTenantOwnership(product?.deletedAt ? null : product, {
        resourceType: 'Product',
        resourceId: productId,
        user,
        notFoundMessage: 'Ürün bulunamadı',
        securityEvents: this.securityEvents,
      });

      return tx.product.update({
        where: { id: productId },
        data: { unitsPerCase: dto.unitsPerCase },
        include: { category: { select: { id: true, name: true } } },
      });
    });
  }
}
