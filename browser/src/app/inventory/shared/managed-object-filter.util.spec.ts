import { describe, expect, it } from 'vitest';
import { filterDevicesAndGroups, isDeviceOrGroup } from './managed-object-filter.util';

function mo(overrides: Record<string, unknown> = {}) {
  return { id: '1', name: 'x', ...overrides } as any;
}

describe('isDeviceOrGroup', () => {
  it('is true for objects with c8y_IsDevice', () => {
    expect(isDeviceOrGroup(mo({ c8y_IsDevice: {} }))).toBe(true);
  });

  it('is true for objects with c8y_IsDeviceGroup', () => {
    expect(isDeviceOrGroup(mo({ c8y_IsDeviceGroup: {} }))).toBe(true);
  });

  it('is false for plain assets', () => {
    expect(isDeviceOrGroup(mo())).toBe(false);
  });
});

describe('filterDevicesAndGroups', () => {
  it('returns the list unchanged when disabled', () => {
    const list = [mo(), mo({ c8y_IsDevice: {} })];
    expect(filterDevicesAndGroups(list, false)).toBe(list);
  });

  it('keeps only devices and groups when enabled', () => {
    const device = mo({ id: 'd', c8y_IsDevice: {} });
    const group = mo({ id: 'g', c8y_IsDeviceGroup: {} });
    const plain = mo({ id: 'p' });
    expect(filterDevicesAndGroups([device, group, plain], true)).toEqual([device, group]);
  });
});
