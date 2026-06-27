'use client';

import { useState } from 'react';
import { CheckCircle, Pencil, Users } from 'lucide-react';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useAssignRole,
  useApproveRegistration,
  useBranchUsers,
  usePendingRegistrations,
} from '@/hooks/useMudur';
import type { BranchUser, PendingRegistration, UserRole } from '@/lib/types';

// ── Badges ────────────────────────────────────────────────────────────────────

const ROLE_CONFIG: Record<string, { label: string; className: string }> = {
  SUBE_MUDURU: { label: 'Şube Müdürü', className: 'border-blue-200 bg-blue-100 text-blue-700' },
  KASIYER: { label: 'Şube Görevlisi', className: 'border-green-200 bg-green-100 text-green-700' },
  DEPO: { label: 'Depo Görevlisi', className: 'border-orange-200 bg-orange-100 text-orange-700' },
};

function RoleBadge({ role }: { role: UserRole }) {
  const cfg = ROLE_CONFIG[role];
  if (!cfg) return null;
  return (
    <Badge variant="outline" className={`text-xs ${cfg.className}`}>
      {cfg.label}
    </Badge>
  );
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <Badge variant="outline" className="border-green-200 bg-green-100 text-xs text-green-700">
      Aktif
    </Badge>
  ) : (
    <Badge variant="outline" className="border-red-200 bg-red-100 text-xs text-red-700">
      Pasif
    </Badge>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(dateStr: string) {
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium' }).format(new Date(dateStr));
}

// ── Skeletons ─────────────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}

function RequestCardSkeleton() {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-3 w-28" />
        </div>
        <Skeleton className="h-8 w-20 shrink-0" />
      </CardContent>
    </Card>
  );
}

// ── Role edit row ─────────────────────────────────────────────────────────────

function RoleEditCell({ user }: { user: BranchUser }) {
  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState<'KASIYER' | 'DEPO'>(
    user.role === 'DEPO' ? 'DEPO' : 'KASIYER',
  );
  const assignRole = useAssignRole();

  if (user.role !== 'KASIYER' && user.role !== 'DEPO') return null;

  if (!editing) {
    return (
      <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={() => setEditing(true)}>
        <Pencil className="h-3.5 w-3.5" />
        Rol Değiştir
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={role} onValueChange={(v) => setRole(v as 'KASIYER' | 'DEPO')}>
        <SelectTrigger className="h-8 w-36 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="KASIYER">Şube Görevlisi</SelectItem>
          <SelectItem value="DEPO">Depo Görevlisi</SelectItem>
        </SelectContent>
      </Select>
      <Button
        size="sm"
        className="h-8 gap-1.5 text-xs"
        disabled={assignRole.isPending}
        onClick={() =>
          assignRole.mutate(
            { userId: user.id, role },
            { onSuccess: () => setEditing(false) },
          )
        }
      >
        Kaydet
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 text-xs"
        disabled={assignRole.isPending}
        onClick={() => setEditing(false)}
      >
        Vazgeç
      </Button>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MudurPersonelPage() {
  const [tab, setTab] = useState<'staff' | 'requests'>('staff');

  const { data: users, isPending: usersLoading, isError: usersError } = useBranchUsers();
  const assignedUsers: Array<BranchUser & { role: UserRole }> = (users ?? []).filter(
    (u: BranchUser): u is BranchUser & { role: UserRole } =>
      u.role === 'SUBE_MUDURU' || u.role === 'KASIYER' || u.role === 'DEPO',
  );
  const {
    data: registrations,
    isPending: registrationsLoading,
    isError: registrationsError,
  } = usePendingRegistrations();
  const approveMutation = useApproveRegistration();

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">Personel</h1>

      {/* Tab bar */}
      <div className="mb-6 flex w-fit gap-1 rounded-lg border border-input bg-muted/30 p-1">
        <button
          type="button"
          onClick={() => setTab('staff')}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            tab === 'staff'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Personel Listesi
        </button>
        <button
          type="button"
          onClick={() => setTab('requests')}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            tab === 'requests'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Kayıt Talepleri
          {(registrations?.length ?? 0) > 0 && (
            <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-700">
              {registrations!.length}
            </span>
          )}
        </button>
      </div>

      {/* ── Personel Listesi ── */}
      {tab === 'staff' && (
        <div>
          {usersError && (
            <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              Personel listesi yüklenirken hata oluştu.
            </div>
          )}

          {usersLoading ? (
            <TableSkeleton />
          ) : assignedUsers.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card py-12 text-center">
              <Users className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Henüz personel bulunmuyor.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>E-posta</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Durum</TableHead>
                    <TableHead>Katılım Tarihi</TableHead>
                    <TableHead className="w-44" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignedUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        {user.fullName ? (
                          <div>
                            <p className="font-medium">{user.fullName}</p>
                            <p className="text-xs text-muted-foreground">{user.email}</p>
                          </div>
                        ) : (
                          <p className="font-medium">{user.email}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <RoleBadge role={user.role} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge isActive={user.isActive} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">{fmt(user.createdAt)}</TableCell>
                      <TableCell>
                        <RoleEditCell user={user} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      {/* ── Kayıt Talepleri ── */}
      {tab === 'requests' && (
        <div>
          {registrationsError && (
            <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              Kayıt talepleri yüklenirken hata oluştu.
            </div>
          )}

          {registrationsLoading ? (
            <div className="space-y-3">
              <RequestCardSkeleton />
              <RequestCardSkeleton />
            </div>
          ) : (registrations?.length ?? 0) === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card py-12 text-center">
              <CheckCircle className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Bekleyen kayıt talebi yok.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(registrations ?? []).map((reg: PendingRegistration) => (
                <Card key={reg.id}>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="space-y-1">
                      <p className="font-semibold">{reg.applicantEmail}</p>
                      <p className="text-xs text-muted-foreground">
                        {reg.applicantName} — {fmt(reg.createdAt)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      className="gap-1.5"
                      disabled={approveMutation.isPending}
                      onClick={() => approveMutation.mutate(reg.id)}
                    >
                      <CheckCircle className="h-3.5 w-3.5" />
                      Onayla
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
