import type { ContainerSummary } from '../api/types';
import { clickableProps } from '../lib/a11y';
import { formatMb, formatPct, formatPort, formatUptime, STATUS_LABEL } from '../lib/format';
import { ExternalLink } from './ExternalLink';
import { ServiceIcon } from './ServiceIcon';
import { StatusDot } from './StatusDot';

interface Props {
  container: ContainerSummary;
  onSelect: (name: string) => void;
  selected?: boolean;
}

export function ContainerCard({ container: c, onSelect, selected = false }: Props) {
  const running = c.status === 'running' || c.status === 'unhealthy';
  const published = c.ports.filter((p) => p.host_port);
  return (
    <div
      data-dis-selectable
      {...clickableProps(() => onSelect(c.name))}
      className={`group flex w-full cursor-pointer flex-col gap-3 rounded-lg border bg-surface p-4 text-left transition-colors hover:border-accent/60 ${
        selected ? 'border-accent' : 'border-line'
      } ${running ? '' : 'opacity-70'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <ServiceIcon icons={c.icons} name={c.name} size={32} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <StatusDot status={c.status} />
              <span className="truncate font-mono text-sm font-semibold text-ink group-hover:text-accent-ink">
                {c.name}
              </span>
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
          <dt className="text-faint">estado</dt>
          <dd className="text-ink">{STATUS_LABEL[c.status]}</dd>
        </div>
        <div>
          <dt className="text-faint">cpu</dt>
          <dd className="text-ink">{formatPct(c.cpu_pct)}</dd>
        </div>
        <div>
          <dt className="text-faint">ram</dt>
          <dd className="text-ink">{formatMb(c.mem_mb)}</dd>
        </div>
      </dl>

      <div className="flex items-end justify-between gap-2">
        <div className="flex min-w-0 flex-wrap gap-1">
          {published.length === 0 && (
            <span className="font-mono text-xs text-faint">sin puertos</span>
          )}
          {published.map((p) => (
            <span
              key={`${p.host_port}-${p.container_port}-${p.protocol}`}
              className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-muted"
              title={p.host_ip ? `${p.host_ip}:${p.host_port}` : undefined}
            >
              {formatPort(p)}
            </span>
          ))}
        </div>
        <span className="shrink-0 font-mono text-xs text-faint" title="Tiempo activo">
          ↑ {formatUptime(c.uptime_s)}
        </span>
      </div>
    </div>
  );
}
