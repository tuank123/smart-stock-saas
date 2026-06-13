import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { StaffRegistrationController } from './staff-registration.controller';
import { StaffRegistrationService } from './staff-registration.service';

@Module({
  imports: [PrismaModule],
  controllers: [StaffRegistrationController],
  providers: [StaffRegistrationService],
})
export class StaffRegistrationModule {}
