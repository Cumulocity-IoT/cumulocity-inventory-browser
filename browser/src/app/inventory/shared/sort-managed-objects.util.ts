import { IManagedObject } from '@c8y/client';

/** Alphabetical (case-insensitive) by name, falling back to id when a name is missing. */
export function sortByName(managedObjects: IManagedObject[]): IManagedObject[] {
  return [...managedObjects].sort((a, b) => label(a).localeCompare(label(b), undefined, { sensitivity: 'base' }));
}

function label(managedObject: IManagedObject): string {
  return (managedObject['name'] as string | undefined) ?? managedObject.id;
}
