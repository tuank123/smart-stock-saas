'use client';

import { Fragment, useRef, useState } from 'react';
import { AlertTriangle, Camera, CheckCircle, RefreshCw, RotateCcw } from 'lucide-react';
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
import { useAuthStore } from '@/store/auth.store';
import { useOcrConfirm, useOcrScan, useStockList } from '@/hooks/useMudur';
import type { OcrParsedLine } from '@/hooks/useMudur';
import type { StockLevel } from '@/lib/types';
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
  excluded: boolean;
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
  const ocrScan = useOcrScan();
  const ocrConfirm = useOcrConfirm();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [scanId, setScanId] = useState('');
  const [reviewRows, setReviewRows] = useState<ReviewRow[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  function resizeAndEncode(f: File): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(f);
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
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.8).split(',')[1]);
      };
      img.src = url;
    });
  }

  async function handleScan() {
    if (!file || !user?.branchId) return;

    const base64 = await resizeAndEncode(file);

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
              excluded: false,
            })),
          );
          setStep(2);
        },
      },
    );
  }

  // ── Step 2 helpers ────────────────────────────────────────────────────

  function updateRow(index: number, patch: Partial<ReviewRow>) {
    setReviewRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function handleConfirm() {
    const active = reviewRows.filter((r) => !r.excluded);
    if (active.some((r) => !r.productId)) {
      toast.error('Eşleştirilmemiş ürünler var');
      return;
    }
    if (active.some((r) => resolveTotalQty(r) == null)) {
      toast.error('Koli/adet bilgisi eksik olan ürünler var');
      return;
    }
    ocrConfirm.mutate(
      {
        scanId,
        lines: active.map((r) => ({
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
    setFile(null);
    setPreview(null);
    setScanId('');
    setReviewRows([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-2xl">
      <StepIndicator current={step} />

      {/* ── Adım 1 — Fotoğraf Yükle ─────────────────────────────── */}
      {step === 1 && (
        <Card>
          <CardContent className="p-6">
            <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Fatura Fotoğrafı
            </p>

            {/* Upload area */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mb-4 flex w-full flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border py-10 transition-colors hover:border-foreground/30 hover:bg-muted/30"
            >
              <Camera className="h-10 w-10 text-muted-foreground/50" />
              <div className="text-center">
                <p className="text-sm font-medium">Fatura fotoğrafı çek veya yükle</p>
                <p className="text-xs text-muted-foreground">JPG, PNG, HEIC</p>
              </div>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFileChange}
            />

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
              disabled={!file || ocrScan.isPending}
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
                  <div
                    key={i}
                    className={`rounded-lg border p-3 transition-opacity ${
                      row.excluded ? 'opacity-40' : ''
                    }`}
                  >
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <p className="text-xs text-muted-foreground">{row.ocrName}</p>
                      <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={row.excluded}
                          onChange={(e) => updateRow(i, { excluded: e.target.checked })}
                          className="h-3.5 w-3.5 rounded border-input"
                        />
                        Hariç tut
                      </label>
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
                            disabled={row.excluded}
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
                            disabled={row.excluded}
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
                          disabled={row.excluded}
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
                            disabled={row.excluded}
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

            <Button
              className="mt-6 w-full gap-2"
              disabled={ocrConfirm.isPending || reviewRows.every((r) => r.excluded)}
              onClick={handleConfirm}
            >
              {ocrConfirm.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  İşleniyor…
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4" />
                  Onayla ve Stoka İşle
                </>
              )}
            </Button>

            {reviewRows.filter((r) => !r.excluded).some((r) => !r.productId) && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                Eşleştirilmemiş satırlar var — hariç tut ya da ürün seç.
              </p>
            )}

            {reviewRows.filter((r) => !r.excluded).some((r) => resolveTotalQty(r) == null) && (
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
              <p className="text-lg font-semibold">Fatura başarıyla stoka işlendi</p>
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
