// Tipos de la API de Dis (espejo de backend/app/models.py).

export type ContainerStatus = 'running' | 'stopped' | 'restarting' | 'paused' | 'unhealthy';
export type ToolStatus = ContainerStatus | 'development' | 'idea';
export type ToolStage = 'operational' | 'development' | 'idea';

export interface PortMapping {
  container_port: number;
  protocol: string;
  host_ip: string | null;
  host_port: number | null;
}

export interface ContainerSummary {
  id: string;
  name: string;
  image: string;
  status: ContainerStatus;
  state: string;
  health: string | null;
  ports: PortMapping[];
  uptime_s: number | null;
  cpu_pct: number | null;
  mem_mb: number | null;
  url: string | null;
  description: string | null;
  depends_on: string[];
}

export interface EnvVar {
  key: string;
  value: string;
  masked: boolean;
}

export interface ContainerDetail extends ContainerSummary {
  created: string | null;
  started_at: string | null;
  command: string | null;
  env: EnvVar[];
  labels: Record<string, string>;
}

export interface ContainerStats {
  cpu_pct: number;
  mem_mb: number;
  mem_limit_mb: number;
  net_rx_b: number;
  net_tx_b: number;
}

export interface ContainerLogs {
  lines: string[];
}

export interface DiskUsage {
  mountpoint: string;
  used_gb: number;
  total_gb: number;
  pct: number;
}

export interface ResourceSample {
  ts: number;
  cpu_pct: number;
  ram_used_gb: number;
}

export interface Resources {
  cpu_pct: number;
  cpu_count: number;
  ram_used_gb: number;
  ram_total_gb: number;
  ram_pct: number;
  disks: DiskUsage[];
  history_5m: ResourceSample[];
}

export interface Tool {
  id: string;
  name: string;
  description: string;
  url: string | null;
  status: ToolStatus;
  stage: ToolStage;
  depends_on: string[];
  container: string | null;
  is_self: boolean;
}

export interface GraphNode {
  id: string;
  label: string;
  type: 'container' | 'tool';
  status: ToolStatus;
  url: string | null;
  description: string | null;
  container: string | null;
  is_self: boolean;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  docker_available: boolean;
}

export interface ConfigStatus {
  path: string | null;
  /** Epoch en segundos de la última carga correcta de dis.yaml. */
  loaded_at: number | null;
  /** Error de la última recarga (se sigue usando la config anterior). */
  error: string | null;
}

export interface Alerts {
  connected: boolean;
  alerts: Record<string, unknown>[];
  error: string | null;
}

/** Lo que el usuario ha seleccionado para ver en el panel lateral. */
export type Selection = { kind: 'container'; name: string } | { kind: 'tool'; id: string };
