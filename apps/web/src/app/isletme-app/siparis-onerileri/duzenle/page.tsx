'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, CheckCircle, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { StationPageHeader } from '@/components/layout/StationPageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useApproveOrder,
  useOrderDetail,
  useUpdateOrder,
  useUpdateUnitsPerCase,
} from '@/hooks/useMudur';
import type { OrderItem } from '@/lib/types';
import { formatCaseBreakdown } from '@/lib/caseFormat';

// ── Types ─────────────────────────────────────────────────────────────────────

interface OrderItemDraft {
  productId: string;
  productName: string;
  productSku: string;
  productUnit: string;
  quantity: number; // son geçerli sayısal değer (payload/not için)
  qtyText: string; // input'un ham metni (controlled value — canlı yazım)
  unitsPerCase: number | null;
}

// ── Inner content — needs useSearchParams so wrapped in Suspense ──────────────

function OrderEditInner() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId') ?? '';
  const router = useRouter();

  const orderQuery = useOrderDetail(orderId);
  const updateOrder = useUpdateOrder();
  const approveOrder = useApproveOrder();
  const updateUnitsPerCase = useUpdateUnitsPerCase();

  const [orderItems, setOrderItems] = useState<OrderItemDraft[]>([]);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [initialized, setInitialized] = useState(false);

  // Pending koli change waiting for AlertDialog confirmation
  const [pendingCase, setPendingCase] = useState<{
    item: OrderItemDraft;
    newValue: number;
  } | null>(null);
  const pendingInputRef = useRef<HTMLInputElement | null>(null);

  // Pre-fill form once the order is loaded. Notlar opsiyonel serbest metin:
  // varsa kullanıcının önceki notunu göster, yoksa boş bırak.
  useEffect(() => {
    if (orderQuery.data && !initialized) {
      const items = orderQuery.data.items.map((item: OrderItem) => ({
        productId: item.productId,
        productName: item.product.name,
        productSku: item.product.sku,
        productUnit: item.product.unit,
        quantity: Number(item.quantityOrdered),
        qtyText: String(Number(item.quantityOrdered)),
        unitsPerCase: item.product.unitsPerCase ?? null,
      }));
      setOrderItems(items);
      setNotes(orderQuery.data.notes ?? '');
      setInitialized(true);
    }
  }, [orderQuery.data, initialized]);

  function applyUnitsPerCase(item: OrderItemDraft, n: number) {
    updateUnitsPerCase.mutate(
      { productId: item.productId, unitsPerCase: n },
      {
        onSuccess: () => {
          setOrderItems((prev) =>
            prev.map((i) =>
              i.productId === item.productId ? { ...i, unitsPerCase: n } : i,
            ),
          );
        },
      },
    );
  }

  function handleUnitsPerCaseBlur(
    item: OrderItemDraft,
    e: React.FocusEvent<HTMLInputElement>,
  ) {
    const n = parseInt(e.target.value, 10);
    if (isNaN(n) || n < 1) {
      e.target.value = item.unitsPerCase != null ? String(item.unitsPerCase) : '';
      return;
    }
    if (n === item.unitsPerCase) return;

    if (item.unitsPerCase != null) {
      pendingInputRef.current = e.target;
      setPendingCase({ item, newValue: n });
      return;
    }

    applyUnitsPerCase(item, n);
  }

  function handleCaseConfirm() {
    if (!pendingCase) return;
    applyUnitsPerCase(pendingCase.item, pendingCase.newValue);
    setPendingCase(null);
    pendingInputRef.current = null;
  }

  function handleCaseCancel() {
    if (pendingInputRef.current && pendingCase) {
      pendingInputRef.current.value = String(pendingCase.item.unitsPerCase);
    }
    setPendingCase(null);
    pendingInputRef.current = null;
  }

  function updateItemQuantity(productId: string, value: string) {
    const qty = parseFloat(value);
    const valid = !isNaN(qty) && qty > 0;
    setOrderItems((prev) =>
      prev.map((i) =>
        i.productId === productId
          ? {
              ...i,
              qtyText: value, // ham metni her zaman koru (geçersizse de göster)
              quantity: valid ? qty : i.quantity, // payload için son geçerli değer
            }
          : i,
      ),
    );
  }

  function removeItem(productId: string) {
    setOrderItems((prev) => prev.filter((i) => i.productId !== productId));
  }

  function buildPayload() {
    return {
      items: orderItems.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      notes: notes.trim() || undefined,
    };
  }

  function validate(): boolean {
    setError('');
    if (orderItems.length === 0) {
      setError('En az bir ürün olmalıdır.');
      return false;
    }
    return true;
  }

  function handleSaveOnly() {
    if (!validate()) return;
    updateOrder.mutate(
      { orderId, data: buildPayload() },
      { onSuccess: () => router.push('/isletme-app/siparis-onerileri') },
    );
  }

  function handleSaveAndApprove() {
    if (!validate()) return;
    updateOrder.mutate(
      { orderId, data: buildPayload() },
      {
        onSuccess: () => {
          approveOrder.mutate(orderId, {
            onSuccess: () => router.push('/isletme-app/siparis-onerileri'),
          });
        },
      },
    );
  }

  const allCaseFilled = orderItems.length > 0 && orderItems.every((i) => i.unitsPerCase != null && i.unitsPerCase > 0);
  const isBusy = updateOrder.isPending || approveOrder.isPending;
  const saveDisabled = isBusy || orderQuery.isPending || !allCaseFilled;
  const saveTooltip = !allCaseFilled ? 'Önce tüm ürünler için koli bilgisi girin' : undefined;

  return (
    <div>
      {/* ── Koli güncelleme onay diyaloğu ──────────────────────────────────── */}
      <AlertDialog open={!!pendingCase} onOpenChange={(open) => !open && handleCaseCancel()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Koli Bilgisini Güncelle</AlertDialogTitle>
            <AlertDialogDescription>
              Koli başına adet bilgisini değiştirmek istediğinize emin misiniz? Bu değişiklik bu
              ürünün tüm gelecek siparişlerini etkiler.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCaseCancel}>İptal</AlertDialogCancel>
            <AlertDialogAction onClick={handleCaseConfirm}>Onaylıyorum</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <StationPageHeader title="Sipariş Düzenle" />

      {orderQuery.isError && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
          <p className="text-sm text-destructive">Sipariş yüklenemedi.</p>
        </div>
      )}

      {!orderQuery.isError && (
        <div className="mx-auto max-w-2xl">
          <Card>
            <CardContent className="p-6">
              <div className="space-y-6">
                {/* Ürünler */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Ürünler
                    </h2>
                    {!orderQuery.isPending && orderItems.some((i) => i.unitsPerCase === null) && (
                      <p className="flex items-center gap-1 text-xs text-destructive">
                        <AlertTriangle className="h-3 w-3" />
                        Koli bilgisi eksik ürünler var
                      </p>
                    )}
                  </div>

                  {orderQuery.isPending ? (
                    <div className="space-y-2">
                      <Skeleton className="h-14 w-full rounded-md" />
                      <Skeleton className="h-14 w-full rounded-md" />
                    </div>
                  ) : (
                    orderItems.length > 0 && (
                      <div className="space-y-3">
                        {orderItems.map((item) => {
                          // Koli, ham metinden canlı hesaplanır — her tuşta güncellenir.
                          const koli = formatCaseBreakdown(
                            parseFloat(item.qtyText),
                            item.unitsPerCase,
                          );
                          const caseEmpty = item.unitsPerCase === null;

                          return (
                            <div key={item.productId} className="rounded-md border p-3">
                              {/* Başlık: ürün adı + SKU, sağ üstte sil */}
                              <div className="mb-3 flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium">{item.productName}</p>
                                  <p className="text-xs text-muted-foreground">{item.productSku}</p>
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                                  onClick={() => removeItem(item.productId)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>

                              {/* Miktar — controlled, canlı koli */}
                              <div className="space-y-1.5">
                                <Label htmlFor={`qty-${item.productId}`}>
                                  Miktar ({item.productUnit})
                                </Label>
                                <Input
                                  id={`qty-${item.productId}`}
                                  type="number"
                                  min="0.001"
                                  step="0.001"
                                  value={item.qtyText}
                                  onChange={(e) => updateItemQuantity(item.productId, e.target.value)}
                                  className="w-full text-sm"
                                />
                                <p className="text-xs text-muted-foreground">
                                  {koli ?? '–'}
                                </p>
                              </div>

                              {/* Koli (adet/koli) — onBlur akışı (AlertDialog onayı) korunur */}
                              <div className="mt-3 space-y-1.5">
                                <Label htmlFor={`upc-${item.productId}`}>Koli (adet/koli)</Label>
                                <Input
                                  id={`upc-${item.productId}`}
                                  type="number"
                                  min="1"
                                  step="1"
                                  defaultValue={item.unitsPerCase ?? ''}
                                  onBlur={(e) => handleUnitsPerCaseBlur(item, e)}
                                  placeholder={caseEmpty ? 'Zorunlu' : ''}
                                  className={`w-full text-sm ${
                                    caseEmpty
                                      ? 'border-destructive placeholder:text-destructive/60 focus-visible:ring-destructive'
                                      : ''
                                  }`}
                                />
                                <p className="text-xs text-muted-foreground">
                                  {item.unitsPerCase != null
                                    ? `1 kolide ${item.unitsPerCase} adet`
                                    : 'Koli başına adet sayısını girin'}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )
                  )}
                </div>

                {/* Notlar */}
                <div className="space-y-1.5">
                  <Label htmlFor="notes">Notlar</Label>
                  {orderQuery.isPending ? (
                    <Skeleton className="h-20 w-full" />
                  ) : (
                    <textarea
                      id="notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                      placeholder="Tedarikçiye iletilecek ekstra not (opsiyonel)"
                      className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    />
                  )}
                </div>

                {error && (
                  <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    {error}
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button type="button" variant="outline" className="sm:flex-1" asChild>
                    <Link href="/isletme-app/siparis-onerileri">← Siparişlere Dön</Link>
                  </Button>
                  <span
                    className={`contents ${saveDisabled ? 'cursor-not-allowed' : ''}`}
                    title={saveTooltip}
                  >
                    <Button
                      type="button"
                      variant="outline"
                      className="sm:flex-1"
                      disabled={saveDisabled}
                      onClick={handleSaveOnly}
                    >
                      {updateOrder.isPending && !approveOrder.isPending
                        ? 'Kaydediliyor…'
                        : 'Sadece Kaydet'}
                    </Button>
                    <Button
                      type="button"
                      className="gap-1.5 sm:flex-1"
                      disabled={saveDisabled}
                      onClick={handleSaveAndApprove}
                    >
                      <CheckCircle className="h-4 w-4" />
                      {isBusy ? 'İşleniyor…' : 'Kaydet ve Onayla'}
                    </Button>
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ── Page export — wrap in Suspense for useSearchParams ────────────────────────

export default function OrderEditPage() {
  return (
    <Suspense>
      <OrderEditInner />
    </Suspense>
  );
}
