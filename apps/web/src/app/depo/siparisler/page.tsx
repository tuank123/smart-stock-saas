'use client';

import { useState } from 'react';
import { ChevronDown, Loader2, PackageCheck } from 'lucide-react';
import { StationPageHeader } from '@/components/layout/StationPageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useReceiveOrder, useStationOrders } from '@/hooks/useMudur';
import type { Order, OrderItem } from '@/lib/types';

// ── Durum badge ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  APPROVED: { label: 'Onaylandı', className: 'border-blue-200 bg-blue-100 text-blue-700' },
  SENT: { label: 'Gönderildi', className: 'border-orange-200 bg-orange-100 text-orange-700' },
  PARTIAL: { label: 'Kısmi Teslim', className: 'border-amber-200 bg-amber-100 text-amber-700' },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <Badge variant="outline" className={`text-xs ${cfg?.className ?? ''}`}>
      {cfg?.label ?? status}
    </Badge>
  );
}

function fmt(dateStr: string) {
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium' }).format(new Date(dateStr));
}

// ── Sayfa ───────────────────────────────────────────────────────────────────

export default function DepoSiparislerPage() {
  const { data: orders, isPending, isError } = useStationOrders();
  const [openId, setOpenId] = useState<string | null>(null);

  const list = orders ?? [];

  return (
    <div className="mx-auto w-full max-w-lg">
      <StationPageHeader title="Sipariş Teslim Alma" />

      {isError && (
        <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          Siparişler yüklenirken hata oluştu.
        </div>
      )}

      {isPending ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Yükleniyor…</span>
        </div>
      ) : list.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card py-14 text-center">
          <PackageCheck className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Teslim alınacak sipariş yok</p>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((order: Order) => (
            <OrderCard
              key={order.id}
              order={order}
              open={openId === order.id}
              onToggle={() => setOpenId((cur) => (cur === order.id ? null : order.id))}
              onReceived={() => setOpenId(null)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sipariş kartı (dokununca teslim-alma moduna açılır) ──────────────────────

function OrderCard({
  order,
  open,
  onToggle,
  onReceived,
}: {
  order: Order;
  open: boolean;
  onToggle: () => void;
  onReceived: () => void;
}) {
  const receiveOrder = useReceiveOrder();

  // Her kalem için teslim alınan miktar — default: sipariş edilen miktar.
  const [qtyMap, setQtyMap] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      order.items.map((i: OrderItem) => [i.id, String(Number(i.quantityOrdered))]),
    ),
  );

  function handleReceive() {
    const items = order.items.map((i: OrderItem) => ({
      productId: i.productId,
      quantityReceived: Number(qtyMap[i.id] ?? 0),
    }));
    receiveOrder.mutate(
      { orderId: order.id, items },
      { onSuccess: () => onReceived() },
    );
  }

  return (
    <Card>
      {/* Kart başlığı — dokununca aç/kapa */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left"
      >
        <CardContent className="flex items-start justify-between gap-3 p-4">
          <div className="min-w-0 space-y-1">
            <p className="truncate font-semibold">{order.supplier.name}</p>
            <p className="text-xs text-muted-foreground">
              {order.branch.name} · {fmt(order.createdAt)}
            </p>
            <p className="text-xs text-muted-foreground">{order.items.length} kalem</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <StatusBadge status={order.status} />
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
            />
          </div>
        </CardContent>
      </button>

      {/* Teslim-alma modu */}
      {open && (
        <div className="border-t p-4">
          <div className="space-y-3">
            {order.items.map((item: OrderItem) => (
              <div key={item.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.product.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Sipariş: {Number(item.quantityOrdered).toLocaleString('tr-TR')}{' '}
                    {item.product.unit}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Input
                    type="number"
                    min="0"
                    step="0.001"
                    value={qtyMap[item.id] ?? ''}
                    onChange={(e) =>
                      setQtyMap((m) => ({ ...m, [item.id]: e.target.value }))
                    }
                    className="h-9 w-24 text-right text-sm"
                  />
                  <span className="w-8 text-xs text-muted-foreground">{item.product.unit}</span>
                </div>
              </div>
            ))}
          </div>

          <Button
            className="mt-4 w-full gap-1.5"
            disabled={receiveOrder.isPending}
            onClick={handleReceive}
          >
            {receiveOrder.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Teslim alınıyor…
              </>
            ) : (
              <>
                <PackageCheck className="h-4 w-4" />
                Teslim Al
              </>
            )}
          </Button>
        </div>
      )}
    </Card>
  );
}
