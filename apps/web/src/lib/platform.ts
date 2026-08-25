import { Capacitor } from '@capacitor/core';

/**
 * True when running inside the Capacitor native shell (iOS/Android), false in
 * a regular browser. Used to switch the auth flow from cookie-based (web) to
 * body-based refresh tokens (native), since the cross-origin HttpOnly cookie
 * isn't reliably sent from the native webview.
 *
 * Sonuç modül seviyesinde önbelleğe alınır. Capacitor'ın native köprüsü
 * WebView'e sayfa yüklenmeden ÖNCE (document-start) enjekte edilir ve bir
 * instance'ın ömrü boyunca native<->web arasında çalışma anında geçiş
 * YAPILMAZ — yani Capacitor.isNativePlatform() aynı sayfa yüklemesi içinde
 * hiçbir zaman farklı bir sonuca dönmez. Önbellekleme olmadan, dashboardFor()
 * ve isletme/layout.tsx gibi birbirinden bağımsız çağıranlar aynı anlamda
 * "her zaman aynı" olması gereken bu değeri ayrı ayrı sorguluyordu; teorik
 * bir okuma tutarsızlığı ihtimalini tamamen ortadan kaldırmak için tek bir
 * hesaplama sonucu paylaşılır.
 */
let cachedIsNative: boolean | null = null;

export function isNative(): boolean {
  if (typeof window === 'undefined') return false;
  if (cachedIsNative === null) {
    try {
      cachedIsNative = Capacitor.isNativePlatform();
    } catch {
      cachedIsNative = false;
    }
  }
  return cachedIsNative;
}
