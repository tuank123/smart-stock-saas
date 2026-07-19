'use client';

import { OcrScanFlow } from '@/components/shared/OcrScanFlow';

export default function MudurOcrPage() {
  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">Fatura Tarama (OCR)</h1>
      <OcrScanFlow />
    </div>
  );
}
