'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, Camera, List, ScanBarcode, Video, VideoOff, X } from 'lucide-react';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
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
import { useStockList, useWaste } from '@/hooks/useMudur';
import type { StockLevel } from '@/lib/types';

// ── Camera barcode scanner ────────────────────────────────────────────────────

interface BarcodeScannerProps {
  onDetected: (value: string) => void;
}

function BarcodeScanner({ onDetected }: BarcodeScannerProps) {
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const detectedRef = useRef(false);

  const stopScan = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setScanning(false);
  }, []);

  async function startScan() {
    setCameraError(null);
    detectedRef.current = false;
    setScanning(true);
    try {
      const reader = new BrowserMultiFormatReader();
      const controls = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' } } },
        videoRef.current!,
        (result) => {
          if (result && !detectedRef.current) {
            detectedRef.current = true;
            stopScan();
            onDetected(result.getText());
          }
        },
      );
      controlsRef.current = controls;
    } catch {
      setScanning(false);
      setCameraError('Kameraya erişilemiyor. Lütfen tarayıcı kamera iznini kontrol edin.');
    }
  }

  useEffect(() => {
    return () => {
      controlsRef.current?.stop();
    };
  }, []);

  return (
    <div className="space-y-2">
      {/* Video element stays mounted so the ref is always available */}
      <div className={scanning ? 'block' : 'hidden'}>
        <video
          ref={videoRef}
          className="w-full max-h-48 rounded-md object-cover bg-black"
          muted
          playsInline
        />
      </div>

      {cameraError && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {cameraError}
        </div>
      )}

      {!scanning ? (
        <Button
          type="button"
          variant="outline"
          className="w-full gap-2"
          onClick={startScan}
        >
          <Video className="h-4 w-4" />
          Kamerayı Aç
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="w-full gap-2"
          onClick={stopScan}
        >
          <VideoOff className="h-4 w-4" />
          Kamerayı Kapat
        </Button>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MudurFirePage() {
  const router = useRouter();
  const { data: stock, isPending: stockLoading } = useStockList();
  const wasteMutation = useWaste();

  const [selectMode, setSelectMode] = useState<'list' | 'barcode'>('list');
  const [productId, setProductId] = useState('');
  const [scannedValue, setScannedValue] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  function removePhoto() {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(null);
    setPhotoFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleBarcodeDetected(value: string) {
    setScannedValue(value);
    const match = (stock ?? []).find(
      (s: StockLevel) =>
        s.product.sku === value ||
        (s.product.barcode && s.product.barcode === value),
    );
    if (match) setProductId(match.productId);
    else setProductId('');
  }

  function retryBarcode() {
    setScannedValue(null);
    setProductId('');
  }

  function switchMode(mode: 'list' | 'barcode') {
    setSelectMode(mode);
    setProductId('');
    setScannedValue(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!productId) {
      setError('Lütfen bir ürün seçin.');
      return;
    }
    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty < 0.001) {
      setError('Miktar en az 0.001 olmalıdır.');
      return;
    }
    if (!reason.trim()) {
      setError('Sebep alanı zorunludur.');
      return;
    }

    wasteMutation.mutate(
      { productId, quantity: qty, reason: reason.trim() },
      {
        onSuccess: () => {
          setProductId('');
          setScannedValue(null);
          setQuantity('');
          setReason('');
          removePhoto();
        },
      },
    );
  }

  const selectedStock = stock?.find((s: StockLevel) => s.productId === productId);

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-semibold">Fire Kaydı</h1>
      </div>

      <div className="mx-auto max-w-lg">
        <Card>
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Ürün seç */}
              <div className="space-y-2">
                <Label>Ürün *</Label>

                {/* Mode toggle */}
                <div className="flex gap-1 rounded-md border border-input p-0.5 w-fit">
                  <button
                    type="button"
                    onClick={() => switchMode('list')}
                    className={`flex items-center gap-1.5 rounded px-3 py-1 text-sm font-medium transition-colors ${
                      selectMode === 'list'
                        ? 'bg-foreground text-background'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <List className="h-3.5 w-3.5" />
                    Listeden Seç
                  </button>
                  <button
                    type="button"
                    onClick={() => switchMode('barcode')}
                    className={`flex items-center gap-1.5 rounded px-3 py-1 text-sm font-medium transition-colors ${
                      selectMode === 'barcode'
                        ? 'bg-foreground text-background'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <ScanBarcode className="h-3.5 w-3.5" />
                    Barkod Okut
                  </button>
                </div>

                {/* List mode */}
                {selectMode === 'list' &&
                  (stockLoading ? (
                    <Skeleton className="h-9 w-full" />
                  ) : (
                    <Select value={productId} onValueChange={setProductId}>
                      <SelectTrigger id="product">
                        <SelectValue placeholder="Ürün seçin…" />
                      </SelectTrigger>
                      <SelectContent>
                        {(stock ?? []).map((s: StockLevel) => (
                          <SelectItem key={s.productId} value={s.productId}>
                            {s.product.name}
                            <span className="ml-2 text-xs text-muted-foreground">
                              ({s.product.sku})
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ))}

                {/* Barcode mode */}
                {selectMode === 'barcode' && (
                  <div className="space-y-2">
                    {/* Show scanner when no result yet */}
                    {!scannedValue && <BarcodeScanner onDetected={handleBarcodeDetected} />}

                    {/* Match found */}
                    {scannedValue && productId && (
                      <div className="flex items-center gap-2 rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800">
                        <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-green-500" />
                        <span className="font-medium">{selectedStock?.product.name}</span>
                        <span className="text-xs text-green-600">
                          ({selectedStock?.product.sku})
                        </span>
                      </div>
                    )}

                    {/* No match */}
                    {scannedValue && !productId && (
                      <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        <span>
                          Ürün bulunamadı —{' '}
                          <span className="font-mono">{scannedValue}</span>
                        </span>
                      </div>
                    )}

                    {/* Retry / re-scan */}
                    {scannedValue && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full gap-1.5"
                        onClick={retryBarcode}
                      >
                        <X className="h-3.5 w-3.5" />
                        Tekrar Dene
                      </Button>
                    )}
                  </div>
                )}

                {/* Current stock hint — works for both modes */}
                {selectedStock && (
                  <p className="text-xs text-muted-foreground">
                    Mevcut stok:{' '}
                    <span className="font-medium">
                      {Number(selectedStock.quantity).toLocaleString('tr-TR')}{' '}
                      {selectedStock.product.unit}
                    </span>
                  </p>
                )}
              </div>

              {/* Miktar */}
              <div className="space-y-1.5">
                <Label htmlFor="quantity">Miktar *</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="0"
                />
              </div>

              {/* Sebep */}
              <div className="space-y-1.5">
                <Label htmlFor="reason">Sebep *</Label>
                <textarea
                  id="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  placeholder="Fire sebebini açıklayın…"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                />
              </div>

              {/* Fotoğraf */}
              <div className="space-y-1.5">
                <Label>Fotoğraf (opsiyonel)</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoChange}
                  className="hidden"
                  id="photo-input"
                />
                {!photoPreview ? (
                  <label
                    htmlFor="photo-input"
                    className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-input bg-muted/30 px-3 py-4 text-sm text-muted-foreground transition-colors hover:bg-muted/50"
                  >
                    <Camera className="h-4 w-4" />
                    Fotoğraf seç veya çek
                  </label>
                ) : (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photoPreview}
                      alt="Fotoğraf önizleme"
                      className="max-h-48 w-full rounded-md object-cover"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={removePhoto}
                      className="absolute right-2 top-2 flex items-center gap-1 text-xs"
                    >
                      <X className="h-3 w-3" />
                      Fotoğrafı Kaldır
                    </Button>
                  </div>
                )}
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
                  İptal
                </Button>
                <Button
                  type="submit"
                  variant="destructive"
                  className="flex-1"
                  disabled={wasteMutation.isPending}
                >
                  {wasteMutation.isPending ? 'Kaydediliyor…' : 'Fire Kaydet'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
