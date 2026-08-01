'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { StationPageHeader } from '@/components/layout/StationPageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useMe, useChangePassword } from '@/hooks/useSettings';

// ── Şifre input'u ─────────────────────────────────────────────────────────────

interface PasswordInputProps {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

function PasswordInput({ id, value, onChange, placeholder }: PasswordInputProps) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pr-9"
      />
      <button
        type="button"
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        onClick={() => setShow((s) => !s)}
        tabIndex={-1}
        aria-label={show ? 'Şifreyi gizle' : 'Şifreyi göster'}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

export default function HesapBilgileriPage() {
  const { data: me, isPending } = useMe();
  const changePwd = useChangePassword();

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
            <p className="text-sm font-medium">{me?.user.email}</p>
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
