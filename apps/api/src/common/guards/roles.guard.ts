import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { SecurityEventLogger } from '../security-event/security-event.service';

/**
 * RolesGuard enforces role-based access control (RBAC)
 * - Allows @Public() routes
 * - Skips check if @Roles() decorator not applied
 * - Rejects users with null role (unassigned workers)
 * - Allows SUPER_ADMIN to access any protected route
 * - Checks if user role matches @Roles() list
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private securityEvents: SecurityEventLogger,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    // Allow @Public() routes to bypass role check
    try {
      const isPublic = this.reflector.getAllAndOverride('isPublic', [
        context.getHandler(),
        context.getClass(),
      ]);

      if (isPublic) {
        return true;
      }
    } catch (error) {
      // Safe navigation: if Reflector fails, continue with role check
    }

    // Get required roles from @Roles() decorator
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no @Roles() decorator applied, skip role check
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User context not found');
    }

    // Reject users with null role (unassigned workers cannot access protected resources)
    if (user.role === null) {
      this.securityEvents.log({
        eventType: 'ROLE_NOT_ASSIGNED',
        message: 'Rolü atanmamış kullanıcı korumalı bir uca erişmeye çalıştı',
        ip: request.ip,
        userId: user.userId,
        tenantId: user.tenantId,
        path: request.originalUrl ?? request.url,
        context: { requiredRoles },
      });
      throw new ForbiddenException(
        'User role not assigned. Please contact administrator.',
      );
    }

    // SUPER_ADMIN can access any protected route
    if (user.role === UserRole.SUPER_ADMIN) {
      return true;
    }

    // Check if user role is in required roles list
    const hasRequiredRole = requiredRoles.includes(user.role);

    if (!hasRequiredRole) {
      // NOT: Bu yalnızca "kendi tenant'ında yanlış rol" reddini yakalar
      // (JWT'deki role, @Roles() ile uyuşmuyor). "Başka bir tenant'ın
      // KAYNAĞINA erişim" (ör. GET /branches/:id başka tenant'a ait) bu
      // guard'da AYIRT EDİLEMEZ — o kontrol servis katmanında (onlarca
      // yerde `resource.tenantId !== user.tenantId` → 404) yapılıyor ve
      // bilinçli olarak bu görevin kapsamı dışında bırakıldı.
      this.securityEvents.log({
        eventType: 'FORBIDDEN_ROLE',
        message: `Yetkisiz rol ile erişim denemesi (gerekli: ${requiredRoles.join(', ')}, mevcut: ${user.role})`,
        ip: request.ip,
        userId: user.userId,
        tenantId: user.tenantId,
        path: request.originalUrl ?? request.url,
        context: { requiredRoles, actualRole: user.role },
      });
      throw new ForbiddenException(
        `Access denied. Required roles: ${requiredRoles.join(', ')}. Your role: ${user.role}`,
      );
    }

    return true;
  }
}
