import dagre from '@dagrejs/dagre';
import type { XYPosition } from '@xyflow/react';
import type { GraphEdge, GraphNode } from '../api/types';

// v2: layout por grupos. Las posiciones guardadas con la cuadrícula anterior,
// demasiado apretada, se descartan para que se vea el nuevo reparto.
export const POSITIONS_KEY = 'dis_graph_positions_v2';
const LEGACY_POSITIONS_KEYS = ['dis_graph_positions'];

export const NODE_WIDTH = 240;
/** Alto aproximado de un nodo (el real se mide al pintarlo). */
export const NODE_HEIGHT = 150;
// Dentro de un grupo de servicios relacionados: entre vecinos y entre capas.
const NODE_GAP = 70;
const RANK_GAP = 110;
// Entre grupos, más, para que se lean como bloques separados.
const GROUP_GAP_X = 150;
const GROUP_GAP_Y = 130;
// Proporción a la que se reparten los grupos (la de una pantalla apaisada).
const ASPECT = 16 / 9;

export type Positions = Record<string, XYPosition>;

export function loadPositions(): Positions {
  try {
    for (const key of LEGACY_POSITIONS_KEYS) localStorage.removeItem(key);
    const raw = localStorage.getItem(POSITIONS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Positions = {};
    for (const [id, pos] of Object.entries(parsed as Record<string, unknown>)) {
      const p = pos as Partial<XYPosition> | null;
      if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) out[id] = { x: p.x!, y: p.y! };
    }
    return out;
  } catch {
    return {};
  }
}

export function savePositions(positions: Positions): void {
  try {
    localStorage.setItem(POSITIONS_KEY, JSON.stringify(positions));
  } catch {
    // Sin almacenamiento: el layout no se recuerda entre visitas.
  }
}

export function clearPositions(): void {
  try {
    localStorage.removeItem(POSITIONS_KEY);
  } catch {
    // ignorado
  }
}

interface Block {
  width: number;
  height: number;
  /** Posiciones relativas a la esquina superior izquierda del bloque. */
  positions: Positions;
}

/** Grupos de nodos conectados entre sí (sin mirar el sentido), en el orden de `nodes`. */
function components(nodes: GraphNode[], edges: GraphEdge[]): GraphNode[][] {
  const links = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    links.get(e.source)?.push(e.target);
    links.get(e.target)?.push(e.source);
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const order = new Map(nodes.map((n, i) => [n.id, i]));
  const seen = new Set<string>();
  const groups: GraphNode[][] = [];
  for (const start of nodes) {
    if (seen.has(start.id)) continue;
    const group: GraphNode[] = [];
    const stack = [start.id];
    seen.add(start.id);
    while (stack.length > 0) {
      const id = stack.pop()!;
      group.push(byId.get(id)!);
      for (const next of links.get(id) ?? []) {
        if (!seen.has(next)) {
          seen.add(next);
          stack.push(next);
        }
      }
    }
    // Conserva el orden original dentro del grupo (dagre lo usa de partida).
    groups.push(group.sort((a, b) => order.get(a.id)! - order.get(b.id)!));
  }
  return groups;
}

/**
 * Un grupo, por capas con dagre: arriba los servicios que dependen de otros y
 * debajo sus dependencias, ordenados para que las aristas se crucen lo menos
 * posible y con hueco suficiente entre nodos.
 */
function layoutGroup(group: GraphNode[], edges: GraphEdge[]): Block {
  if (group.length === 1) {
    return {
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      positions: { [group[0]!.id]: { x: 0, y: 0 } },
    };
  }
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: NODE_GAP, ranksep: RANK_GAP, marginx: 0, marginy: 0 });
  g.setDefaultEdgeLabel(() => ({}));
  const ids = new Set(group.map((n) => n.id));
  for (const n of group) g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  for (const e of edges) if (ids.has(e.source) && ids.has(e.target)) g.setEdge(e.source, e.target);
  dagre.layout(g);

  // dagre da el centro de cada nodo; React Flow quiere la esquina.
  const positions: Positions = {};
  let width = 0;
  let height = 0;
  for (const n of group) {
    const { x, y } = g.node(n.id) as { x: number; y: number };
    positions[n.id] = { x: Math.round(x - NODE_WIDTH / 2), y: Math.round(y - NODE_HEIGHT / 2) };
    width = Math.max(width, x + NODE_WIDTH / 2);
    height = Math.max(height, y + NODE_HEIGHT / 2);
  }
  return { width, height, positions };
}

