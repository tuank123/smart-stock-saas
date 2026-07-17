'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, RefreshCw, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

import { PageLayout } from '@/components/layout/PageLayout';
import { PageTabs } from '@/components/layout/PageTabs';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge, ORDER_STATUS_LABELS } from '@/components/shared/StatusBadge';
import { api } from '@/lib/api';
import type { Branch, Order } from '@/lib/types';

function fetchBranches(): Promise<Branch[]> {
  return api.get<Branch[]>('/branches').then((r) => r.data);
}
function fetchOrders(branchId: string): Promise<Order[]> {
  return api.get<Order[]>(`/orders/${branchId}`).then((r) => r.data);
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

  const branchesQuery = useQuery<Branch[]>({ queryKey: ['branches'], queryFn: fetchBranches });
  const ordersQuery = useQuery<Order[]>({
    queryKey: ['orders', branchId],
    queryFn: async () => {
      if (branchId === 'ALL') {
        const branches = branchesQuery.data ?? [];
        const results = await Promise.all(
          branches.map((b: Branch) => fetchOrders(b.id).catch(() => [] as Order[])),
        );
        return results.flat();
      }
      return fetchOrders(branchId);
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

  const orders = ordersQuery.data ?? [];
  const filtered = useMemo(
    () => (statusFilter === 'ALL' ? orders : orders.filter((o: Order) => o.status === statusFilter)),
    [orders, statusFilter],
  );

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
            <Select value={branchId} onValueChange={(v) => { setBranchId(v); setStatusFilter('ALL'); }}>
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
          <Select value={statusFilter} onValueChange={setStatusFilter}>
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
      ) : filtered.length === 0 ? (
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
              {filtered.map((o: Order) => (
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
        </div>
      )}
    </PageLayout>
  );
}
