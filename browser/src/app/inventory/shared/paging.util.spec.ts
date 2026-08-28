import { describe, expect, it } from 'vitest';
import { hasNextPage } from './paging.util';

describe('hasNextPage', () => {
  it('is false for null/undefined', () => {
    expect(hasNextPage(null)).toBe(false);
    expect(hasNextPage(undefined)).toBe(false);
  });

  it('is false when paging is missing', () => {
    expect(hasNextPage({ data: [] } as any)).toBe(false);
  });

  it('is false when nextPage is not set, even if totalPages is unknown (no withTotalPages opt-in)', () => {
    expect(hasNextPage({ data: [], paging: { currentPage: 1 } } as any)).toBe(false);
  });

  it('is true when nextPage is present, regardless of totalPages', () => {
    expect(hasNextPage({ data: [], paging: { currentPage: 1, nextPage: 2 } } as any)).toBe(true);
  });
});
