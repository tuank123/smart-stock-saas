import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSupplierDto, LinkBranchSupplierDto } from './dto/supplier.dto';

@Injectable()
export class SuppliersService {
  constructor(private prisma: PrismaService) {}

  async createSupplier(dto: CreateSupplierDto, user: { tenantId: string }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${user.tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      return tx.supplier.create({
        data: {
          tenantId: user.tenantId,
          name: dto.name,
          contactName: dto.contactName,
          whatsappNumber: dto.whatsappNumber,
          notes: dto.notes,
        },
      });
    });
  }

  async linkBranch(
    supplierId: string,
    branchId: string,
    dto: LinkBranchSupplierDto,
    user: { tenantId: string },
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${user.tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      const supplier = await tx.supplier.findUnique({
        where: { id: supplierId },
        select: { tenantId: true },
      });
      if (!supplier || supplier.tenantId !== user.tenantId) {
        throw new NotFoundException('Tedarikçi bulunamadı');
      }

      const branch = await tx.branch.findUnique({
        where: { id: branchId },
        select: { tenantId: true },
      });
      if (!branch || branch.tenantId !== user.tenantId) {
        throw new NotFoundException('Şube bulunamadı');
      }

      try {
        return await tx.branchSupplier.create({
          data: { branchId, supplierId, isPrimary: dto.isPrimary ?? false, notes: dto.notes },
          include: { supplier: { select: { name: true } }, branch: { select: { name: true } } },
        });
      } catch (e: any) {
        if (e.code === 'P2002') {
          throw new ConflictException('Bu şube-tedarikçi ilişkisi zaten mevcut');
        }
        throw e;
      }
    });
  }

  async listSuppliers(user: { tenantId: string }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${user.tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      return tx.supplier.findMany({
        where: { tenantId: user.tenantId, isActive: true, deletedAt: null },
        include: {
          branchSuppliers: {
            include: { branch: { select: { id: true, name: true } } },
          },
        },
        orderBy: { name: 'asc' },
      });
    });
  }
}
