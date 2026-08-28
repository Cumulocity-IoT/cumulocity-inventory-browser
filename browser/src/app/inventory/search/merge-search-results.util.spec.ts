import { describe, expect, it } from 'vitest';
import { mergeSearchResults } from './merge-search-results.util';

function mo(id: string) {
  return { id, name: `Object ${id}` } as any;
}

describe('mergeSearchResults', () => {
  it('tags results by their source', () => {
    expect(mergeSearchResults([{ reason: 'name/id/type', items: [mo('1')] }])).toEqual([
      { id: '1', object: mo('1'), matchReasons: ['name/id/type'] },
    ]);
  });

  it('merges an object found by multiple sources into one row with all reasons, in source order', () => {
    const result = mergeSearchResults([
      { reason: 'name/id/type', items: [mo('1')] },
      { reason: 'fragment', items: [mo('1')] },
      { reason: 'external id', items: [mo('1')] },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].matchReasons).toEqual(['name/id/type', 'fragment', 'external id']);
  });

  it('keeps distinct objects as separate rows, in source-then-item order', () => {
    const result = mergeSearchResults([
      { reason: 'name/id/type', items: [mo('1'), mo('2')] },
      { reason: 'fragment', items: [mo('2'), mo('3')] },
    ]);
    expect(result.map((r) => r.object.id)).toEqual(['1', '2', '3']);
  });

  it('handles empty sources', () => {
    expect(mergeSearchResults([])).toEqual([]);
    expect(mergeSearchResults([{ reason: 'external id', items: [] }])).toEqual([]);
  });
});
