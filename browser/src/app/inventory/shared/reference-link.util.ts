import { ReferenceNode } from '../state/inventory.model';

/**
 * Recognizes the two Managed Object reference shapes used across the Inventory API:
 * a bare `{ self, id }` (e.g. a `managedObject` fragment), or an `IManagedObjectReference`
 * (`{ self, managedObject: { id, ... } }`, as used in childDevices/childAssets/... references[]).
 */
export function extractReferenceNode(value: unknown): ReferenceNode | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;

  if (typeof record['id'] === 'string' && typeof record['self'] === 'string') {
    return {
      id: record['id'] as string,
      name: typeof record['name'] === 'string' ? (record['name'] as string) : undefined,
      self: record['self'] as string,
    };
  }

  const managedObject = record['managedObject'];
  if (managedObject && typeof managedObject === 'object') {
    const mo = managedObject as Record<string, unknown>;
    if (typeof mo['id'] === 'string') {
      return {
        id: mo['id'] as string,
        name: typeof mo['name'] === 'string' ? (mo['name'] as string) : undefined,
        self: typeof mo['self'] === 'string' ? (mo['self'] as string) : undefined,
      };
    }
  }

  return null;
}

export function isReferenceNode(value: unknown): boolean {
  return extractReferenceNode(value) !== null;
}
