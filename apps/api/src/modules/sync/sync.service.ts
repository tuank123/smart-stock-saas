import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

const MAX_ATTEMPTS = 3;

export interface AddToQueueParams {
  tenantId: string;
  branchId: string;
  operationType: string;
  payload: object;
  adapterType: string;
  createdBy?: string;
}

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async addToQueue(params: AddToQueueParams) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${params.tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      return tx.syncQueue.create({
        data: {
          tenantId:      params.tenantId,
          branchId:      params.branchId,
          operationType: params.operationType,
          payload:       params.payload,
          adapterType:   params.adapterType,
          createdBy:     params.createdBy ?? null,
          status:        'PENDING',
        },
      });
    });
  }

  async processQueue(): Promise<number> {
    const enabled = this.config.get<string>('SYNC_ENABLED') === 'true';

    // Fetch all PENDING jobs that haven't exceeded max attempts
    // Use super-admin RLS to read across all tenants
    const jobs = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'true'`);
      return tx.syncQueue.findMany({
        where: { status: 'PENDING', attemptCount: { lt: MAX_ATTEMPTS } },
        orderBy: { createdAt: 'asc' },
        take: 50,
      });
    });

    let processed = 0;

    for (const job of jobs) {
      try {
        // Mark PROCESSING
        await this.prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`SET app.is_super_admin = 'true'`);
          await tx.syncQueue.update({
            where: { id: job.id },
            data: { status: 'PROCESSING', lastAttemptAt: new Date() },
          });
        });

        let success = false;
        let responsePayload = '';
        let errorDetail = '';

        if (!enabled) {
          // Mock mode — always success
          this.logger.log(
            `🔄 [MOCK] Sync işlendi — op=${job.operationType} branch=${job.branchId}`,
          );
          success = true;
          responsePayload = JSON.stringify({ mock: true, status: 'ok' });
        } else {
          // Real adapter call (stub — extend per adapterType)
          try {
            responsePayload = JSON.stringify(
              await this.callAdapter(job.adapterType, job.operationType, job.payload),
            );
            success = true;
          } catch (err: unknown) {
            const e = err as Error;
            errorDetail = e.message ?? 'Unknown error';
          }
        }

        const nextAttempt = job.attemptCount + 1;
        const maxed = nextAttempt >= MAX_ATTEMPTS;

        await this.prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`SET app.is_super_admin = 'true'`);

          await tx.syncQueue.update({
            where: { id: job.id },
            data: {
              status:       success ? 'SUCCESS' : (maxed ? 'FAILED' : 'PENDING'),
              attemptCount: nextAttempt,
              processedAt:  success ? new Date() : null,
              errorMessage: success ? null : errorDetail,
            },
          });

          await tx.syncLog.create({
            data: {
              tenantId:        job.tenantId,
              queueId:         job.id,
              attemptNumber:   nextAttempt,
              direction:       job.direction,
              requestPayload:  JSON.stringify(job.payload),
              responsePayload: responsePayload || null,
              status:          success ? 'SUCCESS' : 'FAILED',
              errorDetail:     errorDetail || null,
            },
          });
        });

        if (success) processed++;
      } catch (err: unknown) {
        const e = err as Error;
        this.logger.error(`[SyncQueue] job=${job.id} error: ${e.message}`);
      }
    }

    return processed;
  }

  async getFailedJobs(branchId: string, tenantId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      return tx.syncQueue.findMany({
        where: {
          tenantId,
          branchId,
          status: 'FAILED',
          attemptCount: { gte: MAX_ATTEMPTS },
        },
        orderBy: { createdAt: 'desc' },
        include: { logs: { orderBy: { executedAt: 'desc' }, take: 1 } },
      });
    });
  }

  async retryJob(queueId: string, tenantId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      await tx.syncQueue.update({
        where: { id: queueId },
        data: { status: 'PENDING', attemptCount: 0, errorMessage: null },
      });
    });
  }

  async getStatus(branchId: string, tenantId: string) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      const [pending, processing, success, failed] = await Promise.all([
        tx.syncQueue.count({ where: { tenantId, branchId, status: 'PENDING',    createdAt: { gte: since } } }),
        tx.syncQueue.count({ where: { tenantId, branchId, status: 'PROCESSING', createdAt: { gte: since } } }),
        tx.syncQueue.count({ where: { tenantId, branchId, status: 'SUCCESS',    createdAt: { gte: since } } }),
        tx.syncQueue.count({ where: { tenantId, branchId, status: 'FAILED',     createdAt: { gte: since } } }),
      ]);

      return { pending, processing, success, failed };
    });
  }

  private async callAdapter(
    adapterType: string,
    operationType: string,
    _payload: unknown,
  ): Promise<object> {
    // Real adapter dispatch — extend per integration type
    throw new Error(
      `Adapter not implemented: type=${adapterType} op=${operationType}`,
    );
  }
}
