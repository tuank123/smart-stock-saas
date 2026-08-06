import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AgentContext as AgentContextType } from '../guards/agent-auth.guard';

// AgentAuthGuard'ın request'e eklediği { branchId, tenantId, adapterType } bağlamı.
export const AgentContext = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AgentContextType => {
    const request = ctx.switchToHttp().getRequest();
    return request.agentContext;
  },
);
