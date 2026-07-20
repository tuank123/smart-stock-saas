import { Response } from 'express';
import { AuthResponse } from './dto/auth-response.dto';

const REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Sets the refresh token as an HttpOnly cookie. Shared by login / refresh /
 * tenant signup so the cookie config stays identical everywhere.
 */
export function setRefreshTokenCookie(response: Response, refreshToken: string): void {
  response.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: REFRESH_COOKIE_MAX_AGE,
  });
}

/**
 * Builds the `data` payload for auth responses. Native clients
 * (X-Client-Platform: native) also get the refresh token in the body since the
 * cross-origin cookie isn't reliable in the Capacitor webview.
 */
export function buildAuthData(
  accessToken: string,
  refreshToken: string,
  user: AuthResponse['user'],
  clientPlatform?: string,
) {
  const isNative = clientPlatform === 'native';
  return {
    accessToken,
    ...(isNative ? { refreshToken } : {}),
    user,
  };
}
