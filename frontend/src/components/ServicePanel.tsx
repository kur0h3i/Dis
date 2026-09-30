import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  type StatsHistory,
  useContainerDetail,
  useContainerLogs,
  useContainerStats,
} from '../api/hooks';
import type { ContainerDetail, ContainerSummary, Selection, Tool } from '../api/types';
import { formatBytes, formatMb, formatPct, formatUptime, STATUS_LABEL } from '../lib/format';
import { ExternalLink } from './ExternalLink';
import { LogViewer } from './LogViewer';
import { MiniChart } from './MiniChart';
import { ServiceIcon } from './ServiceIcon';
import { StatusDot } from './StatusDot';

interface Props {
  selection: Selection | null;
  tools: Tool[] | undefined;
  containers: ContainerSummary[] | undefined;
  onSelect: (s: Selection) => void;
  onClose: () => void;
}

/**
 * Atributo para que un clic en tarjetas, nodos, la cabecera o la barra del mapa
 * no cuente como "clic fuera".
 */
export const SELECTABLE_ATTR = 'data-dis-selectable';

/** Ancho máximo del panel (px); el mapa lo usa para no dejar nodos debajo. */
export const PANEL_MAX_WIDTH = 520;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="font-mono text-[11px] font-semibold tracking-[0.2em] text-faint uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2 px-3 py-2">
      <div className="font-mono text-[11px] text-faint">{label}</div>
      <div className="font-mono text-base font-semibold text-ink">{value}</div>
      {sub && <div className="font-mono text-[11px] text-faint">{sub}</div>}
    </div>
  );
}

function rate(history: StatsHistory | undefined, key: 'net_rx_b' | 'net_tx_b'): string {
  const s = history?.samples;
  if (!s || s.length < 2) return '—';
  const a = s[s.length - 2]!;
  const b = s[s.length - 1]!;
  const dt = (b.ts - a.ts) / 1000;
  const delta = b[key] - a[key];
  if (dt <= 0 || delta < 0) return '—';
  return `${formatBytes(delta / dt)}/s`;
}

function LiveMetrics({ name, running }: { name: string; running: boolean }) {
  const { data, error } = useContainerStats(name, running);
  if (!running) {
    return <p className="text-sm text-muted">El contenedor no está en marcha.</p>;
  }
  if (error) return <p className="font-mono text-xs text-[#ef4444]">{error.message}</p>;
  const latest = data?.latest;
  const samples = data?.samples ?? [];
  const labels = samples.map((s) => new Date(s.ts).toLocaleTimeString());
  const slots = 13;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Metric label="CPU" value={formatPct(latest?.cpu_pct, 2)} />
        <Metric
          label="RAM"
          value={formatMb(latest?.mem_mb)}
          sub={latest ? `límite ${formatMb(latest.mem_limit_mb)}` : undefined}
        />
        <Metric
          label="Red"
          value={`↓ ${rate(data, 'net_rx_b')}`}
          sub={`↑ ${rate(data, 'net_tx_b')}`}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-line bg-surface-2 p-3">
          <div className="mb-2 font-mono text-[11px] text-faint">CPU % · 60 s</div>
          <MiniChart
            values={samples.map((s) => s.cpu_pct)}
            labels={labels}
            min={0}
            capacity={slots}
            height={44}
            format={(v) => `${v.toFixed(2)}%`}
            ariaLabel="CPU del contenedor en el último minuto"
          />
        </div>
        <div className="rounded-lg border border-line bg-surface-2 p-3">
          <div className="mb-2 font-mono text-[11px] text-faint">RAM MB · 60 s</div>
          <MiniChart
            values={samples.map((s) => s.mem_mb)}
            labels={labels}
            min={0}
            capacity={slots}
            height={44}
            color="var(--accent-2)"
            format={(v) => formatMb(v)}
            ariaLabel="Memoria del contenedor en el último minuto"
          />
        </div>
      </div>
      {latest && (
        <p className="font-mono text-[11px] text-faint">
          total red: ↓ {formatBytes(latest.net_rx_b)} · ↑ {formatBytes(latest.net_tx_b)}
        </p>
      )}
    </div>
  );
}

function Logs({ name }: { name: string }) {
  const logs = useContainerLogs(name);
  const [clearedAt, setClearedAt] = useState<number | null>(null);
  const cleared = clearedAt != null && clearedAt === logs.dataUpdatedAt;
  return (
    <LogViewer
      lines={cleared ? [] : logs.data?.lines}
      loading={logs.isFetching}
      error={logs.error?.message}
      updatedAt={logs.dataUpdatedAt || undefined}
      onClear={() => setClearedAt(logs.dataUpdatedAt)}
      onRefresh={() => {
        setClearedAt(null);
        void logs.refetch();
      }}
    />
  );
}

