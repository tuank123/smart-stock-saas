'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { Plus, Phone, CheckCircle2, XCircle, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';

import { PageLayout } from '@/components/layout/PageLayout';
import { PageTabs } from '@/components/layout/PageTabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { api } from '@/lib/api';
import type { PaginatedResponse, Supplier } from '@/lib/types';

const PAGE_SIZE = 50;

function fetchSuppliers(page: number): Promise<PaginatedResponse<Supplier>> {
  return api
    .get<PaginatedResponse<Supplier>>('/suppliers', { params: { page, pageSize: PAGE_SIZE } })
    .then((r) => r.data);
}

// ── Create supplier modal ─────────────────────────────────────────────────────

interface CreateSupplierModalProps { open: boolean; onClose: () => void; }

function CreateSupplierModal({ open, onClose }: CreateSupplierModalProps) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', contactName: '', whatsappNumber: '', notes: '' });

  useEffect(() => {
    if (!open) setForm({ name: '', contactName: '', whatsappNumber: '', notes: '' });
  }, [open]);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const mutation = useMutation({
    mutationFn: (data: typeof form) => api.post('/suppliers', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      toast.success('Tedarikçi oluşturuldu');
      onClose();
    },
    onError: () => toast.error('Tedarikçi oluşturulamadı'),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Yeni Tedarikçi</DialogTitle>
          <DialogDescription>Tedarikçi bilgilerini girin.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(form); }} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="s-name">Ad *</Label>
            <Input id="s-name" required value={form.name} onChange={set('name')} placeholder="Acme Tedarik A.Ş." />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-contact">Yetkili Kişi</Label>
            <Input id="s-contact" value={form.contactName} onChange={set('contactName')} placeholder="Ahmet Yılmaz" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-wa">WhatsApp Numarası *</Label>
            <Input id="s-wa" required value={form.whatsappNumber} onChange={set('whatsappNumber')} placeholder="+905551234567" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-notes">Notlar</Label>
            <Input id="s-notes" value={form.notes} onChange={set('notes')} placeholder="Opsiyonel notlar…" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>İptal</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Oluşturuluyor…' : 'Oluştur'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SuppliersPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [page, setPage] = useState(1);

  const suppliersQuery: UseQueryResult<PaginatedResponse<Supplier>> = useQuery<PaginatedResponse<Supplier>>({
    queryKey: ['suppliers', page],
    queryFn: () => fetchSuppliers(page),
    staleTime: 1000 * 60,
  });

  const suppliers = suppliersQuery.data?.items ?? [];
  const total = suppliersQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <PageLayout title="Tedarikçiler">
      <PageTabs
        tabs={[
          { href: '/orders', label: 'Siparişler' },
          { href: '/transfers', label: 'Transferler' },
          { href: '/suppliers', label: 'Tedarikçiler' },
        ]}
      />
      <div className="mb-5 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {suppliersQuery.isSuccess ? `Toplam ${total} tedarikçi` : ' '}
        </p>
        <Button size="sm" onClick={() => setModalOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Yeni Tedarikçi
        </Button>
      </div>

      {suppliersQuery.isError && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive">Tedarikçiler yüklenemedi.</p>
        </div>
      )}

      {suppliersQuery.isPending ? (
        <div className="rounded-xl border bg-card p-4 space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-11 w-full" />)}
        </div>
      ) : suppliers.length === 0 ? (
        <div className="rounded-xl border bg-card p-12 text-center">
          <p className="text-sm text-muted-foreground">Henüz tedarikçi eklenmemiş.</p>
          <Button className="mt-4" size="sm" onClick={() => setModalOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            İlk Tedarikçiyi Ekle
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ad</TableHead>
                <TableHead>Yetkili</TableHead>
                <TableHead>WhatsApp</TableHead>
                <TableHead className="text-center">OTP Doğrulama</TableHead>
                <TableHead>Bağlı Şubeler</TableHead>
                <TableHead className="text-center">Durum</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.map((s: Supplier) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="text-muted-foreground">{s.contactName ?? '—'}</TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Phone className="h-3.5 w-3.5" />
                      {s.whatsappNumber}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    {s.otpVerified ? (
                      <CheckCircle2 className="mx-auto h-4 w-4 text-green-600" />
                    ) : (
                      <XCircle className="mx-auto h-4 w-4 text-muted-foreground/50" />
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {s.branchSuppliers.length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        s.branchSuppliers.map((bs) => (
                          <Badge key={bs.id} variant={bs.isPrimary ? 'default' : 'outline'} className="text-xs">
                            {bs.branch.name}
                            {bs.isPrimary && <span className="ml-1 opacity-70">(Birincil)</span>}
                          </Badge>
                        ))
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={s.isActive ? 'secondary' : 'outline'} className="text-xs">
                      {s.isActive ? 'Aktif' : 'Pasif'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Sayfalama — admin/errors ile aynı desen */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t p-3">
              <p className="text-sm text-muted-foreground">
                Sayfa {page}/{totalPages}
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
          )}
        </div>
      )}

      <CreateSupplierModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </PageLayout>
  );
}
