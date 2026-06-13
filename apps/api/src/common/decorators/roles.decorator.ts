import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Decorator to specify required roles for endpoint
 * @param roles - Array of UserRole enum values allowed to access the endpoint
 * 
 * @example
 * @Roles(UserRole.PATRON, UserRole.SUBE_MUDURU)
 * @Post()
 * create() { }
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
