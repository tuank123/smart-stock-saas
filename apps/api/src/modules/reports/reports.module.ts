import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ReportsController } from './reports.controller';
import { ReportsScheduler } from './reports.scheduler';
import { ReportsService } from './reports.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [ReportsController],
  providers: [ReportsService, ReportsScheduler],
  exports: [ReportsService],
})
export class ReportsModule {}
