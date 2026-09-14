import {
  AlertTriangle,
  ShoppingCart,
  TrendingDown,
  ArrowDown,
  ArrowUp,
  PackageX,
  Wallet,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuthStore } from '@/store/auth.store';
import type { DailyPayload, MonthlyPayload } from '@/lib/types';

// isletme-app/aylik-rapor/detay ve web/reports/detay TARAFINDAN PAYLAŞILIR —
// reports/detay/page.tsx'ten çıkarıldı (bkz. görev notları). Layout'tan
// tamamen bağımsız (yalnızca payload prop'u alıyor), her iki rota da kendi
// sarmalayıcısını (PageLayout / StationPageHeader) kullanmaya devam eder.

// ── Helpers ───────────────────────────────────────────────────────────────────

export function fmtDate(dateStr: string) {
  return new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date(dateStr));
}

export function currency(val: number) {
  return `${Number(val).toLocaleString('tr-TR')} ₺`;
}

// ── Stat card (same pattern as dashboard/page.tsx) ────────────────────────────

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  highlight?: 'warning';
}

export function StatCard({ label, value, icon, highlight }: StatCardProps) {
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

export function StatCardSkeleton() {
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

// ── Section heading ───────────────────────────────────────────────────────────

export function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
      {children}
    </h2>
  );
}

// ── DAILY detail ──────────────────────────────────────────────────────────────

