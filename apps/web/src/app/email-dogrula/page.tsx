'use client';

import { Suspense, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useVerifyEmail, getApiErrorMessage } from '@/hooks/useAuth';

// ── İçerik — useSearchParams kullandığı için Suspense ile sarılı ──────────────

function EmailDogrulaInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const verifyEmail = useVerifyEmail();
  const { mutate } = verifyEmail;

  // Sayfa yüklenince otomatik doğrula. Token tek kullanımlık olduğu için
  // (StrictMode'un çift effect'i dahil) yalnızca bir kez tetiklenmeli.
  const firedRef = useRef(false);
  useEffect(() => {
    if (!token || firedRef.current) return;
    firedRef.current = true;
    mutate({ token });
  }, [token, mutate]);

  if (!token) {
    return (
      <Shell>
        <ResultBox
          tone="error"
          title="Bağlantı geçersiz görünüyor (token bulunamadı)."
          detail="Doğrulama bağlantısını e-postanızdan tekrar açmayı deneyin."
        />
      </Shell>
    );
  }

  if (verifyEmail.isPending || verifyEmail.isIdle) {
    return (
      <Shell>
        <div className="flex items-center justify-center gap-2 rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          E-posta adresiniz doğrulanıyor…
        </div>
      </Shell>
    );
  }

  if (verifyEmail.isError) {
    return (
      <Shell>
        <ResultBox
          tone="error"
          title={getApiErrorMessage(verifyEmail.error)}
          detail="Doğrulama bağlantıları tek kullanımlıktır ve 24 saat sonra geçersiz olur."
        />
      </Shell>
    );
  }

  return (
    <Shell>
      <ResultBox
        tone="success"
        title="E-posta adresiniz doğrulandı"
        detail="Artık hesabınızı tam olarak kullanabilirsiniz."
      />
    </Shell>
  );
}

// ── Ortak kabuk ve sonuç kutusu ───────────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-2xl bg-primary text-3xl font-bold text-primary-foreground">
            SP
          </div>
          <h1 className="text-2xl font-semibold">E-posta Doğrulama</h1>
        </div>

        <div className="space-y-6">
          {children}

          <p className="text-center text-sm text-muted-foreground">
            <Link href="/login" className="font-medium text-primary hover:underline">
              Giriş Yap&apos;a Dön
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function ResultBox({
  tone,
  title,
  detail,
}: {
  tone: 'success' | 'error';
  title: string;
  detail: string;
}) {
  const success = tone === 'success';
  return (
    <div className="space-y-6">
      <div
        className={
          success
            ? 'flex gap-3 rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800'
            : 'flex gap-3 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800'
        }
      >
        {success ? (
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
        ) : (
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
        )}
        <div>
          <p className="font-medium">{title}</p>
          <p className={success ? 'mt-1 text-green-700' : 'mt-1 text-red-700'}>{detail}</p>
        </div>
      </div>

      {success && (
        <Button asChild className="h-12 w-full py-3 text-base">
          <Link href="/login">Giriş Yap</Link>
        </Button>
      )}
    </div>
  );
}

export default function EmailDogrulaPage() {
  return (
    <Suspense>
      <EmailDogrulaInner />
    </Suspense>
  );
}
