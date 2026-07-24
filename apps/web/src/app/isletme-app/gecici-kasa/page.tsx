'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  Check,
  Loader2,
  Minus,
  PackageX,
  Plus,
  ScanBarcode,
  Trash2,
} from 'lucide-react';
import { StationPageHeader } from '@/components/layout/StationPageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BarcodeScanner } from '@/components/shared/BarcodeScanner';
import { useStockQuery, useRecordSale } from '@/hooks/useMudur';
import { cn } from '@/lib/utils';
import type { StockLevel } from '@/lib/types';

interface CartItem {
  productId: string;
  productName: string;
  unit: string;
  unitPrice: number;
  quantity: number;
}

function fmtMoney(v: number) {
  return `${v.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺`;
}

function priceOf(item: StockLevel): number | null {
  const p = item.product.salePrice;
  if (p == null) return null;
  const n = Number(p);
  return Number.isFinite(n) ? n : null;
}

export default function GeciciKasaPage() {
  const [barcodeTerm, setBarcodeTerm] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD'>('CASH');
  const [scanOpen, setScanOpen] = useState(false);
  const [customerPhone, setCustomerPhone] = useState('');
  const [lastTxn, setLastTxn] = useState<string | null>(null);
  const [lastSmsPhone, setLastSmsPhone] = useState<string | null>(null);

  const sale = useRecordSale();

  // Barkod bazlı sorgu (isim araması yok).
  const barcodeQuery = useStockQuery(barcodeTerm, true);
  const results = barcodeQuery.data ?? [];

  const addToCart = useCallback((item: StockLevel) => {
    const price = priceOf(item);
    if (price == null) {
      toast.error('Bu ürünün satış fiyatı belirlenmemiş');
      return;
    }
    setCart((prev) => {
      const existing = prev.find((c) => c.productId === item.productId);
      if (existing) {
        return prev.map((c) =>
          c.productId === item.productId ? { ...c, quantity: c.quantity + 1 } : c,
        );
      }
      return [
        ...prev,
        {
          productId: item.productId,
          productName: item.product.name,
          unit: item.product.unit,
          unitPrice: price,
          quantity: 1,
        },
      ];
    });
    setLastTxn(null);
    setBarcodeTerm(null); // sonuç listesini kapat → sepete odaklan
  }, []);

  // Barkod okundu → tek eşleşme varsa otomatik sepete ekle; 0 ise uyar;
  // birden fazlaysa listede bırak (kullanıcı seçsin).
  useEffect(() => {
    if (!barcodeTerm || !barcodeQuery.isSuccess) return;
    const data = barcodeQuery.data ?? [];
    if (data.length === 1) {
      addToCart(data[0]); // barcodeTerm'i de temizler
    } else if (data.length === 0) {
      toast.error('Barkod ile ürün bulunamadı');
      setBarcodeTerm(null);
    }
    // data.length > 1 → liste açık kalsın
  }, [barcodeTerm, barcodeQuery.isSuccess, barcodeQuery.data, addToCart]);

  function changeQty(productId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((c) => (c.productId === productId ? { ...c, quantity: c.quantity + delta } : c))
        .filter((c) => c.quantity > 0),
    );
  }

  function removeFromCart(productId: string) {
    setCart((prev) => prev.filter((c) => c.productId !== productId));
  }

  const grandTotal = cart.reduce((s, c) => s + c.quantity * c.unitPrice, 0);

  function handleComplete() {
    if (cart.length === 0) return;
    const phone = customerPhone.trim();
    sale.mutate(
      {
        items: cart.map((c) => ({ productId: c.productId, quantity: c.quantity })),
        paymentMethod,
        ...(phone ? { customerPhone: phone } : {}),
      },
      {
        onSuccess: (data) => {
          const smsSent = (data as { smsSent?: boolean })?.smsSent === true;
          setCart([]);
          setBarcodeTerm(null);
          setCustomerPhone('');
          setLastTxn((data as { transactionId?: string })?.transactionId ?? null);
          setLastSmsPhone(smsSent ? phone : null);
          if (smsSent && phone) {
            toast.success(`Fiş ${phone} numarasına gönderildi`);
          }
        },
      },
    );
  }

  function onBarcode(value: string) {
    setScanOpen(false);
    setLastTxn(null);
    setBarcodeTerm(value); // barkod bazlı sorguyu tetikle
  }

  return (
    <div className="mx-auto w-full max-w-lg">
      <StationPageHeader title="Geçici Kasa" />

      {/* Barkod okut — ana giriş */}
      <Button
        type="button"
        variant="outline"
        className="mb-6 flex h-24 w-full flex-col items-center justify-center gap-2"
        onClick={() => setScanOpen(true)}
      >
        <ScanBarcode className="h-8 w-8 text-primary" />
        <span className="text-base font-medium">Barkod Okut</span>
      </Button>

      {/* Barkod sorgusu sonuçları (yalnız barkod okunmuşken) */}
      {barcodeTerm !== null && (
        <div className="mb-6">
          {barcodeQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Aranıyor…</span>
            </div>
          ) : barcodeQuery.isError ? (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Sorgu başarısız.
            </div>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-card py-8 text-center">
              <PackageX className="h-7 w-7 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Ürün bulunamadı</p>
            </div>
          ) : (
            <div className="space-y-2">
              {results.map((item: StockLevel) => {
                const price = priceOf(item);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => addToCart(item)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border bg-card p-3 text-left shadow-sm transition-colors hover:bg-muted active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{item.product.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {price != null ? fmtMoney(price) : 'Fiyat belirlenmemiş'} · Stok{' '}
                        {Number(item.quantity).toLocaleString('tr-TR')} {item.product.unit}
                      </p>
                    </div>
                    <Plus className="h-5 w-5 shrink-0 text-primary" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Son işlem onayı */}
      {lastTxn && cart.length === 0 && barcodeTerm === null && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-700">
          <Check className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="space-y-0.5">
            <p>
              Satış tamamlandı. İşlem No:{' '}
              <span className="font-mono text-xs">{lastTxn.slice(0, 8)}</span>
            </p>
            {lastSmsPhone && <p className="text-xs">Fiş {lastSmsPhone} numarasına gönderildi.</p>}
          </div>
        </div>
      )}

      {/* Sepet */}
      {cart.length === 0
        ? !lastTxn &&
          barcodeTerm === null && (
            <div className="rounded-xl border border-dashed bg-card py-12 text-center text-sm text-muted-foreground">
              Sepet boş — barkod okutarak ürün ekleyin.
            </div>
          )
        : (
          <div className="space-y-2">
            {cart.map((c) => (
              <div key={c.productId} className="rounded-md border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.productName}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmtMoney(c.unitPrice)} / {c.unit}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => removeFromCart(c.productId)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => changeQty(c.productId, -1)}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="w-8 text-center text-sm font-medium tabular-nums">
                      {c.quantity}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => changeQty(c.productId, 1)}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">
                    {fmtMoney(c.quantity * c.unitPrice)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

      {/* Alt bar: toplam + ödeme + tamamla */}
      {cart.length > 0 && (
        <div className="mt-6 space-y-4 rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Genel Toplam</span>
            <span className="text-xl font-bold tabular-nums">{fmtMoney(grandTotal)}</span>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Ödeme Yöntemi</p>
            <div className="grid grid-cols-2 gap-2">
              {(['CASH', 'CARD'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPaymentMethod(m)}
                  className={cn(
                    'rounded-lg border py-3 text-sm font-medium transition-colors',
                    paymentMethod === m
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'bg-card hover:bg-muted',
                  )}
                >
                  {m === 'CASH' ? 'Nakit' : 'Kart'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="customerPhone" className="mb-2 block text-sm font-medium">
              Müşteri Telefon Numarası{' '}
              <span className="text-muted-foreground">(opsiyonel)</span>
            </label>
            <Input
              id="customerPhone"
              type="tel"
              inputMode="tel"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="05XX XXX XX XX"
              className="w-full"
            />
          </div>

          <Button
            type="button"
            className="h-12 w-full text-base"
            disabled={sale.isPending}
            onClick={handleComplete}
          >
            {sale.isPending ? 'İşleniyor…' : `Satışı Tamamla · ${fmtMoney(grandTotal)}`}
          </Button>
        </div>
      )}

      {/* Barkod tarayıcı */}
      <Dialog open={scanOpen} onOpenChange={setScanOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Barkod Okut</DialogTitle>
          </DialogHeader>
          <BarcodeScanner onDetected={onBarcode} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
