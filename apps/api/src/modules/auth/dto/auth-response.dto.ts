export class AuthResponse {
  accessToken: string = '';
  refreshToken: string = '';
  user: {
    id: string;
    email: string;
    role: string;
    tenantId: string;
    branchId?: string | null;
  } = {
    id: '',
    email: '',
    role: '',
    tenantId: '',
    branchId: null,
  };
}
