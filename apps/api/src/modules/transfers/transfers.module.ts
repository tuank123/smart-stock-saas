import { Module } from '@nestjs/common';
import { SyncModule } from '../sync/sync.module';
import { TransfersController } from './transfers.controller';
import { TransfersService } from './transfers.service';

@Module({
  imports: [SyncModule],
  controllers: [TransfersController],
  providers: [TransfersService],
})
export class TransfersModule {}
