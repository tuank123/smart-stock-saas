import { Capacitor } from '@capacitor/core';

/**
 * True when running inside the Capacitor native shell (iOS/Android), false in
 * a regular browser. Used to switch the auth flow from cookie-based (web) to
 * body-based refresh tokens (native), since the cross-origin HttpOnly cookie
 * isn't reliably sent from the native webview.
 */
export function isNative(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}
