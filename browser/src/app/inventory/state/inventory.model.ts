export interface ReferenceNode {
  id: string;
  name?: string;
  self?: string;
}

export interface SiblingContext {
  referenceArray: ReferenceNode[];
  index: number;
  /** id of the Managed Object whose JSON held this references[] array — used by Parent. */
  originId: string;
}

export interface HistoryEntry {
  id: string;
  siblingContext?: SiblingContext;
}

export interface IdentityEntry {
  type: string;
  externalId: string;
  self?: string;
  managedObject?: ReferenceNode;
}
