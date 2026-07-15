'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';

const DEFAULT_TENANT = '290ec168-0ac0-4592-8d3f-163c70ad92cf';

export default function LoginPage() {
  const { login, isLoggingIn, loginError: error } = useAuth();
  const [form, setForm] = useState({
    email: '',
    password: '',
    tenantId: DEFAULT_TENANT,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login(form);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-2xl bg-primary text-3xl font-bold text-primary-foreground">
            SP
          </div>
          <h1 className="text-2xl font-semibold">StokPilot Girişi</h1>
          <p className="mt-1.5 text-base text-muted-foreground">Hesabınıza giriş yapın</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="email">E-posta</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="admin@acme.com"
              className="w-full rounded-md border bg-background px-4 py-3 text-base outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="password">Şifre</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="••••••••"
              className="w-full rounded-md border bg-background px-4 py-3 text-base outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="tenantId">
              İşletme ID
            </label>
            <input
              id="tenantId"
              type="text"
              required
              value={form.tenantId}
              onChange={(e) => setForm((f) => ({ ...f, tenantId: e.target.value }))}
              placeholder="Tenant ID'nizi girin"
              className="w-full rounded-md border bg-background px-4 py-2.5 text-sm text-muted-foreground outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2"
            />
            <p className="text-xs text-muted-foreground">
              Sistem otomatik doldurdu, değiştirmeyin.
            </p>
          </div>

          <Button type="submit" className="h-12 w-full py-3 text-base" disabled={isLoggingIn}>
            {isLoggingIn ? 'Giriş yapılıyor...' : 'Giriş Yap'}
          </Button>

          {error && <p className="text-center text-sm text-red-500">{error}</p>}
        </form>
      </div>
    </div>
  );
}
