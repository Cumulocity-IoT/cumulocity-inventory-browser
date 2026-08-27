import { describe, expect, it } from 'vitest';
import { mergeSearchResults } from './merge-search-results.util';

function mo(id: string) {
  return { id, name: `Object ${id}` } as any;
}

describe('mergeSearchResults', () => {
  it('tags name/id/type-only results', () => {
    expect(mergeSearchResults([mo('1')], [])).toEqual([{ object: mo('1'), matchReasons: ['name/id/type'] }]);
  });

  it('tags fragment-only results', () => {
    expect(mergeSearchResults([], [mo('1')])).toEqual([{ object: mo('1'), matchReasons: ['fragment'] }]);
  });

  it('merges an object found by both searches into one row with both reasons', () => {
    const result = mergeSearchResults([mo('1')], [mo('1')]);
    expect(result).toHaveLength(1);
    expect(result[0].matchReasons).toEqual(['name/id/type', 'fragment']);
  });

  it('keeps distinct objects as separate rows, in name-results-first then fragment-only order', () => {
    const result = mergeSearchResults([mo('1'), mo('2')], [mo('2'), mo('3')]);
    expect(result.map((r) => r.object.id)).toEqual(['1', '2', '3']);
  });
});
