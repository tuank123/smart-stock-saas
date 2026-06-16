'use client';

import { PageLayout } from '@/components/layout/PageLayout';

export default function DashboardPage() {
  return (
    <PageLayout title="Dashboard">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {(['Şubeler', 'Ürünler', 'Siparişler', 'Stok Uyarısı'] as const).map((label) => (
          <div key={label} className="rounded-lg border bg-card p-4 shadow-sm">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold">—</p>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-lg border bg-card p-6 shadow-sm">
        <p className="text-sm text-muted-foreground">
          Dashboard içerikleri yakında eklenecek.
        </p>
      </div>
    </PageLayout>
  );
}
