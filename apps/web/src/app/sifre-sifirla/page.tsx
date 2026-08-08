'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { useResetPassword, getApiErrorMessage } from '@/hooks/useAuth';

// Backend'deki kuralın aynısı (SignupDto / ResetPasswordDto).
const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*[0-9]).{8,}$/;
const PASSWORD_MESSAGE = 'Şifre en az 8 karakter, 1 büyük harf ve 1 rakam içermelidir.';

// ── İçerik — useSearchParams kullandığı için Suspense ile sarılı ──────────────

function SifreSifirlaInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [clientError, setClientError] = useState<string | null>(null);

  const resetPassword = useResetPassword();

  // Başarıdan 2 saniye sonra girişe yönlendir.
  useEffect(() => {
    if (!resetPassword.isSuccess) return;
    const timer = setTimeout(() => router.push('/login'), 2000);
    return () => clearTimeout(timer);
  }, [resetPassword.isSuccess, router]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setClientError(null);

    if (!PASSWORD_REGEX.test(newPassword)) {
      setClientError(PASSWORD_MESSAGE);
      return;
    }
    if (newPassword !== confirmPassword) {
      setClientError('Şifreler eşleşmiyor.');
      return;
    }

    resetPassword.mutate({ token, newPassword });
  };

  // Token hiç yoksa forma gerek yok — doğrudan yeni bağlantı iste.
  if (!token) {
    return (
      <Shell title="Şifre Sıfırlama">
        <ErrorBox message="Bağlantı geçersiz görünüyor (token bulunamadı)." />
      </Shell>
    );
  }

  if (resetPassword.isSuccess) {
    return (
      <Shell title="Şifre Sıfırlama">
        <div className="space-y-6">
          <div className="flex gap-3 rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-medium">Şifreniz güncellendi</p>
              <p className="mt-1 text-green-700">Giriş sayfasına yönlendiriliyorsunuz…</p>
            </div>
          </div>
          <p className="text-center text-sm text-muted-foreground">
            <Link href="/login" className="font-medium text-primary hover:underline">
              Giriş Yap&apos;a Dön
            </Link>
          </p>
        </div>
      </Shell>
    );
  }

  // Token geçersiz/süresi dolmuşsa formu tekrar denetmenin anlamı yok.
  if (resetPassword.isError) {
    return (
      <Shell title="Şifre Sıfırlama">
        <ErrorBox message={getApiErrorMessage(resetPassword.error)} />
      </Shell>
    );
  }

  // Kuralları kullanıcıya önceden göster (submit'i beklemeden).
  const passwordRuleOk = PASSWORD_REGEX.test(newPassword);
  const matchOk = newPassword.length > 0 && newPassword === confirmPassword;

  return (
    <Shell title="Yeni Şifre Belirle">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid gap-1.5">
          <Label htmlFor="new-password">Yeni Şifre</Label>
          <PasswordInput
            id="new-password"
            value={newPassword}
            onChange={setNewPassword}
            autoComplete="new-password"
          />
          <p
            className={
              newPassword.length === 0
                ? 'text-xs text-muted-foreground'
                : passwordRuleOk
                  ? 'text-xs text-green-600'
                  : 'text-xs text-red-500'
            }
          >
            {PASSWORD_MESSAGE}
          </p>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="confirm-password">Yeni Şifre Tekrar</Label>
          <PasswordInput
            id="confirm-password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
          />
          {confirmPassword.length > 0 && !matchOk && (
            <p className="text-xs text-red-500">Şifreler eşleşmiyor.</p>
          )}
        </div>

        <Button
          type="submit"
          className="h-12 w-full py-3 text-base"
          disabled={resetPassword.isPending || !passwordRuleOk || !matchOk}
        >
          {resetPassword.isPending ? 'Güncelleniyor…' : 'Şifreyi Güncelle'}
        </Button>

        {clientError && <p className="text-center text-sm text-red-500">{clientError}</p>}

        <p className="text-center text-sm text-muted-foreground">
          <Link href="/login" className="font-medium text-primary hover:underline">
            Giriş Yap&apos;a Dön
          </Link>
        </p>
      </form>
    </Shell>
  );
}

// ── Ortak kabuk ve hata kutusu ────────────────────────────────────────────────

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-2xl bg-primary text-3xl font-bold text-primary-foreground">
            SP
          </div>
          <h1 className="text-2xl font-semibold">{title}</h1>
        </div>
        {children}
      </div>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="space-y-6">
      <div className="flex gap-3 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <p className="font-medium">{message}</p>
          <p className="mt-1 text-red-700">
            Sıfırlama bağlantıları tek kullanımlıktır ve 1 saat sonra geçersiz olur.
          </p>
        </div>
      </div>

      <Button asChild className="h-12 w-full py-3 text-base">
        <Link href="/sifremi-unuttum">Yeni Bağlantı İste</Link>
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-primary hover:underline">
          Giriş Yap&apos;a Dön
        </Link>
      </p>
    </div>
  );
}

export default function SifreSifirlaPage() {
  return (
    <Suspense>
      <SifreSifirlaInner />
    </Suspense>
  );
}
