import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SyncController } from './sync.controller';
import { SyncScheduler } from './sync.scheduler';
import { SyncService } from './sync.service';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { AgentAuthGuard } from '../../common/guards/agent-auth.guard';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [SyncController, AgentController],
  providers: [SyncService, SyncScheduler, AgentService, AgentAuthGuard],
  exports: [SyncService],
})
export class SyncModule {}
