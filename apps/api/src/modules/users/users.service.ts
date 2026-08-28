import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SecurityEventLogger } from '../../common/security-event/security-event.service';
import { assertTenantOwnership } from '../../common/utils/assert-tenant-ownership';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private securityEvents: SecurityEventLogger,
  ) {}

  async listByBranch(
    branchId: string,
    user: { tenantId: string; branchId?: string | null; role?: string | null },
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${user.tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      if (user.role === 'SUBE_MUDURU' && user.branchId !== branchId) {
        throw new ForbiddenException('Bu şubenin personeline erişim yetkiniz yok');
      }

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

      return tx.user.findMany({
        where: {
          tenantId: user.tenantId,
          branchId,
          deletedAt: null,
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      });
    });
  }
}
