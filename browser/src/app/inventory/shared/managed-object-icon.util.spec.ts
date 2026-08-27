import { describe, expect, it } from 'vitest';
import { managedObjectIcon } from './managed-object-icon.util';

describe('managedObjectIcon', () => {
  it('returns "c8y-group" for a collapsed device group', () => {
    expect(managedObjectIcon({ c8y_IsDeviceGroup: {} } as any)).toBe('c8y-group');
  });

  it('returns "c8y-group-open" for an expanded device group', () => {
    expect(managedObjectIcon({ c8y_IsDeviceGroup: {} } as any, true)).toBe('c8y-group-open');
  });

  it('returns "c8y-device" for a device, regardless of expanded', () => {
    expect(managedObjectIcon({ c8y_IsDevice: {} } as any)).toBe('c8y-device');
    expect(managedObjectIcon({ c8y_IsDevice: {} } as any, true)).toBe('c8y-device');
  });

  it('falls back to "file" for a plain asset', () => {
    expect(managedObjectIcon({} as any)).toBe('file');
  });
});
