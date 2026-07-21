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
