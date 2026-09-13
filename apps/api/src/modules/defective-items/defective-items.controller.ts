import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateDefectiveItemDto } from './dto/defective-item.dto';
import { DefectiveItemsService } from './defective-items.service';

type DefectiveItemCurrentUser = {
  tenantId: string;
  userId: string;
  role?: string | null;
  planId?: string | null;
};

@Roles(UserRole.PATRON)
@Controller('defective-items')
export class DefectiveItemsController {
  constructor(private service: DefectiveItemsService) {}

  @Post(':branchId')
  @HttpCode(201)
  create(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body() dto: CreateDefectiveItemDto,
    @CurrentUser() user: DefectiveItemCurrentUser,
  ) {
    return this.service.create(branchId, dto, user);
  }

  @Get(':branchId')
  listPending(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @CurrentUser() user: DefectiveItemCurrentUser,
  ) {
    return this.service.listPending(branchId, user);
  }

  @Patch(':id/waste')
  markWasted(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: DefectiveItemCurrentUser,
  ) {
    return this.service.markWasted(id, user);
  }

  @Patch(':id/exchange')
  markExchanged(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: DefectiveItemCurrentUser,
  ) {
    return this.service.markExchanged(id, user);
  }
}
