import { ConflictException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { TenantPlan } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { AuthResponse } from '../auth/dto/auth-response.dto';
import { SignupDto } from './dto/tenant.dto';

// Türkçe karakterleri sadeleştirip URL-güvenli slug üretir.
function slugify(input: string): string {
  const trMap: Record<string, string> = {
    ı: 'i', İ: 'i', ş: 's', Ş: 's', ğ: 'g', Ğ: 'g',
    ü: 'u', Ü: 'u', ö: 'o', Ö: 'o', ç: 'c', Ç: 'c',
  };
  const slug = input
    .replace(/[ıİşŞğĞüÜöÖçÇ]/g, (c) => trMap[c] ?? c)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || 'sube';
}

@Injectable()
export class TenantsService {
  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
  ) {}

  async signup(dto: SignupDto): Promise<AuthResponse> {
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const planId: TenantPlan =
      dto.businessType === 'COK_SUBE' ? 'PROFESSIONAL' : 'STARTER';
    const slug = slugify(dto.branchName);

    const user = await this.prisma.$transaction(async (tx) => {
      // Yeni tenant oluşturulacağı için henüz bir tenant bağlamı yok.
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'true'`);

      // Vergi numarası tekliği
      const existing = await tx.tenant.findUnique({
        where: { taxNumber: dto.taxNumber },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException('Bu vergi numarası zaten kayıtlı');
      }

      // E-posta global tekilik: bir e-posta yalnızca bir işletmeye ait olabilir
      // (login'deki "aynı email birden fazla tenant" belirsizliğini önler).
      const existingUser = await tx.user.findFirst({
        where: { email: dto.email, deletedAt: null },
        select: { id: true },
      });
      if (existingUser) {
        throw new ConflictException('Bu e-posta adresi zaten başka bir işletmede kayıtlı');
      }

      let tenant;
      try {
        tenant = await tx.tenant.create({
          data: {
            companyName: dto.companyName,
            taxNumber: dto.taxNumber,
            planId,
            status: 'ACTIVE',
            settings: { language: 'tr', currency: 'TRY' },
          },
        });
      } catch (e: any) {
        // Yarış durumu güvenliği (aynı vergi no eşzamanlı)
        if (e.code === 'P2002') {
          throw new ConflictException('Bu vergi numarası zaten kayıtlı');
        }
        throw e;
      }

      // Bundan sonrası tenant bağlamında
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${tenant.id}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      const branch = await tx.branch.create({
        data: {
          tenantId: tenant.id,
          name: dto.branchName,
          slug,
        },
      });

      return tx.user.create({
        data: {
          tenantId: tenant.id,
          branchId: branch.id,
          email: dto.email,
          fullName: dto.fullName,
          passwordHash,
          role: 'PATRON',
          isActive: true,
        },
      });
    });

    // Token üretimini AuthService'ten yeniden kullan (kod tekrarı yok)
    const { accessToken, refreshToken } = await this.authService.issueTokens({
      id: user.id,
      email: user.email,
      tenantId: user.tenantId,
      branchId: user.branchId,
      role: user.role,
      planId,
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
        branchId: user.branchId,
        planId,
      },
    };
  }
}
