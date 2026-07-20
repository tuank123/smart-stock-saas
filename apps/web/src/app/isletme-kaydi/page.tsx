'use client';

import { useState } from 'react';
import Link from 'next/link';
import axios from 'axios';
import toast from 'react-hot-toast';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTenantSignup } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

type Plan = 'TEK_SUBE' | 'COK_SUBE';

// kayit-ol/page.tsx ile aynı hata çıkarma deseni.
function extractError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    if (!err.response) return 'Sunucuya bağlanılamadı';
    const msg = err.response.data?.message;
    if (Array.isArray(msg)) return msg.join(', ');
    if (typeof msg === 'string') return msg;
  }
  return 'Kayıt tamamlanamadı. Lütfen tekrar deneyin.';
}

const PLANS: { value: Plan; title: string; desc: string }[] = [
  {
    value: 'TEK_SUBE',
    title: 'Tek Şubeli',
    desc: 'Tek şubeniz için OCR fatura okuma, WhatsApp fiyat güncelleme, otomatik sipariş önerisi ve acil durum kasası.',
  },
  {
    value: 'COK_SUBE',
    title: 'Çok Şubeli',
    desc: 'Birden fazla şubenizi tek merkezden yönetin; stok, sipariş ve transfer takibi.',
  },
];

export default function IsletmeKaydiPage() {
  const signup = useTenantSignup();
  const [step, setStep] = useState<1 | 2>(1);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [form, setForm] = useState({
    companyName: '',
    taxNumber: '',
    branchName: '',
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  function selectPlan(p: Plan) {
    setPlan(p);
    setStep(2);
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!plan) return;

    if (form.password.length < 8) {
      toast.error('Şifre en az 8 karakter olmalıdır');
      return;
    }
    if (form.password !== form.confirmPassword) {
      toast.error('Şifreler eşleşmiyor');
      return;
    }

    signup.mutate(
      {
        companyName: form.companyName.trim(),
        taxNumber: form.taxNumber.trim(),
        businessType: plan,
        branchName: form.branchName.trim(),
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        password: form.password,
      },
      {
        onError: (err) => toast.error(extractError(err)),
      },
    );
  };

  const branchPlaceholder = plan === 'COK_SUBE' ? 'İlk şubenizin adı' : 'Merkez Şube';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-2xl bg-primary text-3xl font-bold text-primary-foreground">
            SP
          </div>
          <h1 className="text-2xl font-semibold">İşletme Kaydı</h1>
          <p className="mt-1.5 text-base text-muted-foreground">
            {step === 1 ? 'İşletme tipinizi seçin' : 'İşletme bilgilerinizi girin'}
          </p>
        </div>

        {/* ── Adım 1 — Plan Seçimi ─────────────────────────────── */}
        {step === 1 ? (
          <div className="space-y-4">
            {PLANS.map((p) => {
              const selected = plan === p.value;
              return (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => selectPlan(p.value)}
                  className={cn(
                    'w-full rounded-2xl border bg-card p-5 text-left shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    selected && 'border-primary ring-2 ring-primary/40',
                  )}
                >
                  <p className="text-base font-semibold">{p.title}</p>
                  <p className="mt-1.5 text-sm text-muted-foreground">{p.desc}</p>
                </button>
              );
            })}

            <p className="text-center text-sm text-muted-foreground">
              Zaten hesabın var mı?{' '}
              <Link href="/login" className="font-medium text-primary hover:underline">
                Giriş Yap
              </Link>
            </p>
          </div>
        ) : (
          /* ── Adım 2 — Kayıt Formu ─────────────────────────────── */
          <form onSubmit={handleSubmit} className="space-y-5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2 gap-1.5"
              onClick={() => setStep(1)}
            >
              <ArrowLeft className="h-4 w-4" />
              Geri
            </Button>

            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="companyName">Firma Adı</label>
              <input
                id="companyName"
                type="text"
                required
                value={form.companyName}
                onChange={set('companyName')}
                placeholder="Acme Gıda A.Ş."
                className="w-full rounded-md border bg-background px-4 py-3 text-base outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="taxNumber">Vergi Numarası</label>
              <input
                id="taxNumber"
                type="text"
                required
                value={form.taxNumber}
                onChange={set('taxNumber')}
                placeholder="1234567890"
                className="w-full rounded-md border bg-background px-4 py-3 text-base outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="branchName">Şube Adı</label>
              <input
                id="branchName"
                type="text"
                required
                value={form.branchName}
                onChange={set('branchName')}
                placeholder={branchPlaceholder}
                className="w-full rounded-md border bg-background px-4 py-3 text-base outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="fullName">Ad Soyad</label>
              <input
                id="fullName"
                type="text"
                autoComplete="name"
                required
                value={form.fullName}
                onChange={set('fullName')}
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

            <Button type="submit" className="h-12 w-full py-3 text-base" disabled={signup.isPending}>
              {signup.isPending ? 'Kaydediliyor...' : 'Kaydol'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
