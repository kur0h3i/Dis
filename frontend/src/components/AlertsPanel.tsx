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

/** Alertas de Cerbero. Hasta que Cerbero exista, muestra "no conectado". */
export function AlertsPanel({ alerts, loading = false }: Props) {
  // TODO: Cerbero live — streaming (SSE/WebSocket) cuando su API esté lista.
  const connected = alerts?.connected ?? false;
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-mono text-sm font-semibold text-ink">Alertas · Cerbero</h3>
        <span className="font-mono text-[11px] text-faint">
          {loading ? 'consultando…' : connected ? 'conectado' : 'sin conexión'}
        </span>
      </div>
      {!connected && (
        <p className="text-sm text-muted">
          Cerbero no conectado.
          {alerts?.error && (
            <span className="mt-1 block font-mono text-xs text-faint">{alerts.error}</span>
          )}
        </p>
      )}
      {connected && alerts && alerts.alerts.length === 0 && (
        <p className="text-sm text-muted">Sin alertas activas.</p>
      )}
      {connected && alerts && alerts.alerts.length > 0 && (
        <ul className="space-y-1.5">
          {alerts.alerts.map((a, i) => (
            <li key={i} className="flex gap-2 font-mono text-xs">
              <span className="text-[#eab308]">▲</span>
              <span className="text-ink">{alertText(a)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