/**
 * Coloca bloques en filas de hasta `maxWidth` (el primero de cada fila siempre
 * cabe), cada fila centrada en `totalWidth`. Escribe las posiciones absolutas
 * en `out` y devuelve el alto ocupado, con el hueco de después de la última fila.
 */
function packRows(
  blocks: Block[],
  maxWidth: number,
  gapX: number,
  gapY: number,
  top: number,
  totalWidth: number,
  out: Positions,
): number {
  const rows: Block[][] = [];
  let width = Infinity;
  for (const b of blocks) {
    if (width + gapX + b.width > maxWidth) {
      rows.push([]);
      width = -gapX;
    }
    rows[rows.length - 1]!.push(b);
    width += gapX + b.width;
  }
  let y = top;
  for (const row of rows) {
    const rowWidth = row.reduce((w, b) => w + b.width, 0) + gapX * (row.length - 1);
    let x = Math.round((totalWidth - rowWidth) / 2);
    for (const b of row) {
      for (const [id, p] of Object.entries(b.positions)) out[id] = { x: x + p.x, y: y + p.y };
      x += b.width + gapX;
    }
    y += Math.max(...row.map((b) => b.height)) + gapY;
  }
  return y - top;
}

/** Ancho de las filas de `packRows` para esos bloques, sin colocarlos. */
function rowsWidth(blocks: Block[], maxWidth: number, gapX: number): number {
  let widest = 0;
  let width = Infinity;
  for (const b of blocks) {
    width = width + gapX + b.width > maxWidth ? b.width : width + gapX + b.width;
    widest = Math.max(widest, width);
  }
  return widest;
}

/**
 * Layout inicial. Cada grupo de servicios relacionados (una app con su base de
 * datos, su caché...) se coloca por capas con dagre, y los grupos se reparten
 * en filas con aire entre ellos, los grandes primero. Al final, en una
 * cuadrícula, los nodos sin aristas: herramientas antes que contenedores.
 * Se calcula una vez; después manda lo que el usuario arrastre.
 */
export function gridLayout(nodes: GraphNode[], edges: GraphEdge[]): Positions {
  const ids = new Set(nodes.map((n) => n.id));
  const valid = edges.filter(
    (e) => e.source !== e.target && ids.has(e.source) && ids.has(e.target),
  );
  const groups = components(nodes, valid);

  const connected = groups
    .filter((g) => g.length > 1)
    .map((g) => layoutGroup(g, valid))
    // Los grupos más grandes primero (sort es estable: a igualdad, el orden de llegada).
    .sort((a, b) => b.width * b.height - a.width * a.height);
  const isolated = groups
    .filter((g) => g.length === 1)
    .map((g) => g[0]!)
    .sort((a, b) => (a.type === b.type ? 0 : a.type === 'tool' ? -1 : 1))
    .map((n) => layoutGroup([n], valid));

  // Ancho objetivo: el de un rectángulo con la proporción ASPECT y el área de
  // todo, sin bajar del grupo más ancho.
  const area =
    connected.reduce((a, b) => a + (b.width + GROUP_GAP_X) * (b.height + GROUP_GAP_Y), 0) +
    isolated.length * (NODE_WIDTH + NODE_GAP) * (NODE_HEIGHT + NODE_GAP);
  const maxWidth = Math.max(NODE_WIDTH, ...connected.map((b) => b.width), Math.sqrt(area * ASPECT));
  const totalWidth = Math.max(
    rowsWidth(connected, maxWidth, GROUP_GAP_X),
    rowsWidth(isolated, maxWidth, NODE_GAP),
  );

  const positions: Positions = {};
  const top = packRows(connected, maxWidth, GROUP_GAP_X, GROUP_GAP_Y, 0, totalWidth, positions);
  packRows(isolated, maxWidth, NODE_GAP, NODE_GAP, top, totalWidth, positions);
  return positions;
}
