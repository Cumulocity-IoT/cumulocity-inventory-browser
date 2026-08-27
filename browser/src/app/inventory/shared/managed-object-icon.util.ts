import { IManagedObject } from '@c8y/client';

/**
 * Icon to represent a Managed Object in the tree/search UI: group, device, or a generic fallback.
 * Groups and devices use the same legacy Cumulocity icon set (`c8y-group`/`c8y-group-open`,
 * `c8y-device`) the real Cumulocity Navigator renders its own Groups tree with — this tree is
 * mounted inside that same Navigator, so matching icon set/size gives visual parity for free
 * rather than looking like a foreign, smaller icon set stuck onto it.
 */
export function managedObjectIcon(managedObject: IManagedObject, expanded = false): string {
  if (managedObject['c8y_IsDeviceGroup']) {
    return expanded ? 'c8y-group-open' : 'c8y-group';
  }
  if (managedObject['c8y_IsDevice']) {
    return 'c8y-device';
  }
  return 'file';
}
