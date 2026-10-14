import type { Alerts } from '../api/types';

interface Props {
  alerts: Alerts | undefined;
  loading?: boolean;
}

function alertText(a: Record<string, unknown>): string {
  for (const key of ['message', 'msg', 'title', 'text']) {
    if (typeof a[key] === 'string') return a[key] as string;
  }
  return JSON.stringify(a);
}

/** Alertas de Cerbero: tarjeta si hay alertas; si no, una línea de estado. */
export function AlertsPanel({ alerts, loading = false }: Props) {
  // TODO: Cerbero live — streaming (SSE/WebSocket) cuando su API esté lista.
  if (!alerts?.connected || alerts.alerts.length === 0) {
    const state = loading
      ? 'consultando…'
      : alerts?.connected
        ? 'sin alertas activas'
        : 'sin conexión';
    return (
      <p className="font-mono text-xs text-faint">
        Cerbero: {state}
        {alerts?.error && ` · ${alerts.error}`}
      </p>
    );
  }
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-mono text-sm font-semibold text-ink">Alertas · Cerbero</h3>
        <span className="font-mono text-xs text-faint">conectado</span>
      </div>
      <ul className="space-y-1.5">
        {alerts.alerts.map((a, i) => (
          <li key={i} className="flex gap-2 font-mono text-xs">
            <span className="text-warn">▲</span>
            <span className="text-ink">{alertText(a)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
