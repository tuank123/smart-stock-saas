'use client';

import { AlertTriangle, ShoppingCart, ArrowLeftRight, Building2, Wifi, WifiOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useMudurDashboard } from '@/hooks/useMudur';

// ── Stat card ─────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  highlight?: 'warning' | 'info';
}

function StatCard({ label, value, icon, highlight }: StatCardProps) {
  const warn = highlight === 'warning' && Number(value) > 0;
  return (
    <div
      className={`rounded-lg border bg-card p-4 shadow-sm ${
        warn ? 'border-amber-400/50 bg-amber-50/50 dark:bg-amber-950/20' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        <span className={warn ? 'text-amber-500' : 'text-muted-foreground'}>{icon}</span>
      </div>
      <p className={`mt-2 text-3xl font-bold ${warn ? 'text-amber-600 dark:text-amber-400' : ''}`}>
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
      <Skeleton className="h-8 w-20" />
    </div>
  );
}

// ── Branch info card ──────────────────────────────────────────────────────────

function BranchInfoSkeleton() {
  return (
    <Card>
      <CardContent className="p-6 space-y-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-5 w-28" />
      </CardContent>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MudurDashboardPage() {
  const { branch, criticalStockCount, draftOrderCount, requestedTransferCount, isLoading, isError } =
    useMudurDashboard();

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">Dashboard</h1>

      {isError && (
        <div className="mb-5 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive">Veriler yüklenirken hata oluştu.</p>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
              label="Şube"
              value={branch?.name ?? '—'}
              icon={<Building2 className="h-4 w-4" />}
            />
            <StatCard
              label="Kritik Stok"
              value={criticalStockCount}
              icon={<AlertTriangle className="h-4 w-4" />}
              highlight="warning"
            />
            <StatCard
              label="Bekleyen Sipariş"
              value={draftOrderCount}
              icon={<ShoppingCart className="h-4 w-4" />}
              highlight="warning"
            />
            <StatCard
              label="Bekleyen Transfer"
              value={requestedTransferCount}
              icon={<ArrowLeftRight className="h-4 w-4" />}
              highlight="warning"
            />
          </>
        )}
      </div>

      {/* Branch info card */}
      <div className="mt-6">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Şube Bilgileri
        </h2>

        {isLoading ? (
          <BranchInfoSkeleton />
        ) : branch ? (
          <Card>
            <CardContent className="p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1.5">
                  <p className="font-medium">{branch.name}</p>
                  {branch.address ? (
                    <p className="text-sm text-muted-foreground">{branch.address}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">Adres belirtilmemiş</p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end">
                  <Badge variant={branch.isActive ? 'default' : 'secondary'} className="text-xs">
                    {branch.isActive ? 'Aktif' : 'Pasif'}
                  </Badge>

                  {branch.integrationStatus ? (
                    <Badge
                      variant="outline"
                      className="flex items-center gap-1 text-xs text-green-700 border-green-300"
                    >
                      <Wifi className="h-3 w-3" />
                      {branch.integrationStatus}
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="flex items-center gap-1 text-xs text-muted-foreground"
                    >
                      <WifiOff className="h-3 w-3" />
                      Entegrasyon yok
                    </Badge>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
