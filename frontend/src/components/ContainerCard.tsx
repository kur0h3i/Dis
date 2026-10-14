import { useEffect, useRef } from 'react';
import type { ContainerSummary } from '../api/types';
import { clickableProps } from '../lib/a11y';
import {
  formatMb,
  formatPct,
  formatPort,
  formatUptime,
  severityEdge,
  STATUS_LABEL,
} from '../lib/format';
import { ExternalLink } from './ExternalLink';
import { ServiceIcon } from './ServiceIcon';
import { StatusDot } from './StatusDot';

interface Props {
  container: ContainerSummary;
  onSelect: (name: string) => void;
  selected?: boolean;
  /** Versión baja para lo que no se abre (bases de datos, exporters…). */
  compact?: boolean;
}

export function ContainerCard({
  container: c,
  onSelect,
  selected = false,
  compact = false,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  // Al pasar de 3 a 2 columnas (panel abierto) la tarjeta puede salirse de la pantalla.
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [selected]);
  const running = c.status === 'running' || c.status === 'unhealthy';
  const published = c.ports.filter((p) => p.host_port);
  // El estado solo se escribe si no es el normal.
  const status = c.status !== 'running' && (
    <span className="shrink-0 font-mono text-xs text-muted">{STATUS_LABEL[c.status]}</span>
  );
  return (
    <div
      ref={ref}
      data-dis-selectable
      {...clickableProps(() => onSelect(c.name))}
      className={`group flex w-full scroll-mt-16 cursor-pointer flex-col rounded-lg border bg-surface text-left ${
        compact ? 'gap-1 p-3' : 'gap-3 p-4'
      } transition-colors transition-colors hover:border-accent/60 ${
        selected ? 'border-accent' : 'border-line'
      } ${severityEdge(c.status)}`}
    >
      {compact ? (
        <>
          <div className="flex items-center gap-2">
            <ServiceIcon icons={c.icons} name={c.name} size={24} />
            <StatusDot status={c.status} />
            <span className="truncate font-mono text-sm font-semibold text-ink group-hover:text-accent-ink">
              {c.name}
            </span>
            {status}
          </div>
          <div
            className="truncate font-mono text-xs text-faint"
            title={published.map(formatPort).join(', ')}
          >
            cpu {formatPct(c.cpu_pct)} · ram {formatMb(c.mem_mb)} ·{' '}
            {published.length === 0
              ? 'sin puertos'
              : `${published.length} puerto${published.length === 1 ? '' : 's'}`}{' '}
            · ↑ {formatUptime(c.uptime_s)}
          </div>
        </>
      ) : (
        <>
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-3">
              <ServiceIcon icons={c.icons} name={c.name} size={32} />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <StatusDot status={c.status} />
                  <span className="truncate font-mono text-sm font-semibold text-ink group-hover:text-accent-ink">
                    {c.name}
                  </span>
                  {status}
                </div>
                <div className="mt-0.5 truncate font-mono text-xs text-faint" title={c.image}>
                  {c.image}
                </div>
              </div>
            </div>
            {c.url && running && <ExternalLink href={c.url} />}
          </div>

          <dl className="grid grid-cols-3 gap-2 font-mono text-xs">
            <div>
              <dt className="text-faint">cpu</dt>
              <dd className="text-ink">{formatPct(c.cpu_pct)}</dd>
            </div>
            <div>
              <dt className="text-faint">ram</dt>
              <dd className="text-ink">{formatMb(c.mem_mb)}</dd>
            </div>
            <div>
              <dt className="text-faint">activo</dt>
              <dd className="text-ink">{formatUptime(c.uptime_s)}</dd>
            </div>
          </dl>

          <div className="flex min-w-0 flex-wrap gap-1">
            {published.length === 0 && (
              <span className="font-mono text-xs text-faint">sin puertos</span>
            )}
            {published.map((p) => (
              <span
                key={`${p.host_port}-${p.container_port}-${p.protocol}`}
                className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-muted"
                title={p.host_ip ? `${p.host_ip}:${p.host_port}` : undefined}
              >
                {formatPort(p)}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
