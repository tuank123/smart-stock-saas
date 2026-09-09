// isletme-app/* (mobil) ve isletme/* (web, yalnızca STARTER PATRON) ilk
// kullanım turlarının BİRBİRİNDEN BAĞIMSIZ localStorage flag'leri — biri
// "görüldü" olsa da diğeri yeniden gösterilmeli, bu yüzden ayrı key'ler.
export const MOBILE_ONBOARDING_STORAGE_KEY = 'stokpilot_onboarding_seen';
export const WEB_ONBOARDING_STORAGE_KEY = 'stokpilot_web_onboarding_seen';

/**
 * Bir ilk kullanım turunun daha önce görülüp görülmediğini (ya da "Atla" ile
 * geçildiğini) düz localStorage'da tutar — lib/auth.ts:authStorage ile aynı
 * desen (Capacitor'ın WebView'inde de localStorage aynen çalışır, ekstra bir
 * şey gerekmez). `key` çağıran tarafından verilir — OnboardingTour tek bir
 * bileşen olarak hem mobil hem web turu için (farklı key'lerle) yeniden
 * kullanılabilsin diye.
 */
export function hasSeenOnboarding(key: string): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem(key) === 'true';
}

export function markOnboardingSeen(key: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, 'true');
}
