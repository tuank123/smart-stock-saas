import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { SecurityEventLogger } from '../security-event/security-event.service';

export interface AgentContext {
  branchId: string;
  tenantId: string;
  adapterType: string;
}

// Agent'ın X-Agent-Id + X-Agent-Key header'larıyla kendini doğruladığı guard.
// JWT/Roles akışından tamamen ayrı; route'lar @Public() ile global JWT guard'ı atlar.
@Injectable()
export class AgentAuthGuard implements CanActivate {
  constructor(
    private prisma: PrismaService,
    private securityEvents: SecurityEventLogger,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    const agentId = request.header('x-agent-id');
    const agentKey = request.header('x-agent-key');

    if (!agentId || !agentKey) {
      this.securityEvents.log({
        eventType: 'INVALID_AGENT_KEY',
        message: 'Agent kimlik bilgileri eksik (X-Agent-Id/X-Agent-Key)',
        ip: request.ip,
        path: request.originalUrl ?? request.url,
      });
      throw new UnauthorizedException('Agent kimlik bilgileri eksik');
    }

    // super-admin RLS: Agent'ın tenant bağlamı yok, global arama gerekli.
    const integration = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'true'`);
      return tx.branchIntegration.findFirst({
        where: { agentId, connectionStatus: 'CONNECTED' },
        select: {
          branchId: true,
          tenantId: true,
          adapterType: true,
          apiKeyHash: true,
        },
      });
    });

    if (!integration || !integration.apiKeyHash) {
      // Ham agentId loglanır (KIMLIK, sır değil) — API key ASLA loglanmaz.
      this.securityEvents.log({
        eventType: 'INVALID_AGENT_KEY',
        message: 'Bilinmeyen veya bağlı olmayan Agent kimliği',
        ip: request.ip,
        path: request.originalUrl ?? request.url,
        context: { agentId },
      });
      throw new UnauthorizedException('Geçersiz Agent kimliği');
    }

    const valid = await bcrypt.compare(agentKey, integration.apiKeyHash);
    if (!valid) {
      this.securityEvents.log({
        eventType: 'INVALID_AGENT_KEY',
        message: 'Agent API anahtarı eşleşmedi',
        ip: request.ip,
        tenantId: integration.tenantId,
        branchId: integration.branchId,
        path: request.originalUrl ?? request.url,
        context: { agentId },
      });
      throw new UnauthorizedException('Geçersiz Agent anahtarı');
    }

    // Sonraki handler'lar için bağlamı request'e ekle.
    request.agentContext = {
      branchId: integration.branchId,
      tenantId: integration.tenantId,
      adapterType: integration.adapterType,
    };

    return true;
  }
}
