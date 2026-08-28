import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// error_logs.source için sabit değer — API_EXCEPTION/SYNC_JOB/OCR_SCAN/
// WHATSAPP_WEBHOOK'un yanına eklenen yeni kategori. Alt tür ayrımı (login
// denemesi mi, imza reddi mi, ...) context.eventType'ta tutulur — source
// tek başına yeterince ayrıştırıcı değil.
const SECURITY_EVENT_SOURCE = 'SECURITY_EVENT';

export type SecurityEventType =
  | 'LOGIN_FAILED'
  | 'JWT_REJECTED'
  | 'FORBIDDEN_ROLE'
  | 'ROLE_NOT_ASSIGNED'
  | 'TENANT_CONTEXT_MISSING'
  | 'INVALID_AGENT_KEY'
  | 'WHATSAPP_SIGNATURE_INVALID'
  | 'RATE_LIMITED'
  | 'CROSS_TENANT_ACCESS_ATTEMPT';

export interface SecurityEventParams {
  eventType: SecurityEventType;
  message: string;
  ip?: string | null;
  email?: string | null;
  userId?: string | null;
  tenantId?: string | null;
  branchId?: string | null;
  path?: string | null;
  /** Ek, şüpheye yer bırakmayan bağlam — ASLA şifre/API-key/token gibi sır içermemeli. */
  context?: Record<string, unknown>;
}

/**
 * Güvenlik-hassas reddetme olaylarını (başarısız login, geçersiz JWT/Agent
 * key/webhook imzası, yetkisiz rol, rate-limit) ErrorLog'a — dolayısıyla
 * admin panelindeki "Hatalar & Uyarılar" ekranına — yazar.
 *
 * all-exceptions.filter.ts BİLEREK değiştirilmedi: o filtre yalnızca >=500
 * (gerçek sunucu hataları) yazıyor, 4xx'i (401/403/429 dahil) kasıtlı olarak
 * atlıyor — bu davranış korunuyor. Bunun yerine her güvenlik-hassas red
 * noktası (guard'lar + auth.service.login) KENDİ reddetme anında bu servisi
 * çağırıyor.
 *
 * Fire-and-forget: log() request akışını ASLA bloklamaz/yavaşlatmaz — hiçbir
 * çağıran `await` etmek zorunda değil (log() zaten Promise döndürmüyor).
 * Yazım başarısız olursa yalnızca Logger'a düşer, orijinal reddetmeyi
 * (401/403/429 fırlatılmasını) hiçbir şekilde etkilemez/geciktirmez.
 */
@Injectable()
export class SecurityEventLogger {
  private readonly logger = new Logger(SecurityEventLogger.name);

  constructor(private readonly prisma: PrismaService) {}

  log(params: SecurityEventParams): void {
    void this.prisma.errorLog
      .create({
        data: {
          source: SECURITY_EVENT_SOURCE,
          severity: 'WARNING',
          message: params.message,
          tenantId: params.tenantId ?? null,
          branchId: params.branchId ?? null,
          context: {
            eventType: params.eventType,
            ip: params.ip ?? null,
            email: params.email ?? null,
            userId: params.userId ?? null,
            path: params.path ?? null,
            ...params.context,
          },
        },
      })
      .catch((err: unknown) => {
        this.logger.error(
          `SecurityEvent ErrorLog kaydı başarısız (${params.eventType})`,
          err as Error,
        );
      });
  }
}
