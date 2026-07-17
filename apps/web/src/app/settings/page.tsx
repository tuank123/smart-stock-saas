'use client';

import { PageLayout } from '@/components/layout/PageLayout';
import { SettingsContent } from '@/components/settings/SettingsContent';

export default function SettingsPage() {
  return (
    <PageLayout title="Ayarlar">
      <SettingsContent />
    </PageLayout>
  );
}
