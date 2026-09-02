/**
 * login()'in PATRON/SUPER_ADMIN için döndürdüğü ara yanıt — tam token
 * İÇERMEZ. tempToken yalnızca POST /auth/verify-2fa'da kabul edilir (bkz.
 * JwtAuthGuard'daki `payload.type !== 'access'` reddi).
 */
export interface TwoFaRequiredResponse {
  requires2fa: true;
  tempToken: string;
}

export class AuthResponse {
  accessToken: string = '';
  refreshToken: string = '';
  user: {
    id: string;
    email: string;
    role: string | null;
    tenantId: string;
    branchId?: string | null;
    planId?: string | null;
  } = {
    id: '',
    email: '',
    role: null,
    tenantId: '',
    branchId: null,
    planId: null,
  };
}
