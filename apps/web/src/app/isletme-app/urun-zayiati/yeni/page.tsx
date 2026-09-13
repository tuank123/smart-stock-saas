'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { AlertTriangle, Camera as CameraIcon, X } from 'lucide-react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { StationPageHeader } from '@/components/layout/StationPageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateDefectiveItem, useStockQuery } from '@/hooks/useMudur';
import type { StockLevel } from '@/lib/types';

// OcrScanFlow.tsx'teki resizeAndEncode ile AYNI desen: max 1200px, JPEG 0.8.
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
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.src = src;
  });
}

export default function UrunZayiatiYeniPage() {
  const router = useRouter();
  const createDefectiveItem = useCreateDefectiveItem();

  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<StockLevel | null>(null);
  const [quantity, setQuantity] = useState('');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [error, setError] = useState('');

  const searchQuery = useStockQuery(selected ? null : search);
  const results = searchQuery.data ?? [];

  // Capacitor Camera — OcrScanFlow.tsx'teki AYNI "Çek/Galeriden Seç" deseni
  // (native'de plugin, web'de otomatik dosya seçici fallback'i devreye girer).
  async function handlePickPhoto() {
    try {
      const photo = await Camera.getPhoto({
        quality: 80,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Prompt,
        promptLabelHeader: 'Ürün Fotoğrafı',
        promptLabelPhoto: 'Galeriden Seç',
        promptLabelPicture: 'Fotoğraf Çek',
      });
      if (photo.dataUrl) setPhotoPreview(photo.dataUrl);
    } catch (err) {
      if (!String(err).toLowerCase().includes('cancel')) {
        toast.error('Fotoğraf alınamadı');
      }
    }
  }

  function removePhoto() {
    setPhotoPreview(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!selected) {
      setError('Lütfen bir ürün seçin.');
      return;
    }
    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty < 0.001) {
      setError('Miktar en az 0.001 olmalıdır.');
      return;
    }
    if (!photoPreview) {
      setError('Fotoğraf zorunludur.');
      return;
    }

    const photoBase64 = await resizeAndEncode(photoPreview);

    createDefectiveItem.mutate(
      { productId: selected.productId, quantity: qty, photoBase64 },
      { onSuccess: () => router.replace('/isletme-app/urun-zayiati') },
    );
  }

  return (
    <div className="mx-auto w-full max-w-lg">
      <StationPageHeader title="Yeni Zayiat Kaydı" />

      <Card>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Ürün ara */}
            <div className="space-y-2">
              <Label htmlFor="product-search">Ürün *</Label>

              {selected ? (
                <div className="flex items-center justify-between gap-2 rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{selected.product.name}</p>
                    <p className="text-xs text-green-600">{selected.product.sku}</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelected(null);
                      setSearch('');
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                    Değiştir
                  </Button>
                </div>
              ) : (
                <>
                  <Input
                    id="product-search"
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Ürün adı yazın…"
                  />
                  {search.trim() !== '' && (
                    <div className="max-h-52 space-y-1 overflow-y-auto rounded-md border p-1">
                      {results.length === 0 ? (
                        <p className="px-2 py-2 text-sm text-muted-foreground">
                          Ürün bulunamadı.
                        </p>
                      ) : (
                        results.map((s: StockLevel) => (
                          <button
                            key={s.productId}
                            type="button"
                            className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
                            onClick={() => {
                              setSelected(s);
                              setSearch('');
                            }}
                          >
                            <span className="truncate">{s.product.name}</span>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {s.product.sku}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </>
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

            {/* Fotoğraf */}
            <div className="space-y-1.5">
              <Label>Fotoğraf (zorunlu)</Label>
              {!photoPreview ? (
                <button
                  type="button"
                  onClick={handlePickPhoto}
                  className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-input bg-muted/30 px-3 py-4 text-sm text-muted-foreground transition-colors hover:bg-muted/50"
                >
                  <CameraIcon className="h-4 w-4" />
                  Fotoğraf çek veya seç
                </button>
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
                disabled={createDefectiveItem.isPending}
              >
                {createDefectiveItem.isPending ? 'Kaydediliyor…' : 'Kaydet'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
