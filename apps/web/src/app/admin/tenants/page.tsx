'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAdminTenants, type AdminTenantListItem } from '@/hooks/useAdmin';
import { StatusBadge, PlanBadge } from '@/components/admin/TenantBadges';

const ALL = '__ALL__';

function fmtDate(dateStr: string) {
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium' }).format(new Date(dateStr));
}

export default function AdminTenantsPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>(ALL);
  const [planId, setPlanId] = useState<string>(ALL);
  const [includeTest, setIncludeTest] = useState(false);
  const [page, setPage] = useState(1);

  const params = useMemo(
    () => ({
      search: search.trim() || undefined,
      status: status === ALL ? undefined : status,
      planId: planId === ALL ? undefined : planId,
      includeTest: includeTest || undefined,
      page,
    }),
    [search, status, planId, includeTest, page],
  );

  const { data, isPending, isError } = useAdminTenants(params);

  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? 20;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Filtre değişince ilk sayfaya dön.
  function resetAndSet(fn: () => void) {
    fn();
    setPage(1);
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <h1 className="mb-6 text-2xl font-semibold">İşletmeler</h1>

      {/* Filtreler */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          value={search}
          onChange={(e) => resetAndSet(() => setSearch(e.target.value))}
          placeholder="Firma adı veya vergi no ara…"
          className="w-full sm:w-64"
        />
        <Select value={status} onValueChange={(v) => resetAndSet(() => setStatus(v))}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Durum" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tüm Durumlar</SelectItem>
            <SelectItem value="ACTIVE">Aktif</SelectItem>
            <SelectItem value="SUSPENDED">Askıda</SelectItem>
            <SelectItem value="DELETED">Silinmiş</SelectItem>
          </SelectContent>
        </Select>
        <Select value={planId} onValueChange={(v) => resetAndSet(() => setPlanId(v))}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Plan" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tüm Planlar</SelectItem>
            <SelectItem value="STARTER">STARTER</SelectItem>
            <SelectItem value="PROFESSIONAL">PROFESSIONAL</SelectItem>
            <SelectItem value="ENTERPRISE">ENTERPRISE</SelectItem>
          </SelectContent>
        </Select>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={includeTest}
            onChange={(e) => resetAndSet(() => setIncludeTest(e.target.checked))}
            className="h-4 w-4 rounded border-input"
          />
          Test hesaplarını da göster
        </label>
      </div>

      {isPending ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : isError || !data ? (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
          <p className="text-sm text-destructive">İşletmeler yüklenemedi.</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Firma Adı</TableHead>
                  <TableHead>Vergi No</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead className="text-right">Kullanıcı</TableHead>
                  <TableHead className="text-right">Şube</TableHead>
                  <TableHead>Kayıt Tarihi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                      Kayıt bulunamadı.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.items.map((t: AdminTenantListItem) => (
                    <TableRow
                      key={t.id}
                      onClick={() => router.push(`/admin/tenants/detay?id=${t.id}`)}
                      className="cursor-pointer"
                    >
                      <TableCell className="font-medium">{t.companyName}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {t.taxNumber}
                      </TableCell>
                      <TableCell>
                        <PlanBadge planId={t.planId} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={t.status} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{t.userCount}</TableCell>
                      <TableCell className="text-right tabular-nums">{t.branchCount}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {fmtDate(t.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Sayfalama */}
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Toplam {total} işletme · Sayfa {page}/{totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
                Önceki
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Sonraki
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
