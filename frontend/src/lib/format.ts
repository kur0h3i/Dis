import type { ContainerStatus, PortMapping, ToolStatus } from '../api/types';

// hex y no var(): el MiniMap/SVG los pinta fuera del CSS; coincide con --ok/--warn/--danger en oscuro.
export const STATUS_COLOR: Record<ToolStatus, string> = {
  running: '#22c55e',
  stopped: '#6b7280',
  restarting: '#eab308',
  paused: '#eab308',
  unhealthy: '#ef4444',
  development: '#6b7280',
  idea: '#6b7280',
};

export const STATUS_LABEL: Record<ToolStatus, string> = {
  running: 'running',
  stopped: 'stopped',
  restarting: 'restarting',
  paused: 'paused',
  unhealthy: 'unhealthy',
  development: 'en desarrollo',
  idea: 'idea',
};

export function isDown(status: ToolStatus | ContainerStatus): boolean {
  return status === 'stopped' || status === 'unhealthy';
}

export function formatUptime(seconds: number | null | undefined): string {
  if (seconds == null) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${seconds}s`;
}

export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatMb(mb: number | null | undefined): string {
  if (mb == null) return '—';
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;
}

export function formatPct(pct: number | null | undefined, digits = 1): string {
  return pct == null ? '—' : `${pct.toFixed(digits)}%`;
}

/** "9080→8080/tcp" o "5432/tcp" si no está publicado. */
export function formatPort(p: PortMapping): string {
  const target = `${p.container_port}/${p.protocol}`;
  return p.host_port ? `${p.host_port}→${target}` : target;
}

/** Filo izquierdo de color para estados que piden atención (hover incluido: pisa el borde de hover). */
export function severityEdge(status: ToolStatus): string {
  if (status === 'unhealthy') return 'border-l-4 border-l-danger hover:border-l-danger';
  if (status === 'restarting' || status === 'paused')
    return 'border-l-4 border-l-warn hover:border-l-warn';
  return '';
}

/** Estados que piden atención. Un contenedor parado no cuenta: puede ser intencionado. */
export function isProblem(status: ToolStatus): boolean {
  return status === 'unhealthy' || status === 'restarting' || status === 'paused';
}

/** Antigüedad legible de un dato: "hace menos de 1 min", "hace 5 min", "hace 2 h". */
export function formatAge(ms: number): string {
  if (ms < 60_000) return 'hace menos de 1 min';
  if (ms < 3_600_000) return `hace ${Math.floor(ms / 60_000)} min`;
  return `hace ${Math.floor(ms / 3_600_000)} h`;
}
