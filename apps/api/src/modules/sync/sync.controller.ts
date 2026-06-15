import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { SyncService } from './sync.service';

@Controller('sync')
export class SyncController {
  constructor(private service: SyncService) {}

  @Roles(UserRole.PATRON, UserRole.SUBE_MUDURU)
  @Get('status/:branchId')
  status(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @CurrentUser() user: { tenantId: string },
  ) {
    return this.service.getStatus(branchId, user.tenantId);
  }

  @Roles(UserRole.SUBE_MUDURU)
  @Get('failed/:branchId')
  failed(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @CurrentUser() user: { tenantId: string },
  ) {
    return this.service.getFailedJobs(branchId, user.tenantId);
  }

  @Roles(UserRole.SUBE_MUDURU)
  @Post('retry/:queueId')
  @HttpCode(200)
  retry(
    @Param('queueId', ParseUUIDPipe) queueId: string,
    @CurrentUser() user: { tenantId: string },
  ) {
    return this.service.retryJob(queueId, user.tenantId).then(() => ({ success: true }));
  }

  @Roles(UserRole.SUBE_MUDURU)
  @Post('trigger')
  @HttpCode(200)
  async trigger() {
    const processed = await this.service.processQueue();
    return { processed };
  }
}
