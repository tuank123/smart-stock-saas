'use client';

import { useState } from 'react';
import { Copy, Wifi, Loader2, WifiOff } from 'lucide-react';
import toast from 'react-hot-toast';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useBranchIntegration, useGenerateSetupCode } from '@/hooks/useIntegration';

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

function adapterLabel(value: string) {
  return ADAPTERS.find((a) => a.value === value)?.label ?? value;
}

export default function EntegrasyonPage() {
  const query = useBranchIntegration();
  const generate = useGenerateSetupCode();
  const existing = query.data ?? null;

  const [adapterType, setAdapterType] = useState('');
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);

  const status = existing?.connectionStatus ?? null;
  const isConnected = status === 'CONNECTED';
  const isPendingInstall = status === 'PENDING_INSTALL';

  const handleGenerate = () => {
    if (!adapterType) {
      toast.error('Adaptör tipi seçin');
      return;
    }
    generate.mutate(
      { adapterType },
      { onSuccess: (data) => setGeneratedCode(data.token) },
    );
  };

  const copyCode = async () => {
    if (!generatedCode) return;
    try {
      await navigator.clipboard.writeText(generatedCode);
      toast.success('Kod kopyalandı');
    } catch {
      toast.error('Kopyalanamadı');
    }
  };

  return (
    <div className="mx-auto w-full max-w-xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Barkod Entegrasyonu</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Kasa / POS yazılımınızı bağlamak için bir kurulum kodu üretin ve
          StokPilot Agent üzerinden girin.
        </p>
      </div>

      {/* Mevcut durum */}
      {query.isPending ? (
        <Skeleton className="mb-6 h-20 w-full rounded-xl" />
      ) : existing ? (
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${
                    isConnected ? 'bg-green-100' : 'bg-yellow-100'
                  }`}
                >
                  {isConnected ? (
                    <Wifi className="h-4 w-4 text-green-700" />
                  ) : (
                    <Loader2 className="h-4 w-4 animate-spin text-yellow-700" />
                  )}
                </div>
                <div>
                  <p className="font-medium leading-tight">{adapterLabel(existing.adapterType)}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {isConnected
                      ? 'Agent bağlı'
                      : isPendingInstall
                        ? 'Agent bağlantısı bekleniyor…'
                        : (status ?? 'Durum bilinmiyor')}
                  </p>
                </div>
              </div>
              {isConnected ? (
                <Badge
                  variant="outline"
                  className="text-xs border-green-300 bg-green-50 text-green-700"
                >
                  Bağlandı
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="text-xs border-yellow-300 bg-yellow-50 text-yellow-700"
                >
                  Kurulum Bekleniyor
                </Badge>
              )}
            </div>

            {/* Bağlı Agent detayları */}
            {isConnected && (existing.agentVersion || existing.agentId) && (
              <div className="mt-3 border-t pt-3 text-xs text-muted-foreground">
                {existing.agentVersion && <span>Agent v{existing.agentVersion}</span>}
                {existing.agentVersion && existing.agentId && <span> · </span>}
                {existing.agentId && <span className="font-mono">{existing.agentId}</span>}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="mb-6">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
              <WifiOff className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">Henüz bir entegrasyon kurulmadı.</p>
          </CardContent>
        </Card>
      )}

      {/* Adaptör seçimi + kod üret */}
      <div className="space-y-5">
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

        <Button
          type="button"
          className="w-full"
          onClick={handleGenerate}
          disabled={generate.isPending}
        >
          {generate.isPending ? 'Oluşturuluyor…' : 'Kurulum Kodu Üret'}
        </Button>
      </div>

      {/* Üretilen kod */}
      {generatedCode && (
        <Card className="mt-6">
          <CardContent className="flex flex-col items-center gap-4 p-6 text-center">
            <div className="select-all rounded-xl border bg-muted/40 px-6 py-4 font-mono text-3xl font-bold tracking-[0.3em]">
              {generatedCode}
            </div>
            <Button variant="outline" className="gap-1.5" onClick={copyCode}>
              <Copy className="h-4 w-4" />
              Kopyala
            </Button>
            <p className="text-sm text-muted-foreground">
              Bu kodu StokPilot Agent kurulum ekranında kullanın.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
