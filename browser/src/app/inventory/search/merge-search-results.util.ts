import { IManagedObject } from '@c8y/client';

export type MatchReason = 'name/id/type' | 'fragment';

export interface SearchResultRow {
  object: IManagedObject;
  matchReasons: MatchReason[];
}

/**
 * Combines the name/id/type search and the "has fragment" search into one deduplicated list —
 * the two remain independent queries (see InventoryNavigationService.search/searchByFragment),
 * but showing them as two separate, visually-identical result boxes made it unclear why a result
 * landed in one or the other. Each row keeps track of which search(es) it matched.
 */
export function mergeSearchResults(nameResults: IManagedObject[], fragmentResults: IManagedObject[]): SearchResultRow[] {
  const rows = new Map<string, SearchResultRow>();

  for (const object of nameResults) {
    rows.set(object.id, { object, matchReasons: ['name/id/type'] });
  }
  for (const object of fragmentResults) {
    const existing = rows.get(object.id);
    if (existing) {
      existing.matchReasons.push('fragment');
    } else {
      rows.set(object.id, { object, matchReasons: ['fragment'] });
    }
  }

  return [...rows.values()];
}
