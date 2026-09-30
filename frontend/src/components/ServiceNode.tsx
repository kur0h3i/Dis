import { Handle, type Node, type NodeProps, Position } from '@xyflow/react';
import { memo } from 'react';
import type { ContainerSummary, GraphNode, Selection } from '../api/types';
import { formatMb, formatPct, formatUptime, STATUS_LABEL } from '../lib/format';
import { NODE_WIDTH } from '../lib/graphLayout';
import { selectionFor } from '../lib/selection';
import { ExternalLink } from './ExternalLink';
import { StatusDot } from './StatusDot';

export type ServiceNodeData = {
  node: GraphNode;
  container?: ContainerSummary;
  active: boolean;
  onDetail: (s: Selection) => void;
};

export type ServiceFlowNode = Node<ServiceNodeData, 'service'>;

/** Nodo del mapa: ventana flotante con el estado y las métricas del servicio. */
function ServiceNodeImpl({ data, selected }: NodeProps<ServiceFlowNode>) {
  const { node, container: c, active, onDetail } = data;
  const inactive = node.status === 'development' || node.status === 'idea';
  const running = node.status === 'running' || node.status === 'unhealthy';

  return (
    <div
      data-dis-selectable
      style={{ width: NODE_WIDTH }}
      className={`overflow-hidden rounded-lg border bg-surface shadow-lg shadow-black/20 transition-colors ${
        active
          ? 'border-accent ring-2 ring-accent/30'
          : selected
            ? 'border-accent-2'
            : 'border-line'
      } ${inactive ? 'opacity-55' : ''}`}
    >
      <Handle type="target" position={Position.Top} isConnectable={false} className="opacity-0!" />

      <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-3 py-2">
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
