'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FileText, FileDown, AlertTriangle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useReports } from '@/hooks/useReports';
import type { Report } from '@/lib/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

type FilterType = 'all' | 'DAILY' | 'MONTHLY';

const TYPE_LABEL: Record<string, string> = { DAILY: 'Günlük', MONTHLY: 'Aylık' };

function fmtDate(dateStr: string) {
  return new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date(dateStr));
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function ReportCardSkeleton() {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-md shrink-0" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-28" />
          </div>
        </div>
        <Skeleton className="h-5 w-16 shrink-0" />
      </div>
    </div>
  );
}

// ── Report card ───────────────────────────────────────────────────────────────

function ReportCard({ report }: { report: Report }) {
  const typeLabel = TYPE_LABEL[report.reportType] ?? report.reportType;
  const date = fmtDate(report.reportDate);

  return (
    <Link
      href={`/reports/detay?id=${report.id}`}
      className="group block rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-3">
        {/* Left: icon + meta */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
            <FileText className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="font-medium leading-tight">
              {typeLabel} Rapor
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">{date}</p>
          </div>
        </div>

        {/* Right: status + pdf */}
        <div className="flex shrink-0 items-center gap-2">
          {report.pdfUrl && (
            <span className="text-muted-foreground" title="PDF mevcut">
              <FileDown className="h-4 w-4" />
            </span>
          )}
          {report.isRead ? (
            <Badge variant="outline" className="text-xs text-muted-foreground">
              Okundu
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="text-xs font-medium border-orange-300 bg-orange-50 text-orange-700"
            >
              Okunmadı
            </Badge>
          )}
        </div>
      </div>
    </Link>
  );
}

// ── Content ─────────────────────────────────────────────────────────────────

const FILTERS: { value: FilterType; label: string }[] = [
  { value: 'all', label: 'Tümü' },
  { value: 'DAILY', label: 'Günlük' },
  { value: 'MONTHLY', label: 'Aylık' },
];

export function ReportsContent() {
  const [filter, setFilter] = useState<FilterType>('all');
  const query = useReports(filter === 'all' ? undefined : filter);
  const reports = query.data ?? [];

  return (
    <>
      {/* Filter buttons */}
      <div className="mb-5 flex items-center gap-2">
        {FILTERS.map(({ value, label }) => (
          <Button
            key={value}
            size="sm"
            variant={filter === value ? 'default' : 'outline'}
            onClick={() => setFilter(value)}
          >
            {label}
          </Button>
        ))}
        <span className="ml-auto text-sm text-muted-foreground">
          {query.isSuccess ? `${reports.length} rapor` : ' '}
        </span>
      </div>

      {/* Error */}
      {query.isError && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive">Raporlar yüklenemedi.</p>
        </div>
      )}

      {/* Content */}
      {query.isPending ? (
        <div className="space-y-3">
          <ReportCardSkeleton />
          <ReportCardSkeleton />
          <ReportCardSkeleton />
        </div>
      ) : reports.length === 0 ? (
        <div className="rounded-xl border bg-card p-12 text-center">
          <FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Henüz rapor yok.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((r: Report) => (
            <ReportCard key={r.id} report={r} />
          ))}
        </div>
      )}
    </>
  );
}
