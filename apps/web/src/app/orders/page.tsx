'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, RefreshCw, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';

import { PageLayout } from '@/components/layout/PageLayout';
import { PageTabs } from '@/components/layout/PageTabs';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge, ORDER_STATUS_LABELS } from '@/components/shared/StatusBadge';
import { api } from '@/lib/api';
import type { Branch, Order, PaginatedResponse } from '@/lib/types';

const PAGE_SIZE = 50;
// "Tüm Şubeler" seçiliyken şube başına ayrı bir istek atılır (bilinen N+1,
// kapsam dışı — bkz. görev notu). Bu birleşik görünüme gerçek bir pager
// uygulanamıyor (sonuçlar şubeler arası düz birleştiriliyor); en azından
// önceki "hepsini göster" davranışına en yakın sonuç için izin verilen üst
// sınır (100) istenir. Bir şubede 100'den fazla sipariş varsa bu görünümde
// kesilir — mevcut mimari kısıt, bu görevin kapsamında değil.
const ALL_BRANCHES_PAGE_SIZE = 100;

function fetchBranches(): Promise<Branch[]> {
  return api.get<Branch[]>('/branches').then((r) => r.data);
}
function fetchOrders(
  branchId: string,
  params: { status?: string; page?: number; pageSize?: number } = {},
): Promise<PaginatedResponse<Order>> {
  return api
    .get<PaginatedResponse<Order>>(`/orders/${branchId}`, {
      params: {
        ...(params.status && params.status !== 'ALL' ? { status: params.status } : {}),
        ...(params.page ? { page: params.page } : {}),
        ...(params.pageSize ? { pageSize: params.pageSize } : {}),
      },
    })
    .then((r) => r.data);
}

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('tr-TR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

function TableSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-11 w-full" />)}
    </div>
  );
}

export default function OrdersPage() {
  const qc = useQueryClient();
  const [branchId, setBranchId] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [page, setPage] = useState(1);

  const branchesQuery = useQuery<Branch[]>({ queryKey: ['branches'], queryFn: fetchBranches });
  const ordersQuery = useQuery<PaginatedResponse<Order>>({
    queryKey: ['orders', branchId, statusFilter, page],
    queryFn: async () => {
      if (branchId === 'ALL') {
        const branches = branchesQuery.data ?? [];
        const results = await Promise.all(
          branches.map((b: Branch) =>
            fetchOrders(b.id, { status: statusFilter, page: 1, pageSize: ALL_BRANCHES_PAGE_SIZE }).catch(
              () => ({ items: [] as Order[], total: 0, page: 1, pageSize: ALL_BRANCHES_PAGE_SIZE }),
            ),
          ),
        );
        const items = results.flatMap((r) => r.items);
        return { items, total: items.length, page: 1, pageSize: items.length };
      }
      return fetchOrders(branchId, { status: statusFilter, page, pageSize: PAGE_SIZE });
    },
    enabled: !!branchId && branchesQuery.isSuccess,
    staleTime: 1000 * 30,
  });

  const checkMutation = useMutation({
    mutationFn: () =>
      api.post('/orders/check-thresholds', branchId ? { branchId } : {}).then((r) => r.data),
    onSuccess: (data: { createdOrders: number }) => {
      qc.invalidateQueries({ queryKey: ['orders', branchId] });
      toast.success(`${data.createdOrders} otomatik DRAFT sipariş oluşturuldu`);
    },
    onError: () => toast.error('Eşik kontrolü başarısız'),
  });

  const orders = ordersQuery.data?.items ?? [];
  const total = ordersQuery.data?.total ?? 0;
  const isAllBranches = branchId === 'ALL';
  const totalPages = isAllBranches ? 1 : Math.max(1, Math.ceil(total / PAGE_SIZE));

  function handleBranchChange(v: string) {
    setBranchId(v);
    setStatusFilter('ALL');
    setPage(1);
  }

  function handleStatusChange(v: string) {
    setStatusFilter(v);
    setPage(1);
  }

  return (
    <PageLayout title="Siparişler">
      <PageTabs
        tabs={[
          { href: '/orders', label: 'Siparişler' },
          { href: '/transfers', label: 'Transferler' },
          { href: '/suppliers', label: 'Tedarikçiler' },
        ]}
      />
      {/* Toolbar */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="w-full sm:w-52">
          {branchesQuery.isPending ? (
            <Skeleton className="h-9 w-full" />
          ) : (
            <Select value={branchId} onValueChange={handleBranchChange}>
              <SelectTrigger><SelectValue placeholder="Şube seçin…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tüm Şubeler</SelectItem>
                {(branchesQuery.data ?? []).map((b: Branch) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {branchId && (
          <Select value={statusFilter} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tüm Durumlar</SelectItem>
              {ORDER_STATUS_LABELS.map(({ value, label }) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="ml-auto">
          <Button
            variant="outline"
            size="sm"
            disabled={checkMutation.isPending}
            onClick={() => checkMutation.mutate()}
          >
            <RefreshCw className={`mr-1.5 h-4 w-4 ${checkMutation.isPending ? 'animate-spin' : ''}`} />
            Oto. DRAFT Kontrol Et
          </Button>
        </div>
      </div>

      {ordersQuery.isError && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive">Siparişler yüklenemedi.</p>
        </div>
      )}

      {!branchId ? (
        <div className="rounded-xl border bg-card p-12 text-center text-sm text-muted-foreground">
          Siparişleri görmek için bir şube seçin.
        </div>
      ) : ordersQuery.isPending ? (
        <TableSkeleton />
      ) : orders.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          {statusFilter !== 'ALL' ? 'Bu durumda sipariş bulunamadı.' : 'Bu şubede sipariş yok.'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sipariş No</TableHead>
                <TableHead>Tarih</TableHead>
                {branchId === 'ALL' && <TableHead>Şube</TableHead>}
                <TableHead>Tedarikçi</TableHead>
                <TableHead className="text-center">Kalem</TableHead>
                <TableHead className="text-center">Durum</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o: Order) => (
                <TableRow key={o.id}>
                  <TableCell className="font-mono text-sm">{o.id.slice(0, 8).toUpperCase()}</TableCell>
                  <TableCell className="text-muted-foreground">{fmt(o.createdAt)}</TableCell>
                  {branchId === 'ALL' && <TableCell className="text-muted-foreground">{o.branch.name}</TableCell>}
                  <TableCell className="font-medium">{o.supplier.name}</TableCell>
                  <TableCell className="text-center text-muted-foreground">{o.items.length}</TableCell>
                  <TableCell className="text-center">
                    <StatusBadge status={o.status} type="order" />
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                      <Link href={`/orders/detay?id=${o.id}&branchId=${o.branchId}`}>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Sayfalama — admin/errors ile aynı desen ("Tüm Şubeler" birleşik
              görünümünde gerçek bir sayfa kavramı yok, bkz. yukarıdaki not). */}
          {!isAllBranches && (
            <div className="flex items-center justify-between border-t p-3">
              <p className="text-sm text-muted-foreground">
                Sayfa {page}/{totalPages}
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
          )}
        </div>
      )}
    </PageLayout>
  );
}
