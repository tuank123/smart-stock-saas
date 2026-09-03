'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle, ChevronLeft, ChevronRight, Mail, MailOpen } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useAdminFeedback,
  useMarkFeedbackRead,
  type AdminFeedbackItem,
} from '@/hooks/useAdmin';

// "5 dakika önce" tarzı göreli zaman — admin/errors/page.tsx'teki timeAgo ile
// aynı mantık, ama bileşenler paylaşılmıyor (bilerek — ayrı veri modelleri).
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

function StatusBadge({ status }: { status: string }) {
  if (status === 'NEW') {
    return (
      <Badge className="gap-1 border-blue-200 bg-blue-100 text-blue-800 hover:bg-blue-100">
        <Mail className="h-3 w-3" />
        YENİ
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 border-slate-200 bg-slate-100 text-slate-600">
      <MailOpen className="h-3 w-3" />
      OKUNDU
    </Badge>
  );
}

export default function AdminFeedbackPage() {
  const [page, setPage] = useState(1);
  const markRead = useMarkFeedbackRead();

  const { data, isPending, isError } = useAdminFeedback({ page });

  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? 20;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="mx-auto w-full max-w-4xl">
      <h1 className="mb-6 text-2xl font-semibold">Geri Bildirimler</h1>

      {isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>
      ) : isError || !data ? (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
          <p className="text-sm text-destructive">Geri bildirimler yüklenemedi.</p>
        </div>
      ) : data.items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card py-12 text-center">
          <CheckCircle className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Hiç geri bildirim yok.</p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {data.items.map((fb: AdminFeedbackItem) => (
              <Card key={fb.id} className={fb.status === 'READ' ? 'opacity-60' : undefined}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={fb.status} />
                    <span className="text-xs text-muted-foreground">
                      {fb.tenant.companyName} · {fb.user.fullName ?? fb.user.email}
                    </span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {timeAgo(fb.createdAt)}
                    </span>
                  </div>

                  <p className="break-words text-sm font-medium">{fb.subject}</p>
                  <p className="break-words text-sm text-muted-foreground">{fb.message}</p>

                  {fb.status === 'NEW' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-1 gap-1.5 border-green-300 text-green-700 hover:bg-green-50"
                      disabled={markRead.isPending}
                      onClick={() => markRead.mutate(fb.id)}
                    >
                      <CheckCircle className="h-3.5 w-3.5" />
                      Okundu Olarak İşaretle
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
