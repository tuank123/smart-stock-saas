import { Module } from '@nestjs/common';
import { OcrModule } from '../ocr/ocr.module';
import { WhatsappSignatureGuard } from '../../common/guards/whatsapp-signature.guard';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';

@Module({
  imports: [OcrModule],
  controllers: [WhatsappController],
  providers: [WhatsappService, WhatsappSignatureGuard],
  exports: [WhatsappService],
})
export class WhatsappModule {}
