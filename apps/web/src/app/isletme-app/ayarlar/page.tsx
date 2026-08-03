'use client';

import Link from 'next/link';
import {
  Building2,
  Store,
  User,
  BarChart3,
  ChevronRight,
  LogOut,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { StationPageHeader } from '@/components/layout/StationPageHeader';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/hooks/useAuth';
import { useCloseMembership } from '@/hooks/useMudur';

interface SettingsLink {
  href: string;
  label: string;
  icon: LucideIcon;
}

const links: SettingsLink[] = [
  { href: '/isletme-app/ayarlar/isletme', label: 'İşletme Bilgileri', icon: Building2 },
  { href: '/isletme-app/ayarlar/sube', label: 'Şube Bilgileri', icon: Store },
  { href: '/isletme-app/ayarlar/hesap', label: 'Hesap Bilgileri', icon: User },
  { href: '/isletme-app/ayarlar/rapor', label: 'Rapor Ayarları', icon: BarChart3 },
];

export default function AyarlarPage() {
  const { logout } = useAuth();
  const closeMembership = useCloseMembership();

  return (
    <div className="mx-auto w-full max-w-lg">
      <StationPageHeader title="Ayarlar" />

      <div className="divide-y">
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 py-4 transition-colors hover:bg-muted/40"
          >
            <Icon className="h-6 w-6 shrink-0 text-muted-foreground" />
            <span className="flex-1 text-base">{label}</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </div>

      {/* Hesap eylemleri — diğer satırlardan ayrılmış */}
      <div className="mt-8 divide-y border-t">
        <button
          type="button"
          onClick={() => logout()}
          className="flex w-full items-center gap-3 py-4 text-left transition-colors hover:bg-muted/40"
        >
          <LogOut className="h-6 w-6 shrink-0 text-muted-foreground" />
          <span className="flex-1 text-base">Çıkış Yap</span>
        </button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center gap-3 py-4 text-left text-destructive transition-colors hover:bg-destructive/10"
            >
              <Trash2 className="h-6 w-6 shrink-0" />
              <span className="flex-1 text-base">Üyeliği Sonlandır</span>
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Üyeliği Sonlandır</AlertDialogTitle>
              <AlertDialogDescription>
                Üyeliğinizi sonlandırmak istediğinize emin misiniz? Bu işlem geri
                alınamaz, hesabınıza bir daha giriş yapamazsınız.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={closeMembership.isPending}>
                Vazgeç
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => closeMembership.mutate()}
                disabled={closeMembership.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {closeMembership.isPending ? 'Sonlandırılıyor…' : 'Evet, Sonlandır'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
