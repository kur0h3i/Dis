import {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  MarkerType,
  MiniMap,
  type NodeTypes,
  Panel,
  ReactFlow,
  useNodesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useMemo, useState } from 'react';
import { useContainers, useGraph } from '../api/hooks';
import type { ContainerSummary, Graph, Selection } from '../api/types';
import { ServiceNode, type ServiceFlowNode } from '../components/ServiceNode';
import { isDown, STATUS_COLOR } from '../lib/format';
import {
  clearPositions,
  gridLayout,
  loadPositions,
  type Positions,
  savePositions,
} from '../lib/graphLayout';
import { sameSelection, selectionFor } from '../lib/selection';
import type { Theme } from '../lib/theme';

const EDGE_OK = '#7c3aed';
const EDGE_DOWN = '#f97316';

const nodeTypes: NodeTypes = { service: ServiceNode };

interface Props {
  theme: Theme;
  selection: Selection | null;
  onSelect: (s: Selection) => void;
}

/** Fusiona el grafo nuevo con los nodos actuales conservando posición y medidas. */
function mergeNodes(
  prev: ServiceFlowNode[],
  graph: Graph,
  containers: ContainerSummary[] | undefined,
  selection: Selection | null,
  onDetail: (s: Selection) => void,
  forceLayout: boolean,
): ServiceFlowNode[] {
  const byId = new Map(prev.map((n) => [n.id, n]));
  const saved = forceLayout ? {} : loadPositions();
  const auto = gridLayout(graph.nodes, graph.edges);
  // Nodos nuevos sin posición guardada: debajo de todo lo que ya existe.
  const known = graph.nodes.filter((n) => byId.has(n.id) || saved[n.id]);
  const needsAuto = graph.nodes.some((n) => !byId.has(n.id) && !saved[n.id]);
  const shiftY =
    needsAuto && known.length > 0
      ? Math.max(...known.map((n) => (byId.get(n.id)?.position ?? saved[n.id]!).y)) + 240
      : 0;
  const containerByName = new Map((containers ?? []).map((c) => [c.name, c]));

  return graph.nodes.map((g) => {
    const existing = forceLayout ? undefined : byId.get(g.id);
    const fallback = auto[g.id] ?? { x: 0, y: 0 };
    const position =
      existing?.position ??
      saved[g.id] ??
      (known.length > 0 ? { x: fallback.x, y: fallback.y + shiftY } : fallback);
    return {
      ...(existing ?? {}),
      id: g.id,
      type: 'service',
      position,
      data: {
        node: g,
        container: g.container ? containerByName.get(g.container) : undefined,
        active: sameSelection(selection, selectionFor(g)),
        onDetail,
      },
    } satisfies ServiceFlowNode;
  });
}

export function MapView({ theme, selection, onSelect }: Props) {
  const graph = useGraph();
  const containers = useContainers();
  const [nodes, setNodes, onNodesChange] = useNodesState<ServiceFlowNode>([]);

  // Sincroniza nodos con los datos al vuelo (patrón "ajustar estado en render",
  // sin useEffect): solo cuando cambia alguna de las entradas.
  const [synced, setSynced] = useState<{
    graph?: Graph;
    containers?: ContainerSummary[];
    selection: Selection | null;
    layoutVersion: number;
  }>({ selection: null, layoutVersion: 0 });
  const [layoutVersion, setLayoutVersion] = useState(0);

  if (
    graph.data &&
    (synced.graph !== graph.data ||
      synced.containers !== containers.data ||
      synced.selection !== selection ||
      synced.layoutVersion !== layoutVersion)
  ) {
    const forceLayout = synced.layoutVersion !== layoutVersion;
    setSynced({ graph: graph.data, containers: containers.data, selection, layoutVersion });
    setNodes((prev) =>
      mergeNodes(prev, graph.data!, containers.data, selection, onSelect, forceLayout),
    );
  }

  const edges: Edge[] = useMemo(() => {
    const status = new Map((graph.data?.nodes ?? []).map((n) => [n.id, n.status]));
    return (graph.data?.edges ?? []).map((e) => {
      const targetStatus = status.get(e.target);
      const down = targetStatus ? isDown(targetStatus) : true;
      const color = down ? EDGE_DOWN : EDGE_OK;
      return {
        id: `${e.source}->${e.target}`,
        source: e.source,
        target: e.target,
        animated: down,
        style: { stroke: color, strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 18, height: 18 },
        label: down ? 'caído' : undefined,
        labelStyle: { fill: EDGE_DOWN, fontFamily: 'var(--font-mono)', fontSize: 10 },
        labelBgStyle: { fill: 'var(--surface)' },
      } satisfies Edge;
    });
  }, [graph.data]);

  const persist = useCallback((current: ServiceFlowNode[]) => {
    const positions: Positions = {};
    for (const n of current)
      positions[n.id] = { x: Math.round(n.position.x), y: Math.round(n.position.y) };
    savePositions(positions);
  }, []);

  const resetLayout = () => {
    clearPositions();
    setLayoutVersion((v) => v + 1);
  };

  if (graph.error && !graph.data) {
    return (
      <div className="p-6 font-mono text-sm text-[#ef4444]">
        Grafo no disponible: {graph.error.message}
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={(_, __, dragged) => {
          // `nodes` aún no refleja la última posición: la combinamos a mano.
          const moved = new Map(dragged.map((n) => [n.id, n.position]));
          persist(nodes.map((n) => ({ ...n, position: moved.get(n.id) ?? n.position })));
        }}
        onNodeClick={(_, node) => onSelect(selectionFor(node.data.node))}
        colorMode={theme}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        minZoom={0.2}
        maxZoom={2}
        nodesConnectable={false}
        edgesFocusable={false}
        proOptions={{ hideAttribution: true }}
        style={{ background: 'var(--bg)' }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color="var(--border)" />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          nodeColor={(n) => STATUS_COLOR[(n as ServiceFlowNode).data.node.status]}
          maskColor="color-mix(in srgb, var(--bg) 70%, transparent)"
          style={{ background: 'var(--surface)' }}
        />
        <Panel position="top-right">
          <div className="space-y-2 rounded-lg border border-line bg-surface/90 p-3 font-mono text-[11px] text-muted shadow backdrop-blur">
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {(['running', 'restarting', 'unhealthy', 'stopped'] as const).map((s) => (
                <span key={s} className="inline-flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: STATUS_COLOR[s] }}
                  />
                  {s}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-4" style={{ backgroundColor: EDGE_OK }} /> depende de
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-4" style={{ backgroundColor: EDGE_DOWN }} /> destino caído
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={resetLayout}
                className="rounded-md border border-line px-2 py-1 text-ink hover:border-accent/60"
              >
                Reordenar
              </button>
              {graph.data && !graph.data.docker_available && (
                <span className="text-[#ef4444]">Docker no disponible</span>
              )}
            </div>
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}
