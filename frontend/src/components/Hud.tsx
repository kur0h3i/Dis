import { useEffect, useState } from 'react';
import type { Alerts, ContainerSummary, Resources, Tool } from '../api/types';
import { formatUptime, STATUS_LABEL } from '../lib/format';
import { ServiceIcon } from './ServiceIcon';
import { StatusDot } from './StatusDot';

/** Panel HUD con esquinas luminosas (ver .hud en index.css). */
export function Hud({
  title,
  meta,
  className = '',
  children,
}: {
  title?: string;
  meta?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`hud ${className}`}>
      {title && (
        <h2 className="hud-title">
          {title}
          {meta && <i>{meta}</i>}
        </h2>
      )}
      {children}
    </section>
  );
}

function useClock(): string {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now.toLocaleTimeString('es-ES');
}

interface BarProps {
  resources: Resources | undefined;
  containers: ContainerSummary[] | undefined;
  tools: Tool[] | undefined;
  offline: boolean;
}

/** Cinta de estado: enlace, reloj y rótulo con datos reales del servidor. */
export function StatusStrip({ resources, containers, tools, offline }: BarProps) {
  const clock = useClock();
  const parts: string[] = [];
  if (resources) {
    parts.push(`CPU ${resources.cpu_pct.toFixed(0)} %`);
    parts.push(`RAM ${resources.ram_used_gb.toFixed(1)}/${resources.ram_total_gb.toFixed(0)} GB`);
    for (const d of resources.disks) parts.push(`${d.mountpoint} ${d.pct.toFixed(0)} %`);
  }
  if (containers) {
    parts.push(
      `Docker ${containers.filter((c) => c.status === 'running').length}/${containers.length} en marcha`,
    );
  }
  if (tools)
    parts.push(`${tools.filter((t) => t.stage === 'operational').length} herramientas operativas`);
  return (
    <div className="cy-bar">
      <span className="flex items-center gap-2">
        <span className={`cy-led ${offline ? 'cy-led-bad' : ''}`} />
        {offline ? 'SIN ENLACE' : 'ENLACE SEGURO'}
      </span>
      <span>{clock}</span>
      <div className="cy-ticker">
        <span>{parts.join(' · ') || 'esperando datos…'}</span>
      </div>
    </div>
  );
}

/** Menú de módulos: las herramientas del ecosistema con su luz de estado. */
export function ModulesNav({
  tools,
  selectedId,
  onSelect,
}: {
  tools: Tool[] | undefined;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const list = tools ?? [];
  const online = list.filter((t) => t.status === 'running').length;
  return (
    <Hud title="MÓDULOS" meta={`${online} en línea`}>
      <ul className="cy-nav">
        {list.map((t, i) => {
          const operational = t.stage === 'operational';
          const content = (
            <>
              <span className="cy-code">{`${t.name[0]?.toUpperCase() ?? '?'}-${String(i + 1).padStart(2, '0')}`}</span>
              <span className="cy-name">
                <ServiceIcon icons={t.icons} name={t.name} size={18} />
                {t.name.toUpperCase()}
              </span>
              <StatusDot status={t.status} />
              <span className="cy-desc">
                {t.is_self
                  ? 'estás aquí'
                  : operational
                    ? t.description
                    : `${t.description} · ${STATUS_LABEL[t.status]}`}
              </span>
            </>
          );
          return (
            <li key={t.id}>
              {operational ? (
                <button
                  type="button"
                  data-dis-selectable
                  onClick={() => onSelect(t.id)}
                  aria-pressed={selectedId === t.id}
                  className={`cy-mod ${selectedId === t.id ? 'on' : ''}`}
                >
                  {content}
                </button>
              ) : (
                <div className="cy-mod off" aria-disabled>
                  {content}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Hud>
  );
}

/** Barras de la carga de CPU de los últimos 5 min (datos reales). */
export function LoadBars({ resources }: { resources: Resources | undefined }) {
  const values = resources?.history_5m.map((s) => s.cpu_pct) ?? [];
  return (
    <Hud title="CARGA" meta="cpu · 5 min">
      <div className="cy-bars" role="img" aria-label="CPU de los últimos 5 minutos">
        {values.length === 0 && <span style={{ height: '8%' }} />}
        {values.map((v, i) => (
          <span key={i} style={{ height: `${Math.max(6, Math.min(100, v))}%` }} />
        ))}
      </div>
    </Hud>
  );
}

function hash(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/** Radar: un blip por contenedor (posición fija por nombre, color por estado). */
export function ServiceRadar({ containers }: { containers: ContainerSummary[] | undefined }) {
  const list = containers ?? [];
  return (
    <Hud title="ESCANEO" meta={`${list.length} nodos`}>
      <div className="cy-radar" role="img" aria-label={`${list.length} contenedores detectados`}>
        {list.map((c) => {
          const h = hash(c.name);
          const ang = (h % 360) * (Math.PI / 180);
          const r = 18 + ((h >> 9) % 28);
          return (
            <i
              key={c.id}
              title={`${c.name}: ${STATUS_LABEL[c.status]}`}
              className={c.status === 'running' ? '' : 'cy-blip-off'}
              style={{ left: `${50 + r * Math.cos(ang)}%`, top: `${50 + r * Math.sin(ang)}%` }}
            />
          );
        })}
      </div>
    </Hud>
  );
}

/** Consola lateral: estado actual de cada servicio y alertas de Cerbero. */
export function EventConsole({
  containers,
  alerts,
}: {
  containers: ContainerSummary[] | undefined;
  alerts: Alerts | undefined;
}) {
  const list = containers ?? [];
  return (
    <Hud title="CONSOLA" meta="estado actual">
      <div className="cy-log">
        {list.map((c) => (
          <p key={c.id}>
            <b>{c.name}</b>{' '}
            {c.status === 'running' ? (
              <em>{STATUS_LABEL[c.status]}</em>
            ) : (
              <u>{STATUS_LABEL[c.status]}</u>
            )}
            {c.uptime_s != null && <span className="cy-dim"> · {formatUptime(c.uptime_s)}</span>}
          </p>
        ))}
        <p className="cy-dim">
          cerbero: {alerts?.connected ? `${alerts.alerts.length} alertas` : 'no conectado'}
        </p>
        <p className="cy-cur" />
      </div>
    </Hud>
  );
}
