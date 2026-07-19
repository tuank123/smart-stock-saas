import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AssignRoleDto,
  CompleteRegistrationDto,
} from './dto/staff-registration.dto';
import { UserRole } from '@prisma/client';

@Injectable()
export class StaffRegistrationService {
  constructor(private prisma: PrismaService) {}

  // ─── STEP 1: manager mints a code for their branch ───────────────────────
  async generateCode(user: {
    userId: string;
    tenantId: string;
    branchId?: string | null;
  }) {
    if (!user.branchId) {
      throw new BadRequestException('Şube bilgisi bulunamadı');
    }

    const tokenString = this.generateToken();

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${user.tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      const token = await tx.staffRegistrationToken.create({
        data: {
          tenantId: user.tenantId,
          branchId: user.branchId!,
          token: tokenString,
          applicantName: null,
          applicantEmail: null,
          // status defaults to PENDING
        },
      });

      return { token: token.token };
    });
  }

  // ─── STEP 2: applicant completes registration with the code ──────────────
  async completeRegistration(dto: CompleteRegistrationDto) {
    const passwordHash = await bcrypt.hash(dto.password, 10);

    return this.prisma.$transaction(async (tx) => {
      // Look the token up globally (no tenant context yet)
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'true'`);

      const token = await tx.staffRegistrationToken.findUnique({
        where: { token: dto.token },
        select: { id: true, status: true, tenantId: true, branchId: true },
      });

      if (!token || token.status !== 'PENDING') {
        throw new BadRequestException('Geçersiz veya kullanılmış kod');
      }

      // Scope the rest of the work to the token's tenant
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${token.tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      const existing = await tx.user.findFirst({
        where: { tenantId: token.tenantId, email: dto.email },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException('Bu e-posta zaten kayıtlı');
      }

      const user = await tx.user.create({
        data: {
          tenantId: token.tenantId,
          branchId: token.branchId,
          email: dto.email,
          fullName: dto.name,
          passwordHash,
          role: null,
          isActive: true,
        },
        select: { id: true, email: true, fullName: true },
      });

      await tx.staffRegistrationToken.update({
        where: { id: token.id },
        data: {
          applicantName: dto.name,
          applicantEmail: dto.email,
          status: 'USED',
          usedAt: new Date(),
          createdUserId: user.id,
        },
      });

      return { id: user.id, email: user.email, name: user.fullName };
    });
  }

  // ─── STEP 3: manager assigns a role to the new user ──────────────────────
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
