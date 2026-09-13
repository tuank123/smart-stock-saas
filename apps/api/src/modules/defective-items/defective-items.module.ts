import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { DefectiveItemsController } from './defective-items.controller';
import { DefectiveItemsService } from './defective-items.service';

@Module({
  imports: [PrismaModule],
  controllers: [DefectiveItemsController],
  providers: [DefectiveItemsService],
})
export class DefectiveItemsModule {}
