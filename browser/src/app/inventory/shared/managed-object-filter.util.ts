import { IManagedObject } from '@c8y/client';

export function isDeviceOrGroup(managedObject: IManagedObject): boolean {
  return Boolean(managedObject['c8y_IsDevice']) || Boolean(managedObject['c8y_IsDeviceGroup']);
}
