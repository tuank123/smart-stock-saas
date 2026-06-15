import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [PortalController],
  providers: [PortalService],
})
export class PortalModule {}
