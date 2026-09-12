import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SyncModule } from '../sync/sync.module';
import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';

@Module({
  imports: [JwtModule.register({}), SyncModule],
  controllers: [PortalController],
  providers: [PortalService],
})
export class PortalModule {}
