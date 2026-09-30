import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { getJson } from './client';
import type {
  Alerts,
  ContainerDetail,
  ContainerLogs,
  ContainerStats,
  ContainerSummary,
  Graph,
  Resources,
  Tool,
} from './types';

// Intervalos de polling (ms).
export const POLL = {
  resources: 10_000,
  containers: 30_000,
  tools: 30_000,
  graph: 30_000,
  alerts: 30_000,
  panelStats: 5_000,
} as const;

export const keys = {
  resources: ['resources'] as const,
  containers: ['containers'] as const,
  container: (id: string) => ['containers', id] as const,
  stats: (id: string) => ['containers', id, 'stats'] as const,
  logs: (id: string) => ['containers', id, 'logs'] as const,
  tools: ['tools'] as const,
  graph: ['graph'] as const,
  alerts: ['alerts'] as const,
};

export function useResources() {
  return useQuery({
    queryKey: keys.resources,
    queryFn: ({ signal }) => getJson<Resources>('/api/resources', signal),
    refetchInterval: POLL.resources,
    placeholderData: keepPreviousData,
  });
}

export function useContainers() {
  return useQuery({
    queryKey: keys.containers,
    queryFn: ({ signal }) => getJson<ContainerSummary[]>('/api/containers', signal),
    refetchInterval: POLL.containers,
    placeholderData: keepPreviousData,
  });
}

export function useTools() {
  return useQuery({
    queryKey: keys.tools,
    queryFn: ({ signal }) => getJson<Tool[]>('/api/tools', signal),
    refetchInterval: POLL.tools,
    placeholderData: keepPreviousData,
  });
}

export function useGraph() {
  return useQuery({
    queryKey: keys.graph,
    queryFn: ({ signal }) => getJson<Graph>('/api/graph', signal),
    refetchInterval: POLL.graph,
    placeholderData: keepPreviousData,
  });
}

export function useAlerts() {
  return useQuery({
    queryKey: keys.alerts,
    queryFn: ({ signal }) => getJson<Alerts>('/api/alerts', signal),
    refetchInterval: POLL.alerts,
  });
}

const enc = encodeURIComponent;

export function useContainerDetail(id: string | null) {
  return useQuery({
    queryKey: keys.container(id ?? ''),
    queryFn: ({ signal }) => getJson<ContainerDetail>(`/api/containers/${enc(id!)}`, signal),
    enabled: !!id,
    refetchInterval: POLL.containers,
  });
}

export interface StatsSample extends ContainerStats {
  ts: number;
}

export interface StatsHistory {
  latest: StatsSample;
  /** Últimos 60 s (una muestra cada 5 s). */
  samples: StatsSample[];
}

const STATS_WINDOW = 60_000 / POLL.panelStats + 1;

/**
 * Stats en vivo del panel: solo mientras está abierto (``enabled``). Cada
 * respuesta se acumula sobre la anterior en la propia caché de react-query, y
 * ``gcTime: 0`` descarta el histórico al cerrar el panel.
 */
export function useContainerStats(id: string | null, enabled = true) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: keys.stats(id ?? ''),
    queryFn: async ({ signal }) => {
      const stats = await getJson<ContainerStats>(`/api/containers/${enc(id!)}/stats`, signal);
      const prev = qc.getQueryData<StatsHistory>(keys.stats(id!));
      const sample: StatsSample = { ...stats, ts: Date.now() };
      return {
        latest: sample,
        samples: [...(prev?.samples ?? []), sample].slice(-STATS_WINDOW),
      } satisfies StatsHistory;
    },
    enabled: !!id && enabled,
    refetchInterval: POLL.panelStats,
    staleTime: 0,
    gcTime: 0,
  });
}

export function useContainerLogs(id: string | null) {
  return useQuery({
    queryKey: keys.logs(id ?? ''),
    queryFn: ({ signal }) => getJson<ContainerLogs>(`/api/containers/${enc(id!)}/logs`, signal),
    enabled: !!id,
    // Sin polling: se refresca con el botón del visor de logs.
    staleTime: Infinity,
    gcTime: 0,
  });
}
