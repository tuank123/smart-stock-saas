'use client';

import Link from 'next/link';
import { Camera, History, PackageCheck, Search, type LucideIcon } from 'lucide-react';

// İleride yeni istasyon eklemek için bu diziye bir satır eklemek yeterli.
interface StationAction {
  href: string;
  label: string;
  icon: LucideIcon;
}

const actions: StationAction[] = [
  { href: '/depo/siparisler', label: 'Sipariş Teslim Alma', icon: PackageCheck },
  { href: '/depo/stok-sorgu', label: 'Stok Sorgulama', icon: Search },
  { href: '/depo/fatura-tarama', label: 'Fatura Tarama', icon: Camera },
  { href: '/depo/hareketler', label: 'Stok Hareketleri', icon: History },
];

export default function DepoDashboardPage() {
  return (
    <div className="mx-auto w-full max-w-lg">
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
