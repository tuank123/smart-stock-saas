'use client';

import { Suspense, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, AlertTriangle, FileText } from 'lucide-react';

import { PageLayout } from '@/components/layout/PageLayout';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useQueryClient } from '@tanstack/react-query';
import { useReport } from '@/hooks/useReports';
import {
  fmtDate,
  StatCardSkeleton,
  DailyDetail,
  MonthlyDetail,
} from '@/components/reports/ReportDetailContent';
import type { DailyPayload, MonthlyPayload, ReportDetail } from '@/lib/types';

// ── Inner content — needs useSearchParams so wrapped in Suspense ──────────────

function ReportDetailInner() {
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

  const title = report
    ? `${report.reportType === 'DAILY' ? 'Günlük' : 'Aylık'} Rapor — ${fmtDate(report.reportDate)}`
    : 'Rapor Detay';

  function isDaily(r: ReportDetail): r is ReportDetail & { payload: DailyPayload } {
    return r.reportType === 'DAILY';
  }

  return (
    <PageLayout title={title}>
      {/* Back button */}
      <div className="mb-5 flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/reports">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Raporlara Dön
          </Link>
        </Button>

        {report?.pdfUrl && (
          <Button variant="outline" size="sm" asChild>
            <a href={report.pdfUrl} target="_blank" rel="noreferrer">
              <FileText className="mr-1.5 h-4 w-4" />
              PDF İndir
            </a>
          </Button>
        )}
      </div>

      {/* Error */}
      {query.isError && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive">Rapor yüklenemedi.</p>
        </div>
      )}

      {/* Loading */}
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

      {/* Detail */}
      {report && (
        isDaily(report)
          ? <DailyDetail payload={report.payload as DailyPayload} />
          : <MonthlyDetail payload={report.payload as MonthlyPayload} />
      )}
    </PageLayout>
  );
}

// ── Page export — wrap in Suspense for useSearchParams ────────────────────────

export default function ReportDetailPage() {
  return (
    <Suspense>
      <ReportDetailInner />
    </Suspense>
  );
}
