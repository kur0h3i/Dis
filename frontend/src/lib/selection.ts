import type { GraphNode, Selection } from '../api/types';

export function selectionFor(node: GraphNode): Selection {
  return node.type === 'tool'
    ? { kind: 'tool', id: node.id }
    : { kind: 'container', name: node.container ?? node.id };
}

/**
 * ¿Es este nodo el de la selección? Un contenedor seleccionado desde el
 * dashboard también marca a la herramienta que lo absorbe en el mapa.
 */
export function nodeMatchesSelection(node: GraphNode, selection: Selection | null): boolean {
  if (!selection) return false;
  if (selection.kind === 'tool') return node.type === 'tool' && node.id === selection.id;
  return node.container === selection.name;
}
