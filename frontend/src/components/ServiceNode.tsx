import { Handle, type Node, type NodeProps, Position, useStore } from '@xyflow/react';
import { memo } from 'react';
import type { ContainerSummary, GraphNode, Selection } from '../api/types';
import { formatMb, formatPct, formatUptime, severityEdge, STATUS_LABEL } from '../lib/format';
import { NODE_HEIGHT, NODE_WIDTH } from '../lib/graphLayout';
import { selectionFor } from '../lib/selection';
import { ExternalLink } from './ExternalLink';
import { ServiceIcon } from './ServiceIcon';
import { StatusDot } from './StatusDot';

const COMPACT_ZOOM = 0.75; // por debajo, el texto del nodo completo baja de ~10 px en pantalla

export type ServiceNodeData = {
  node: GraphNode;
  container?: ContainerSummary;
  active: boolean;
  /** Fuera del foco actual (hover, selección o búsqueda): se atenúa. */
  dimmed: boolean;
  onDetail: (s: Selection) => void;
};

export type ServiceFlowNode = Node<ServiceNodeData, 'service'>;

/** Nodo del mapa: ventana flotante con el estado y las métricas del servicio. */
function ServiceNodeImpl({ data, selected }: NodeProps<ServiceFlowNode>) {
  const { node, container: c, active, dimmed, onDetail } = data;
  const inactive = node.status === 'development' || node.status === 'idea';
  const running = node.status === 'running' || node.status === 'unhealthy';
  // Booleano: solo re-renderiza al cruzar el umbral, no a cada paso de zoom.
  const compact = useStore((s) => s.transform[2] < COMPACT_ZOOM);

  return (
    <div
      data-dis-selectable
      style={compact ? { width: NODE_WIDTH, height: NODE_HEIGHT } : { width: NODE_WIDTH }}
      className={`overflow-hidden rounded-lg border bg-surface shadow-lg shadow-black/20 transition-[opacity,border-color,box-shadow] duration-200 ${
        active
          ? 'border-accent ring-2 ring-accent/30'
          : selected
            ? 'border-accent-2'
            : 'border-line'
      } ${severityEdge(node.status)} ${inactive ? 'border-dashed' : ''} ${dimmed ? 'opacity-25' : inactive && !active ? 'opacity-55' : ''}`}
    >
      <Handle type="target" position={Position.Top} isConnectable={false} className="opacity-0!" />

      {compact ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-3">
          <div className="flex items-center gap-2">
            <ServiceIcon icons={node.icons} name={node.label} size={40} />
            <StatusDot status={node.status} />
          </div>
          <span className="line-clamp-2 max-w-full text-center font-mono text-[28px] leading-tight font-semibold break-all text-ink">
            {node.label}
          </span>
          {/* Único acceso por teclado al panel desde un nodo compacto. */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDetail(selectionFor(node));
            }}
            className="nodrag sr-only rounded-md px-2 py-1 font-mono text-xs text-muted focus:not-sr-only"
          >
            Ver detalle →
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-3 py-2">
            <ServiceIcon icons={node.icons} name={node.label} size={22} />
            <StatusDot status={node.status} />
            <span className="truncate font-mono text-sm font-semibold text-ink">{node.label}</span>
            <span className="ml-auto shrink-0 font-mono text-[10px] text-faint uppercase">
              {node.is_self ? 'aquí' : node.type === 'tool' ? 'tool' : 'docker'}
            </span>
          </div>

          <div className="space-y-1.5 px-3 py-2.5 font-mono text-[11px]">
            {c ? (
              <dl className="grid grid-cols-3 gap-1">
                <div>
                  <dt className="text-faint">cpu</dt>
                  <dd className="text-ink">{formatPct(c.cpu_pct)}</dd>
                </div>
                <div>
                  <dt className="text-faint">ram</dt>
                  <dd className="text-ink">{formatMb(c.mem_mb)}</dd>
                </div>
                <div>
                  <dt className="text-faint">up</dt>
                  <dd className="text-ink">{formatUptime(c.uptime_s)}</dd>
                </div>
              </dl>
            ) : (
              <p className="line-clamp-2 min-h-[2lh] text-muted">{node.description ?? '—'}</p>
            )}
            <div className="text-faint">
              estado: <span className="text-muted">{STATUS_LABEL[node.status]}</span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2">
            {node.url && running && !node.is_self ? (
              <ExternalLink href={node.url} className="nodrag" />
            ) : (
              <span className="font-mono text-[11px] text-faint">
                {node.is_self ? 'estás aquí' : 'sin UI'}
              </span>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDetail(selectionFor(node));
              }}
              className="nodrag rounded-md px-2 py-1 font-mono text-xs text-muted hover:bg-surface-2 hover:text-ink"
            >
              Ver detalle →
            </button>
          </div>
        </>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={false}
        className="opacity-0!"
      />
    </div>
  );
}

export const ServiceNode = memo(ServiceNodeImpl);
