import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { SmsModule } from '../sms/sms.module';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';

@Module({
  imports: [PrismaModule, SmsModule],
  controllers: [StockController],
  providers: [StockService],
})
export class StockModule {}
