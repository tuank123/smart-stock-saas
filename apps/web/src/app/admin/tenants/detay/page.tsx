'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, ArrowLeft, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import {
  useAdminTenantDetail,
  useUpdateTenantStatus,
  type AdminTenantUser,
  type AdminTenantBranch,
} from '@/hooks/useAdmin';
import { StatusBadge, PlanBadge } from '@/components/admin/TenantBadges';

function fmtDateTime(dateStr: string | null) {
  if (!dateStr) return '—';
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(dateStr),
  );
}

const roleLabels: Record<string, string> = {
  PATRON: 'Patron',
  SUBE_MUDURU: 'Şube Müdürü',
  KASIYER: 'Kasiyer',
  DEPO: 'Depo',
  SUPER_ADMIN: 'Süper Admin',
};

// ── Inner content — needs useSearchParams so wrapped in Suspense ──────────────

function TenantDetailInner() {
  const searchParams = useSearchParams();
  const tenantId = searchParams.get('id') ?? '';
  const { data: tenant, isPending, isError } = useAdminTenantDetail(tenantId);
  const updateStatus = useUpdateTenantStatus();

  // Onay gerektiren hedef durum ('SUSPENDED' | 'DELETED') veya null.
  const [confirmTarget, setConfirmTarget] = useState<'SUSPENDED' | 'DELETED' | null>(null);

  function applyStatus(status: string) {
    updateStatus.mutate({ id: tenantId, status });
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <Button variant="ghost" size="sm" className="mb-4 gap-1.5" asChild>
        <Link href="/admin/tenants">
          <ArrowLeft className="h-4 w-4" />
          İşletmeler
        </Link>
      </Button>

      {isPending ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : isError || !tenant ? (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
          <p className="text-sm text-destructive">İşletme bulunamadı.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Firma bilgileri + durum */}
          <Card>
            <CardContent className="space-y-4 p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-semibold">{tenant.companyName}</h1>
                  <p className="mt-1 font-mono text-sm text-muted-foreground">
                    Vergi No: {tenant.taxNumber}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <PlanBadge planId={tenant.planId} />
                  <StatusBadge status={tenant.status} />
                </div>
              </div>

              {/* Durumu Değiştir */}
              <div className="border-t pt-4">
                <p className="mb-2 text-sm font-medium">Durumu Değiştir</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 border-green-300 text-green-700 hover:bg-green-50"
                    disabled={updateStatus.isPending || tenant.status === 'ACTIVE'}
                    onClick={() => applyStatus('ACTIVE')}
                  >
                    <Check className="h-3.5 w-3.5" />
                    Aktif Yap
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50"
                    disabled={updateStatus.isPending || tenant.status === 'SUSPENDED'}
                    onClick={() => setConfirmTarget('SUSPENDED')}
                  >
                    <X className="h-3.5 w-3.5" />
                    Askıya Al
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 border-red-300 text-red-700 hover:bg-red-50"
                    disabled={updateStatus.isPending || tenant.status === 'DELETED'}
                    onClick={() => setConfirmTarget('DELETED')}
                  >
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Sil
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Not: &quot;Aktif Yap&quot; işletmeyi aktifleştirir ama kullanıcıları otomatik
                  yeniden aktive etmez.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Kullanıcılar */}
          <div>
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
              Kullanıcılar ({tenant.users.length})
            </h2>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>E-posta</TableHead>
                    <TableHead>Ad</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Aktif</TableHead>
                    <TableHead>Son Giriş</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tenant.users.map((u: AdminTenantUser) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.email}</TableCell>
                      <TableCell>{u.fullName ?? '—'}</TableCell>
                      <TableCell>{u.role ? (roleLabels[u.role] ?? u.role) : '—'}</TableCell>
                      <TableCell>
                        {u.isActive ? (
                          <Badge className="border-green-200 bg-green-100 text-green-800 hover:bg-green-100">
                            Aktif
                          </Badge>
                        ) : (
                          <Badge className="border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-100">
                            Pasif
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {fmtDateTime(u.lastLoginAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Şubeler */}
          <div>
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
              Şubeler ({tenant.branches.length})
            </h2>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ad</TableHead>
                    <TableHead>Adres</TableHead>
                    <TableHead>Telefon</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tenant.branches.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="py-6 text-center text-sm text-muted-foreground">
                        Şube yok.
                      </TableCell>
                    </TableRow>
                  ) : (
                    tenant.branches.map((b: AdminTenantBranch) => (
                      <TableRow key={b.id}>
                        <TableCell className="font-medium">{b.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {b.address ?? '—'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {b.phone ?? '—'}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      )}

      {/* Askıya Al / Sil onay dialog'u */}
      <AlertDialog open={confirmTarget !== null} onOpenChange={(o) => !o && setConfirmTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmTarget === 'DELETED' ? 'İşletmeyi Sil' : 'İşletmeyi Askıya Al'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Bu işletmenin durumu{' '}
              <strong>{confirmTarget === 'DELETED' ? 'Silinmiş' : 'Askıda'}</strong> olarak
              güncellenecek ve bu işletmenin <strong>TÜM kullanıcıları pasif hale gelecek</strong>{' '}
              (giriş yapamayacaklar). Devam etmek istiyor musunuz?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updateStatus.isPending}>Vazgeç</AlertDialogCancel>
            <AlertDialogAction
              disabled={updateStatus.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirmTarget) applyStatus(confirmTarget);
                setConfirmTarget(null);
              }}
            >
              {updateStatus.isPending ? 'Uygulanıyor…' : 'Evet, Devam Et'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Page export — wrap in Suspense for useSearchParams ────────────────────────

export default function AdminTenantDetailPage() {
  return (
    <Suspense>
      <TenantDetailInner />
    </Suspense>
  );
}
