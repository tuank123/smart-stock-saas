'use client';

import { ReportsContent } from '@/components/reports/ReportsContent';
import { OnboardingTour } from '@/components/onboarding/OnboardingTour';
import { WEB_ONBOARDING_STEPS } from '@/lib/help-content';
import { WEB_ONBOARDING_STORAGE_KEY } from '@/lib/onboarding';

// isletme/layout.tsx zaten Header + <main>'i sağlıyor; burada sadece içerik.
// Web turu yalnızca burada (ilk gerçek ekran) gösterilir, entegrasyon
// sayfasında tekrar tetiklenmez — bkz. WEB_ONBOARDING_STORAGE_KEY.
export default function IsletmeRaporlarPage() {
  return (
    <>
      <OnboardingTour steps={WEB_ONBOARDING_STEPS} storageKey={WEB_ONBOARDING_STORAGE_KEY} />
      <ReportsContent />
    </>
  );
}
