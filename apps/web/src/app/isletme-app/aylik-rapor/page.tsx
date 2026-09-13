'use client';

import { StationPageHeader } from '@/components/layout/StationPageHeader';
import { ReportsContent } from '@/components/reports/ReportsContent';

// Günlük rapor zaten isletme-app/gunluk-rapor'da canlı gösteriliyor, bu
// yüzden burada yalnızca MONTHLY listelenir (fixedType) — kartlar isletme-app
// kabuğundan hiç çıkmadan kendi detay rotasına gider (detailBasePath).
export default function AylikRaporPage() {
  return (
    <div className="mx-auto w-full max-w-lg">
      <StationPageHeader title="Aylık Raporlar" />
      <ReportsContent fixedType="MONTHLY" detailBasePath="/isletme-app/aylik-rapor/detay" />
    </div>
  );
}
