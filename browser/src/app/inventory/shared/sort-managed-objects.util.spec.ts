import { describe, expect, it } from 'vitest';
import { sortByName } from './sort-managed-objects.util';

function mo(id: string, name?: string) {
  return { id, name } as any;
}

describe('sortByName', () => {
  it('sorts case-insensitively by name', () => {
    const result = sortByName([mo('1', 'zebra'), mo('2', 'Apple'), mo('3', 'mango')]);
    expect(result.map((m) => m.id)).toEqual(['2', '3', '1']);
  });

  it('falls back to id when name is missing', () => {
    const result = sortByName([mo('b'), mo('a')]);
    expect(result.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('does not mutate the input array', () => {
    const input = [mo('1', 'b'), mo('2', 'a')];
    const result = sortByName(input);
    expect(input.map((m) => m.id)).toEqual(['1', '2']);
    expect(result).not.toBe(input);
  });
});
