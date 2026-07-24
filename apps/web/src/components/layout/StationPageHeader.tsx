'use client';

import { type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * İstasyon (Şube Görevlisi / Depo) alt sayfaları için basit geri-dönüş başlığı:
 * sol tarafta geri oku (router.back()) + başlık. Role'den bağımsız, generic.
 */
export function StationPageHeader({
  title,
  right,
  onBack,
}: {
  title: string;
  right?: ReactNode;
  onBack?: () => void;
}) {
  const router = useRouter();
  return (
    <div className="mb-6 flex items-center gap-3">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => (onBack ? onBack() : router.back())}
        aria-label="Geri"
      >
        <ArrowLeft className="h-5 w-5" />
      </Button>
      <h1 className="text-xl font-semibold">{title}</h1>
      {right && <div className="ml-auto">{right}</div>}
    </div>
  );
}
