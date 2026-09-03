const ONBOARDING_SEEN_KEY = 'stokpilot_onboarding_seen';

/**
 * isletme-app/* ilk kullanım turunu daha önce görüp görmediğini (ya da
 * "Atla" ile geçtiğini) düz localStorage'da tutar — lib/auth.ts:authStorage
 * ile aynı desen (Capacitor'ın WebView'inde de localStorage aynen çalışır,
 * ekstra bir şey gerekmez).
 */
export function hasSeenOnboarding(): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem(ONBOARDING_SEEN_KEY) === 'true';
}

export function markOnboardingSeen(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ONBOARDING_SEEN_KEY, 'true');
}
