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
