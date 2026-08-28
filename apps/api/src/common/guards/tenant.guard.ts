import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { SecurityEventLogger } from '../security-event/security-event.service';

/**
 * TenantGuard enforces multi-tenant isolation
 * - Allows SUPER_ADMIN to bypass tenant checks
 * - Attaches request.tenantId from JWT payload for all other users
 * - Allows @Public() routes to skip tenant context setup
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private securityEvents: SecurityEventLogger,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    // Allow @Public() routes to bypass tenant checks
    try {
      const isPublic = this.reflector.getAllAndOverride('isPublic', [
        context.getHandler(),
        context.getClass(),
      ]);

      if (isPublic) {
        return true;
      }
    } catch (error) {
      // Safe navigation: if Reflector fails, continue with tenant check
    }

    // Get user from request (set by JwtAuthGuard)
    const user = request.user;

    if (!user) {
      // NOT: Bu, gerçek "başka bir tenant'ın kaynağına erişim denemesi"
      // olayını YAKALAMAZ — o kontrol servis katmanında ayrı ayrı yapılıyor
      // (bkz. roles.guard.ts'teki aynı not). Burada yalnızca JWT payload'ı
      // hiç yoksa/bozuksa (pratikte neredeyse imkansız — JwtAuthGuard zaten
      // önce çalışıp geçerli bir payload set ediyor) tetiklenir.
      this.securityEvents.log({
        eventType: 'TENANT_CONTEXT_MISSING',
        message: 'İstek bağlamında kullanıcı bilgisi bulunamadı',
        ip: request.ip,
        path: request.originalUrl ?? request.url,
      });
      throw new ForbiddenException('User context not found');
    }

    // SUPER_ADMIN can access any tenant context
    if (user.role === UserRole.SUPER_ADMIN) {
      request.tenantId = user.tenantId;
      return true;
    }

    // For other users, attach tenantId from JWT payload
    if (!user.tenantId) {
      this.securityEvents.log({
        eventType: 'TENANT_CONTEXT_MISSING',
        message: 'Kullanıcı bağlamında tenant ID bulunamadı',
        ip: request.ip,
        userId: user.userId,
        path: request.originalUrl ?? request.url,
      });
      throw new ForbiddenException('Tenant ID not found in user context');
    }

    request.tenantId = user.tenantId;
    return true;
  }
}
