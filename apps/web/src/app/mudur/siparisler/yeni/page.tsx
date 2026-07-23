'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, Plus, Trash2 } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthStore } from '@/store/auth.store';
import {
  useBranchDetail,
  useCreateOrder,
  useStockList,
  useSuppliers,
  useUpdateUnitsPerCase,
} from '@/hooks/useMudur';
import type { StockLevel, Supplier } from '@/lib/types';
import { formatCaseBreakdown } from '@/lib/caseFormat';

// ── Types ─────────────────────────────────────────────────────────────────────

interface OrderItemDraft {
  productId: string;
  productName: string;
  productSku: string;
  productUnit: string;
  quantity: number;
  unitsPerCase: number | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildAutoNote(items: OrderItemDraft[], branchName: string): string {
  const parts = items.map((i) => {
    const breakdown = formatCaseBreakdown(i.quantity, i.unitsPerCase);
    return `${i.productName} ${breakdown ?? `${i.quantity} adet`}`;
  });
  return `${parts.join(', ')}, ${branchName} şubesine sipariş`;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MudurYeniSiparisPage() {
  const router = useRouter();
  const { user } = useAuthStore();

  const { data: suppliers, isPending: suppliersLoading } = useSuppliers();
  const { data: stock, isPending: stockLoading } = useStockList();
  const { data: branch } = useBranchDetail();
  const createOrder = useCreateOrder();
  const updateUnitsPerCase = useUpdateUnitsPerCase();

  const [supplierId, setSupplierId] = useState('');
  const [orderItems, setOrderItems] = useState<OrderItemDraft[]>([]);
  const [notes, setNotes] = useState('');
  const [noteIsAuto, setNoteIsAuto] = useState(true);
  const [itemProductId, setItemProductId] = useState('');
  const [itemQuantity, setItemQuantity] = useState('');
  const [error, setError] = useState('');

  // Pending koli change waiting for AlertDialog confirmation
  const [pendingCase, setPendingCase] = useState<{
    item: OrderItemDraft;
    newValue: number;
  } | null>(null);
  const pendingInputRef = useRef<HTMLInputElement | null>(null);

  // Products not yet added to the order
  const availableStock = (stock ?? []).filter(
    (s: StockLevel) => !orderItems.some((i) => i.productId === s.productId),
  );

  function addItem() {
    setError('');
    if (!itemProductId) return;
    const qty = parseFloat(itemQuantity);
    if (isNaN(qty) || qty <= 0) {
      setError('Geçerli bir miktar girin.');
      return;
    }
    const stockItem = (stock ?? []).find((s: StockLevel) => s.productId === itemProductId);
    if (!stockItem) return;

    const newItem: OrderItemDraft = {
      productId: itemProductId,
      productName: stockItem.product.name,
      productSku: stockItem.product.sku ?? '',
      productUnit: stockItem.product.unit,
      quantity: qty,
      unitsPerCase: stockItem.product.unitsPerCase ?? null,
    };

    setOrderItems((prev) => {
      const updated = [...prev, newItem];
      if (noteIsAuto && branch) {
        const allFilled = updated.every((i) => i.unitsPerCase != null);
        if (allFilled) setNotes(buildAutoNote(updated, branch.name));
      }
      return updated;
    });
    setItemProductId('');
    setItemQuantity('');
  }

  function removeItem(productId: string) {
    setOrderItems((prev) => prev.filter((i) => i.productId !== productId));
  }

  function applyUnitsPerCase(item: OrderItemDraft, n: number) {
    updateUnitsPerCase.mutate(
      { productId: item.productId, unitsPerCase: n },
      {
        onSuccess: () => {
          setOrderItems((prev) => {
            const updated = prev.map((i) =>
              i.productId === item.productId ? { ...i, unitsPerCase: n } : i,
            );
            if (noteIsAuto && branch) {
              const allFilled = updated.every((i) => i.unitsPerCase != null);
              if (allFilled) setNotes(buildAutoNote(updated, branch.name));
            }
            return updated;
          });
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!supplierId) {
      setError('Lütfen bir tedarikçi seçin.');
      return;
    }
    if (orderItems.length === 0) {
      setError('En az bir ürün eklemelisiniz.');
      return;
    }
    if (!user?.branchId) return;

    createOrder.mutate(
      {
        branchId: user.branchId,
        supplierId,
        items: orderItems.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        notes: notes.trim() || undefined,
      },
      { onSuccess: () => router.push('/mudur/siparisler') },
    );
  }

  const allCaseFilled =
    orderItems.length > 0 && orderItems.every((i) => i.unitsPerCase != null && i.unitsPerCase > 0);
  const submitDisabled = createOrder.isPending || !allCaseFilled;
  const submitTooltip = !allCaseFilled ? 'Önce tüm ürünler için koli bilgisi girin' : undefined;

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

      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-semibold">Yeni Sipariş</h1>
      </div>

      <div className="mx-auto max-w-2xl">
        <Card>
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Tedarikçi */}
              <div className="space-y-1.5">
                <Label htmlFor="supplier">Tedarikçi *</Label>
                {suppliersLoading ? (
                  <Skeleton className="h-9 w-full" />
                ) : (
                  <Select value={supplierId} onValueChange={setSupplierId}>
                    <SelectTrigger id="supplier">
                      <SelectValue placeholder="Tedarikçi seçin…" />
                    </SelectTrigger>
                    <SelectContent>
                      {(suppliers ?? []).map((s: Supplier) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Ürünler */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Ürünler *
                  </h2>
                  {orderItems.some((i) => i.unitsPerCase === null) && (
                    <p className="flex items-center gap-1 text-xs text-destructive">
                      <AlertTriangle className="h-3 w-3" />
                      Koli bilgisi eksik ürünler var
                    </p>
                  )}
                </div>

                {/* Add item row */}
                <div className="flex gap-2">
                  {stockLoading ? (
                    <Skeleton className="h-9 flex-1" />
                  ) : (
                    <Select value={itemProductId} onValueChange={setItemProductId}>
                      <SelectTrigger className="min-w-0 flex-1">
                        <SelectValue placeholder="Ürün seçin…" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableStock.map((s: StockLevel) => (
                          <SelectItem key={s.productId} value={s.productId}>
                            {s.product.name}
                            <span className="ml-2 text-xs text-muted-foreground">
                              ({s.product.sku})
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Input
                    type="number"
                    min="0.001"
                    step="0.001"
                    value={itemQuantity}
                    onChange={(e) => setItemQuantity(e.target.value)}
                    placeholder="Miktar"
                    className="w-24 shrink-0"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    onClick={addItem}
                    disabled={!itemProductId || !itemQuantity}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                {/* Items list */}
                {orderItems.length > 0 && (
                  <div className="overflow-hidden rounded-md border">
                    {/* Column headers */}
                    <div className="grid grid-cols-[1fr_8rem_9rem_2rem] gap-x-3 border-b bg-muted/40 px-3 py-1.5">
                      <span className="text-xs text-muted-foreground">Ürün</span>
                      <span className="text-right text-xs text-muted-foreground">Miktar</span>
                      <span className="text-right text-xs text-muted-foreground">
                        Koli (adet/koli)
                      </span>
                      <span />
                    </div>

                    <div className="divide-y">
                      {orderItems.map((item) => {
                        const koli = formatCaseBreakdown(item.quantity, item.unitsPerCase);
                        const caseEmpty = item.unitsPerCase === null;

                        return (
                          <div
                            key={item.productId}
                            className="grid grid-cols-[1fr_8rem_9rem_2rem] items-start gap-x-3 px-3 py-2.5"
                          >
                            {/* Product info */}
                            <div className="flex min-w-0 flex-col justify-center pt-1.5">
                              <p className="truncate text-sm font-medium">{item.productName}</p>
                              <p className="text-xs text-muted-foreground">{item.productSku}</p>
                            </div>

                            {/* Quantity */}
                            <div className="flex flex-col items-center gap-1">
                              <Input
                                type="number"
                                min="0.001"
                                step="0.001"
                                defaultValue={item.quantity}
                                onBlur={(e) => {
                                  const qty = parseFloat(e.target.value);
                                  if (!isNaN(qty) && qty > 0) {
                                    setOrderItems((prev) =>
                                      prev.map((i) =>
                                        i.productId === item.productId
                                          ? { ...i, quantity: qty }
                                          : i,
                                      ),
                                    );
                                  }
                                }}
                                className="w-full text-right text-sm"
                              />
                              <span className="text-xs text-muted-foreground">
                                {item.productUnit}
                              </span>
                              {koli != null && (
                                <span className="text-xs text-muted-foreground">({koli})</span>
                              )}
                            </div>

                            {/* unitsPerCase */}
                            <div className="flex flex-col items-center gap-1">
                              <Input
                                type="number"
                                min="1"
                                step="1"
                                defaultValue={item.unitsPerCase ?? ''}
                                onBlur={(e) => handleUnitsPerCaseBlur(item, e)}
                                placeholder={caseEmpty ? 'Zorunlu' : ''}
                                className={`w-full text-right text-sm ${
                                  caseEmpty
                                    ? 'border-destructive placeholder:text-destructive/60 focus-visible:ring-destructive'
                                    : ''
                                }`}
                              />
                              <span className="text-xs text-muted-foreground">
                                {item.unitsPerCase != null
                                  ? `1 kolide ${item.unitsPerCase} adet`
                                  : 'adet/koli'}
                              </span>
                            </div>

                            {/* Remove */}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="mt-0.5 h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => removeItem(item.productId)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {orderItems.length === 0 && !stockLoading && (
                  <p className="text-xs text-muted-foreground">Henüz ürün eklenmedi.</p>
                )}
              </div>

              {/* Notlar */}
              <div className="space-y-1.5">
                <Label htmlFor="notes">Notlar</Label>
                <textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => {
                    setNotes(e.target.value);
                    setNoteIsAuto(false);
                  }}
                  rows={3}
                  placeholder="Tedarikçiye iletmek istediğiniz notu yazın..."
                  className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => router.back()}
                >
                  ← Siparişlere Dön
                </Button>
                <span
                  className={`flex-1 ${submitDisabled ? 'cursor-not-allowed' : ''}`}
                  title={submitTooltip}
                >
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={submitDisabled}
                  >
                    {createOrder.isPending ? 'Oluşturuluyor…' : 'Sipariş Oluştur'}
                  </Button>
                </span>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
