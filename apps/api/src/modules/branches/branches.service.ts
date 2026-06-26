import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateBranchDto, CreateIntegrationDto } from './dto/branch.dto';

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

  async createIntegration(
    branchId: string,
    dto: CreateIntegrationDto,
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

      try {
        return await tx.branchIntegration.create({
          data: {
            tenantId: user.tenantId,
            branchId,
            adapterType: dto.adapterType,
            webserviceUrl: dto.webserviceUrl,
            apiKeyEncrypted: Buffer.from(dto.apiKey).toString('base64'),
            pollingIntervalSec: dto.pollingIntervalSec ?? 10,
            connectionStatus: 'PENDING_INSTALL',
          },
        });
      } catch (e: any) {
        if (e.code === 'P2002') {
          throw new ConflictException('Bu şube için zaten bir integration kaydı var');
        }
        throw e;
      }
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
}
