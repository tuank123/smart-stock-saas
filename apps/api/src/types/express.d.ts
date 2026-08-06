import { Request } from 'express';

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        email: string;
        tenantId: string;
        role: string;
      };
      tenantId?: string;
      agentContext?: {
        branchId: string;
        tenantId: string;
        adapterType: string;
      };
    }
  }
}
