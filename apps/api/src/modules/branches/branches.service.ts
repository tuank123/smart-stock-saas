import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { randomBytes, randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { SecurityEventLogger } from '../../common/security-event/security-event.service';
import { assertTenantOwnership } from '../../common/utils/assert-tenant-ownership';
import { withTenantContext } from '../../common/utils/tenant-context';
import { encrypt, decryptSafe } from '../../common/utils/encryption';
import {
  CreateBranchDto,
  GenerateSetupCodeDto,
  ConnectAgentDto,
  UpdateBranchDto,
} from './dto/branch.dto';

@Injectable()
export class BranchesService {
  constructor(
    private prisma: PrismaService,
    private securityEvents: SecurityEventLogger,
  ) {}

  async createBranch(dto: CreateBranchDto, user: { tenantId: string }) {
    return withTenantContext(this.prisma, { tenantId: user.tenantId }, async (tx) => {

      try {
        const created = await tx.branch.create({
          data: {
            tenantId: user.tenantId,
            name: dto.name,
            slug: dto.slug,
            address: dto.address,
            // Telefon DB'ye şifreli yazılır (AES-256-GCM).
            phone: dto.phone ? encrypt(dto.phone) : dto.phone,
            timezone: dto.timezone ?? 'UTC',
          },
        });

        // Çağırana düz metin dön — DB'deki şifreli hali sızmasın.
        return { ...created, phone: decryptSafe(created.phone) };
      } catch (e: any) {
        if (e.code === 'P2002') {
          throw new ConflictException(`'${dto.slug}' slug'ı bu tenant'ta zaten mevcut`);
        }
        throw e;
      }
    });
  }

  async listBranches(user: { tenantId: string; branchId?: string | null; role?: string | null }) {
    return withTenantContext(this.prisma, { tenantId: user.tenantId }, async (tx) => {

      const where = {
        tenantId: user.tenantId,
        isActive: true,
        deletedAt: null,
      };

      const branches = await tx.branch.findMany({ where, orderBy: { createdAt: 'asc' } });

      // Liste de tam Branch nesnesi döndürdüğü için telefonlar burada da çözülür.
      return branches.map((b) => ({ ...b, phone: decryptSafe(b.phone) }));
    });
  }

  async getBranch(
    branchId: string,
    user: { tenantId: string; branchId?: string | null; role?: string | null },
  ) {
    return withTenantContext(this.prisma, { tenantId: user.tenantId }, async (tx) => {

      if (user.role === 'SUBE_MUDURU' && user.branchId !== branchId) {
        throw new ForbiddenException('Bu şubeye erişim yetkiniz yok');
      }

      const branch = await tx.branch.findUnique({ where: { id: branchId } });

      assertTenantOwnership(branch, {
        resourceType: 'Branch',
        resourceId: branchId,
        user,
        notFoundMessage: 'Şube bulunamadı',
        securityEvents: this.securityEvents,
      });

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
        phone: decryptSafe(branch.phone),
        closingTime: branch.closingTime,
        debtRemindersEnabled: branch.debtRemindersEnabled,
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
    return withTenantContext(this.prisma, { tenantId: user.tenantId }, async (tx) => {

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
      assertTenantOwnership(branch, {
        resourceType: 'Branch',
        resourceId: branchId,
        user,
        notFoundMessage: 'Şube bulunamadı',
        securityEvents: this.securityEvents,
      });

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
    return withTenantContext(this.prisma, { isSuperAdmin: true }, async (tx) => {
      const setup = await tx.agentSetupToken.findUnique({
        where: { token: dto.token },
        select: { id: true, status: true, branchId: true },
      });

      if (!setup || setup.status !== 'PENDING') {
        throw new BadRequestException('Geçersiz veya kullanılmış kurulum kodu');
      }

      const agentId = randomUUID();
      // Ham API anahtarı yalnız bu yanıtta döner; DB'ye sadece bcrypt hash'i yazılır.
      const apiKey = randomBytes(32).toString('hex');
      const rounds = process.env.BCRYPT_ROUNDS ? parseInt(process.env.BCRYPT_ROUNDS, 10) : 12;
      const apiKeyHash = await bcrypt.hash(apiKey, rounds);

      await tx.branchIntegration.update({
        where: { branchId: setup.branchId },
        data: {
          connectionStatus: 'CONNECTED',
          agentId,
          agentVersion: dto.agentVersion,
          apiKeyHash,
        },
      });

      await tx.agentSetupToken.update({
        where: { id: setup.id },
        data: { status: 'USED', usedAt: new Date() },
      });

      return { success: true, agentId, apiKey };
    });
  }

  async getIntegration(branchId: string, user: { tenantId: string }) {
    return withTenantContext(this.prisma, { tenantId: user.tenantId }, async (tx) => {

      const integration = await tx.branchIntegration.findUnique({
        where: { branchId },
      });

      assertTenantOwnership(integration, {
        resourceType: 'BranchIntegration',
        resourceId: branchId,
        user,
        notFoundMessage: 'Bu şubeye ait integration bulunamadı',
        securityEvents: this.securityEvents,
      });

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

  // Şube temel bilgilerini (ad, adres, telefon) günceller.
  async updateBranch(
    branchId: string,
    dto: UpdateBranchDto,
    user: { tenantId: string; branchId?: string | null; role?: string | null },
  ) {
    return withTenantContext(this.prisma, { tenantId: user.tenantId }, async (tx) => {

      // SUBE_MUDURU yalnızca kendi şubesini güncelleyebilir.
      if (user.role === 'SUBE_MUDURU' && user.branchId !== branchId) {
        throw new ForbiddenException('Bu şubeye erişim yetkiniz yok');
      }

      const existing = await tx.branch.findUnique({ where: { id: branchId } });
      assertTenantOwnership(existing, {
        resourceType: 'Branch',
        resourceId: branchId,
        user,
        notFoundMessage: 'Şube bulunamadı',
        securityEvents: this.securityEvents,
      });

      const branch = await tx.branch.update({
        where: { id: branchId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.address !== undefined ? { address: dto.address } : {}),
          // Telefon DB'ye şifreli yazılır; null/boş gelirse olduğu gibi bırakılır.
          ...(dto.phone !== undefined
            ? { phone: dto.phone ? encrypt(dto.phone) : dto.phone }
            : {}),
          ...(dto.closingTime !== undefined ? { closingTime: dto.closingTime } : {}),
          ...(dto.debtRemindersEnabled !== undefined
            ? { debtRemindersEnabled: dto.debtRemindersEnabled }
            : {}),
        },
        select: {
          id: true,
          name: true,
          slug: true,
          address: true,
          phone: true,
          closingTime: true,
          debtRemindersEnabled: true,
          isActive: true,
        },
      });

      // Güncelleme yanıtı da düz metin telefon döner.
      return { ...branch, phone: decryptSafe(branch.phone) };
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
