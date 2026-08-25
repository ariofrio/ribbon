export interface CatalogEntry {
  name: string;
  category: string;
  tags: readonly string[];
}

function label(name: string): string {
  return name.replace(/-/g, " ");
}

/**
 * Ranks name matches above tag matches so searching "book" leads with the
 * book, not with everything a book is a synonym for.
 */
export function searchIcons<T extends CatalogEntry>(
  catalog: readonly T[],
  query: string,
  category: string | null,
): { results: T[]; total: number } {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const scoped =
    category === null
      ? catalog
      : catalog.filter((entry) => entry.category === category);

  if (terms.length === 0) {
    return { results: [...scoped], total: scoped.length };
  }

  const scored: Array<{ entry: T; score: number }> = [];
  for (const entry of scoped) {
    const name = label(entry.name);
    let score = 0;
    for (const term of terms) {
      if (name === term) score += 6;
      else if (name.startsWith(term)) score += 4;
      else if (name.includes(term)) score += 3;
      else if (entry.tags.some((tag) => tag.startsWith(term))) score += 2;
      else if (entry.tags.some((tag) => tag.includes(term))) score += 1;
      else {
        score = 0;
        break;
      }
    }
    if (score > 0) scored.push({ entry, score });
  }

  scored.sort(
    (left, right) =>
      right.score - left.score ||
      left.entry.name.length - right.entry.name.length ||
      left.entry.name.localeCompare(right.entry.name),
  );

  return {
    results: scored.map(({ entry }) => entry),
    total: scored.length,
  };
}

export function iconLabel(name: string): string {
  return label(name);
}

export function categoryLabel(category: string): string {
  return category.replace(/-/g, " ");
}
