/**
 * Bir miktarı koli + kalan adet olarak okunur biçimde döndürür.
 * - Tam bölünürse: "{fullCases} koli"
 * - Kalan varsa:   "{fullCases} koli + {remainder} adet"
 * - Tam koli yoksa (fullCases === 0): "{remainder} adet"
 * - unitsPerCase null/≤0 veya quantity geçerli/pozitif değilse: null
 *   (çağıran taraf "–" veya boş gösterebilir).
 */
export function formatCaseBreakdown(
  quantity: number,
  unitsPerCase: number | null | undefined,
): string | null {
  if (
    unitsPerCase == null ||
    unitsPerCase <= 0 ||
    !Number.isFinite(quantity) ||
    quantity <= 0
  ) {
    return null;
  }
  const fullCases = Math.floor(quantity / unitsPerCase);
  const remainder = quantity % unitsPerCase;
  if (remainder === 0) return `${fullCases} koli`;
  if (fullCases === 0) return `${remainder} adet`;
  return `${fullCases} koli + ${remainder} adet`;
}
