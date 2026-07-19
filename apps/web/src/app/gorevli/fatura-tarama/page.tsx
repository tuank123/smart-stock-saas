'use client';

import { GorevliPageHeader } from '@/components/layout/GorevliPageHeader';
import { OcrScanFlow } from '@/components/shared/OcrScanFlow';

export default function GorevliFaturaTaramaPage() {
  return (
    <div>
      <GorevliPageHeader title="Fatura Tarama" />
      <OcrScanFlow />
    </div>
  );
}
