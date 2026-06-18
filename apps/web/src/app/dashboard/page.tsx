'use client';

import Link from 'next/link';
import { Building2, ShoppingCart, AlertTriangle, FileText, Wifi, WifiOff } from 'lucide-react';
import { PageLayout } from '@/components/layout/PageLayout';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useDashboard } from '@/hooks/useDashboard';
import type { BranchDashboardRow, Report } from '@/lib/types';

// ── Stat card ─────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  highlight?: 'warning' | 'info';
}

function StatCard({ label, value, icon, highlight }: StatCardProps) {
  return (
    <div
      className={`rounded-lg border bg-card p-4 shadow-sm ${
        highlight === 'warning' && value > 0
          ? 'border-amber-400/50 bg-amber-50/50 dark:bg-amber-950/20'
          : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        <span
          className={
            highlight === 'warning' && value > 0
              ? 'text-amber-500'
              : 'text-muted-foreground'
          }
        >
          {icon}
        </span>
      </div>
      <p
        className={`mt-2 text-3xl font-bold ${
          highlight === 'warning' && value > 0 ? 'text-amber-600 dark:text-amber-400' : ''
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function StatCardSkeleton() {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-4 w-4 rounded-full" />
      </div>
      <Skeleton className="h-8 w-16" />
    </div>
  );
}

// ── Branch list ───────────────────────────────────────────────────────────────

function BranchRow({ branch }: { branch: BranchDashboardRow }) {
  const hasIntegration = branch.integration != null;
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border bg-card p-4 shadow-sm">
      <div className="min-w-0">
        <p className="font-medium truncate">{branch.name}</p>
        {branch.address ? (
          <p className="mt-0.5 text-sm text-muted-foreground truncate">{branch.address}</p>
        ) : (
          <p className="mt-0.5 text-sm text-muted-foreground italic">Adres belirtilmemiş</p>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-2">
        <Badge
          variant={hasIntegration ? 'default' : 'secondary'}
          className="flex items-center gap-1 text-xs"
        >
          {hasIntegration ? (
            <>
              <Wifi className="h-3 w-3" />
              {branch.integration!.adapterType}
            </>
          ) : (
            <>
              <WifiOff className="h-3 w-3" />
              Entegrasyon yok
            </>
          )}
        </Badge>

        <div className="flex gap-2">
          {branch.criticalStockCount > 0 && (
            <Badge variant="destructive" className="text-xs">
              {branch.criticalStockCount} kritik stok
            </Badge>
          )}
          {branch.draftOrderCount > 0 && (
            <Badge variant="outline" className="text-xs">
              {branch.draftOrderCount} bekleyen sipariş
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

function BranchListSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-lg border bg-card p-4 shadow-sm flex items-start justify-between gap-4">
          <div className="space-y-2 flex-1">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
      ))}
    </div>
  );
}

// ── Report list ───────────────────────────────────────────────────────────────

const REPORT_TYPE_LABELS: Record<string, string> = {
  DAILY: 'Günlük',
  MONTHLY: 'Aylık',
};

function ReportItem({ report }: { report: Report }) {
  const typeLabel = REPORT_TYPE_LABELS[report.reportType] ?? report.reportType;
  const date = new Date(report.reportDate).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <Link
      href={`/reports/${report.id}`}
      className="flex items-center justify-between gap-3 py-2 border-b last:border-0 hover:bg-muted/40 -mx-2 px-2 rounded transition-colors"
    >
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm">
          {typeLabel} Rapor — {date}
        </span>
      </div>
      {!report.isRead && (
        <Badge variant="secondary" className="text-xs shrink-0">
          Okunmadı
        </Badge>
      )}
    </Link>
  );
}

// ── Dashboard page ────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const {
    totalBranches,
    integratedBranches,
    totalCriticalStock,
    totalDraftOrders,
    unreadReports,
    branchRows,
    isLoading,
    isError,
  } = useDashboard();

  return (
    <PageLayout title="Dashboard">
      {/* Error banner */}
      {isError && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive">
            Veriler yüklenirken hata oluştu. Sayfayı yenileyip tekrar deneyin.
          </p>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <StatCard
              label="Toplam Şube"
              value={totalBranches}
              icon={<Building2 className="h-4 w-4" />}
            />
            <StatCard
              label="Entegre Şube"
              value={integratedBranches}
              icon={<Wifi className="h-4 w-4" />}
              highlight="info"
            />
            <StatCard
              label="Kritik Stok"
              value={totalCriticalStock}
              icon={<AlertTriangle className="h-4 w-4" />}
              highlight="warning"
            />
            <StatCard
              label="Onay Bekleyen Oto. Sipariş"
              value={totalDraftOrders}
              icon={<ShoppingCart className="h-4 w-4" />}
              highlight="warning"
            />
          </>
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Branch list */}
        <div className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Şubeler
          </h2>
          {isLoading ? (
            <BranchListSkeleton />
          ) : branchRows.length === 0 ? (
            <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
              Henüz şube eklenmemiş.
            </div>
          ) : (
            <div className="space-y-3">
              {branchRows.map((b) => (
                <BranchRow key={b.id} branch={b} />
              ))}
            </div>
          )}
        </div>

        {/* Unread reports */}
        <div>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Okunmamış Raporlar
            {unreadReports.length > 0 && (
              <Badge variant="destructive" className="text-xs">
                {unreadReports.length}
              </Badge>
            )}
          </h2>

          <div className="rounded-lg border bg-card p-4 shadow-sm">
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-3/4" />
              </div>
            ) : unreadReports.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Okunmamış rapor yok.
              </p>
            ) : (
              <div>
                {unreadReports.map((r) => (
                  <ReportItem key={r.id} report={r} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
