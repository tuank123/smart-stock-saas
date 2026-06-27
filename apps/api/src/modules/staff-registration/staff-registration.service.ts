import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AssignRoleDto,
  RequestRegistrationDto,
  VerifyTokenDto,
} from './dto/staff-registration.dto';
import { UserRole } from '@prisma/client';

@Injectable()
export class StaffRegistrationService {
  constructor(private prisma: PrismaService) {}

  async requestRegistration(dto: RequestRegistrationDto) {
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const tokenString = this.generateToken();

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'true'`);

      const tenant = await tx.tenant.findFirst({
        where: { companyName: dto.companyName, deletedAt: null, status: 'ACTIVE' },
        select: { id: true },
      });

      if (!tenant) throw new NotFoundException('Şirket bulunamadı');

      await tx.$executeRawUnsafe(`SET app.tenant_id = '${tenant.id}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          branchId: dto.branchId,
          email: dto.applicantEmail,
          fullName: dto.applicantName,
          passwordHash,
          role: null,
          isActive: false,
        },
      });

      const token = await tx.staffRegistrationToken.create({
        data: {
          tenantId: tenant.id,
          branchId: dto.branchId,
          token: tokenString,
          applicantName: dto.applicantName,
          applicantEmail: dto.applicantEmail,
          createdUserId: user.id,
        },
      });

      return { message: 'Talebiniz iletildi', tokenId: token.id };
    });
  }

  async listPending(branchId: string, user: { tenantId: string }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${user.tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      return tx.staffRegistrationToken.findMany({
        where: { branchId, status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
      });
    });
  }

  async approveToken(tokenId: string, user: { userId: string; tenantId: string }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${user.tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      const existing = await tx.staffRegistrationToken.findUnique({
        where: { id: tokenId },
        select: { id: true, status: true, token: true },
      });

      if (!existing) throw new NotFoundException('Token bulunamadı');
      if (existing.status !== 'PENDING') {
        throw new BadRequestException('Yalnızca PENDING tokenlar onaylanabilir');
      }

      await tx.staffRegistrationToken.update({
        where: { id: tokenId },
        data: {
          status: 'APPROVED',
          approvedBy: user.userId,
          approvedAt: new Date(),
        },
      });

      return { token: existing.token };
    });
  }

  async verifyToken(dto: VerifyTokenDto) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'true'`);

      const registrationToken = await tx.staffRegistrationToken.findUnique({
        where: { token: dto.token },
        select: { id: true, status: true, tenantId: true, createdUserId: true },
      });

      if (!registrationToken || registrationToken.status !== 'APPROVED') {
        throw new BadRequestException('Geçersiz veya onaylanmamış token');
      }

      await tx.$executeRawUnsafe(`SET app.tenant_id = '${registrationToken.tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      await tx.user.update({
        where: { id: registrationToken.createdUserId! },
        data: { isActive: true },
      });

      await tx.staffRegistrationToken.update({
        where: { id: registrationToken.id },
        data: { status: 'USED', usedAt: new Date() },
      });

      return { message: 'Hesabınız aktif, müdürünüz rol atayacak' };
    });
  }

  async assignRole(
    userId: string,
    dto: AssignRoleDto,
    user: { tenantId: string },
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${user.tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      const target = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, tenantId: true },
      });

      if (!target) throw new NotFoundException('Kullanıcı bulunamadı');

      await tx.user.update({
        where: { id: userId },
        data: { role: dto.role as UserRole },
      });

      return { message: 'Rol atandı' };
    });
  }

  private generateToken(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    return Array.from(randomBytes(8))
      .map((b) => chars[b % chars.length])
      .join('');
  }
}
