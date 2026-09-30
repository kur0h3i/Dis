import type { GraphNode, Selection } from '../api/types';

export function selectionFor(node: GraphNode): Selection {
  return node.type === 'tool'
    ? { kind: 'tool', id: node.id }
    : { kind: 'container', name: node.container ?? node.id };
}

export function sameSelection(a: Selection | null, b: Selection): boolean {
  if (!a) return false;
  if (a.kind === 'tool' && b.kind === 'tool') return a.id === b.id;
  if (a.kind === 'container' && b.kind === 'container') return a.name === b.name;
  return false;
}
