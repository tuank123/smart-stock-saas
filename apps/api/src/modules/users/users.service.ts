import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

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

      if (!branch || branch.tenantId !== user.tenantId) {
        throw new NotFoundException('Şube bulunamadı');
      }

      return tx.user.findMany({
        where: {
          tenantId: user.tenantId,
          branchId,
          deletedAt: null,
        },
        select: {
          id: true,
          email: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      });
    });
  }
}
