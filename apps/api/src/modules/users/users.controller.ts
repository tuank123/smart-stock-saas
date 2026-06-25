import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private service: UsersService) {}

  @Roles(UserRole.PATRON, UserRole.SUBE_MUDURU)
  @Get('branch/:branchId')
  listByBranch(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @CurrentUser() user: { tenantId: string; branchId?: string | null; role?: string | null },
  ) {
    return this.service.listByBranch(branchId, user);
  }
}
