import type { ContainerSummary } from '../api/types';

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
 * Orden por defecto: el que ya trae el backend (running primero, luego nombre).
 * "active-first": primero los abribles (con UI web), después los pasivos
 * (bases de datos, workers...), conservando el orden original dentro de cada grupo.
 */
export function sortContainers(list: ContainerSummary[], mode: SortMode): ContainerSummary[] {
  if (mode !== 'active-first') return list;
  return list
    .map((c, i) => ({ c, i }))
    .sort((a, b) => Number(isActive(b.c)) - Number(isActive(a.c)) || a.i - b.i)
    .map(({ c }) => c);
}
