import * as fuzz from 'fuzzball';

export interface FuzzyCandidate {
  id: string;
  name: string;
}

export interface FuzzyMatchResult {
  id: string;
  name: string;
  score: number;
}

/**
 * Adaylar arasından en yüksek skorlu fuzzy eşleşmeyi döndürür.
 * token_sort_ratio: kelime sırasından bağımsız, yazım hatalarına dayanıklı,
 * 0-100 arası bir skor üretir. threshold (varsayılan 70) altındaki eşleşmeler
 * yok sayılır. Eşleşme yoksa null döner.
 */
export function findBestFuzzyMatch(
  query: string,
  candidates: FuzzyCandidate[],
  threshold = 70,
): FuzzyMatchResult | null {
  if (!query || candidates.length === 0) return null;

  let best: FuzzyMatchResult | null = null;
  for (const c of candidates) {
    const score = fuzz.token_sort_ratio(query.toLowerCase(), c.name.toLowerCase());
    if (score >= threshold && (!best || score > best.score)) {
      best = { id: c.id, name: c.name, score };
    }
  }
  return best;
}

/**
 * Bir arama sorgusuna en yakın birden fazla adayı, skora göre azalan sırada
 * döndürür (öneri listesi için). token_set_ratio kullanır — token_sort_ratio'nun
 * aksine, sorgu tam üründen daha az kelime içerdiğinde (örn. "Cola 1Litre" ->
 * "Coca-Cola 1 Litre") de yüksek skor üretir, çünkü ortak olmayan kelimeleri
 * cezalandırmak yerine kelime kümesi kesişimine bakar.
 */
export function findFuzzyMatches(
  query: string,
  candidates: FuzzyCandidate[],
  threshold = 70,
  limit = 10,
): FuzzyMatchResult[] {
  if (!query || candidates.length === 0) return [];

  const scored: FuzzyMatchResult[] = [];
  for (const c of candidates) {
    const score = fuzz.token_set_ratio(query.toLowerCase(), c.name.toLowerCase());
    if (score >= threshold) {
      scored.push({ id: c.id, name: c.name, score });
    }
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}
