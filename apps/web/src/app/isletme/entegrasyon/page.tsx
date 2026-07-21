'use client';

import { useEffect, useState } from 'react';
import { Eye, EyeOff, Wifi, WifiOff } from 'lucide-react';
import toast from 'react-hot-toast';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useBranchIntegration,
  useSaveBranchIntegration,
  useUpdateBranchIntegration,
} from '@/hooks/useIntegration';

// value'lar backend'deki integration_adapters tablosuyla BİREBİR eşleşmeli
// (adapterType DB'ye karşı doğrulanıyor). Label'lar kullanıcıya Türkçe gösterilir.
const ADAPTERS: { value: string; label: string }[] = [
  { value: 'BAY_T', label: 'Bay-t' },
  { value: 'LOGO', label: 'Logo' },
  { value: 'MIKRO', label: 'Mikro' },
  { value: 'NETSIS', label: 'Netsis' },
  { value: 'NEBIM', label: 'Nebim' },
  { value: 'ETA', label: 'ETA' },
  { value: 'DIA', label: 'Dia' },
  { value: 'AKINSOFT', label: 'Akınsoft' },
  { value: 'ZIRVE', label: 'Zirve' },
  { value: 'LUCA', label: 'Luca' },
];

const STATUS_LABEL: Record<string, string> = {
  CONNECTED: 'Bağlı',
  PENDING_INSTALL: 'Kurulum bekleniyor',
  DISCONNECTED: 'Bağlantı yok',
  ERROR: 'Hata',
};

function adapterLabel(value: string) {
  return ADAPTERS.find((a) => a.value === value)?.label ?? value;
}

export default function EntegrasyonPage() {
  const query = useBranchIntegration();
  const save = useSaveBranchIntegration();
  const update = useUpdateBranchIntegration();
  const existing = query.data ?? null;
  const saving = save.isPending || update.isPending;

  const [adapterType, setAdapterType] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [webserviceUrl, setWebserviceUrl] = useState('');
  const [pollingIntervalSec, setPollingIntervalSec] = useState('');
  const [showKey, setShowKey] = useState(false);

  // Mevcut entegrasyon yüklendiğinde formu "Düzenle" moduna doldur
  // (apiKey backend'den dönmez, güvenlik için boş kalır).
  useEffect(() => {
    if (existing) {
      setAdapterType(existing.adapterType ?? '');
      setWebserviceUrl(existing.webserviceUrl ?? '');
      setPollingIntervalSec(
        existing.pollingIntervalSec != null ? String(existing.pollingIntervalSec) : '',
      );
    }
  }, [existing]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adapterType) {
      toast.error('Adaptör tipi seçin');
      return;
    }

    const webservice = webserviceUrl.trim() || undefined;
    const polling = pollingIntervalSec ? Number(pollingIntervalSec) : undefined;

    if (existing) {
      // Güncelleme (PATCH): apiKey boşsa mevcut anahtar korunur.
      update.mutate({
        adapterType,
        webserviceUrl: webservice,
        pollingIntervalSec: polling,
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
      });
      return;
    }

    // Yeni kurulum (POST): apiKey zorunlu.
    if (!apiKey.trim()) {
      toast.error('API anahtarı gerekli');
      return;
    }
    save.mutate({
      adapterType,
      apiKey: apiKey.trim(),
      webserviceUrl: webservice,
      pollingIntervalSec: polling,
    });
  };

  return (
    <div className="mx-auto w-full max-w-xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Barkod Entegrasyonu</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Kasa / POS yazılımınızı bağlayarak stok ve fiyatların otomatik
          senkronize olmasını sağlayın.
        </p>
      </div>

      {/* Mevcut durum */}
      {query.isPending ? (
        <Skeleton className="mb-6 h-20 w-full rounded-xl" />
      ) : existing ? (
        <Card className="mb-6">
          <CardContent className="flex items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-green-100">
                <Wifi className="h-4 w-4 text-green-700" />
              </div>
              <div>
                <p className="font-medium leading-tight">{adapterLabel(existing.adapterType)}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {existing.connectionStatus
                    ? (STATUS_LABEL[existing.connectionStatus] ?? existing.connectionStatus)
                    : 'Durum bilinmiyor'}
                </p>
              </div>
            </div>
            <Badge variant="outline" className="text-xs">
              Kurulu
            </Badge>
          </CardContent>
        </Card>
      ) : (
        <Card className="mb-6">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
              <WifiOff className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              Henüz bir entegrasyon kurulmadı.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Kur / Düzenle formu */}
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="adapterType">Adaptör Tipi</Label>
          <Select value={adapterType} onValueChange={setAdapterType}>
            <SelectTrigger id="adapterType">
              <SelectValue placeholder="Yazılımınızı seçin…" />
            </SelectTrigger>
            <SelectContent>
              {ADAPTERS.map((a) => (
                <SelectItem key={a.value} value={a.value}>
                  {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="apiKey">API Anahtarı</Label>
          <div className="relative">
            <Input
              id="apiKey"
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={existing ? 'Yeni anahtar girin' : '••••••••'}
              className="pr-10"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground"
              tabIndex={-1}
              aria-label={showKey ? 'Gizle' : 'Göster'}
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="webserviceUrl">
            Web Servis URL <span className="text-muted-foreground">(opsiyonel)</span>
          </Label>
          <Input
            id="webserviceUrl"
            type="url"
            value={webserviceUrl}
            onChange={(e) => setWebserviceUrl(e.target.value)}
            placeholder="https://…"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pollingIntervalSec">
            Yoklama Aralığı (sn) <span className="text-muted-foreground">(opsiyonel)</span>
          </Label>
          <Input
            id="pollingIntervalSec"
            type="number"
            min={1}
            value={pollingIntervalSec}
            onChange={(e) => setPollingIntervalSec(e.target.value)}
            placeholder="10"
          />
        </div>

        <Button type="submit" className="w-full" disabled={saving}>
          {saving ? 'Kaydediliyor…' : existing ? 'Güncelle' : 'Kur'}
        </Button>
      </form>
    </div>
  );
}