function ContainerSections({
  detail,
  tools,
  onSelect,
}: {
  detail: ContainerDetail;
  tools: Tool[] | undefined;
  onSelect: (s: Selection) => void;
}) {
  const running = detail.status === 'running' || detail.status === 'unhealthy';
  const urlDetected = detail.detected.includes('url');
  return (
    <>
      {detail.depends_on.length > 0 && (
        <Section title="Depende de">
          <div className="flex flex-wrap items-center gap-1 font-mono text-xs">
            {detail.depends_on.map((dep) => (
              <button
                key={dep}
                type="button"
                onClick={() =>
                  onSelect(
                    tools?.some((t) => t.id === dep)
                      ? { kind: 'tool', id: dep }
                      : { kind: 'container', name: dep },
                  )
                }
                className="rounded bg-surface-2 px-1.5 text-accent-ink hover:underline"
              >
                {dep}
              </button>
            ))}
            {detail.detected.includes('depends_on') && (
              <span className="text-[11px] text-faint">· incluye el depends_on de Compose</span>
            )}
          </div>
        </Section>
      )}

      <Section title="Métricas en tiempo real">
        <LiveMetrics name={detail.name} running={running} />
      </Section>

      <Section title="Puertos">
        {detail.ports.length === 0 ? (
          <p className="text-sm text-muted">Sin puertos expuestos.</p>
        ) : (
          <table className="w-full font-mono text-xs">
            <thead className="text-left text-faint">
              <tr>
                <th className="py-1 font-normal">host</th>
                <th className="py-1 font-normal">contenedor</th>
                <th className="py-1 font-normal">proto</th>
              </tr>
            </thead>
            <tbody className="text-ink">
              {detail.ports.map((p) => (
                <tr
                  key={`${p.host_ip}-${p.host_port}-${p.container_port}-${p.protocol}`}
                  className="border-t border-line"
                >
                  <td className="py-1.5">
                    {p.host_port ? (
                      `${p.host_ip ?? '*'}:${p.host_port}`
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </td>
                  <td className="py-1.5">{p.container_port}</td>
                  <td className="py-1.5 text-muted">{p.protocol}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {detail.url && running && <ExternalLink href={detail.url} label="Abrir UI" />}
      </Section>

      <Section title={`Variables de entorno (${detail.env.length})`}>
        {detail.env.length === 0 ? (
          <p className="text-sm text-muted">Sin variables.</p>
        ) : (
          <div className="max-h-60 overflow-auto rounded-lg border border-line">
            <table className="w-full font-mono text-[11px]">
              <tbody>
                {detail.env.map((e) => (
                  <tr key={e.key} className="border-b border-line last:border-0 align-top">
                    <td className="py-1 pr-2 pl-3 text-accent-ink">{e.key}</td>
                    <td
                      className={`py-1 pr-3 break-all ${e.masked ? 'text-faint' : 'text-ink'}`}
                      title={e.masked ? 'Valor oculto (credencial)' : undefined}
                    >
                      {e.value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Logs · últimas 100 líneas">
        <Logs name={detail.name} />
      </Section>

      <Section title="Acciones">
        <div className="flex flex-wrap gap-2">
          {detail.url && running ? (
            <ExternalLink href={detail.url} label="Abrir UI" />
          ) : (
            <span className="text-sm text-faint">Sin UI web configurada.</span>
          )}
          {urlDetected && (
            <span className="self-center font-mono text-[11px] text-faint">
              enlace deducido del puerto publicado · fíjalo con el label dis.url
            </span>
          )}
          {/* TODO: start / stop / restart — fuera del MVP. Necesita el endpoint
              POST /api/containers/{id}/{accion} (ver docker_service.py) y auth. */}
        </div>
      </Section>
    </>
  );
}

function PanelBody({ selection, tools, containers, onSelect }: Omit<Props, 'onClose'>) {
  const tool =
    selection?.kind === 'tool'
      ? tools?.find((t) => t.id === selection.id)
      : tools?.find((t) => selection?.kind === 'container' && t.container === selection.name);
  const containerName =
    selection?.kind === 'container' ? selection.name : (tool?.container ?? null);
  // Mientras la lista de contenedores carga, intentamos el detalle igualmente.
  const known = containerName ? (containers?.some((c) => c.name === containerName) ?? true) : false;
  const detail = useContainerDetail(known ? containerName : null);
  const d = detail.data;

  const title = tool?.name ?? containerName ?? '—';
  const status = d?.status ?? tool?.status ?? 'stopped';
  const icons = tool?.icons ?? d?.icons ?? [];

  return (
    <div className="space-y-6">
      <header className="space-y-2 pr-8">
        <div className="flex items-center gap-2">
          <ServiceIcon icons={icons} name={title} size={28} className="mr-1" />
          <StatusDot status={status} />
          <h2 className="truncate font-mono text-lg font-semibold text-ink">{title}</h2>
          {tool?.is_self && (
            <span className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-faint">
              estás aquí
            </span>
          )}
        </div>
        {d && <div className="truncate font-mono text-xs text-faint">{d.image}</div>}
        <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-muted">
          <span>estado: {STATUS_LABEL[status]}</span>
          {d && <span>activo: {formatUptime(d.uptime_s)}</span>}
          {d?.health && <span>health: {d.health}</span>}
          {d && <span className="text-faint">id {d.id}</span>}
        </div>
        {(tool?.description || d?.description) && (
          <p className="text-sm text-muted">{tool?.description || d?.description}</p>
        )}
      </header>

      {tool && (
        <Section title="Herramienta">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-xs">
            <dt className="text-faint">fase</dt>
            <dd className="text-ink">{tool.stage}</dd>
            <dt className="text-faint">contenedor</dt>
            <dd className="text-ink">{tool.container ?? '—'}</dd>
            <dt className="text-faint">depende de</dt>
            <dd className="flex flex-wrap gap-1">
              {tool.depends_on.length === 0 && <span className="text-ink">—</span>}
              {tool.depends_on.map((dep) => (
                <button
                  key={dep}
                  type="button"
                  onClick={() =>
                    onSelect(
                      tools?.some((t) => t.id === dep)
                        ? { kind: 'tool', id: dep }
                        : { kind: 'container', name: dep },
                    )
                  }
                  className="rounded bg-surface-2 px-1.5 text-accent-ink hover:underline"
                >
                  {dep}
                </button>
              ))}
            </dd>
          </dl>
          {tool.url && !tool.is_self && <ExternalLink href={tool.url} label="Abrir UI" />}
        </Section>
      )}

      {containerName && !known && (
        <p className="rounded-lg border border-line bg-surface-2 p-3 font-mono text-xs text-muted">
          El contenedor <span className="text-ink">{containerName}</span> no existe en Docker.
        </p>
      )}
      {detail.error && <p className="font-mono text-xs text-[#ef4444]">{detail.error.message}</p>}
      {known && !d && !detail.error && (
        <div className="h-40 animate-pulse rounded-lg border border-line bg-surface-2" />
      )}
      {d && <ContainerSections detail={d} tools={tools} onSelect={onSelect} />}
    </div>
  );
}

/**
 * Panel lateral deslizante (no modal): el resto de la página sigue usable.
 * Se cierra con Escape o con un clic fuera que no sea sobre otra tarjeta/nodo.
 */
export function ServicePanel({ selection, tools, containers, onSelect, onClose }: Props) {
  const open = selection != null;
  const panelRef = useRef<HTMLElement>(null);
  // Mantiene el contenido durante la animación de cierre.
  const [shown, setShown] = useState<Selection | null>(selection);
  if (selection && selection !== shown) setShown(selection);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    let down: { x: number; y: number; outside: boolean } | null = null;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      const outside =
        !!target && !panelRef.current?.contains(target) && !target.closest(`[${SELECTABLE_ATTR}]`);
      down = { x: e.clientX, y: e.clientY, outside };
    };
    const onUp = (e: PointerEvent) => {
      // Un arrastre (pan del mapa, mover nodos) no es un "clic fuera".
      if (down?.outside && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5) onClose();
      down = null;
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('pointerup', onUp, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('pointerup', onUp, true);
    };
  }, [open, onClose]);

  return (
    <aside
      ref={panelRef}
      aria-label="Detalle del servicio"
      aria-hidden={!open}
      style={{ maxWidth: PANEL_MAX_WIDTH }}
      className={`fixed top-14 right-0 bottom-0 z-40 flex w-full flex-col border-l border-line bg-surface shadow-2xl shadow-black/40 transition-[transform,visibility] duration-300 ease-out ${
        open ? 'visible translate-x-0' : 'invisible translate-x-full'
      }`}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar panel"
        className="absolute top-4 right-4 z-10 rounded-md px-2 py-1 font-mono text-sm text-faint hover:bg-surface-2 hover:text-ink"
      >
        esc ✕
      </button>
      <div className="flex-1 overflow-y-auto p-6">
        {shown && (
          <PanelBody
            // Remonta al cambiar de servicio: resetea logs limpiados, histórico, etc.
            key={shown.kind === 'tool' ? `t:${shown.id}` : `c:${shown.name}`}
            selection={shown}
            tools={tools}
            containers={containers}
            onSelect={onSelect}
          />
        )}
      </div>
    </aside>
  );
}
