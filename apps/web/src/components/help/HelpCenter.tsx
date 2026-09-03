'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, HelpCircle, MessageCircleQuestion, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { FAQ_ITEMS, type FaqItem } from '@/lib/help-content';
import { cn } from '@/lib/utils';

/**
 * isletme-app/* düzeninde HER ekranda erişilebilir sabit yardım butonu
 * (sağ alt köşe) + tıklanınca açılan arama + SSS modalı. layout.tsx'e TEK
 * satırla eklenir, kendi state'ini kendi yönetir.
 *
 * Faz B'de üzerinde tartışılıp vazgeçilen "geri bildirim butonu" fikriyle
 * KARIŞTIRILMAMALI — bu, var olan Ayarlar > Geri Bildirim sayfasını
 * TAMAMLAYAN ayrı bir özellik (SSS'te bulunamayan sorular için oraya
 * yönlendirir, kendisi bir geri bildirim formu DEĞİLDİR).
 */
export function HelpCenter() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Basit metin eşleştirmesi — fuzzy arama gerekmiyor (bkz. görev).
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr-TR');
    if (!q) return FAQ_ITEMS;
    return FAQ_ITEMS.filter(
      (item) =>
        item.question.toLocaleLowerCase('tr-TR').includes(q) ||
        item.answer.toLocaleLowerCase('tr-TR').includes(q) ||
        item.category.toLocaleLowerCase('tr-TR').includes(q),
    );
  }, [query]);

  // Kategoriye göre grupla — FAQ_ITEMS'teki sırayı korur.
  const grouped = useMemo(() => {
    const map = new Map<string, FaqItem[]>();
    for (const item of filtered) {
      const list = map.get(item.category) ?? [];
      list.push(item);
      map.set(item.category, list);
    }
    return Array.from(map.entries());
  }, [filtered]);

  function toggle(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      // Bir sonraki açılışta baştan başlasın — yarım kalmış arama/açık
      // maddeler bir sonraki ziyarette kafa karıştırmasın.
      setQuery('');
      setExpandedIds(new Set());
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Yardım"
        title="Yardım"
        className="fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95"
      >
        <HelpCircle className="h-6 w-6" />
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Yardım</DialogTitle>
          </DialogHeader>

          <div className="relative shrink-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ne yapmak istiyorsunuz?"
              aria-label="SSS içinde ara"
              autoFocus
              className="h-10 pl-9"
            />
          </div>

          <div className="-mx-1 flex-1 space-y-4 overflow-y-auto px-1">
            {grouped.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <MessageCircleQuestion className="h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  Aradığınızı bulamadınız mı? Bize bildirin, en kısa sürede yardımcı olalım.
                </p>
                <Link
                  href="/isletme-app/ayarlar/geri-bildirim"
                  onClick={() => handleOpenChange(false)}
                  className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
                >
                  Geri Bildirim Gönder
                </Link>
              </div>
            ) : (
              <>
                {grouped.map(([category, items]) => (
                  <div key={category}>
                    <p className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {category}
                    </p>
                    <div className="space-y-2">
                      {items.map((item) => {
                        const isOpen = expandedIds.has(item.id);
                        return (
                          <div key={item.id} className="overflow-hidden rounded-lg border bg-card">
                            <button
                              type="button"
                              onClick={() => toggle(item.id)}
                              aria-expanded={isOpen}
                              className="flex w-full items-center justify-between gap-3 p-3 text-left text-sm font-medium"
                            >
                              <span>{item.question}</span>
                              <ChevronDown
                                className={cn(
                                  'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                                  isOpen && 'rotate-180',
                                )}
                              />
                            </button>
                            {isOpen && (
                              <p className="border-t bg-muted/30 p-3 text-sm text-muted-foreground">
                                {item.answer}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                <p className="px-1 pb-1 pt-2 text-center text-xs text-muted-foreground">
                  Aradığınızı bulamadınız mı?{' '}
                  <Link
                    href="/isletme-app/ayarlar/geri-bildirim"
                    onClick={() => handleOpenChange(false)}
                    className="font-medium text-primary hover:underline"
                  >
                    Bize bildirin
                  </Link>
                  .
                </p>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
