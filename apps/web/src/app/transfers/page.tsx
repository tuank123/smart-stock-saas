'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

import { PageLayout } from '@/components/layout/PageLayout';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge, TRANSFER_STATUS_LABELS } from '@/components/shared/StatusBadge';
import { api } from '@/lib/api';
import type { Branch, Transfer } from '@/lib/types';

function fetchBranches(): Promise<Branch[]> {
  return api.get<Branch[]>('/branches').then((r) => r.data);
}
function fetchTransfers(branchId: string): Promise<Transfer[]> {
  return api.get<Transfer[]>(`/transfers/${branchId}`).then((r) => r.data);
}

function fmt(d: string) {
  return new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function TableSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-11 w-full" />)}
    </div>
  );
}

// ── Action button per transfer status ─────────────────────────────────────────

interface ActionBtnProps {
  transfer: Transfer;
  branchId: string;
  onSuccess: () => void;
}

function ActionButtons({ transfer, branchId, onSuccess }: ActionBtnProps) {
  const qc = useQueryClient();

  const mutate = (path: string, label: string) =>
    useMutation({
      mutationFn: () => api.patch(`/transfers/${transfer.id}/${path}`).then((r) => r.data),
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ['transfers', branchId] });
        toast.success(`${label} işlemi başarılı`);
        onSuccess();
      },
      onError: () => toast.error(`${label} işlemi başarısız`),
    });

  const approveMut = mutate('approve', 'Onay');
  const rejectMut = mutate('reject', 'Red');
  const dispatchMut = mutate('dispatch', 'Yola çıktı');
  const receiveMut = mutate('receive', 'Teslim al');

  const { status } = transfer;
  if (status === 'REQUESTED') {
    return (
      <div className="flex gap-1">
        <Button size="sm" variant="outline" className="h-7 text-xs text-green-700 border-green-300 hover:bg-green-50"
          disabled={approveMut.isPending} onClick={() => approveMut.mutate()}>
          Onayla
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs text-red-700 border-red-300 hover:bg-red-50"
          disabled={rejectMut.isPending} onClick={() => rejectMut.mutate()}>
          Reddet
        </Button>
      </div>
    );
  }
  if (status === 'APPROVED') {
    return (
      <Button size="sm" variant="outline" className="h-7 text-xs"
        disabled={dispatchMut.isPending} onClick={() => dispatchMut.mutate()}>
        Yola Çıktı
      </Button>
    );
  }
  if (status === 'IN_TRANSIT') {
    return (
      <Button size="sm" variant="outline" className="h-7 text-xs text-green-700 border-green-300 hover:bg-green-50"
        disabled={receiveMut.isPending} onClick={() => receiveMut.mutate()}>
        Teslim Al
      </Button>
    );
  }
  return null;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TransfersPage() {
  const qc = useQueryClient();
  const [branchId, setBranchId] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const branchesQuery = useQuery<Branch[]>({ queryKey: ['branches'], queryFn: fetchBranches });
  const transfersQuery = useQuery<Transfer[]>({
    queryKey: ['transfers', branchId],
    queryFn: () => fetchTransfers(branchId),
    enabled: !!branchId,
    staleTime: 1000 * 30,
  });

  const transfers = transfersQuery.data ?? [];
  const filtered = useMemo(
    () => (statusFilter === 'ALL' ? transfers : transfers.filter((t: Transfer) => t.status === statusFilter)),
    [transfers, statusFilter],
  );

  const invalidate = () => qc.invalidateQueries({ queryKey: ['transfers', branchId] });

  return (
    <PageLayout title="Transferler">
      {/* Toolbar */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="w-52">
          {branchesQuery.isPending ? (
            <Skeleton className="h-9 w-full" />
          ) : (
            <Select value={branchId} onValueChange={(v) => { setBranchId(v); setStatusFilter('ALL'); }}>
              <SelectTrigger><SelectValue placeholder="Şube seçin…" /></SelectTrigger>
              <SelectContent>
                {(branchesQuery.data ?? []).map((b: Branch) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {branchId && (
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tüm Durumlar</SelectItem>
              {TRANSFER_STATUS_LABELS.map(({ value, label }) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {transfersQuery.isError && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive">Transferler yüklenemedi.</p>
        </div>
      )}

      {!branchId ? (
        <div className="rounded-xl border bg-card p-12 text-center text-sm text-muted-foreground">
          Transferleri görmek için bir şube seçin.
        </div>
      ) : transfersQuery.isPending ? (
        <TableSkeleton />
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          {statusFilter !== 'ALL' ? 'Bu durumda transfer bulunamadı.' : 'Bu şubede transfer yok.'}
        </div>
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ürün</TableHead>
                <TableHead>Güzergah</TableHead>
                <TableHead className="text-right">Miktar</TableHead>
                <TableHead>Tarih</TableHead>
                <TableHead className="text-center">Durum</TableHead>
                <TableHead className="text-right">Aksiyon</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((t: Transfer) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.product.name}
                    <span className="ml-1.5 text-xs text-muted-foreground font-mono">{t.product.sku}</span>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1.5 text-sm">
                      <span className="text-muted-foreground">{t.fromBranch.name}</span>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50" />
                      <span className="text-muted-foreground">{t.toBranch.name}</span>
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {Number(t.quantity).toLocaleString('tr-TR')} {t.product.unit}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{fmt(t.createdAt)}</TableCell>
                  <TableCell className="text-center">
                    <StatusBadge status={t.status} type="transfer" />
                  </TableCell>
                  <TableCell className="text-right">
                    <ActionButtons transfer={t} branchId={branchId} onSuccess={invalidate} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </PageLayout>
  );
}
