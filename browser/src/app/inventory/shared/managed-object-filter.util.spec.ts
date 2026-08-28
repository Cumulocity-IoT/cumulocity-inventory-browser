import { describe, expect, it } from 'vitest';
import { isDeviceOrGroup } from './managed-object-filter.util';

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
