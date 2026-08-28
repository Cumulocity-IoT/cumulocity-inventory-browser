import { IManagedObject } from '@c8y/client';

export type MatchReason = 'name/id/type' | 'fragment' | 'external id';

export interface SearchResultRow {
  /** Mirrors `object.id` — required by DataGridComponent's `Row` type. */
  id: string;
  object: IManagedObject;
  matchReasons: MatchReason[];
}

export interface MatchSource {
  reason: MatchReason;
  items: IManagedObject[];
}

/**
 * Combines the results of several independent searches (name/id/type, "has fragment", external
 * ID) into one deduplicated list — each remains its own query (see InventoryNavigationService's
 * search/searchByFragment/findByExternalId), but showing them as separate, visually-identical
 * result boxes made it unclear why a result landed in one or another. Each row keeps track of
 * which search(es) it matched, in the order the sources were given.
 */
export function mergeSearchResults(sources: MatchSource[]): SearchResultRow[] {
  const rows = new Map<string, SearchResultRow>();

  for (const { reason, items } of sources) {
    for (const object of items) {
      const existing = rows.get(object.id);
      if (existing) {
        existing.matchReasons.push(reason);
      } else {
        rows.set(object.id, { id: object.id, object, matchReasons: [reason] });
      }
    }
  }

  return [...rows.values()];
}
