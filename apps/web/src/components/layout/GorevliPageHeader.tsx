'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Şube Görevlisi alt sayfaları için basit geri-dönüş başlığı:
 * sol tarafta geri oku (router.back()) + başlık.
 */
export function GorevliPageHeader({ title }: { title: string }) {
  const router = useRouter();
  return (
    <div className="mb-6 flex items-center gap-3">
      <Button variant="ghost" size="icon" onClick={() => router.back()} aria-label="Geri">
        <ArrowLeft className="h-5 w-5" />
      </Button>
      <h1 className="text-xl font-semibold">{title}</h1>
    </div>
  );
}
