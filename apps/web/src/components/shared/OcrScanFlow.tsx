'use client';

import { Fragment, useState } from 'react';
import { AlertTriangle, Camera as CameraIcon, CheckCircle, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import toast from 'react-hot-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/store/auth.store';
import {
  useOcrConfirm,
  useOcrConfirmReturn,
  useOcrScan,
  useStockList,
  useSuppliers,
} from '@/hooks/useMudur';
import type { OcrParsedLine } from '@/hooks/useMudur';
import type { StockLevel, Supplier } from '@/lib/types';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

type QtyMode = 'ADET' | 'KOLI';

interface ReviewRow {
  ocrName: string;
  unit: string;
  confidence: number;
  matchStatus: OcrParsedLine['matchStatus'];
  productId: string | null;
  qty: number;
  mode: QtyMode;
  manualUnitsPerCase: number | null;
}

// ── Step indicator ────────────────────────────────────────────────────────────

const STEP_LABELS = ['Fotoğraf Yükle', 'Gözden Geçir', 'Tamamlandı'];

function StepIndicator({ current }: { current: 1 | 2 | 3 }) {
  return (
    <div className="mb-6 flex items-center gap-2">
      {[1, 2, 3].map((s, i) => (
        <Fragment key={s}>
          <div className="flex flex-col items-center gap-1">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                s === current
                  ? 'bg-foreground text-background'
                  : s < current
                  ? 'bg-primary/20 text-primary'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {s < current ? <CheckCircle className="h-3.5 w-3.5" /> : s}
            </div>
            <span
              className={`hidden text-xs sm:block ${
                s === current ? 'font-medium text-foreground' : 'text-muted-foreground'
              }`}
            >
              {STEP_LABELS[i]}
            </span>
          </div>
          {s < 3 && (
            <div
              className={`mb-3 h-px flex-1 transition-colors ${
                s < current ? 'bg-primary/40' : 'bg-border'
              }`}
            />
          )}
        </Fragment>
      ))}
    </div>
  );
}

// ── Shared OCR invoice-scan flow (foto çek → tara → onayla) ────────────────────
// branchId, ürün listesi ve OCR hook'ları role'den bağımsız olduğu için hem
// SUBE_MUDURU (mudur/ocr) hem KASIYER (gorevli/fatura-tarama) bunu kullanır.

export function OcrScanFlow() {
  const { user } = useAuthStore();
  const { data: stock } = useStockList();
  const { data: suppliers } = useSuppliers();
  const ocrScan = useOcrScan();
  const ocrConfirm = useOcrConfirm();
  const ocrConfirmReturn = useOcrConfirmReturn();

  // Satış faturası (stoka girer) mi, iade faturası (stoktan çıkar) mı?
  const [invoiceMode, setInvoiceMode] = useState<'SALE' | 'RETURN'>('SALE');

  const [step, setStep] = useState<1 | 2 | 3>(1);
  // preview = seçilen görselin data URL'i (hem önizleme hem tarama kaynağı).
  const [preview, setPreview] = useState<string | null>(null);
  const [scanId, setScanId] = useState('');
  const [reviewRows, setReviewRows] = useState<ReviewRow[]>([]);

  // Fatura meta bilgileri (Adım 2 — borç kayıtları için).
  const [supplierId, setSupplierId] = useState('');
  const [invoiceTotal, setInvoiceTotal] = useState('');
  const [paidAmount, setPaidAmount] = useState('');
  const [allItemsReceived, setAllItemsReceived] = useState(true);
  const [missingItemsNote, setMissingItemsNote] = useState('');

  // İade faturası bilgileri.
  const [invoiceDate, setInvoiceDate] = useState('');
  const [returnTotal, setReturnTotal] = useState('');
  const [settlementType, setSettlementType] = useState<'PRODUCT' | 'CASH'>('PRODUCT');

  // Map productId → { name, unit, unitsPerCase } from stock list for display
  const productMap = new Map<string, { name: string; unit: string; unitsPerCase: number | null }>(
    (stock ?? []).map((s: StockLevel) => [
      s.productId,
      { name: s.product.name, unit: s.product.unit, unitsPerCase: s.product.unitsPerCase ?? null },
    ]),
  );

  // Total adet for a row, accounting for koli mode (qty × unitsPerCase)
  function resolveUnitsPerCase(row: ReviewRow): number | null {
    if (row.productId) {
      const unitsPerCase = productMap.get(row.productId)?.unitsPerCase ?? null;
      if (unitsPerCase) return unitsPerCase;
    }
    return row.manualUnitsPerCase;
  }

  function resolveTotalQty(row: ReviewRow): number | null {
    if (row.mode === 'ADET') return row.qty;
    const unitsPerCase = resolveUnitsPerCase(row);
    if (!unitsPerCase) return null;
    return row.qty * unitsPerCase;
  }

  // ── Step 1 helpers ────────────────────────────────────────────────────

  // Capacitor Camera — kullanıcıya "Fotoğraf Çek" / "Galeriden Seç" menüsü sunar
  // (native'de plugin, web'de otomatik dosya seçici fallback'i devreye girer).
  async function handlePickImage() {
    try {
      const photo = await Camera.getPhoto({
        quality: 80,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Prompt,
        promptLabelHeader: 'Fatura Fotoğrafı',
        promptLabelPhoto: 'Galeriden Seç',
        promptLabelPicture: 'Fotoğraf Çek',
      });
      if (photo.dataUrl) {
        setPreview(photo.dataUrl);
      }
    } catch (err) {
      // Kullanıcı iptal ettiyse sessizce çık, hata gösterme.
      if (!String(err).toLowerCase().includes('cancel')) {
        toast.error('Fotoğraf alınamadı');
      }
    }
  }

  // Verilen data URL'i canvas üzerinde küçültüp base64 (prefix'siz) döndürür.
  function resizeAndEncode(src: string): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1200;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
          else { w = Math.round(w * MAX / h); h = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.8).split(',')[1]);
      };
      img.src = src;
    });
  }

  async function handleScan() {
    if (!preview || !user?.branchId) return;

    const base64 = await resizeAndEncode(preview);

    ocrScan.mutate(
      { branchId: user.branchId, imageBase64: base64 },
      {
        onSuccess: (data) => {
          setScanId(data.scanId);
          setReviewRows(
            data.parsedLines.map((line) => ({
              ocrName: line.name,
              unit: line.unit,
              confidence: line.confidence,
              matchStatus: line.matchStatus,
              productId: line.matchedProductId ?? null,
              qty: line.qty,
              mode: 'ADET' as const,
              manualUnitsPerCase: null,
            })),
          );
          // OCR fatura başlığını form alanlarına ön-doldur (kullanıcı düzenleyebilir).
          const header = data.header;
          if (header) {
            setSupplierId(header.matchedSupplierId ?? '');
            setInvoiceDate(header.invoiceDate ?? '');
            const totalStr = header.invoiceTotal != null ? String(header.invoiceTotal) : '';
            setInvoiceTotal(totalStr);
            setReturnTotal(totalStr);
          }
          setStep(2);
        },
        // GEÇİCİ TEŞHİS: taramada oluşan hatanın tam mesajını göster.
        onError: (err: unknown) => {
          const responseData = (err as { response?: { data?: unknown } })?.response?.data;
          const detail = responseData ? ` | data: ${JSON.stringify(responseData)}` : '';
          toast.error(`TARAMA HATASI: ${String(err)}${detail}`);
        },
      },
    );
  }

  // ── Step 2 helpers ────────────────────────────────────────────────────

  function updateRow(index: number, patch: Partial<ReviewRow>) {
    setReviewRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  // Satırı listeden kalıcı olarak çıkarır (geri getirilemez).
  function handleDeleteRow(index: number) {
    setReviewRows((prev) => prev.filter((_, i) => i !== index));
  }

  function handleConfirm() {
    if (reviewRows.some((r) => !r.productId)) {
      toast.error('Eşleştirilmemiş ürünler var');
      return;
    }
    if (reviewRows.some((r) => resolveTotalQty(r) == null)) {
      toast.error('Koli/adet bilgisi eksik olan ürünler var');
      return;
    }
    if (!supplierId) {
      toast.error('Tedarikçi seçin');
      return;
    }
    if (!allItemsReceived && !missingItemsNote.trim()) {
      toast.error('Eksik ürün notunu yazın');
      return;
    }

    const invoiceTotalNum = invoiceTotal.trim()
      ? Number(invoiceTotal.replace(',', '.'))
      : undefined;
    const paidAmountNum = paidAmount.trim()
      ? Number(paidAmount.replace(',', '.'))
      : undefined;

    ocrConfirm.mutate(
      {
        scanId,
        lines: reviewRows.map((r) => ({
          productId: r.productId!,
          qty: resolveTotalQty(r)!,
          unit: r.unit,
        })),
        supplierId,
        invoiceTotal: invoiceTotalNum,
        paidAmount: paidAmountNum,
        missingItemsNote:
          !allItemsReceived && missingItemsNote.trim() ? missingItemsNote.trim() : undefined,
      },
      { onSuccess: () => setStep(3) },
    );
  }

  function handleConfirmReturn() {
    if (reviewRows.some((r) => !r.productId)) {
      toast.error('Eşleştirilmemiş ürünler var');
      return;
    }
    if (reviewRows.some((r) => resolveTotalQty(r) == null)) {
      toast.error('Koli/adet bilgisi eksik olan ürünler var');
      return;
    }
    if (!supplierId) {
      toast.error('Tedarikçi seçin');
      return;
    }
    if (!invoiceDate) {
      toast.error('Fatura tarihi girin');
      return;
    }
    const returnTotalNum = Number(returnTotal.replace(',', '.'));
    if (!returnTotalNum || returnTotalNum <= 0) {
      toast.error('Geçerli bir iade tutarı girin');
      return;
    }

    ocrConfirmReturn.mutate(
      {
        scanId,
        supplierId,
        invoiceDate,
        returnTotal: returnTotalNum,
        settlementType,
        lines: reviewRows.map((r) => ({
          productId: r.productId!,
          qty: resolveTotalQty(r)!,
          unit: r.unit,
        })),
      },
      { onSuccess: () => setStep(3) },
    );
  }

  function reset() {
    setStep(1);
    setPreview(null);
    setScanId('');
    setReviewRows([]);
    setSupplierId('');
    setInvoiceTotal('');
    setPaidAmount('');
    setAllItemsReceived(true);
    setMissingItemsNote('');
    setInvoiceDate('');
    setReturnTotal('');
    setSettlementType('PRODUCT');
  }

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-2xl">
      {/* ── Fatura Türü Seçici ───────────────────────────────────── */}
      <div className="mb-4 grid grid-cols-2 gap-2">
        <Button
          variant={invoiceMode === 'SALE' ? 'default' : 'outline'}
          onClick={() => setInvoiceMode('SALE')}
        >
          Satış Faturası
        </Button>
        <Button
          variant={invoiceMode === 'RETURN' ? 'default' : 'outline'}
          onClick={() => setInvoiceMode('RETURN')}
        >
          İade Faturası
        </Button>
      </div>

      <StepIndicator current={step} />

      {/* ── Adım 1 — Fotoğraf Yükle ─────────────────────────────── */}
      {step === 1 && (
        <Card>
          <CardContent className="p-6">
            <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Fatura Fotoğrafı
            </p>

            {/* Upload area — Capacitor Camera (Çek / Galeriden Seç menüsü) */}
            <button
              type="button"
              onClick={handlePickImage}
              className="mb-4 flex w-full flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border py-10 transition-colors hover:border-foreground/30 hover:bg-muted/30"
            >
              <CameraIcon className="h-10 w-10 text-muted-foreground/50" />
              <div className="text-center">
                <p className="text-sm font-medium">Fatura fotoğrafı çek veya yükle</p>
                <p className="text-xs text-muted-foreground">JPG, PNG, HEIC</p>
              </div>
            </button>

            {/* Preview */}
            {preview && (
              <div className="mb-4 overflow-hidden rounded-lg border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview}
                  alt="Fatura önizleme"
                  className="max-h-64 w-full object-contain"
                />
              </div>
            )}

            <Button
              className="w-full gap-2"
              disabled={!preview || ocrScan.isPending}
              onClick={handleScan}
            >
              {ocrScan.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Fatura taranıyor…
                </>
              ) : (
                'Tara'
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Adım 2 — Sonuçları Gözden Geçir ─────────────────────── */}
      {step === 2 && (
        <Card>
          <CardContent className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                OCR Sonuçları — {reviewRows.length} satır
              </p>
              <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={reset}>
                <RotateCcw className="h-3.5 w-3.5" />
                Yeniden Tara
              </Button>
            </div>

            <div className="space-y-3">
              {reviewRows.map((row, i) => {
                const matched = row.productId ? productMap.get(row.productId) : null;
                const isAutoMatched = row.matchStatus === 'AUTO_MATCHED' && row.productId;

                return (
                  <div key={i} className="rounded-lg border p-3">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <p className="text-xs text-muted-foreground">{row.ocrName}</p>
                      <button
                        type="button"
                        onClick={() => handleDeleteRow(i)}
                        aria-label="Satırı sil"
                        className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs text-destructive transition-colors hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Sil
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {/* Match status + product selector */}
                      {isAutoMatched ? (
                        <div className="flex flex-1 items-center gap-2">
                          <Badge
                            variant="outline"
                            className="shrink-0 border-green-200 bg-green-100 text-xs text-green-700"
                          >
                            <CheckCircle className="mr-1 h-3 w-3" />
                            Otomatik Eşleşti
                          </Badge>
                          <span className="truncate text-sm font-medium">
                            {matched?.name ?? row.productId}
                          </span>
                        </div>
                      ) : (
                        <div className="flex flex-1 items-center gap-2">
                          <Badge
                            variant="outline"
                            className={`shrink-0 text-xs ${
                              row.productId
                                ? 'border-amber-200 bg-amber-100 text-amber-700'
                                : 'border-red-200 bg-red-100 text-red-700'
                            }`}
                          >
                            {row.productId ? 'Manuel Seç' : 'Eşleşmedi'}
                          </Badge>
                          <Select
                            value={row.productId ?? ''}
                            onValueChange={(v) => updateRow(i, { productId: v || null })}
                          >
                            <SelectTrigger className="h-8 min-w-0 flex-1 text-xs">
                              <SelectValue placeholder="Ürün seçin…" />
                            </SelectTrigger>
                            <SelectContent>
                              {(stock ?? []).map((s: StockLevel) => (
                                <SelectItem key={s.productId} value={s.productId}>
                                  {s.product.name}
                                  <span className="ml-1 text-muted-foreground">
                                    ({s.product.sku})
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {/* Unit mode toggle */}
                      <div className="flex shrink-0 overflow-hidden rounded-md border">
                        {(['ADET', 'KOLI'] as const).map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => updateRow(i, { mode: m })}
                            className={cn(
                              'px-2 py-1 text-xs font-medium transition-colors',
                              row.mode === m
                                ? 'bg-foreground text-background'
                                : 'bg-background text-muted-foreground hover:bg-muted/50',
                            )}
                          >
                            {m === 'ADET' ? 'Adet' : 'Koli'}
                          </button>
                        ))}
                      </div>

                      {/* Quantity */}
                      <div className="flex shrink-0 items-center gap-1">
                        <Input
                          type="number"
                          min="0.001"
                          step="0.001"
                          value={row.qty}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            if (!isNaN(v) && v > 0) updateRow(i, { qty: v });
                          }}
                          className="h-8 w-20 text-right text-sm"
                        />
                        <span className="text-xs text-muted-foreground">
                          {row.mode === 'KOLI' ? 'koli' : row.unit}
                        </span>
                      </div>
                    </div>

                    {/* Koli → adet conversion */}
                    {row.mode === 'KOLI' && (() => {
                      const unitsPerCase = resolveUnitsPerCase(row);
                      if (unitsPerCase) {
                        return (
                          <p className="mt-2 text-xs text-muted-foreground">
                            ({row.qty} koli × {unitsPerCase} adet/koli = {row.qty * unitsPerCase}{' '}
                            adet)
                          </p>
                        );
                      }
                      return (
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            Bu ürün için koli/adet bilgisi giriniz
                          </span>
                          <Input
                            type="number"
                            min="1"
                            step="1"
                            value={row.manualUnitsPerCase ?? ''}
                            onChange={(e) => {
                              const v = parseInt(e.target.value, 10);
                              updateRow(i, { manualUnitsPerCase: !isNaN(v) && v >= 1 ? v : null });
                            }}
                            className="h-8 w-20 text-right text-sm"
                          />
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>

            {reviewRows.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                OCR sonucu boş. Lütfen yeniden tarayın.
              </p>
            )}

            {/* ── Fatura Bilgileri (ortak — OCR'dan ön-dolu, düzenlenebilir) ── */}
            <div className="mt-6 space-y-4 border-t pt-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Fatura Bilgileri
              </p>

              {/* Tedarikçi */}
              <div className="space-y-1.5">
                <Label htmlFor="ocr-supplier">Tedarikçi *</Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger id="ocr-supplier">
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
              </div>

              {/* Fatura tarihi + tutar (moda göre etiket/bağlanan state) */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ocr-invoice-date">Fatura Tarihi *</Label>
                  <Input
                    id="ocr-invoice-date"
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ocr-total">
                    {invoiceMode === 'SALE' ? 'Fatura Tutarı (₺)' : 'İade Tutarı (₺) *'}
                  </Label>
                  <Input
                    id="ocr-total"
                    type="text"
                    inputMode="decimal"
                    value={invoiceMode === 'SALE' ? invoiceTotal : returnTotal}
                    onChange={(e) =>
                      invoiceMode === 'SALE'
                        ? setInvoiceTotal(e.target.value)
                        : setReturnTotal(e.target.value)
                    }
                    placeholder="0,00"
                  />
                </div>
              </div>
            </div>

            {/* ── SALE: Ödenen Tutar + Teslim Alındı mı ──────────────── */}
            {invoiceMode === 'SALE' && (
              <div className="mt-4 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="ocr-paid-amount">Ödenen Tutar (₺)</Label>
                  <Input
                    id="ocr-paid-amount"
                    type="text"
                    inputMode="decimal"
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(e.target.value)}
                    placeholder="0,00"
                  />
                </div>

                {invoiceTotal.trim() && !paidAmount.trim() && (
                  <p className="flex items-center gap-1.5 text-xs text-amber-600">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    Fatura tutarı girdiniz — ödenen tutarı da girmezseniz borç kaydı oluşmaz.
                  </p>
                )}

                <div className="space-y-1.5">
                  <Label>Faturadaki tüm ürünler teslim alındı mı?</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={allItemsReceived ? 'default' : 'outline'}
                      onClick={() => setAllItemsReceived(true)}
                    >
                      Evet
                    </Button>
                    <Button
                      type="button"
                      variant={!allItemsReceived ? 'default' : 'outline'}
                      onClick={() => setAllItemsReceived(false)}
                    >
                      Hayır
                    </Button>
                  </div>
                </div>

                {!allItemsReceived && (
                  <div className="space-y-1.5">
                    <Label htmlFor="ocr-missing-note">Eksik ürün(ler) ve miktarını yazın *</Label>
                    <textarea
                      id="ocr-missing-note"
                      value={missingItemsNote}
                      onChange={(e) => setMissingItemsNote(e.target.value)}
                      rows={3}
                      placeholder="Örn. Coca-Cola 33cl - 5 adet eksik"
                      className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    />
                  </div>
                )}
              </div>
            )}

            {/* ── RETURN: İade Nasıl Gerçekleşecek ───────────────────── */}
            {invoiceMode === 'RETURN' && (
              <div className="mt-4 space-y-4">
                <div className="space-y-1.5">
                  <Label>İade Nasıl Gerçekleşecek?</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={settlementType === 'PRODUCT' ? 'default' : 'outline'}
                      onClick={() => setSettlementType('PRODUCT')}
                    >
                      Ürünle
                    </Button>
                    <Button
                      type="button"
                      variant={settlementType === 'CASH' ? 'default' : 'outline'}
                      onClick={() => setSettlementType('CASH')}
                    >
                      Parayla
                    </Button>
                  </div>
                </div>

                {settlementType === 'CASH' && (
                  <p className="text-xs text-muted-foreground">
                    İade tutarı ({returnTotal || '0'}₺) nakit olarak alacak kaydına eklenecek.
                  </p>
                )}

                {settlementType === 'PRODUCT' && (
                  <p className="text-xs text-muted-foreground">
                    Faturadaki ürün ve miktarlar otomatik kullanılacak; kayıt "Ödendi"
                    yapıldığında ürünler stoğa geri eklenir.
                  </p>
                )}
              </div>
            )}

            <Button
              className="mt-6 w-full gap-2"
              disabled={
                (invoiceMode === 'SALE' ? ocrConfirm.isPending : ocrConfirmReturn.isPending) ||
                reviewRows.length === 0
              }
              onClick={invoiceMode === 'SALE' ? handleConfirm : handleConfirmReturn}
            >
              {(invoiceMode === 'SALE' ? ocrConfirm.isPending : ocrConfirmReturn.isPending) ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  İşleniyor…
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4" />
                  {invoiceMode === 'SALE' ? 'Onayla ve Stoka İşle' : 'İade Faturasını Onayla'}
                </>
              )}
            </Button>

            {reviewRows.some((r) => !r.productId) && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                Eşleştirilmemiş satırlar var — ürün seçin ya da satırı silin.
              </p>
            )}

            {reviewRows.some((r) => resolveTotalQty(r) == null) && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                Koli/adet bilgisi eksik satırlar var.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Adım 3 — Başarı ─────────────────────────────────────── */}
      {step === 3 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-5 p-10 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <div>
              <p className="text-lg font-semibold">
                {invoiceMode === 'SALE'
                  ? 'Fatura başarıyla stoka işlendi'
                  : 'İade faturası başarıyla kaydedildi'}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Stok hareketleri güncellendi.
              </p>
            </div>
            <Button onClick={reset} variant="outline" className="gap-2">
              <RotateCcw className="h-4 w-4" />
              Yeni Fatura Tara
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
