'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export interface PageTab {
  href: string;
  label: string;
}

/**
 * Simple horizontal tab/link row for navigating between sibling PATRON pages
 * that used to live under the same sidebar group (e.g. Şubeler / Stok / Ürünler).
 * Needed because the desktop Sidebar was replaced by a bottom tab bar.
 */
export function PageTabs({ tabs }: { tabs: PageTab[] }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  return (
    <div className="mb-5 flex gap-1 border-b">
      {tabs.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
            isActive(href)
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}
