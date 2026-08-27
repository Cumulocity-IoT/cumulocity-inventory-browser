import { describe, expect, it } from 'vitest';
import { serializeWithLinks } from './json-serializer.util';

describe('serializeWithLinks', () => {
  it('matches JSON.stringify(value, null, 2) byte for byte', () => {
    const value = {
      id: '1',
      self: 'https://x/1',
      name: 'Foo',
      childDevices: {
        references: [{ self: 'https://x/childDevices/2', managedObject: { self: 'https://x/2', id: '2', name: 'Bar' } }],
      },
      c8y_Position: { lat: 1, lng: 2 },
    };
    expect(serializeWithLinks(value).text).toBe(JSON.stringify(value, null, 2));
  });

  it('does not treat the root value as a reference even though it has self+id', () => {
    const value = { id: 'root', self: 'https://x/root' };
    expect(serializeWithLinks(value).links).toEqual([]);
  });

  it('records a link range for nested reference nodes, and the range slices back to that node', () => {
    const value = {
      childDevices: {
        references: [{ self: 'https://x/childDevices/2', managedObject: { self: 'https://x/2', id: '2', name: 'Bar' } }],
      },
    };
    const { text, links } = serializeWithLinks(value);
    expect(links).toHaveLength(1);
    expect(links[0].node).toEqual({ id: '2', name: 'Bar', self: 'https://x/2' });
    expect(JSON.parse(text.slice(links[0].start, links[0].end))).toEqual(value.childDevices.references[0]);
  });

  it('links references[] array items into a shared sibling array for Prev/Next', () => {
    const value = {
      childAdditions: {
        references: [
          { self: 'https://x/childAdditions/1', managedObject: { self: 'https://x/1', id: '1', name: 'TBA' } },
          { self: 'https://x/childAdditions/2', managedObject: { self: 'https://x/2', id: '2', name: 'KPI Widget' } },
        ],
      },
    };
    const { links } = serializeWithLinks(value);
    expect(links).toHaveLength(2);

    expect(links[0].siblingIndex).toBe(0);
    expect(links[1].siblingIndex).toBe(1);
    expect(links[0].siblingArray).toBe(links[1].siblingArray);
    expect(links[0].siblingArray).toEqual([
      { id: '1', name: 'TBA', self: 'https://x/1' },
      { id: '2', name: 'KPI Widget', self: 'https://x/2' },
    ]);
  });

  it('does not attach a sibling array to a reference that is not inside an array', () => {
    const value = { managedObject: { self: 'https://x/1', id: '1', name: 'Foo' } };
    const { links } = serializeWithLinks(value);
    expect(links).toHaveLength(1);
    expect(links[0].siblingArray).toBeUndefined();
    expect(links[0].siblingIndex).toBeUndefined();
  });
});
