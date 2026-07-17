'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Truck,
  Scan,
  Users,
  Tag,
  Settings,
  LogOut,
  Menu,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

// ── Nav items ─────────────────────────────────────────────────────────────────

const mainTabs = [
  { href: '/mudur/dashboard',   label: 'Dashboard',   icon: LayoutDashboard },
  { href: '/mudur/stok',        label: 'Stok',        icon: Package },
  { href: '/mudur/siparisler',  label: 'Siparişler',  icon: ShoppingCart },
];

const moreItems = [
  { href: '/mudur/tedarikciler',      label: 'Tedarikçiler',      icon: Truck },
  { href: '/mudur/ocr',               label: 'Fatura Tarama',     icon: Scan },
  { href: '/mudur/personel',          label: 'Personel',          icon: Users },
  { href: '/mudur/fiyat-guncelleme',  label: 'Fiyat Güncelleme',  icon: Tag },
  { href: '/mudur/ayarlar',           label: 'Ayarlar',           icon: Settings },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function MudurSidebar() {
  const pathname = usePathname();
  const { logout, isLoggingOut } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');
  const moreActive = moreItems.some((item) => isActive(item.href));

  return (
    <>
      {/* Bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex min-h-16 border-t bg-white pb-[env(safe-area-inset-bottom)]">
        {mainTabs.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-1 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors',
                active ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className={cn(
            'flex flex-1 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors',
            moreActive ? 'text-primary' : 'text-muted-foreground',
          )}
        >
          <Menu className="h-5 w-5" />
          Daha Fazla
        </button>
      </nav>

      {/* "Daha Fazla" bottom sheet */}
      <DialogPrimitive.Root open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay
            className={cn(
              'fixed inset-0 z-50 bg-black/50',
              'data-[state=open]:animate-in data-[state=closed]:animate-out',
              'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            )}
          />
          <DialogPrimitive.Content
            className={cn(
              'fixed inset-x-0 bottom-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-2xl border bg-white px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] shadow-lg',
              'data-[state=open]:animate-in data-[state=closed]:animate-out',
              'data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
            )}
          >
            <DialogPrimitive.Title className="mb-3 text-sm font-semibold text-muted-foreground">
              Daha Fazla
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              Diğer menü öğeleri
            </DialogPrimitive.Description>

            <div className="grid grid-cols-3 gap-3 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
              {moreItems.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMoreOpen(false)}
                  className={cn(
                    'flex flex-col items-center gap-2 rounded-lg p-3 text-center text-xs font-medium transition-colors',
                    isActive(href) ? 'text-primary' : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {label}
                </Link>
              ))}
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  logout();
                }}
                disabled={isLoggingOut}
                className="flex flex-col items-center gap-2 rounded-lg p-3 text-center text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
              >
                <LogOut className="h-5 w-5" />
                Çıkış Yap
              </button>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
