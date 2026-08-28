import { NotFoundException } from '@nestjs/common';
import { SecurityEventLogger } from '../security-event/security-event.service';

interface TenantOwned {
  tenantId: string;
}

/**
 * Codebase genelinde onlarca serviste tekrar eden desenin ("kaynak yok VEYA
 * başka tenant'a ait → 404, kaynak sızdırma") merkezi hali. Davranış
 * DIŞARIDAN AYNI kalır (hâlâ NotFoundException, hâlâ aynı mesaj) — tek fark,
 * kaynak GERÇEKTEN VAR ama başka bir tenant'a aitse (yani gerçek bir
 * cross-tenant erişim denemesiyse) bunu SecurityEventLogger'a
 * CROSS_TENANT_ACCESS_ATTEMPT olarak loglaması. Kaynak gerçekten yoksa
 * (resource null/undefined) HİÇBİR ŞEY loglanmaz — bu, "yanlış ID" ile
 * "başka tenant'ın kaynağı" arasındaki tek dışarıdan görünmeyen farktır.
 *
 * Gerçek sahibi tenant'ın ID'si KASITLI OLARAK loglanmıyor — yalnızca
 * "yanlış tenant'tan erişim denendi" bilgisi (denenen kullanıcı/tenant +
 * kaynak tipi/id) yeterli, karşı tarafın kimliğini sızdırmaya gerek yok.
 *
 * TypeScript assertion function: çağrıdan sonra `resource`, çağıran
 * fonksiyonda otomatik olarak non-null olarak daralır (ekstra `!` gerekmez).
 */
export function assertTenantOwnership<T extends TenantOwned | null | undefined>(
  resource: T,
  params: {
    resourceType: string;
    resourceId: string;
    user: { userId?: string | null; tenantId: string };
    notFoundMessage: string;
    securityEvents: SecurityEventLogger;
  },
): asserts resource is NonNullable<T> {
  if (!resource) {
    // Gerçekten yok — sessizce 404. Loglama YOK (yanlış pozitif olmasın).
    throw new NotFoundException(params.notFoundMessage);
  }

  if (resource.tenantId !== params.user.tenantId) {
    params.securityEvents.log({
      eventType: 'CROSS_TENANT_ACCESS_ATTEMPT',
      message: `Başka bir tenant'a ait ${params.resourceType} kaynağına erişim denemesi`,
      userId: params.user.userId ?? null,
      tenantId: params.user.tenantId,
      context: {
        resourceType: params.resourceType,
        resourceId: params.resourceId,
      },
    });
    throw new NotFoundException(params.notFoundMessage);
  }
}
