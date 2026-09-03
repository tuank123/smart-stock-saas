'use client';

import Link from 'next/link';
import {
  Camera,
  MessageSquare,
  ShoppingCart,
  Store,
  Wallet,
  Search,
  BarChart3,
  Settings,
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react';
import { useDebtReminders } from '@/hooks/useMudur';
import { OnboardingTour } from '@/components/onboarding/OnboardingTour';

// İleride yeni istasyon eklemek için bu diziye bir satır eklemek yeterli.
interface StationAction {
  href: string;
  label: string;
  icon: LucideIcon;
}

const actions: StationAction[] = [
  { href: '/isletme-app/fatura-tarama', label: 'Fatura Tarama', icon: Camera },
  { href: '/isletme-app/whatsapp-fiyat', label: 'WhatsApp Fiyat Güncelleme', icon: MessageSquare },
  { href: '/isletme-app/siparis-onerileri', label: 'Sipariş Önerileri', icon: ShoppingCart },
  { href: '/isletme-app/gecici-kasa', label: 'Geçici Kasa', icon: Store },
  { href: '/isletme-app/alacak-verecek', label: 'Alacak Verecek Listeleri', icon: Wallet },
  { href: '/isletme-app/stok-sorgu', label: 'Stok Sorgulama', icon: Search },
  { href: '/isletme-app/gunluk-rapor', label: 'Günlük Rapor', icon: BarChart3 },
  { href: '/isletme-app/ayarlar', label: 'Ayarlar', icon: Settings },
];

export default function IsletmeAppDashboardPage() {
  const { data: reminders } = useDebtReminders();

  const showVisit = reminders?.showVisitReminder ?? false;
  const receivableCount = reminders?.receivableReminders.length ?? 0;
  const showReminderCard = showVisit || receivableCount > 0;

  return (
    <div className="mx-auto w-full max-w-lg">
      <OnboardingTour />

      {showReminderCard && (
        <Link
          href="/isletme-app/alacak-verecek"
          className="mb-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900 shadow-sm transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div className="space-y-1 text-sm">
            {showVisit && <p>Alacak Verecek bölümüne 2 gündür bakmadınız.</p>}
            {receivableCount > 0 && (
              <p>{receivableCount} alacak kaydı için hatırlatma zamanı geldi.</p>
            )}
          </div>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-4">
        {actions.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex min-h-32 flex-col items-center justify-center gap-3 rounded-2xl border bg-card p-4 text-center shadow-sm transition-colors hover:bg-muted active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Icon className="h-10 w-10 text-primary" />
            <span className="text-base font-medium">{label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
