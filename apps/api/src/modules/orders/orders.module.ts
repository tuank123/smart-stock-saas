import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../../prisma/prisma.module';
import { OrdersController } from './orders.controller';
import { OrdersScheduler } from './orders.scheduler';
import { OrdersService } from './orders.service';

@Module({
  imports: [PrismaModule, ScheduleModule.forRoot()],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersScheduler],
  exports: [OrdersService],
})
export class OrdersModule {}
