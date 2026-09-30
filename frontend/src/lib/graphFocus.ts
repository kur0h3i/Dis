import type { GraphEdge, GraphNode, ToolStatus } from '../api/types';
import { STATUS_COLOR } from './format';

/** Grupos de estado del mapa: cada uno es una entrada de la leyenda y un filtro. */
export type StatusGroup = 'running' | 'warning' | 'unhealthy' | 'stopped' | 'inactive';

export const STATUS_GROUPS: readonly { group: StatusGroup; label: string; color: string }[] = [
  { group: 'running', label: 'running', color: STATUS_COLOR.running },
  { group: 'warning', label: 'restarting', color: STATUS_COLOR.restarting },
  { group: 'unhealthy', label: 'unhealthy', color: STATUS_COLOR.unhealthy },
  { group: 'stopped', label: 'stopped', color: STATUS_COLOR.stopped },
  { group: 'inactive', label: 'desarrollo / idea', color: STATUS_COLOR.development },
];

export function statusGroup(status: ToolStatus): StatusGroup {
  switch (status) {
    case 'running':
      return 'running';
    case 'restarting':
    case 'paused':
      return 'warning';
    case 'unhealthy':
      return 'unhealthy';
    case 'stopped':
      return 'stopped';
    default:
      return 'inactive';
  }
}

const HIDDEN_KEY = 'dis_graph_hidden';

export function loadHiddenGroups(): Set<StatusGroup> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? '[]');
    const valid = new Set<string>(STATUS_GROUPS.map((g) => g.group));
    return new Set(
      Array.isArray(parsed) ? (parsed.filter((g) => valid.has(g)) as StatusGroup[]) : [],
    );
  } catch {
    return new Set();
  }
}

export function saveHiddenGroups(groups: Set<StatusGroup>): void {
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify([...groups]));
  } catch {
    // Sin almacenamiento: los filtros no se recuerdan entre visitas.
  }
}

/** Vecinos directos de cada nodo: sus dependencias y quienes dependen de él. */
export function neighborMap(edges: GraphEdge[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    const set = map.get(a) ?? new Set<string>();
    set.add(b);
    map.set(a, set);
  };
  for (const e of edges) {
    link(e.source, e.target);
    link(e.target, e.source);
  }
  return map;
}

/** Minúsculas y sin tildes: "gerion" encuentra "Gerión". */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Coincidencia por nombre, id, contenedor o descripción. `query` ya normalizada. */
export function matchesQuery(node: GraphNode, query: string): boolean {
  if (!query) return true;
  return [node.label, node.id, node.container, node.description].some(
    (field) => field != null && normalizeText(field).includes(query),
  );
}
