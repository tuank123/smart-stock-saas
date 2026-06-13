import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(private configService: ConfigService) {
    super({
      datasources: {
        db: {
          url: configService.get('DATABASE_URL'),
        },
      },
      log:
        configService.get('NODE_ENV') === 'development'
          ? ['query', 'error', 'warn']
          : ['error'],
    });
  }

  async onModuleInit() {
    await this.$connect();
    console.log('✅ Prisma connected to database');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    console.log('✅ Prisma disconnected from database');
  }

  /**
   * Set tenant context for Row-Level Security (RLS)
   * Must be called before executing queries to enable tenant isolation
   * @param tenantId - UUID of the tenant
   * @param isSuperAdmin - Whether the current user is SUPER_ADMIN (bypasses RLS)
   */
  async setTenantContext(tenantId: string, isSuperAdmin = false): Promise<void> {
    await this.$executeRawUnsafe(
      `SET app.tenant_id = '${tenantId}'`,
    );
    await this.$executeRawUnsafe(
      `SET app.is_super_admin = '${isSuperAdmin}'`,
    );
  }
}
