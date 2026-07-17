'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useMe, useChangePassword } from '@/hooks/useSettings';

// ── Config maps ───────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  ACTIVE:    { label: 'Aktif',           className: 'bg-green-100 text-green-700 border-green-200' },
  SUSPENDED: { label: 'Askıya Alındı',   className: 'bg-orange-100 text-orange-700 border-orange-200' },
  DELETED:   { label: 'Silindi',         className: 'bg-red-100 text-red-700 border-red-200' },
};

const PLAN_CONFIG: Record<string, { label: string; className: string }> = {
  STARTER:      { label: 'Başlangıç', className: 'bg-slate-100 text-slate-600 border-slate-200' },
  PROFESSIONAL: { label: 'Büyüme',    className: 'bg-blue-100 text-blue-700 border-blue-200' },
  ENTERPRISE:   { label: 'Kurumsal',  className: 'bg-purple-100 text-purple-700 border-purple-200' },
};

const ROLE_LABELS: Record<string, string> = {
  PATRON:       'Patron',
  SUPER_ADMIN:  'Süper Admin',
  SUBE_MUDURU:  'Şube Müdürü',
  KASIYER:      'Kasiyer',
  DEPO:         'Depo',
};

// ── Small helpers ─────────────────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase mb-3">
      {children}
    </h2>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="text-sm font-medium">{children}</div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <Card>
      <CardContent className="p-6">
        <Skeleton className="h-32 w-full" />
      </CardContent>
    </Card>
  );
}

function TenantStatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status];
  if (!cfg) return <span>{status}</span>;
  return <Badge variant="outline" className={`text-xs ${cfg.className}`}>{cfg.label}</Badge>;
}

function PlanBadge({ planId }: { planId: string }) {
  const cfg = PLAN_CONFIG[planId];
  if (!cfg) return <span>{planId}</span>;
  return <Badge variant="outline" className={`text-xs ${cfg.className}`}>{cfg.label}</Badge>;
}

// ── Password input with show/hide toggle ──────────────────────────────────────

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

// ── Shared settings content (no page-chrome wrapper) ──────────────────────────

export function SettingsContent() {
  const { data, isPending } = useMe();
  const changePwd = useChangePassword();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const user = data?.user;
  const tenant = data?.tenant;

  function handleSubmit(e: React.FormEvent) {
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
    <>
      {/* Bölüm 1: İşletme Bilgileri */}
      <div className="mb-6">
        <SectionHeading>İşletme Bilgileri</SectionHeading>
        {isPending ? (
          <SkeletonCard />
        ) : (
          <Card>
            <CardContent className="p-6 grid gap-4 sm:grid-cols-2">
              <InfoRow label="Ticari Unvan">{tenant?.companyName}</InfoRow>
              <InfoRow label="Vergi No">{tenant?.taxNumber}</InfoRow>
              <InfoRow label="Durum">
                {tenant && <TenantStatusBadge status={tenant.status} />}
              </InfoRow>
              <InfoRow label="Plan">
                {tenant && <PlanBadge planId={tenant.planId} />}
              </InfoRow>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Bölüm 2: Hesap Bilgileri */}
      <div className="mb-6">
        <SectionHeading>Hesap Bilgileri</SectionHeading>
        {isPending ? (
          <SkeletonCard />
        ) : (
          <Card>
            <CardContent className="p-6 grid gap-4 sm:grid-cols-2">
              <InfoRow label="E-posta">{user?.email}</InfoRow>
              <InfoRow label="Rol">
                {user && (ROLE_LABELS[user.role] ?? user.role)}
              </InfoRow>
              <InfoRow label="Üyelik Başlangıcı">
                {user &&
                  new Intl.DateTimeFormat('tr-TR', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  }).format(new Date(user.createdAt))}
              </InfoRow>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Bölüm 3: Şifre Değiştir */}
      <div>
        <SectionHeading>Şifre Değiştir</SectionHeading>
        {isPending ? (
          <SkeletonCard />
        ) : (
          <Card>
            <CardContent className="p-6">
              <form onSubmit={handleSubmit} className="grid gap-4 max-w-sm">
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
                  <PasswordInput
                    id="new-password"
                    value={newPassword}
                    onChange={setNewPassword}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="confirm-password">Yeni Şifre Tekrar</Label>
                  <PasswordInput
                    id="confirm-password"
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                  />
                </div>
                <div className="pt-2">
                  <Button type="submit" disabled={changePwd.isPending}>
                    {changePwd.isPending ? 'Kaydediliyor…' : 'Kaydet'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
