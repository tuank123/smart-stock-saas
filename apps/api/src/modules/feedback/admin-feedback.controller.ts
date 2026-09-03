import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { ListFeedbackQueryDto } from './dto/feedback.dto';
import { FeedbackService } from './feedback.service';

/**
 * Yönetim paneli (SUPER_ADMIN) geri bildirim uçları — admin.controller.ts'teki
 * /admin/errors uçlarıyla aynı desen (ayrı bir controller'da, çünkü
 * FeedbackModule'ün kendi kapsamı; AdminModule'e dokunulmuyor).
 */
@Controller('admin/feedback')
export class AdminFeedbackController {
  constructor(private service: FeedbackService) {}

  @Roles(UserRole.SUPER_ADMIN)
  @Get()
  list(@Query() query: ListFeedbackQueryDto) {
    return this.service.listAll(query);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Patch(':id/read')
  @HttpCode(200)
  markRead(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.markRead(id);
  }
}
