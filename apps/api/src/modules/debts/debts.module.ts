import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { DebtsController } from './debts.controller';
import { DebtsService } from './debts.service';

@Module({
  imports: [PrismaModule],
  controllers: [DebtsController],
  providers: [DebtsService],
})
export class DebtsModule {}
