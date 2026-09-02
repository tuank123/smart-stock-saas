'use client';

import { useMemo, useState } from 'react';
import { AlertOctagon, AlertTriangle, CheckCircle, ChevronLeft, ChevronRight, Info, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useAdminErrors,
  useResolveError,
  type AdminErrorLog,
} from '@/hooks/useAdmin';

const ALL = '__ALL__';

const SOURCE_LABELS: Record<string, string> = {
  API_EXCEPTION: 'API Hatası',
  SYNC_JOB: 'Senkronizasyon',
  OCR_SCAN: 'OCR',
  WHATSAPP_WEBHOOK: 'WhatsApp',
  SECURITY_EVENT: 'Güvenlik Olayı',
  DATA_INTEGRITY: 'Veri Tutarlılığı',
  SCHEDULED_JOB: 'Zamanlanmış İş',
};

// "5 dakika önce" tarzı göreli zaman.
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'az önce';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} dakika önce`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} saat önce`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} gün önce`;
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium' }).format(new Date(dateStr));
}

// SECURITY_EVENT kayıtları diğer hata kaynaklarından görsel olarak ayırt
// edilsin diye (mor/indigo + kalkan ikonu) — API_EXCEPTION/SYNC_JOB/OCR_SCAN/
// WHATSAPP_WEBHOOK hepsi nötr gri kalır.
function SourceBadge({ source }: { source: string }) {
  const label = SOURCE_LABELS[source] ?? source;
  if (source === 'SECURITY_EVENT') {
    return (
      <Badge className="gap-1 border-indigo-200 bg-indigo-100 text-indigo-800 hover:bg-indigo-100">
        <ShieldAlert className="h-3 w-3" />
        {label}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-slate-200 bg-slate-100 text-slate-700">
      {label}
    </Badge>
  );
}

// Kategoriden (SourceBadge — "ne") bağımsız, önem derecesini ("ne kadar ciddi")
// gösteren ayrı bir rozet. CRITICAL, ERROR'dan da (dolu/koyu kırmızı + ikon)
// belirgin şekilde ayrışır — sessizce ERROR ile aynı görünüp gözden kaçmasın.
function SeverityBadge({ severity }: { severity: string }) {
  switch (severity) {
    case 'CRITICAL':
      return (
        <Badge className="gap-1 border-red-700 bg-red-600 text-white hover:bg-red-600">
          <AlertOctagon className="h-3 w-3" />
          KRİTİK
        </Badge>
      );
    case 'ERROR':
      return (
        <Badge className="border-red-200 bg-red-100 text-red-800 hover:bg-red-100">HATA</Badge>
      );
    case 'WARNING':
      return (
        <Badge className="border-amber-200 bg-amber-100 text-amber-800 hover:bg-amber-100">
          UYARI
        </Badge>
      );
    case 'INFO':
      return (
        <Badge className="gap-1 border-green-200 bg-green-100 text-green-800 hover:bg-green-100">
          <Info className="h-3 w-3" />
          BİLGİ
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="border-slate-200 bg-slate-100 text-slate-700">
          {severity}
        </Badge>
      );
  }
}

export default function AdminErrorsPage() {
  const [source, setSource] = useState<string>(ALL);
  const [severity, setSeverity] = useState<string>(ALL);
  const [resolved, setResolved] = useState<string>(ALL); // ALL | 'false' | 'true'
  const [page, setPage] = useState(1);
  const resolveError = useResolveError();

  const params = useMemo(
    () => ({
      source: source === ALL ? undefined : source,
      severity: severity === ALL ? undefined : severity,
      resolved: resolved === ALL ? undefined : resolved,
      page,
    }),
    [source, severity, resolved, page],
  );

  const { data, isPending, isError } = useAdminErrors(params);

  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? 20;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function resetAndSet(fn: () => void) {
    fn();
    setPage(1);
  }

  const emptyText =
    resolved === 'false'
      ? 'Çözülmemiş hata yok.'
      : resolved === 'true'
        ? 'Çözülmüş hata yok.'
        : 'Hiç hata kaydı yok.';

  return (
    <div className="mx-auto w-full max-w-4xl">
      <h1 className="mb-6 text-2xl font-semibold">Hatalar &amp; Uyarılar</h1>

      {/* Filtreler */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select value={source} onValueChange={(v) => resetAndSet(() => setSource(v))}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Kaynak" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tüm Kaynaklar</SelectItem>
            <SelectItem value="API_EXCEPTION">API Hatası</SelectItem>
            <SelectItem value="SYNC_JOB">Senkronizasyon</SelectItem>
            <SelectItem value="OCR_SCAN">OCR</SelectItem>
            <SelectItem value="WHATSAPP_WEBHOOK">WhatsApp</SelectItem>
            <SelectItem value="SECURITY_EVENT">Güvenlik Olayı</SelectItem>
            <SelectItem value="DATA_INTEGRITY">Veri Tutarlılığı</SelectItem>
            <SelectItem value="SCHEDULED_JOB">Zamanlanmış İş</SelectItem>
          </SelectContent>
        </Select>
        <Select value={severity} onValueChange={(v) => resetAndSet(() => setSeverity(v))}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Önem" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tüm Önemler</SelectItem>
            <SelectItem value="CRITICAL">Kritik</SelectItem>
            <SelectItem value="ERROR">Hata</SelectItem>
            <SelectItem value="WARNING">Uyarı</SelectItem>
          </SelectContent>
        </Select>
        <Select value={resolved} onValueChange={(v) => resetAndSet(() => setResolved(v))}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Durum" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tüm Durumlar</SelectItem>
            <SelectItem value="false">Çözülmemiş</SelectItem>
            <SelectItem value="true">Çözülmüş</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>
      ) : isError || !data ? (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
          <p className="text-sm text-destructive">Hata kayıtları yüklenemedi.</p>
        </div>
      ) : data.items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card py-12 text-center">
          <CheckCircle className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {data.items.map((err: AdminErrorLog) => (
              <Card key={err.id} className={err.resolved ? 'opacity-60' : undefined}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <SourceBadge source={err.source} />
                    <SeverityBadge severity={err.severity} />
                    {err.resolved && (
                      <Badge className="border-green-200 bg-green-100 text-green-800 hover:bg-green-100">
                        Çözüldü
                      </Badge>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {timeAgo(err.createdAt)}
                    </span>
                  </div>

                  <p className="break-words text-sm font-medium">{err.message}</p>

                  {err.context != null && (
                    <p className="break-words font-mono text-xs text-muted-foreground">
                      {JSON.stringify(err.context)}
                    </p>
                  )}

                  {!err.resolved && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-1 gap-1.5 border-green-300 text-green-700 hover:bg-green-50"
                      disabled={resolveError.isPending}
                      onClick={() => resolveError.mutate(err.id)}
                    >
                      <CheckCircle className="h-3.5 w-3.5" />
                      Çözüldü Olarak İşaretle
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Sayfalama */}
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Toplam {total} kayıt · Sayfa {page}/{totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
                Önceki
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Sonraki
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
