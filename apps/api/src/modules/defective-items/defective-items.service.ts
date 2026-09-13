import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SecurityEventLogger } from '../../common/security-event/security-event.service';
import { assertTenantOwnership } from '../../common/utils/assert-tenant-ownership';
import { withTenantContext } from '../../common/utils/tenant-context';
import { DataIntegrityException } from '../../common/exceptions/data-integrity.exception';
import { CreateDefectiveItemDto } from './dto/defective-item.dto';

type DefectiveItemUser = {
  tenantId: string;
  userId: string;
  role?: string | null;
  planId?: string | null;
};

const PRODUCT_SELECT = { product: { select: { id: true, sku: true, name: true, unit: true } } };

@Injectable()
export class DefectiveItemsService {
  constructor(
    private prisma: PrismaService,
    private securityEvents: SecurityEventLogger,
  ) {}

  // Bu özellik yalnızca tek şubeli (STARTER) PATRON'a açık — Fire (SUBE_MUDURU)
  // ile hiç kesişmiyor, ayrı bir akış (bkz. görev notları).
  private assertAllowed(user: DefectiveItemUser) {
    if (user.role === 'PATRON' && user.planId !== 'STARTER') {
      throw new ForbiddenException(
        'Bu işlem yalnızca tek şubeli işletme sahipleri tarafından yapılabilir',
      );
    }
  }

  async create(branchId: string, dto: CreateDefectiveItemDto, user: DefectiveItemUser) {
    return withTenantContext(this.prisma, { tenantId: user.tenantId }, async (tx) => {
      this.assertAllowed(user);

      const level = await tx.stockLevel.findUnique({
        where: { productId_branchId: { productId: dto.productId, branchId } },
        select: { id: true, tenantId: true, quantity: true },
      });

      if (!level || level.tenantId !== user.tenantId) {
        throw new NotFoundException('Stok kaydı bulunamadı');
      }

      // recordWaste ile aynı kontrol: miktar mevcut stoktan fazlaysa reddedilir.
      if (Number(level.quantity) < dto.quantity) {
        throw new BadRequestException(`Yetersiz stok (mevcut: ${level.quantity})`);
      }

      const report = await tx.defectiveItemReport.create({
        data: {
          tenantId: user.tenantId,
          branchId,
          productId: dto.productId,
          quantity: dto.quantity,
          photoBase64: dto.photoBase64,
          status: 'PENDING',
          createdBy: user.userId,
        },
        include: PRODUCT_SELECT,
      });

      await Promise.all([
        tx.stockMovement.create({
          data: {
            tenantId: user.tenantId,
            productId: dto.productId,
            branchId,
            movementType: 'DEFECTIVE_OUT',
            quantity: -dto.quantity,
            referenceId: report.id,
            referenceType: 'DEFECTIVE_ITEM_REPORT',
            createdBy: user.userId,
          },
        }),
        tx.stockLevel.update({
          where: { id: level.id },
          data: { quantity: { decrement: dto.quantity } },
        }),
      ]);

      // ── Bütünlük kontrolü: recordWaste ile aynı gerekçe — ön-kontrol tek
      // başına yarış durumuna karşı yeterli değil; düşüşten SONRA gerçek DB
      // değeri yeniden okunarak asıl garanti alınır.
      const finalLevel = await tx.stockLevel.findUnique({
        where: { id: level.id },
        select: { quantity: true },
      });

      if (finalLevel && Number(finalLevel.quantity) < 0) {
        await this.prisma.errorLog
          .create({
            data: {
              source: 'DATA_INTEGRITY',
              severity: 'ERROR',
              message: 'Ürün zayiatı kaydı sonrası stok negatife düştü',
              tenantId: user.tenantId,
              branchId,
              context: {
                productId: dto.productId,
                quantity: dto.quantity,
                stockLevelId: level.id,
                quantityAfter: Number(finalLevel.quantity),
              },
            },
          })
          .catch(() => undefined);

        throw new DataIntegrityException('defective item report caused negative stock level');
      }

      return report;
    });
  }

  async listPending(branchId: string, user: DefectiveItemUser) {
    return withTenantContext(this.prisma, { tenantId: user.tenantId }, async (tx) => {
      this.assertAllowed(user);

      return tx.defectiveItemReport.findMany({
        where: { branchId, status: 'PENDING' },
        include: PRODUCT_SELECT,
        orderBy: { createdAt: 'desc' },
      });
    });
  }

  private async findResolvable(tx: Prisma.TransactionClient, id: string, user: DefectiveItemUser) {
    const report = await tx.defectiveItemReport.findFirst({ where: { id } });
    assertTenantOwnership(report, {
      resourceType: 'DefectiveItemReport',
      resourceId: id,
      user,
      notFoundMessage: 'Zayiat kaydı bulunamadı',
      securityEvents: this.securityEvents,
    });
    if (report.status !== 'PENDING') {
      throw new BadRequestException('Bu kayıt zaten çözümlenmiş');
    }
    return report;
  }

  // "Ziyan Oldu" — kalıcı zayiat. Stok zaten create() sırasında düşülmüştü,
  // burada tekrar dokunulmaz.
  async markWasted(id: string, user: DefectiveItemUser) {
    return withTenantContext(this.prisma, { tenantId: user.tenantId }, async (tx) => {
      this.assertAllowed(user);
      await this.findResolvable(tx, id, user);

      return tx.defectiveItemReport.update({
        where: { id },
        data: { status: 'WASTED', resolvedAt: new Date(), resolvedBy: user.userId },
        include: PRODUCT_SELECT,
      });
    });
  }

  // "Değişim Gerçekleşti" — ürün tedarikçiden değiştirildi, stoğa GERİ eklenir.
  async markExchanged(id: string, user: DefectiveItemUser) {
    return withTenantContext(this.prisma, { tenantId: user.tenantId }, async (tx) => {
      this.assertAllowed(user);
      const report = await this.findResolvable(tx, id, user);

      const updated = await tx.defectiveItemReport.update({
        where: { id },
        data: { status: 'EXCHANGED', resolvedAt: new Date(), resolvedBy: user.userId },
        include: PRODUCT_SELECT,
      });

      await tx.stockMovement.create({
        data: {
          tenantId: user.tenantId,
          productId: report.productId,
          branchId: report.branchId,
          movementType: 'DEFECTIVE_RETURN_IN',
          quantity: report.quantity,
          referenceId: report.id,
          referenceType: 'DEFECTIVE_ITEM_REPORT',
          createdBy: user.userId,
        },
      });

      await tx.stockLevel.updateMany({
        where: { productId: report.productId, branchId: report.branchId },
        data: { quantity: { increment: report.quantity } },
      });

      return updated;
    });
  }
}
