import { ReferenceNode } from '../state/inventory.model';
import { extractReferenceNode } from '../shared/reference-link.util';

const INDENT = '  ';

export interface JsonLink {
  start: number;
  end: number;
  node: ReferenceNode;
  /** Present when this link is an item of a references[] array — enables Prev/Next stepping. */
  siblingArray?: ReferenceNode[];
  siblingIndex?: number;
}

export interface SerializedJson {
  text: string;
  links: JsonLink[];
}

/**
 * Pretty-prints a value exactly like `JSON.stringify(value, null, 2)`, while additionally
 * recording the character range of every reference-shaped node (see reference-link.util) so the
 * caller can turn those ranges into clickable Monaco decorations without a second parsing pass.
 * The root value itself is never treated as a reference, even if it happens to have `self`+`id`.
 * Reference nodes that are items of the same array are linked together via `siblingArray`/
 * `siblingIndex`, so Prev/Next can step through them (matches the array-position sibling model in
 * InventoryNavigationService).
 */
export function serializeWithLinks(value: unknown): SerializedJson {
  const links: JsonLink[] = [];
  let text = '';

  const write = (chunk: string): void => {
    text += chunk;
  };

  // Once an ancestor node has been recognized as a reference and turned into a link, its
  // descendants (e.g. a nested `managedObject: { self, id }`) must not also register as
  // separate, nested links — they're just part of that reference's displayed raw JSON.
  const serializeValue = (
    val: unknown,
    indent: string,
    isRoot: boolean,
    suppressLinks: boolean,
    siblingContext?: { referenceArray: ReferenceNode[]; index: number }
  ): void => {
    const ref = isRoot || suppressLinks ? null : extractReferenceNode(val);
    const start = text.length;
    const childSuppressLinks = suppressLinks || !!ref;

    if (Array.isArray(val)) {
      serializeArray(val, indent, childSuppressLinks);
    } else if (val !== null && typeof val === 'object') {
      serializeObject(val as Record<string, unknown>, indent, childSuppressLinks);
    } else {
      write(JSON.stringify(val) ?? 'null');
    }

    if (ref) {
      links.push({
        start,
        end: text.length,
        node: ref,
        siblingArray: siblingContext?.referenceArray,
        siblingIndex: siblingContext?.index,
      });
    }
  };

  const serializeArray = (arr: unknown[], indent: string, suppressLinks: boolean): void => {
    if (!arr.length) {
      write('[]');
      return;
    }
    const childIndent = indent + INDENT;
    const referenceNodes = suppressLinks ? [] : arr.map((item) => extractReferenceNode(item));
    const referenceArray = referenceNodes.filter((node): node is ReferenceNode => node !== null);

    write('[\n');
    let refIndex = 0;
    arr.forEach((item, i) => {
      write(childIndent);
      const node = referenceNodes[i];
      const siblingContext = node ? { referenceArray, index: refIndex++ } : undefined;
      serializeValue(item, childIndent, false, suppressLinks, siblingContext);
      write(i < arr.length - 1 ? ',\n' : '\n');
    });
    write(`${indent}]`);
  };

  const serializeObject = (obj: Record<string, unknown>, indent: string, suppressLinks: boolean): void => {
    const keys = Object.keys(obj).filter((key) => obj[key] !== undefined);
    if (!keys.length) {
      write('{}');
      return;
    }
    const childIndent = indent + INDENT;
    write('{\n');
    keys.forEach((key, i) => {
      write(`${childIndent}${JSON.stringify(key)}: `);
      serializeValue(obj[key], childIndent, false, suppressLinks);
      write(i < keys.length - 1 ? ',\n' : '\n');
    });
    write(`${indent}}`);
  };

  serializeValue(value, '', true, false);
  return { text, links };
}
