import { isNative } from '@/lib/platform';

/**
 * Login / signup / kök (/) sayfasının ortak rol+plan → hedef eşlemesi.
 * Tek kaynak: yönlendirme mantığı birden fazla yerde tekrar edilmesin.
 *
 * PATRON + STARTER (Tek Şubeli): native ise mobil istasyon deneyimi
 * (/isletme-app), web ise sade sol-menülü deneyim (/isletme). Diğer PATRON
 * planları (PROFESSIONAL/ENTERPRISE/null) mevcut çok-şubeli /dashboard'a gider.
 */
export function dashboardFor(
  role: string | null | undefined,
  planId?: string | null,
): string {
  if (role === 'SUBE_MUDURU') return '/mudur/dashboard';
  if (role === 'KASIYER') return '/gorevli/dashboard';
  if (role === 'DEPO') return '/depo/dashboard';
  if (role === 'PATRON' && planId === 'STARTER') {
    return isNative() ? '/isletme-app/dashboard' : '/isletme/raporlar';
  }
  return '/dashboard';
}
