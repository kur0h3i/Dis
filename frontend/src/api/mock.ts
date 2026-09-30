// Datos de ejemplo para maquetar el Dashboard sin backend.
import type { Alerts, ContainerSummary, Resources, Tool } from './types';

const now = Date.now() / 1000;

export const mockResources: Resources = {
  cpu_pct: 14.2,
  cpu_count: 12,
  ram_used_gb: 7.1,
  ram_total_gb: 11.7,
  ram_pct: 60.7,
  disks: [
    { mountpoint: '/', used_gb: 142, total_gb: 234, pct: 60.7 },
    { mountpoint: '/home', used_gb: 820, total_gb: 931, pct: 88.1 },
  ],
  history_5m: Array.from({ length: 22 }, (_, i) => ({
    ts: now - (21 - i) * 10,
    cpu_pct: 10 + Math.sin(i / 2) * 6 + (i % 5),
    ram_used_gb: 6.8 + Math.sin(i / 4) * 0.3,
  })),
};

export const mockContainers: ContainerSummary[] = [
  {
    id: '687345dcde4c',
    name: 'minos-adminer',
    image: 'adminer',
    status: 'running',
    state: 'running',
    health: null,
    ports: [{ container_port: 8080, protocol: 'tcp', host_ip: '0.0.0.0', host_port: 9080 }],
    uptime_s: 3 * 86400 + 4000,
    cpu_pct: 0.01,
    mem_mb: 8.3,
    url: 'http://localhost:9080',
    description: 'Adminer',
  },
  {
    id: '89183f7f4b2e',
    name: 'minos-db',
    image: 'postgres:16',
    status: 'running',
    state: 'running',
    health: 'healthy',
    ports: [{ container_port: 5432, protocol: 'tcp', host_ip: '127.0.0.1', host_port: 5432 }],
    uptime_s: 3 * 86400 + 4100,
    cpu_pct: 0.4,
    mem_mb: 64.2,
    url: null,
    description: 'PostgreSQL 16',
  },
];

export const mockTools: Tool[] = [
  {
    id: 'dis',
    name: 'Dis',
    description: 'Dashboard central de server-kuro',
    url: null,
    status: 'running',
    stage: 'operational',
    depends_on: [],
    container: 'dis',
    is_self: true,
  },
  {
    id: 'caronte',
    name: 'Caronte',
    description: 'Visualizador de BD; sustituto de Adminer',
    url: 'http://localhost:8081',
    status: 'running',
    stage: 'operational',
    depends_on: ['minos-db'],
    container: null,
    is_self: false,
  },
  {
    id: 'gerion',
    name: 'Gerión',
    description: 'Honeypot',
    url: null,
    status: 'idea',
    stage: 'idea',
    depends_on: [],
    container: null,
    is_self: false,
  },
];

export const mockAlerts: Alerts = { connected: false, alerts: [], error: null };
