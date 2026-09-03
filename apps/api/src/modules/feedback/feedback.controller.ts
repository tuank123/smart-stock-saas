import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateFeedbackDto } from './dto/feedback.dto';
import { FeedbackService } from './feedback.service';

type FeedbackUser = {
  tenantId: string;
  userId: string;
  role?: string | null;
  planId?: string | null;
};

@Controller('feedback')
export class FeedbackController {
  constructor(private service: FeedbackService) {}

  /**
   * POST /api/v1/feedback
   * Teknik olmayan kullanıcı geri bildirimi/şikayeti — ErrorLog'un kapsamadığı
   * ürün/deneyim geri bildirimleri için. Yalnızca tek şubeli (STARTER) PATRON.
   */
  @Roles(UserRole.PATRON)
  @Post()
  @HttpCode(201)
  create(@Body() dto: CreateFeedbackDto, @CurrentUser() user: FeedbackUser) {
    return this.service.create(dto, user);
  }
}
