'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, FileText } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { StationPageHeader } from '@/components/layout/StationPageHeader';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useReport } from '@/hooks/useReports';
import { fmtDate, StatCardSkeleton, MonthlyDetail } from '@/components/reports/ReportDetailContent';
import type { MonthlyPayload } from '@/lib/types';

// isletme-app/aylik-rapor'daki kartlardan gelinir — bu rota yalnızca aylık
// raporlar için (DailyDetail'e gerek yok, günlük rapor zaten
// isletme-app/gunluk-rapor'da canlı gösteriliyor).

function AylikRaporDetayInner() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id') ?? '';
  const qc = useQueryClient();
  const query = useReport(id);
  const report = query.data;

  useEffect(() => {
    if (query.isSuccess) {
      qc.invalidateQueries({ queryKey: ['reports', 'unread'] });
    }
  }, [query.isSuccess, qc]);

  const title = report ? `Aylık Rapor — ${fmtDate(report.reportDate)}` : 'Rapor Detay';

  return (
    <div className="mx-auto w-full max-w-lg">
      <StationPageHeader title={title} />

      {report?.pdfUrl && (
        <div className="mb-4">
          <Button variant="outline" size="sm" asChild>
            <a href={report.pdfUrl} target="_blank" rel="noreferrer">
              <FileText className="mr-1.5 h-4 w-4" />
              PDF İndir
            </a>
          </Button>
        </div>
      )}

      {query.isError && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive">Rapor yüklenemedi.</p>
        </div>
      )}

      {query.isPending && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </div>
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      )}

      {report && <MonthlyDetail payload={report.payload as MonthlyPayload} />}
    </div>
  );
}

export default function AylikRaporDetayPage() {
  return (
    <Suspense>
      <AylikRaporDetayInner />
    </Suspense>
  );
}
