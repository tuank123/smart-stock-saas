import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateBranchDto,
  GenerateSetupCodeDto,
  ConnectAgentDto,
} from './dto/branch.dto';

@Injectable()
export class BranchesService {
  constructor(private prisma: PrismaService) {}

  async createBranch(dto: CreateBranchDto, user: { tenantId: string }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${user.tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      try {
        return await tx.branch.create({
          data: {
            tenantId: user.tenantId,
            name: dto.name,
            slug: dto.slug,
            address: dto.address,
            phone: dto.phone,
            timezone: dto.timezone ?? 'UTC',
          },
        });
      } catch (e: any) {
        if (e.code === 'P2002') {
          throw new ConflictException(`'${dto.slug}' slug'ı bu tenant'ta zaten mevcut`);
        }
        throw e;
      }
    });
  }

  async listBranches(user: { tenantId: string; branchId?: string | null; role?: string | null }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${user.tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      const where = {
        tenantId: user.tenantId,
        isActive: true,
        deletedAt: null,
      };

      return tx.branch.findMany({ where, orderBy: { createdAt: 'asc' } });
    });
  }

  async getBranch(
    branchId: string,
    user: { tenantId: string; branchId?: string | null; role?: string | null },
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${user.tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      if (user.role === 'SUBE_MUDURU' && user.branchId !== branchId) {
        throw new ForbiddenException('Bu şubeye erişim yetkiniz yok');
      }

      const branch = await tx.branch.findUnique({ where: { id: branchId } });

      if (!branch || branch.tenantId !== user.tenantId) {
        throw new NotFoundException('Şube bulunamadı');
      }

      const integration = await tx.branchIntegration.findFirst({
        where: { branchId },
        select: { adapterType: true, connectionStatus: true },
      });

      return {
        id: branch.id,
        name: branch.name,
        slug: branch.slug,
        isActive: branch.isActive,
        address: branch.address,
        integrationStatus: integration?.connectionStatus ?? null,
      };
    });
  }

  /**
   * PATRON şubesi için tek kullanımlık Agent kurulum kodu üretir ve
   * BranchIntegration kaydını PENDING_INSTALL olarak upsert eder.
   * apiKey/webserviceUrl bu akışta tutulmaz — Agent yerelde saklar.
   */
  async generateSetupToken(
    branchId: string,
    dto: GenerateSetupCodeDto,
    user: { tenantId: string },
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${user.tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      const adapter = await tx.integrationAdapter.findUnique({
        where: { adapterType: dto.adapterType, isActive: true },
        select: { adapterType: true },
      });
      if (!adapter) {
        throw new BadRequestException(`'${dto.adapterType}' geçerli bir adaptör değil`);
      }

      const branch = await tx.branch.findUnique({
        where: { id: branchId },
        select: { id: true, tenantId: true },
      });
      if (!branch || branch.tenantId !== user.tenantId) {
        throw new NotFoundException('Şube bulunamadı');
      }

      // BranchIntegration'ı adapterType + PENDING_INSTALL ile hazırla.
      await tx.branchIntegration.upsert({
        where: { branchId },
        create: {
          tenantId: user.tenantId,
          branchId,
          adapterType: dto.adapterType,
          connectionStatus: 'PENDING_INSTALL',
        },
        update: {
          adapterType: dto.adapterType,
          connectionStatus: 'PENDING_INSTALL',
        },
      });

      const setup = await tx.agentSetupToken.create({
        data: {
          tenantId: user.tenantId,
          branchId,
          token: this.generateToken(),
          adapterType: dto.adapterType,
          // status defaults to PENDING
        },
      });

      return { token: setup.token };
    });
  }

  /**
   * PUBLIC — Agent kurulum koduyla kendini şubeye bağlar. Henüz tenant
   * bağlamı yok; token global olarak aranır (super-admin RLS).
   */
  async connectAgent(dto: ConnectAgentDto) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'true'`);

      const setup = await tx.agentSetupToken.findUnique({
        where: { token: dto.token },
        select: { id: true, status: true, branchId: true },
      });

      if (!setup || setup.status !== 'PENDING') {
        throw new BadRequestException('Geçersiz veya kullanılmış kurulum kodu');
      }

      const agentId = randomUUID();

      await tx.branchIntegration.update({
        where: { branchId: setup.branchId },
        data: {
          connectionStatus: 'CONNECTED',
          agentId,
          agentVersion: dto.agentVersion,
        },
      });

      await tx.agentSetupToken.update({
        where: { id: setup.id },
        data: { status: 'USED', usedAt: new Date() },
      });

      return { success: true, agentId };
    });
  }

  async getIntegration(branchId: string, user: { tenantId: string }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${user.tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      const integration = await tx.branchIntegration.findUnique({
        where: { branchId },
      });

      if (!integration || integration.tenantId !== user.tenantId) {
        throw new NotFoundException('Bu şubeye ait integration bulunamadı');
      }

      return integration;
    });
  }

  async listAdapters() {
    return this.prisma.integrationAdapter.findMany({
      where: { isActive: true },
      select: {
        adapterType: true,
        displayName: true,
        webserviceType: true,
        authType: true,
        supportedVersions: true,
      },
      orderBy: { adapterType: 'asc' },
    });
  }

  // staff-registration ile aynı desen: 8 karakterlik okunaklı tek kullanımlık kod.
  private generateToken(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    return Array.from(randomBytes(8))
      .map((b) => chars[b % chars.length])
      .join('');
  }
}
