import type { ContainerSummary } from '../api/types';
import { isProblem } from './format';

export type SortMode = 'default' | 'active-first';

export const SORT_STORAGE_KEY = 'dis_container_sort';

export function readSortMode(): SortMode {
  try {
    return localStorage.getItem(SORT_STORAGE_KEY) === 'active-first' ? 'active-first' : 'default';
  } catch {
    return 'default';
  }
}

export function saveSortMode(mode: SortMode): void {
  try {
    localStorage.setItem(SORT_STORAGE_KEY, mode);
  } catch {
    // Sin almacenamiento: la preferencia no se recuerda.
  }
}

/** Un servicio es "activo" (abrible) si está en marcha y tiene una UI web. */
export function isActive(c: ContainerSummary): boolean {
  const running = c.status === 'running' || c.status === 'unhealthy';
  return running && !!c.url;
}

/**
 * Orden estable: los que dan problemas (unhealthy, restarting, paused) suben siempre; con
 * "active-first" después van los abribles. El resto conserva el orden del backend
 * (running primero, luego nombre).
 */
export function sortContainers(list: ContainerSummary[], mode: SortMode): ContainerSummary[] {
  const rank = (c: ContainerSummary) =>
    Number(!isProblem(c.status)) * 2 + (mode === 'active-first' ? Number(!isActive(c)) : 0);
  return list
    .map((c, i) => ({ c, i }))
    .sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i)
    .map(({ c }) => c);
}

/** Familia = nombre hasta el primer `-` o `_` (heurística: el resumen no trae el proyecto Compose). */
export function familyOf(name: string): string {
  return name.split(/[-_]/)[0] || name;
}

export interface Family {
  key: string;
  label: string;
  items: ContainerSummary[];
}

const OTHERS = '~otros';

/** Agrupa por familia; las de un solo contenedor van a "Otros". Con problemas primero. */
export function groupByFamily(list: ContainerSummary[]): Family[] {
  const counts = new Map<string, number>();
  for (const c of list) counts.set(familyOf(c.name), (counts.get(familyOf(c.name)) ?? 0) + 1);
  const groups = new Map<string, Family>();
  for (const c of list) {
    const f = familyOf(c.name);
    const key = (counts.get(f) ?? 0) >= 2 ? f : OTHERS;
    const g = groups.get(key) ?? { key, label: key === OTHERS ? 'Otros' : f, items: [] };
    g.items.push(c);
    groups.set(key, g);
  }
  const noProblem = (g: Family) => Number(!g.items.some((c) => isProblem(c.status)));
  return [...groups.values()].sort(
    (a, b) =>
      noProblem(a) - noProblem(b) ||
      Number(a.key === OTHERS) - Number(b.key === OTHERS) ||
      a.label.localeCompare(b.label),
  );
}

/** Abierto por defecto si tiene algo abrible o con problemas; los pasivos puros, plegados. */
export function familyOpenByDefault(items: ContainerSummary[]): boolean {
  return items.some(isActive) || items.some((c) => isProblem(c.status));
}

export const FAMILY_STORAGE_KEY = 'dis_family_open';

export function readFamilyOpen(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(FAMILY_STORAGE_KEY) ?? '{}') as Record<string, boolean>;
  } catch {
    return {};
  }
}

export function saveFamilyOpen(map: Record<string, boolean>): void {
  try {
    localStorage.setItem(FAMILY_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Sin almacenamiento: no se recuerda lo plegado.
  }
}