export function DailyDetail({ payload }: { payload: DailyPayload }) {
  const { totals, branches, anomalies } = payload;
  // ScheduledReport.payload şema-sürümsüz bir JSON blob — bu alanlar bu
  // özellikten ÖNCE üretilmiş eski (arşivlenmiş) günlük raporlarda hiç yok
  // (bkz. MonthlyDetail'deki aynı gerekçe).
  const totalRevenue = totals.totalRevenue ?? 0;
  const allDefectiveItems = branches.flatMap((b) =>
    (b.defectiveItems ?? []).map((d) => ({ ...d, branchName: b.branchName })),
  );

  return (
    <>
      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Toplam Ciro"
          value={currency(totalRevenue)}
          icon={<Wallet className="h-4 w-4" />}
        />
        <StatCard
          label="Toplam Sipariş"
          value={totals.totalOrders}
          icon={<ShoppingCart className="h-4 w-4" />}
        />
        <StatCard
          label="Kritik Stok"
          value={totals.totalCriticalStock}
          icon={<AlertTriangle className="h-4 w-4" />}
          highlight="warning"
        />
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Stok Hareketi</p>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="flex items-center gap-1 text-xl font-bold text-green-600">
              <ArrowDown className="h-4 w-4" />
              {totals.totalMovementsIn.toLocaleString('tr-TR')}
            </span>
            <span className="text-muted-foreground">/</span>
            <span className="flex items-center gap-1 text-xl font-bold text-red-500">
              <ArrowUp className="h-4 w-4" />
              {totals.totalMovementsOut.toLocaleString('tr-TR')}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Giriş / Çıkış</p>
        </div>
      </div>

      {/* Branches table */}
      <div className="mt-6">
        <SectionHeading>Şubeler</SectionHeading>
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Şube</TableHead>
                <TableHead className="text-right">Ciro</TableHead>
                <TableHead className="text-right">Sipariş</TableHead>
                <TableHead className="text-right">Onaylanan Değer</TableHead>
                <TableHead className="text-right">Kritik Stok</TableHead>
                <TableHead className="text-right">Giriş</TableHead>
                <TableHead className="text-right">Çıkış</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {branches.map((b) => (
                <TableRow key={b.branchId}>
                  <TableCell className="font-medium">{b.branchName}</TableCell>
                  <TableCell className="text-right">{currency(b.revenue ?? 0)}</TableCell>
                  <TableCell className="text-right">{b.totalOrders}</TableCell>
                  <TableCell className="text-right">{currency(b.approvedOrdersValue)}</TableCell>
                  <TableCell className="text-right">
                    {b.criticalStockCount > 0 ? (
                      <span className="font-semibold text-amber-600">{b.criticalStockCount}</span>
                    ) : (
                      b.criticalStockCount
                    )}
                  </TableCell>
                  <TableCell className="text-right text-green-600">{b.stockMovementsIn}</TableCell>
                  <TableCell className="text-right text-red-500">{b.stockMovementsOut}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Zayiatlar — MonthlyDetail'deki AYNI görsel desen, şube adı eklenmiş
          (bu veri per-branch — birden fazla şube varsa hangi şubeden geldiği
          görünsün). */}
      <div className="mt-6">
        <SectionHeading>
          <span className="flex items-center gap-1.5 text-destructive">
            <PackageX className="h-3.5 w-3.5" />
            Zayiatlar
          </span>
        </SectionHeading>
        {allDefectiveItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">Bu gün zayiat kaydı yok.</p>
        ) : (
          <div className="space-y-1.5">
            {allDefectiveItems.map((d, i) => (
              <div
                key={`${d.branchName}-${d.productId}-${i}`}
                className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{d.productName}</p>
                  {branches.length > 1 && (
                    <p className="text-xs text-muted-foreground">{d.branchName}</p>
                  )}
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {d.quantity.toLocaleString('tr-TR')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Fiyat Anomalisi Detayları — MonthlyDetail'deki AYNI görsel desen
          (kart listesi). PriceChangeLog.branchId OPSİYONEL olduğu için
          (Zayiatlar'ın aksine) tenant-geneli tek düz liste. */}
      <div className="mt-6">
        <SectionHeading>
          <span className="flex items-center gap-1.5 text-amber-600">
            <TrendingDown className="h-3.5 w-3.5" />
            Fiyat Anomalisi Detayları
          </span>
        </SectionHeading>
        {(payload.priceAnomalyDetails ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Bu gün fiyat anomalisi yok.</p>
        ) : (
          <div className="space-y-1.5">
            {(payload.priceAnomalyDetails ?? []).map((a, i) => (
              <div
                key={`${a.productId}-${a.createdAt}-${i}`}
                className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{a.productName}</p>
                  <p className="text-xs text-muted-foreground">{fmtDate(a.createdAt)}</p>
                </div>
                <div className="shrink-0 text-right text-xs text-muted-foreground">
                  <p className="text-sm font-semibold text-foreground">
                    {currency(a.oldPrice)} → {currency(a.newPrice)}
                  </p>
                  <p className={a.changePct > 0 ? 'text-red-600' : 'text-green-600'}>
                    {a.changePct > 0 ? '+' : ''}
                    {a.changePct.toFixed(1)}%
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Anomalies (eski tablo görünümü — korunuyor) */}
      {anomalies.length > 0 && (
        <div className="mt-6">
          <SectionHeading>
            <span className="flex items-center gap-1.5 text-amber-600">
              <AlertTriangle className="h-3.5 w-3.5" />
              Fiyat Anomalileri
            </span>
          </SectionHeading>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ürün ID</TableHead>
                  <TableHead className="text-right">Eski Fiyat</TableHead>
                  <TableHead className="text-right">Yeni Fiyat</TableHead>
                  <TableHead className="text-right">Değişim %</TableHead>
                  <TableHead>Tarih</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {anomalies.map((a) => (
                  <TableRow
                    key={a.id}
                    className={a.anomalyFlag ? 'bg-orange-50/60 dark:bg-orange-950/20' : undefined}
                  >
                    <TableCell className="font-mono text-xs">{a.productId.slice(0, 8)}</TableCell>
                    <TableCell className="text-right">{currency(a.oldPrice)}</TableCell>
                    <TableCell className="text-right font-semibold">{currency(a.newPrice)}</TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant="outline"
                        className={`text-xs ${
                          a.changePct > 0
                            ? 'border-red-300 bg-red-50 text-red-700'
                            : 'border-green-300 bg-green-50 text-green-700'
                        }`}
                      >
                        {a.changePct > 0 ? '+' : ''}
                        {a.changePct.toFixed(1)}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {fmtDate(a.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </>
  );
}

// ── MONTHLY detail ────────────────────────────────────────────────────────────

export function MonthlyDetail({ payload }: { payload: MonthlyPayload }) {
  const { totals, branchComparison } = payload;
  // ScheduledReport.payload şema-sürümsüz bir JSON blob — bu alan bu
  // özellikten ÖNCE üretilmiş eski raporlarda hiç yok (undefined), TypeScript
  // tipinin "zorunlu" demesi DB'deki gerçek veriyi garanti etmiyor (bkz.
  // manuel testte bulunan çökme: id=d0fadac2..., 2026-07-31'de üretilmiş).
  const defectiveItems = payload.defectiveItems ?? [];
  // Aynı gerekçe — monthlyRevenue/priceAnomalyDetails de sonradan eklendi,
  // eski raporlarda yok.
  const monthlyRevenue = totals.monthlyRevenue ?? 0;
  const priceAnomalyDetails = payload.priceAnomalyDetails ?? [];

  // Şube Karşılaştırma, tek şubeli (STARTER) PATRON için ANLAMSIZ — ROL
  // bazlı gizleniyor (payload.branchComparison.length'e göre DEĞİL): eski
  // (tenant temizliğinden önce üretilmiş) raporlar hâlâ o zamanki fazla
  // şubeyi payload'da taşıyor olabilir (JSON blob geriye dönük güncellenmez),
  // veri-bazlı bir kontrol bu durumda yanlışlıkla tabloyu gösterirdi. Bu
  // component hem web (/reports/detay) hem isletme-app (aylik-rapor/detay)
  // tarafından paylaşıldığı için tek bir yerde tutarlı davranış sağlanıyor.
  const { user } = useAuthStore();
  const isStarterPatron = user?.role === 'PATRON' && user?.planId === 'STARTER';

  return (
    <>
      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Toplam Ciro"
          value={currency(monthlyRevenue)}
          icon={<Wallet className="h-4 w-4" />}
        />
        <StatCard
          label="Toplam Sipariş"
          value={totals.totalOrders}
          icon={<ShoppingCart className="h-4 w-4" />}
        />
        <StatCard
          label="Fiyat Anomalisi"
          value={totals.priceAnomalies}
          icon={<TrendingDown className="h-4 w-4" />}
          highlight="warning"
        />
      </div>

      {/* Fiyat Anomalisi detayları — Zayiatlar'daki AYNI liste deseni */}
      <div className="mt-6">
        <SectionHeading>
          <span className="flex items-center gap-1.5 text-amber-600">
            <TrendingDown className="h-3.5 w-3.5" />
            Fiyat Anomalisi Detayları
          </span>
        </SectionHeading>
        {priceAnomalyDetails.length === 0 ? (
          <p className="text-sm text-muted-foreground">Bu ay fiyat anomalisi yok.</p>
        ) : (
          <div className="space-y-1.5">
            {priceAnomalyDetails.map((a, i) => (
              <div
                key={`${a.productId}-${a.createdAt}-${i}`}
                className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{a.productName}</p>
                  <p className="text-xs text-muted-foreground">{fmtDate(a.createdAt)}</p>
                </div>
                <div className="shrink-0 text-right text-xs text-muted-foreground">
                  <p className="text-sm font-semibold text-foreground">
                    {currency(a.oldPrice)} → {currency(a.newPrice)}
                  </p>
                  <p className={a.changePct > 0 ? 'text-red-600' : 'text-green-600'}>
                    {a.changePct > 0 ? '+' : ''}
                    {a.changePct.toFixed(1)}%
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Branch comparison table — çok şubeli PATRON'a özel */}
      {!isStarterPatron && (
        <div className="mt-6">
          <SectionHeading>Şube Karşılaştırma</SectionHeading>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Şube</TableHead>
                  <TableHead className="text-right">Sipariş</TableHead>
                  <TableHead className="text-right">Stok Hareketi</TableHead>
                  <TableHead className="text-right">Kritik Stok</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {branchComparison.map((b) => (
                  <TableRow key={b.branchId}>
                    <TableCell className="font-medium">{b.branchName}</TableCell>
                    <TableCell className="text-right">{b.orderCount}</TableCell>
                    <TableCell className="text-right">{b.stockMovementCount}</TableCell>
                    <TableCell className="text-right">
                      {b.criticalStockCount > 0 ? (
                        <span className="font-semibold text-amber-600">{b.criticalStockCount}</span>
                      ) : (
                        b.criticalStockCount
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Zayiatlar — isletme-app/gunluk-rapor'daki AYNI görsel desen */}
      <div className="mt-6">
        <SectionHeading>
          <span className="flex items-center gap-1.5 text-destructive">
            <PackageX className="h-3.5 w-3.5" />
            Zayiatlar
          </span>
        </SectionHeading>
        {defectiveItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">Bu ay zayiat kaydı yok.</p>
        ) : (
          <div className="space-y-1.5">
            {defectiveItems.map((d) => (
              <div
                key={d.productId}
                className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3"
              >
                <span className="truncate text-sm font-medium">{d.productName}</span>
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {d.totalQuantity.toLocaleString('tr-TR')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
