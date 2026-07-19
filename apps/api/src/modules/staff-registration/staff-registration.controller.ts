import {
  Body,
  Controller,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  AssignRoleDto,
  CompleteRegistrationDto,
} from './dto/staff-registration.dto';
import { StaffRegistrationService } from './staff-registration.service';

@Controller('auth/register')
export class StaffRegistrationController {
  constructor(private service: StaffRegistrationService) {}

  @Roles(UserRole.SUBE_MUDURU)
  @Post('generate-code')
  @HttpCode(201)
  generateCode(
    @CurrentUser()
    user: { userId: string; tenantId: string; branchId?: string | null },
  ) {
    return this.service.generateCode(user);
  }

  @Public()
  @Post('complete')
  @HttpCode(201)
  complete(@Body() dto: CompleteRegistrationDto) {
    return this.service.completeRegistration(dto);
  }

  @Roles(UserRole.SUBE_MUDURU)
  @Patch('assign-role/:userId')
  assignRole(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: AssignRoleDto,
    @CurrentUser() user: { tenantId: string },
  ) {
    return this.service.assignRole(userId, dto, user);
  }
}
