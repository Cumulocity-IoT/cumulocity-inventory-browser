import { IResultList } from '@c8y/client';

/**
 * Whether an `IResultList` has another page to fetch via `.paging.next()`.
 *
 * Deliberately checks `paging.nextPage`, not `paging.currentPage < paging.totalPages` —
 * `totalPages`/`totalElements` are only populated when the request explicitly passes
 * `withTotalPages: true` (an opt-in, since it costs the server an extra count query), which none
 * of our list-type queries do. Without it `totalPages` is `undefined`, so a `currentPage <
 * totalPages` comparison is always `false` regardless of how many more results actually exist.
 * `nextPage` has no such opt-in — it's always present when there's another page — and is exactly
 * what Cumulocity's own Groups navigator checks for the same "is there more to load" decision
 * (`@c8y/ngx-components/assets-navigator`'s `AssetNode.addNodes`).
 */
export function hasNextPage(page: IResultList<unknown> | null | undefined): boolean {
  return page?.paging?.nextPage != null;
}
