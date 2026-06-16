import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ReportsService } from './reports.service';

@Injectable()
export class ReportsScheduler {
  private readonly logger = new Logger(ReportsScheduler.name);

  constructor(private readonly reportsService: ReportsService) {}

  // Every night at 23:59:00
  @Cron('0 59 23 * * *')
  async handleDailyReports() {
    this.logger.log('[Scheduler] Günlük rapor üretimi başlatıldı');
    const count = await this.reportsService.generateDailyForAllTenants();
    this.logger.log(`[Scheduler] ${count} tenant için günlük rapor üretildi`);
  }

  // Every 1st of month at 01:00:00
  @Cron('0 0 1 1 * *')
  async handleMonthlyReports() {
    this.logger.log('[Scheduler] Aylık rapor üretimi başlatıldı');
    const now = new Date();
    // Generate report for previous month
    const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const month = now.getMonth() === 0 ? 12 : now.getMonth();
    const count = await this.reportsService.generateMonthlyForAllTenants(year, month);
    this.logger.log(`[Scheduler] ${count} tenant için aylık rapor üretildi (${year}-${month})`);
  }
}
