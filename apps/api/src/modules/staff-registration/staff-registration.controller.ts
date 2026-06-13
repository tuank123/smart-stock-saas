import {
  Body,
  Controller,
  Get,
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
  RequestRegistrationDto,
  VerifyTokenDto,
} from './dto/staff-registration.dto';
import { StaffRegistrationService } from './staff-registration.service';

@Controller('auth/register')
export class StaffRegistrationController {
  constructor(private service: StaffRegistrationService) {}

  @Public()
  @Post('request')
  @HttpCode(201)
  request(@Body() dto: RequestRegistrationDto) {
    return this.service.requestRegistration(dto);
  }

  @Roles(UserRole.SUBE_MUDURU)
  @Get('pending/:branchId')
  listPending(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @CurrentUser() user: { tenantId: string },
  ) {
    return this.service.listPending(branchId, user);
  }

  @Roles(UserRole.SUBE_MUDURU)
  @Patch('approve/:tokenId')
  approve(
    @Param('tokenId', ParseUUIDPipe) tokenId: string,
    @CurrentUser() user: { userId: string; tenantId: string },
  ) {
    return this.service.approveToken(tokenId, user);
  }

  @Public()
  @Patch('verify')
  @HttpCode(200)
  verify(@Body() dto: VerifyTokenDto) {
    return this.service.verifyToken(dto);
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
