import { Global, Module } from '@nestjs/common';
import { SecurityEventLogger } from './security-event.service';

// PrismaModule ile aynı desen: guard'lar (SyncModule/WhatsappModule'de
// tanımlı, kendi modüllerinde PrismaModule'ü de import etmeden PrismaService
// enjekte edebiliyorlar) SecurityEventLogger'ı da hiçbir ek import olmadan
// enjekte edebilsin diye global.
@Global()
@Module({
  providers: [SecurityEventLogger],
  exports: [SecurityEventLogger],
})
export class SecurityEventModule {}
