'use client';

import {
  AlertTriangle,
  Building2,
  UserCheck,
  PauseCircle,
  Trash2,
  TrendingUp,
  TrendingDown,
  Users,
  Banknote,
  ServerCrash,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdminStats } from '@/hooks/useAdmin';
import { cn } from '@/lib/utils';

function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  valueClassName,
  iconClassName,
}: {
  label: string;
  value: number | string;
  icon: typeof Building2;
  hint?: string;
  valueClassName?: string;
  iconClassName?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Icon className={cn('h-5 w-5 text-muted-foreground', iconClassName)} />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className={cn('text-2xl font-bold tabular-nums', valueClassName)}>{value}</p>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function fmtMoney(n: number) {
  return `${n.toLocaleString('tr-TR')} ₺`;
}

export default function AdminDashboardPage() {
  const { data, isPending, isError } = useAdminStats();

  return (
    <div className="mx-auto w-full max-w-5xl">
      <h1 className="mb-6 text-2xl font-semibold">Genel Bakış</h1>

      {isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : isError || !data ? (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
          <p className="text-sm text-destructive">İstatistikler yüklenemedi.</p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard label="Toplam İşletme" value={data.totalTenants} icon={Building2} />
            <StatCard label="Toplam Kullanıcı" value={data.totalUsers} icon={Users} />
          </div>

          {/* Net büyüme: yeni kayıt ↔ sonlandırılan (yan yana) */}
          <div>
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Son 7 Gün</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <StatCard
                label="Son 7 Günde Yeni Kayıt"
                value={`+${data.newLast7Days}`}
                icon={TrendingUp}
                valueClassName="text-green-600"
                iconClassName="text-green-600"
              />
              <StatCard
                label="Son 7 Günde Sonlandırılan Üyelik"
                value={`-${data.closedLast7Days}`}
                icon={TrendingDown}
                valueClassName="text-destructive"
                iconClassName="text-destructive"
              />
            </div>
          </div>

          {/* Gelir & Sistem Sağlığı */}
          <div>
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
              Gelir &amp; Sistem Sağlığı
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <StatCard
                label="Tahmini Aylık Gelir"
                value={fmtMoney(data.estimatedMonthlyRevenue)}
                icon={Banknote}
                iconClassName="text-green-600"
                hint="Aktif STARTER ×1.750 ₺ + PROFESSIONAL ×2.000 ₺"
              />
              <StatCard
                label="Başarısız Senkronizasyon İşleri"
                value={data.failedSyncJobs}
                icon={ServerCrash}
                valueClassName={data.failedSyncJobs > 0 ? 'text-destructive' : undefined}
                iconClassName={data.failedSyncJobs > 0 ? 'text-destructive' : undefined}
                hint={data.failedSyncJobs > 0 ? 'İnceleme gerekiyor' : 'Sorun yok'}
              />
            </div>
          </div>

          {/* Durum kırılımı */}
          <div>
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Durum Kırılımı</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard label="Aktif" value={data.statusBreakdown.ACTIVE ?? 0} icon={UserCheck} />
              <StatCard
                label="Askıya Alınmış"
                value={data.statusBreakdown.SUSPENDED ?? 0}
                icon={PauseCircle}
              />
              <StatCard
                label="Silinmiş"
                value={data.statusBreakdown.DELETED ?? 0}
                icon={Trash2}
              />
            </div>
          </div>

          {/* Plan kırılımı */}
          <div>
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Plan Kırılımı</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard label="Başlangıç (STARTER)" value={data.planBreakdown.STARTER ?? 0} icon={Building2} />
              <StatCard
                label="Büyüme (PROFESSIONAL)"
                value={data.planBreakdown.PROFESSIONAL ?? 0}
                icon={Building2}
              />
              <StatCard
                label="Kurumsal (ENTERPRISE)"
                value={data.planBreakdown.ENTERPRISE ?? 0}
                icon={Building2}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
