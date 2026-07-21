'use client';

import { StationPageHeader } from '@/components/layout/StationPageHeader';
import { OcrScanFlow } from '@/components/shared/OcrScanFlow';

export default function IsletmeAppFaturaTaramaPage() {
  return (
    <div>
      <StationPageHeader title="Fatura Tarama" />
      <OcrScanFlow />
    </div>
  );
}
