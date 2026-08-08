'use client';

import { useState } from 'react';
import { AlertTriangle, BadgeCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { StationPageHeader } from '@/components/layout/StationPageHeader';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { Skeleton } from '@/components/ui/skeleton';
import { useMe, useChangePassword } from '@/hooks/useSettings';
import { useResendVerification } from '@/hooks/useAuth';

export default function HesapBilgileriPage() {
  const { data: me, isPending } = useMe();
  const changePwd = useChangePassword();
  const resendVerification = useResendVerification();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error('Tüm alanlar zorunludur');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('Yeni şifre en az 8 karakter olmalıdır');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Yeni şifreler eşleşmiyor');
      return;
    }
    changePwd.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: () => {
          setCurrentPassword('');
          setNewPassword('');
          setConfirmPassword('');
        },
      },
    );
  }

  return (
    <div className="mx-auto w-full max-w-lg">
      <StationPageHeader title="Hesap Bilgileri" />

      {isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>E-posta</Label>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium">{me?.user.email}</p>
              {me?.user.emailVerified && (
                <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                  <BadgeCheck className="h-3.5 w-3.5" />
                  Doğrulandı
                </span>
              )}
            </div>

            {me && !me.user.emailVerified && (
              <div className="mt-2 flex flex-col gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="font-medium">E-postanız doğrulanmadı</span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="self-start bg-background"
                  disabled={resendVerification.isPending}
                  onClick={() => resendVerification.mutate()}
                >
                  {resendVerification.isPending
                    ? 'Gönderiliyor…'
                    : 'Doğrulama E-postası Gönder'}
                </Button>
              </div>
            )}
          </div>

          <form onSubmit={handlePasswordSubmit} className="grid max-w-sm gap-4 pt-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Şifre Değiştir
            </p>
            <div className="grid gap-1.5">
              <Label htmlFor="current-password">Mevcut Şifre</Label>
              <PasswordInput
                id="current-password"
                value={currentPassword}
                onChange={setCurrentPassword}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="new-password">Yeni Şifre</Label>
              <PasswordInput id="new-password" value={newPassword} onChange={setNewPassword} />
              <p className="text-xs text-muted-foreground">
                En az 8 karakter, 1 büyük harf ve 1 rakam.
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="confirm-password">Yeni Şifre Tekrar</Label>
              <PasswordInput
                id="confirm-password"
                value={confirmPassword}
                onChange={setConfirmPassword}
              />
            </div>
            <div className="pt-1">
              <Button type="submit" disabled={changePwd.isPending}>
                {changePwd.isPending ? 'Kaydediliyor…' : 'Şifreyi Güncelle'}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
