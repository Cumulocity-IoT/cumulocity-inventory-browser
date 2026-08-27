import { describe, expect, it } from 'vitest';
import { extractReferenceNode, isReferenceNode } from './reference-link.util';

describe('extractReferenceNode', () => {
  it('recognizes a bare {self, id} node', () => {
    expect(extractReferenceNode({ self: 'https://x/1', id: '1', name: 'Foo' })).toEqual({
      id: '1',
      name: 'Foo',
      self: 'https://x/1',
    });
  });

  it('recognizes an IManagedObjectReference wrapping managedObject', () => {
    expect(
      extractReferenceNode({
        self: 'https://x/childAdditions/1',
        managedObject: { self: 'https://x/1', id: '1', name: 'Foo' },
      })
    ).toEqual({ id: '1', name: 'Foo', self: 'https://x/1' });
  });

  it('returns null for plain fragments without both self and id', () => {
    expect(extractReferenceNode({ lat: 1, lng: 2 })).toBeNull();
  });

  it('returns null for arrays and primitives', () => {
    expect(extractReferenceNode([1, 2, 3])).toBeNull();
    expect(extractReferenceNode('text')).toBeNull();
    expect(extractReferenceNode(null)).toBeNull();
  });
});

describe('isReferenceNode', () => {
  it('mirrors extractReferenceNode', () => {
    expect(isReferenceNode({ self: 'https://x/1', id: '1' })).toBe(true);
    expect(isReferenceNode({ foo: 'bar' })).toBe(false);
  });
});
