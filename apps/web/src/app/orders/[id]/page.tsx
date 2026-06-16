'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, AlertTriangle, Check, X, MessageSquare, Building2, Calendar, User,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { PageLayout } from '@/components/layout/PageLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { api } from '@/lib/api';
import type { Order, WhatsappLog } from '@/lib/types';

function fetchOrders(branchId: string): Promise<Order[]> {
  return api.get<Order[]>(`/orders/${branchId}`).then((r) => r.data);
}
function fetchWALogs(orderId: string): Promise<WhatsappLog[]> {
  return api.get<WhatsappLog[]>(`/orders/${orderId}/whatsapp-logs`).then((r) => r.data);
}

function fmt(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleString('tr-TR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

const WA_STATUS: Record<string, { label: string; className: string }> = {
  SENT:    { label: 'Gönderildi', className: 'bg-green-100 text-green-700 border-green-200' },
  PENDING: { label: 'Bekliyor',   className: 'bg-amber-100 text-amber-700 border-amber-200' },
  FAILED:  { label: 'Başarısız',  className: 'bg-red-100 text-red-700 border-red-200' },
};

// ── Inner content — needs useSearchParams so wrapped in Suspense ──────────────

function OrderDetailInner({ orderId }: { orderId: string }) {
  const searchParams = useSearchParams();
  const branchId = searchParams.get('branchId') ?? '';
  const qc = useQueryClient();

  const ordersQuery = useQuery<Order[]>({
    queryKey: ['orders', branchId],
    queryFn: () => fetchOrders(branchId),
    enabled: !!branchId,
  });

  const logsQuery = useQuery<WhatsappLog[]>({
    queryKey: ['orders', orderId, 'wa-logs'],
    queryFn: () => fetchWALogs(orderId),
    staleTime: 1000 * 60,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['orders', branchId] });
  };

  const approveMut = useMutation({
    mutationFn: () => api.patch(`/orders/${orderId}/approve`).then((r) => r.data),
    onSuccess: () => { invalidate(); toast.success('Sipariş onaylandı'); },
    onError: () => toast.error('Onay başarısız'),
  });

  const cancelMut = useMutation({
    mutationFn: () => api.patch(`/orders/${orderId}/cancel`).then((r) => r.data),
    onSuccess: () => { invalidate(); toast.success('Sipariş iptal edildi'); },
    onError: () => toast.error('İptal başarısız'),
  });

  const order = ordersQuery.data?.find((o: Order) => o.id === orderId);

  const isLoading = ordersQuery.isPending;
  const isError = ordersQuery.isError || (!isLoading && !branchId);

  return (
    <PageLayout title={order ? `Sipariş #${orderId.slice(0, 8).toUpperCase()}` : 'Sipariş Detay'}>
      <div className="mb-5 flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/orders${branchId ? `?branchId=${branchId}` : ''}`}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Siparişlere Dön
          </Link>
        </Button>

        {order && (
          <div className="flex items-center gap-2">
            {(order.status === 'DRAFT' || order.status === 'APPROVED') && (
              <Button
                size="sm"
                variant="outline"
                className="text-red-700 border-red-300 hover:bg-red-50"
                disabled={cancelMut.isPending}
                onClick={() => cancelMut.mutate()}
              >
                <X className="mr-1.5 h-4 w-4" />
                İptal Et
              </Button>
            )}
            {order.status === 'DRAFT' && (
              <Button size="sm" disabled={approveMut.isPending} onClick={() => approveMut.mutate()}>
                <Check className="mr-1.5 h-4 w-4" />
                {approveMut.isPending ? 'Onaylanıyor…' : 'Onayla'}
              </Button>
            )}
          </div>
        )}
      </div>

      {isError && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive">
            {!branchId ? 'Şube bilgisi eksik — sipariş listesinden gelin.' : 'Sipariş yüklenemedi.'}
          </p>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-36 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      ) : order ? (
        <div className="space-y-6">
          {/* Info card */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <CardTitle className="text-base">Sipariş Bilgileri</CardTitle>
                <StatusBadge status={order.status} type="order" />
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Building2 className="h-4 w-4 shrink-0" />
                <span><strong>Şube:</strong> {order.branch.name}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Building2 className="h-4 w-4 shrink-0" />
                <span><strong>Tedarikçi:</strong> {order.supplier.name}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-4 w-4 shrink-0" />
                <span><strong>Oluşturma:</strong> {fmt(order.createdAt)}</span>
              </div>
              {order.approver && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <User className="h-4 w-4 shrink-0" />
                  <span><strong>Onaylayan:</strong> {order.approver.email}</span>
                </div>
              )}
              {order.approvedAt && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4 shrink-0" />
                  <span><strong>Onay tarihi:</strong> {fmt(order.approvedAt)}</span>
                </div>
              )}
              {order.notes && (
                <div className="col-span-2 text-muted-foreground">
                  <strong>Not:</strong> {order.notes}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Items table */}
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Kalemler ({order.items.length})
            </h2>
            <div className="rounded-xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ürün</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">Sipariş Miktarı</TableHead>
                    <TableHead className="text-right">Teslim Alınan</TableHead>
                    <TableHead className="text-right">Birim Fiyat</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.items.map((item: import('@/lib/types').OrderItem) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.product.name}</TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground">{item.product.sku}</TableCell>
                      <TableCell className="text-right font-mono">
                        {Number(item.quantityOrdered).toLocaleString('tr-TR')} {item.product.unit}
                      </TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">
                        {Number(item.quantityReceived).toLocaleString('tr-TR')} {item.product.unit}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {item.unitPrice != null
                          ? `₺${Number(item.unitPrice).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`
                          : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* WhatsApp logs */}
          <div>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <MessageSquare className="h-4 w-4" />
              WhatsApp Günlüğü
              {logsQuery.data && logsQuery.data.length > 0 && (
                <Badge variant="outline" className="text-xs">{logsQuery.data.length}</Badge>
              )}
            </h2>

            {logsQuery.isPending ? (
              <Skeleton className="h-20 w-full rounded-xl" />
            ) : !logsQuery.data || logsQuery.data.length === 0 ? (
              <div className="rounded-xl border bg-card p-5 text-center text-sm text-muted-foreground">
                WhatsApp mesajı henüz gönderilmemiş.
              </div>
            ) : (
              <div className="space-y-2">
                {logsQuery.data.map((log: WhatsappLog) => {
                  const cfg = WA_STATUS[log.status] ?? { label: log.status, className: '' };
                  return (
                    <div key={log.id} className="rounded-xl border bg-card p-4 text-sm">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">{log.whatsappNumber}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={`text-xs ${cfg.className}`}>{cfg.label}</Badge>
                          <span className="text-xs text-muted-foreground">{fmt(log.sentAt ?? log.createdAt)}</span>
                        </div>
                      </div>
                      <pre className="whitespace-pre-wrap break-words text-xs text-muted-foreground font-sans leading-relaxed line-clamp-3">
                        {log.messageBody}
                      </pre>
                      {log.errorMessage && (
                        <p className="mt-2 text-xs text-red-600">{log.errorMessage}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : !isLoading && (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Sipariş bulunamadı.
        </div>
      )}
    </PageLayout>
  );
}

// ── Page export — wrap in Suspense for useSearchParams ────────────────────────

export default function OrderDetailPage({ params }: { params: { id: string } }) {
  return (
    <Suspense>
      <OrderDetailInner orderId={params.id} />
    </Suspense>
  );
}
