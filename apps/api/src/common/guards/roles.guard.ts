import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';

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
  constructor(private reflector: Reflector) {}

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
      throw new ForbiddenException(
        `Access denied. Required roles: ${requiredRoles.join(', ')}. Your role: ${user.role}`,
      );
    }

    return true;
  }
}
