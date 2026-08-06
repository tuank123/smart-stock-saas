'use client';

import Link from 'next/link';
import { ChevronRight, FileText, Shield, ScrollText, Cookie, type LucideIcon } from 'lucide-react';
import { StationPageHeader } from '@/components/layout/StationPageHeader';

interface LegalLink {
  href: string;
  label: string;
  icon: LucideIcon;
}

const links: LegalLink[] = [
  { href: '/isletme-app/ayarlar/yasal/kvkk', label: 'KVKK Aydınlatma Metni', icon: FileText },
  { href: '/isletme-app/ayarlar/yasal/gizlilik', label: 'Gizlilik Politikası', icon: Shield },
  {
    href: '/isletme-app/ayarlar/yasal/kullanim-kosullari',
    label: 'Kullanım Koşulları',
    icon: ScrollText,
  },
  { href: '/isletme-app/ayarlar/yasal/cerez', label: 'Çerez Politikası', icon: Cookie },
];

export default function YasalPage() {
  return (
    <div className="mx-auto w-full max-w-lg">
      <StationPageHeader title="Yasal" />

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
    </div>
  );
}
