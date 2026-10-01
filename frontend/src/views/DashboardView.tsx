import { useState } from 'react';
import type { Alerts, ContainerSummary, Resources, Selection, Tool } from '../api/types';
import { AlertsPanel } from '../components/AlertsPanel';
import { ContainerCard } from '../components/ContainerCard';
import { MiniChart } from '../components/MiniChart';
import { ResourceBar } from '../components/ResourceBar';
import { ToolCard } from '../components/ToolCard';
import { isActive, readSortMode, saveSortMode, sortContainers } from '../lib/sortContainers';

// Muestras de 10 s en 5 minutos: la sparkline crece de derecha a izquierda.
const HISTORY_SLOTS = 30;

interface Query<T> {
  data: T | undefined;
  error: Error | null;
  isLoading: boolean;
}

interface Props {
  resources: Query<Resources>;
  containers: Query<ContainerSummary[]>;
  tools: Query<Tool[]>;
  alerts: Query<Alerts>;
  selection: Selection | null;
  onSelect: (s: Selection) => void;
}

function timeLabel(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function SectionTitle({
  title,
  meta,
  action,
}: {
  title: string;
  meta?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-4">
      <h2 className="font-mono text-xs font-semibold tracking-[0.2em] text-faint uppercase">
        {title}
      </h2>
      <div className="flex items-baseline gap-3">
        {meta && <span className="font-mono text-xs text-faint">{meta}</span>}
        {action}
      </div>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-[#ef4444]/40 bg-[#ef4444]/5 p-4 font-mono text-xs text-[#ef4444]">
      {message}
    </div>
  );
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg border border-line bg-surface ${className}`} />;
}

function ContainerGroup({
  label,
  items,
  selectedContainer,
  onSelect,
  emptyText,
}: {
  label: string;
  items: ContainerSummary[];
  selectedContainer: string | null;
  onSelect: (s: Selection) => void;
  emptyText: string;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="font-mono text-[11px] text-faint">{label}</span>
        <span className="font-mono text-[11px] text-faint">· {items.length}</span>
        <span className="h-px flex-1 bg-line" />
      </div>
      {items.length === 0 ? (
        <p className="font-mono text-xs text-faint">{emptyText}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((c) => (
            <ContainerCard
              key={c.id}
              container={c}
              selected={selectedContainer === c.name}
              onSelect={(name) => onSelect({ kind: 'container', name })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ResourcesSection({ q }: { q: Query<Resources> }) {
  if (q.error && !q.data) return <ErrorBox message={`Recursos: ${q.error.message}`} />;
  if (!q.data) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );
  }
  const r = q.data;
  const labels = r.history_5m.map((s) => timeLabel(s.ts));
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-xs text-muted">CPU</span>
          <span className="font-mono text-[11px] text-faint">{r.cpu_count} hilos</span>
        </div>
        <div className="font-mono text-3xl font-semibold text-ink">
          {r.cpu_pct.toFixed(0)}
          <span className="text-lg text-faint">%</span>
        </div>
        <MiniChart
          values={r.history_5m.map((s) => s.cpu_pct)}
          labels={labels}
          min={0}
          max={100}
          capacity={HISTORY_SLOTS}
          format={(v) => `${v.toFixed(1)}%`}
          ariaLabel="Uso de CPU en los últimos 5 minutos"
        />
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-xs text-muted">RAM</span>
          <span className="font-mono text-[11px] text-faint">
            libre {(r.ram_total_gb - r.ram_used_gb).toFixed(1)} GB
          </span>
        </div>
        <div className="font-mono text-3xl font-semibold text-ink">
          {r.ram_used_gb.toFixed(1)}
          <span className="text-lg text-faint"> / {r.ram_total_gb.toFixed(0)} GB</span>
        </div>
        <ResourceBar label="en uso" pct={r.ram_pct} />
        <MiniChart
          values={r.history_5m.map((s) => s.ram_used_gb)}
          labels={labels}
          min={0}
          max={r.ram_total_gb}
          capacity={HISTORY_SLOTS}
          height={32}
          format={(v) => `${v.toFixed(2)} GB`}
          ariaLabel="RAM usada en los últimos 5 minutos"
        />
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
        <span className="font-mono text-xs text-muted">Discos</span>
        {r.disks.length === 0 && <p className="text-sm text-faint">Sin discos configurados.</p>}
        <div className="space-y-3">
          {r.disks.map((d) => (
            <ResourceBar
              key={d.mountpoint}
              label={d.mountpoint}
              pct={d.pct}
              detail={`${d.used_gb.toFixed(0)}/${d.total_gb.toFixed(0)} GB`}
              warnAt={80}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function DashboardView({
  resources,
  containers,
  tools,
  alerts,
  selection,
  onSelect,
}: Props) {
  const [sortMode, setSortMode] = useState(readSortMode);
  const rawList = containers.data ?? [];
  const list = sortContainers(rawList, sortMode);
  const runningCount = rawList.filter((c) => c.status === 'running').length;
  const activeCount = rawList.filter(isActive).length;
  const selectedContainer = selection?.kind === 'container' ? selection.name : null;

  const toggleSort = () => {
    setSortMode((prev) => {
      const next = prev === 'active-first' ? 'default' : 'active-first';
      saveSortMode(next);
      return next;
    });
  };

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-10 px-4 py-6 sm:px-6">
      <section>
        <SectionTitle title="Recursos del servidor" meta="cada 10 s · últimos 5 min" />
        <ResourcesSection q={resources} />
      </section>

      <section>
        <SectionTitle
          title="Servicios Docker"
          meta={containers.data ? `${runningCount}/${rawList.length} en marcha` : undefined}
          action={
            rawList.length > 1 ? (
              <button
                type="button"
                onClick={toggleSort}
                aria-pressed={sortMode === 'active-first'}
                title={
                  sortMode === 'active-first'
                    ? 'Orden por defecto'
                    : 'Primero los que se pueden abrir (con UI web)'
                }
                className={`rounded-md border px-2 py-1 font-mono text-[11px] transition-colors ${
                  sortMode === 'active-first'
                    ? 'border-accent/60 bg-accent/10 text-accent-ink'
                    : 'border-line text-muted hover:border-accent/40 hover:text-ink'
                }`}
              >
                {sortMode === 'active-first'
                  ? `abribles primero · ${activeCount}`
                  : 'ordenar: abribles primero'}
              </button>
            ) : undefined
          }
        />
        {containers.error && <ErrorBox message={containers.error.message} />}
        {!containers.data && !containers.error && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-36" />
            <Skeleton className="h-36" />
            <Skeleton className="h-36" />
          </div>
        )}
        {containers.data && list.length === 0 && (
          <p className="text-sm text-muted">No hay contenedores.</p>
        )}
        {list.length > 0 &&
          (sortMode === 'active-first' ? (
            <div className="space-y-6">
              <ContainerGroup
                label="Abribles · con UI web"
                items={list.filter(isActive)}
                selectedContainer={selectedContainer}
                onSelect={onSelect}
                emptyText="Ninguno en marcha con UI web."
              />
              <ContainerGroup
                label="Pasivos · sin UI web"
                items={list.filter((c) => !isActive(c))}
                selectedContainer={selectedContainer}
                onSelect={onSelect}
                emptyText="Ninguno."
              />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((c) => (
                <ContainerCard
                  key={c.id}
                  container={c}
                  selected={selectedContainer === c.name}
                  onSelect={(name) => onSelect({ kind: 'container', name })}
                />
              ))}
            </div>
          ))}
      </section>

      <section>
        <SectionTitle title="Herramientas" meta="ecosistema server-kuro" />
        {tools.error && <ErrorBox message={tools.error.message} />}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {!tools.data && !tools.error && (
            <>
              <Skeleton className="h-28" />
              <Skeleton className="h-28" />
              <Skeleton className="h-28" />
            </>
          )}
          {tools.data?.map((t) => (
            <ToolCard key={t.id} tool={t} onSelect={(id) => onSelect({ kind: 'tool', id })} />
          ))}
        </div>
        <div className="mt-4">
          <AlertsPanel alerts={alerts.data} loading={alerts.isLoading} />
        </div>
      </section>
    </div>
  );
}
