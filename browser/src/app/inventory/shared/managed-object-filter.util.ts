import { IManagedObject } from '@c8y/client';

export function isDeviceOrGroup(managedObject: IManagedObject): boolean {
  return Boolean(managedObject['c8y_IsDevice']) || Boolean(managedObject['c8y_IsDeviceGroup']);
}

export function filterDevicesAndGroups(managedObjects: IManagedObject[], enabled: boolean): IManagedObject[] {
  return enabled ? managedObjects.filter(isDeviceOrGroup) : managedObjects;
}
