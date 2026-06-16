import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// ── Order statuses ────────────────────────────────────────────────────────────

const ORDER_STATUS: Record<string, { label: string; className: string }> = {
  DRAFT:     { label: 'Taslak',    className: 'bg-slate-100 text-slate-600 border-slate-200' },
  APPROVED:  { label: 'Onaylandı', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  SENT:      { label: 'Gönderildi', className: 'bg-amber-100 text-amber-700 border-amber-200' },
  PARTIAL:   { label: 'Kısmi',     className: 'bg-orange-100 text-orange-700 border-orange-200' },
  RECEIVED:  { label: 'Teslim Alındı', className: 'bg-green-100 text-green-700 border-green-200' },
  CANCELLED: { label: 'İptal',     className: 'bg-red-100 text-red-700 border-red-200' },
};

// ── Transfer statuses ─────────────────────────────────────────────────────────

const TRANSFER_STATUS: Record<string, { label: string; className: string }> = {
  REQUESTED:  { label: 'Talep Edildi', className: 'bg-slate-100 text-slate-600 border-slate-200' },
  APPROVED:   { label: 'Onaylandı',   className: 'bg-blue-100 text-blue-700 border-blue-200' },
  IN_TRANSIT: { label: 'Yolda',       className: 'bg-amber-100 text-amber-700 border-amber-200' },
  DELIVERED:  { label: 'Teslim Edildi', className: 'bg-green-100 text-green-700 border-green-200' },
  REJECTED:   { label: 'Reddedildi', className: 'bg-red-100 text-red-700 border-red-200' },
};

interface StatusBadgeProps {
  status: string;
  type: 'order' | 'transfer';
  className?: string;
}

export function StatusBadge({ status, type, className }: StatusBadgeProps) {
  const map = type === 'order' ? ORDER_STATUS : TRANSFER_STATUS;
  const cfg = map[status] ?? { label: status, className: 'bg-muted text-muted-foreground' };
  return (
    <Badge variant="outline" className={cn('text-xs font-medium', cfg.className, className)}>
      {cfg.label}
    </Badge>
  );
}

export const ORDER_STATUS_LABELS = Object.entries(ORDER_STATUS).map(([value, { label }]) => ({
  value,
  label,
}));

export const TRANSFER_STATUS_LABELS = Object.entries(TRANSFER_STATUS).map(([value, { label }]) => ({
  value,
  label,
}));
