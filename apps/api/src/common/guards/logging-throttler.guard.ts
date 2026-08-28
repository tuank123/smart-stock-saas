import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  ThrottlerLimitDetail,
  ThrottlerModuleOptions,
  ThrottlerStorage,
} from '@nestjs/throttler';
import { SecurityEventLogger } from '../security-event/security-event.service';

// Stok ThrottlerGuard'ın davranışını (limit/ttl/429 mesajı) HİÇ değiştirmez —
// yalnızca throwThrottlingException'ı (kütüphanenin bu amaçla sunduğu
// override noktası) sarmalayıp fırlatmadan önce bir SECURITY_EVENT loglar.
@Injectable()
export class LoggingThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly securityEvents: SecurityEventLogger,
  ) {
    super(options, storageService, reflector);
  }

  protected async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    const request = context.switchToHttp().getRequest();
    const path = request?.originalUrl ?? request?.url ?? null;
    const ip = (throttlerLimitDetail.tracker as string | undefined) ?? request?.ip ?? null;

    this.securityEvents.log({
      eventType: 'RATE_LIMITED',
      message: `Rate limit aşıldı: ${request?.method ?? '?'} ${path ?? '?'}`,
      ip,
      path,
      context: { method: request?.method ?? null, totalHits: throttlerLimitDetail.totalHits },
    });

    return super.throwThrottlingException(context, throttlerLimitDetail);
  }
}
