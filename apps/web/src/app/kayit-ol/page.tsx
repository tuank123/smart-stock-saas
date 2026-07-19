'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { useCompleteRegistration } from '@/hooks/useMudur';

function extractError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    if (!err.response) return 'Sunucuya bağlanılamadı';
    const msg = err.response.data?.message;
    if (Array.isArray(msg)) return msg.join(', ');
    if (typeof msg === 'string') return msg;
  }
  return 'Kayıt tamamlanamadı. Lütfen tekrar deneyin.';
}

export default function KayitOlPage() {
  const router = useRouter();
  const complete = useCompleteRegistration();
  const [form, setForm] = useState({
    token: '',
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (form.password.length < 8) {
      toast.error('Şifre en az 8 karakter olmalıdır');
      return;
    }
    if (form.password !== form.confirmPassword) {
      toast.error('Şifreler eşleşmiyor');
      return;
    }

    complete.mutate(
      {
        token: form.token.trim(),
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
      },
      {
        onSuccess: () => {
          toast.success(
            'Hesabınız oluşturuldu. Müdürünüz size bir rol atadıktan sonra giriş yapabilirsiniz.',
          );
          router.push('/login');
        },
        onError: (err) => toast.error(extractError(err)),
      },
    );
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-2xl bg-primary text-3xl font-bold text-primary-foreground">
            SP
          </div>
          <h1 className="text-2xl font-semibold">Hesap Oluştur</h1>
          <p className="mt-1.5 text-base text-muted-foreground">
            Müdürünüzün verdiği kod ile kayıt olun
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="token">Kayıt Kodu</label>
            <input
              id="token"
              type="text"
              required
              value={form.token}
              onChange={set('token')}
              placeholder="ABCD1234"
              autoCapitalize="characters"
              className="w-full rounded-md border bg-background px-4 py-3 text-base font-mono tracking-widest outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="name">Ad Soyad</label>
            <input
              id="name"
              type="text"
              autoComplete="name"
              required
              value={form.name}
              onChange={set('name')}
              placeholder="Ahmet Yılmaz"
              className="w-full rounded-md border bg-background px-4 py-3 text-base outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="email">E-posta</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={form.email}
              onChange={set('email')}
              placeholder="ahmet@acme.com"
              className="w-full rounded-md border bg-background px-4 py-3 text-base outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="password">Şifre</label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              value={form.password}
              onChange={set('password')}
              placeholder="••••••••"
              className="w-full rounded-md border bg-background px-4 py-3 text-base outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2"
            />
            <p className="text-xs text-muted-foreground">En az 8 karakter.</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="confirmPassword">Şifre Tekrar</label>
            <input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              value={form.confirmPassword}
              onChange={set('confirmPassword')}
              placeholder="••••••••"
              className="w-full rounded-md border bg-background px-4 py-3 text-base outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2"
            />
          </div>

          <Button type="submit" className="h-12 w-full py-3 text-base" disabled={complete.isPending}>
            {complete.isPending ? 'Oluşturuluyor...' : 'Kayıt Ol'}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Zaten hesabın var mı?{' '}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Giriş Yap
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
