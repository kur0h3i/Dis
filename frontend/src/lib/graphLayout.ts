import type { XYPosition } from '@xyflow/react';
import type { GraphEdge, GraphNode } from '../api/types';

export const POSITIONS_KEY = 'dis_graph_positions';

export const NODE_WIDTH = 240;
const COL_W = 290;
const ROW_H = 220;
const MAX_COLS = 4;

export type Positions = Record<string, XYPosition>;

export function loadPositions(): Positions {
  try {
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

/**
 * Layout inicial en cuadrícula por capas: arriba los servicios que dependen de
 * otros, debajo sus dependencias (según la ruta más larga hasta un sumidero) y
 * al final, en filas de 4, los nodos sin aristas. Se calcula una vez; después
 * manda lo que el usuario arrastre.
 */
export function gridLayout(nodes: GraphNode[], edges: GraphEdge[]): Positions {
  const ids = new Set(nodes.map((n) => n.id));
  const out = new Map<string, string[]>();
  const connected = new Set<string>();
  for (const e of edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) continue;
    out.set(e.source, [...(out.get(e.source) ?? []), e.target]);
    connected.add(e.source).add(e.target);
  }

  const rank = new Map<string, number>();
  const visiting = new Set<string>();
  const rankOf = (id: string): number => {
    if (rank.has(id)) return rank.get(id)!;
    if (visiting.has(id)) return 0; // ciclo: lo cortamos
    visiting.add(id);
    const r = Math.max(-1, ...(out.get(id) ?? []).map(rankOf)) + 1;
    visiting.delete(id);
    rank.set(id, r);
    return r;
  };

  const rows: string[][] = [];
  const layered = nodes.filter((n) => connected.has(n.id));
  const maxRank = Math.max(0, ...layered.map((n) => rankOf(n.id)));
  for (let r = maxRank; r >= 0; r--) {
    const row = layered.filter((n) => rankOf(n.id) === r).map((n) => n.id);
    for (let i = 0; i < row.length; i += MAX_COLS) rows.push(row.slice(i, i + MAX_COLS));
  }
  const isolated = nodes.filter((n) => !connected.has(n.id));
  // Herramientas antes que contenedores sueltos.
  isolated.sort((a, b) => (a.type === b.type ? 0 : a.type === 'tool' ? -1 : 1));
  for (let i = 0; i < isolated.length; i += MAX_COLS) {
    rows.push(isolated.slice(i, i + MAX_COLS).map((n) => n.id));
  }

  const widest = Math.max(1, ...rows.map((r) => r.length));
  const positions: Positions = {};
  rows.forEach((row, y) => {
    const offset = ((widest - row.length) * COL_W) / 2;
    row.forEach((id, x) => {
      positions[id] = { x: offset + x * COL_W, y: y * ROW_H };
    });
  });
  return positions;
}
