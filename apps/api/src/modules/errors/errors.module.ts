import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ErrorsController } from './errors.controller';
import { ErrorsService } from './errors.service';

@Module({
  // AuthModule, JwtService'i (JWT_SECRET ile önceden yapılandırılmış olarak)
  // export ediyor — best-effort token çözümü için (bkz. errors.service.ts).
  imports: [AuthModule],
  controllers: [ErrorsController],
  providers: [ErrorsService],
})
export class ErrorsModule {}
