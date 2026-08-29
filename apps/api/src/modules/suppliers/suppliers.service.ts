import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SecurityEventLogger } from '../../common/security-event/security-event.service';
import { assertTenantOwnership } from '../../common/utils/assert-tenant-ownership';
import { withTenantContext } from '../../common/utils/tenant-context';
import { CreateSupplierDto, LinkBranchSupplierDto, UpdateSupplierDto } from './dto/supplier.dto';

@Injectable()
export class SuppliersService {
  constructor(
    private prisma: PrismaService,
    private securityEvents: SecurityEventLogger,
  ) {}

  async createSupplier(dto: CreateSupplierDto, user: { tenantId: string }) {
    return withTenantContext(this.prisma, { tenantId: user.tenantId }, async (tx) => {

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
    return withTenantContext(this.prisma, { tenantId: user.tenantId }, async (tx) => {

      const supplier = await tx.supplier.findUnique({
        where: { id: supplierId },
        select: { tenantId: true },
      });
      assertTenantOwnership(supplier, {
        resourceType: 'Supplier',
        resourceId: supplierId,
        user,
        notFoundMessage: 'Tedarikçi bulunamadı',
        securityEvents: this.securityEvents,
      });

      const branch = await tx.branch.findUnique({
        where: { id: branchId },
        select: { tenantId: true },
      });
      assertTenantOwnership(branch, {
        resourceType: 'Branch',
        resourceId: branchId,
        user,
        notFoundMessage: 'Şube bulunamadı',
        securityEvents: this.securityEvents,
      });

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

  async getSupplier(supplierId: string, user: { tenantId: string }) {
    return withTenantContext(this.prisma, { tenantId: user.tenantId }, async (tx) => {

      const supplier = await tx.supplier.findUnique({
        where: { id: supplierId },
        include: {
          branchSuppliers: {
            include: { branch: { select: { id: true, name: true } } },
          },
        },
      });

      assertTenantOwnership(supplier, {
        resourceType: 'Supplier',
        resourceId: supplierId,
        user,
        notFoundMessage: 'Tedarikçi bulunamadı',
        securityEvents: this.securityEvents,
      });

      return supplier;
    });
  }

  async updateSupplier(
    supplierId: string,
    dto: UpdateSupplierDto,
    user: { tenantId: string },
  ) {
    if (!dto.name && !dto.contactName && !dto.whatsappNumber && !dto.notes) {
      throw new BadRequestException('En az bir alan güncellenmelidir');
    }

    return withTenantContext(this.prisma, { tenantId: user.tenantId }, async (tx) => {

      const existing = await tx.supplier.findUnique({
        where: { id: supplierId },
        select: { tenantId: true },
      });

      assertTenantOwnership(existing, {
        resourceType: 'Supplier',
        resourceId: supplierId,
        user,
        notFoundMessage: 'Tedarikçi bulunamadı',
        securityEvents: this.securityEvents,
      });

      return tx.supplier.update({
        where: { id: supplierId },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.contactName !== undefined && { contactName: dto.contactName }),
          ...(dto.whatsappNumber !== undefined && { whatsappNumber: dto.whatsappNumber }),
          ...(dto.notes !== undefined && { notes: dto.notes }),
        },
        include: {
          branchSuppliers: {
            include: { branch: { select: { id: true, name: true } } },
          },
        },
      });
    });
  }

  async listSuppliers(user: { tenantId: string }) {
    return withTenantContext(this.prisma, { tenantId: user.tenantId }, async (tx) => {

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
