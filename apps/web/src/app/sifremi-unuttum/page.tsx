'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useForgotPassword, getApiErrorMessage } from '@/hooks/useAuth';

// Backend e-posta kayıtlı olsun ya da olmasın aynı yanıtı döner; ekranda da
// kullanıcı numaralandırmasına izin vermemek için tek bir mesaj gösterilir.
const GENERIC_MESSAGE =
  'Eğer bu e-posta kayıtlıysa, bir sıfırlama bağlantısı gönderildi.';

export default function SifremiUnuttumPage() {
  const [email, setEmail] = useState('');
  const forgotPassword = useForgotPassword();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    forgotPassword.mutate({ email });
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-2xl bg-primary text-3xl font-bold text-primary-foreground">
            SP
          </div>
          <h1 className="text-2xl font-semibold">Şifremi Unuttum</h1>
          <p className="mt-1.5 text-base text-muted-foreground">
            Kayıtlı e-posta adresinizi girin, size bir sıfırlama bağlantısı gönderelim.
          </p>
        </div>

        {forgotPassword.isSuccess ? (
          <div className="space-y-6">
            <div className="flex gap-3 rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800">
              <MailCheck className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-medium">{GENERIC_MESSAGE}</p>
                <p className="mt-1 text-green-700">
                  Gelen kutunuzu kontrol edin. Bağlantı 1 saat geçerlidir.
                </p>
              </div>
            </div>

            <p className="text-center text-sm text-muted-foreground">
              <Link href="/login" className="font-medium text-primary hover:underline">
                Giriş Yap&apos;a Dön
              </Link>
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="email">
                E-posta
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ornek@sirket.com"
                className="w-full rounded-md border bg-background px-4 py-3 text-base outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2"
              />
            </div>

            <Button
              type="submit"
              className="h-12 w-full py-3 text-base"
              disabled={forgotPassword.isPending}
            >
              {forgotPassword.isPending ? 'Gönderiliyor…' : 'Sıfırlama Bağlantısı Gönder'}
            </Button>

            {forgotPassword.isError && (
              <p className="text-center text-sm text-red-500">
                {getApiErrorMessage(forgotPassword.error)}
              </p>
            )}

            <p className="text-center text-sm text-muted-foreground">
              <Link href="/login" className="font-medium text-primary hover:underline">
                Giriş Yap&apos;a Dön
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
