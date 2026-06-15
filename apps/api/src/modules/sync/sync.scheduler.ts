import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SyncService } from './sync.service';

@Injectable()
export class SyncScheduler {
  private readonly logger = new Logger(SyncScheduler.name);

  constructor(private syncService: SyncService) {}

  @Cron('*/30 * * * * *')
  async handleProcessQueue() {
    const processed = await this.syncService.processQueue();
    if (processed > 0) {
      this.logger.log(`[Scheduler] ${processed} sync job işlendi`);
    }
  }
}
