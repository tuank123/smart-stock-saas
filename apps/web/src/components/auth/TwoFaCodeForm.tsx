'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { useVerifyTwoFa, getTwoFaErrorInfo } from '@/hooks/useAuth';

interface TwoFaCodeFormProps {
  email: string;
  tempToken: string;
  /** Kullanıcı geri dönmek isterse ya da oturum süresi dolarsa çağrılır. */
  onBackToLogin: () => void;
}

/**
 * POST /auth/login'in PATRON/SUPER_ADMIN için döndürdüğü requires2fa
 * yanıtından sonra gösterilen "6 haneli kodu gir" ekranı.
 *
 * tempToken yalnızca prop olarak (üst bileşenin React state'inden) alınır —
 * URL'e hiç yazılmaz.
 *
 * "Kodu tekrar gönder": backend'de ayrı bir resend endpoint YOK — yeni bir
 * kod almanın tek yolu /auth/login'i (şifreyle) yeniden çağırmak. Bunu burada
 * YAPMIYORUZ: (a) şifreyi bu ekranın ömrü boyunca hafızada tutmayı
 * gerektirir, (b) /auth/login'in kendi IP bazlı rate limitini (5/15dk)
 * gereksiz yere tüketir. Bunun yerine kullanıcıya birkaç dakika içinde
 * giriş ekranına dönüp tekrar denemesi öneriliyor.
 */
export function TwoFaCodeForm({ email, tempToken, onBackToLogin }: TwoFaCodeFormProps) {
  const [code, setCode] = useState('');
  const { mutate: verify, isPending, error } = useVerifyTwoFa();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    verify(
      { tempToken, code },
      {
        onError: (err) => {
          const info = getTwoFaErrorInfo(err);
          if (info.kind === 'session_expired') {
            toast.error(info.message);
            onBackToLogin();
            return;
          }
          // Yanlış kod — input'u temizle, hata mesajı aşağıda gösteriliyor.
          setCode('');
        },
      },
    );
  };

  const errorInfo = error ? getTwoFaErrorInfo(error) : null;
  // session_expired zaten toast + yönlendirmeyle ele alındı — burada tekrar gösterilmez.
  const inlineError = errorInfo && errorInfo.kind !== 'session_expired' ? errorInfo.message : null;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-2xl bg-primary text-3xl font-bold text-primary-foreground">
            SP
          </div>
          <h1 className="text-2xl font-semibold">Doğrulama Kodu</h1>
          <p className="mt-1.5 text-base text-muted-foreground">
            <span className="font-medium text-foreground">{email}</span> adresine gönderilen 6
            haneli kodu girin.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="two-fa-code">
              Doğrulama Kodu
            </label>
            <input
              id="two-fa-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              required
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              className="w-full rounded-md border bg-background px-4 py-3 text-center text-lg tracking-[0.5em] outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2"
            />
          </div>

          <Button
            type="submit"
            className="h-12 w-full py-3 text-base"
            disabled={isPending || code.length !== 6}
          >
            {isPending ? 'Doğrulanıyor...' : 'Doğrula'}
          </Button>

          {inlineError && <p className="text-center text-sm text-red-500">{inlineError}</p>}

          <p className="text-center text-sm text-muted-foreground">
            Kod gelmediyse birkaç dakika içinde{' '}
            <button
              type="button"
              onClick={onBackToLogin}
              className="font-medium text-primary hover:underline"
            >
              giriş ekranına dönüp
            </button>{' '}
            tekrar deneyin.
          </p>
        </form>
      </div>
    </div>
  );
}
