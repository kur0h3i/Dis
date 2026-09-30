import {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  type FitViewOptions,
  MarkerType,
  MiniMap,
  type NodeTypes,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
  useStoreApi,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useContainers, useGraph } from '../api/hooks';
import type { ContainerSummary, Graph, GraphNode, Selection } from '../api/types';
import { MapLegend } from '../components/MapLegend';
import { MapSearch } from '../components/MapSearch';
import { PANEL_MAX_WIDTH } from '../components/ServicePanel';
import { ServiceNode, type ServiceFlowNode } from '../components/ServiceNode';
import { isDown, STATUS_COLOR } from '../lib/format';
import {
  loadHiddenGroups,
  matchesQuery,
  neighborMap,
  normalizeText,
  saveHiddenGroups,
  STATUS_GROUPS,
  type StatusGroup,
  statusGroup,
} from '../lib/graphFocus';
import {
  clearPositions,
  gridLayout,
  loadPositions,
  NODE_HEIGHT,
  NODE_WIDTH,
  type Positions,
  savePositions,
} from '../lib/graphLayout';
import { nodeMatchesSelection, selectionFor } from '../lib/selection';
import type { Theme } from '../lib/theme';

const EDGE_OK = '#7c3aed';
const EDGE_DOWN = '#f97316';
// Margen superior extra para que la barra de búsqueda y leyenda no tape nodos.
const FIT_VIEW: FitViewOptions = {
  padding: { top: '175px', right: 0.1, bottom: 0.1, left: 0.1 },
  maxZoom: 1,
};

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
        // Los decora `displayNodes` según selección, foco y búsqueda.
        active: false,
        dimmed: false,
        onDetail,
      },
    } satisfies ServiceFlowNode;
  });
}

function MapCanvas({ theme, selection, onSelect }: Props) {
  const graph = useGraph();
  const containers = useContainers();
  const { fitView, getNode, getViewport, setCenter } = useReactFlow<ServiceFlowNode>();
  const store = useStoreApi<ServiceFlowNode>();
  const [nodes, setNodes, onNodesChange] = useNodesState<ServiceFlowNode>([]);
  const nodesReady = useNodesInitialized();
  const [hovered, setHovered] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [hidden, setHidden] = useState(loadHiddenGroups);

  // Sincroniza nodos con los datos al vuelo (patrón "ajustar estado en render",
  // sin useEffect): solo cuando cambia alguna de las entradas.
  const [synced, setSynced] = useState<{
    graph?: Graph;
    containers?: ContainerSummary[];
    layoutVersion: number;
  }>({ layoutVersion: 0 });
  const [layoutVersion, setLayoutVersion] = useState(0);

  if (
    graph.data &&
    (synced.graph !== graph.data ||
      synced.containers !== containers.data ||
      synced.layoutVersion !== layoutVersion)
  ) {
    const forceLayout = synced.layoutVersion !== layoutVersion;
    setSynced({ graph: graph.data, containers: containers.data, layoutVersion });
    setNodes((prev) => mergeNodes(prev, graph.data!, containers.data, onSelect, forceLayout));
  }

  const neighbors = useMemo(() => neighborMap(graph.data?.edges ?? []), [graph.data]);
  const selectedId = useMemo(
    () => graph.data?.nodes.find((n) => nodeMatchesSelection(n, selection))?.id ?? null,
    [graph.data, selection],
  );
  const q = normalizeText(query.trim());
  // Foco: el nodo bajo el ratón y, si no hay búsqueda en curso, el seleccionado.
  const hoveredId = hovered && graph.data?.nodes.some((n) => n.id === hovered) ? hovered : null;
  const focusId = hoveredId ?? (q ? null : selectedId);

  const counts = useMemo(() => {
    const out = Object.fromEntries(STATUS_GROUPS.map((g) => [g.group, 0])) as Record<
      StatusGroup,
      number
    >;
    for (const n of graph.data?.nodes ?? []) out[statusGroup(n.status)]++;
    return out;
  }, [graph.data]);

  // Con foco se ven el nodo y sus vecinos directos; con búsqueda, las coincidencias.
  const displayNodes = useMemo(() => {
    const near = focusId ? neighbors.get(focusId) : undefined;
    return nodes.map((n) => {
      const g = n.data.node;
      const dimmed = focusId
        ? g.id !== focusId && !near?.has(g.id)
        : q
          ? !matchesQuery(g, q)
          : false;
      const active = g.id === selectedId;
      const isHidden = hidden.has(statusGroup(g.status));
      if (n.data.dimmed === dimmed && n.data.active === active && !!n.hidden === isHidden) return n;
      return { ...n, hidden: isHidden, data: { ...n.data, dimmed, active } };
    });
  }, [nodes, neighbors, focusId, q, selectedId, hidden]);

  const edges: Edge[] = useMemo(() => {
    const byId = new Map((graph.data?.nodes ?? []).map((n) => [n.id, n]));
    const isHidden = (id: string) => {
      const n = byId.get(id);
      return n ? hidden.has(statusGroup(n.status)) : false;
    };
    const matches = (id: string) => {
      const n = byId.get(id);
      return n ? matchesQuery(n, q) : false;
    };
    return (graph.data?.edges ?? []).map((e) => {
      const target = byId.get(e.target);
      const down = target ? isDown(target.status) : true;
      const color = down ? EDGE_DOWN : EDGE_OK;
      const incident = focusId != null && (e.source === focusId || e.target === focusId);
      const faded = focusId ? !incident : q ? !(matches(e.source) && matches(e.target)) : false;
      return {
        id: `${e.source}->${e.target}`,
        source: e.source,
        target: e.target,
        hidden: isHidden(e.source) || isHidden(e.target),
        animated: down,
        className: faded ? 'dis-edge-faded' : undefined,
        zIndex: incident ? 1 : 0,
        style: { stroke: color, strokeWidth: incident ? 3 : 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 18, height: 18 },
        label: down ? 'caído' : undefined,
        labelStyle: { fill: EDGE_DOWN, fontFamily: 'var(--font-mono)', fontSize: 10 },
        labelBgStyle: { fill: 'var(--surface)' },
      } satisfies Edge;
    });
  }, [graph.data, hidden, focusId, q]);

  /**
   * Mueve la vista para que el nodo quede en la parte del mapa que no tapa el
   * panel lateral. Sin `always`, solo si ahora mismo no se ve entero.
   */
  const reveal = useCallback(
    (id: string, always = false) => {
      const node = getNode(id);
      if (!node || (!always && !node.measured?.width)) return;
      const w = node.measured?.width ?? NODE_WIDTH;
      const h = node.measured?.height ?? NODE_HEIGHT;
      const { width, height } = store.getState();
      const panelW = Math.min(PANEL_MAX_WIDTH, window.innerWidth);
      const visibleW = width - panelW;
      // En pantallas estrechas el panel lo tapa todo: no hay hueco donde centrar.
      if (visibleW < w / 2) return;

      const { x: vx, y: vy, zoom } = getViewport();
      const left = node.position.x * zoom + vx;
      const top = node.position.y * zoom + vy;
      const margin = 16;
      const fits =
        left >= margin &&
        top >= margin &&
        left + w * zoom <= visibleW - margin &&
        top + h * zoom <= height - margin;
      if (fits && !always) return;
      void setCenter(node.position.x + w / 2 + panelW / (2 * zoom), node.position.y + h / 2, {
        zoom,
        duration: 400,
      });
    },
    [getNode, getViewport, setCenter, store],
  );

  // Al seleccionar (clic en el mapa, tarjeta del dashboard, dependencia del
  // panel...), que el nodo no quede escondido bajo el panel. Espera a que los
  // nodos estén medidos (y encuadrados) si se llega al mapa con algo seleccionado.
  useEffect(() => {
    if (selectedId && nodesReady) reveal(selectedId);
  }, [selectedId, nodesReady, reveal]);

  const toggleGroup = (group: StatusGroup) => {
    const next = new Set(hidden);
    if (!next.delete(group)) next.add(group);
    setHidden(next);
    saveHiddenGroups(next);
    setHovered(null);
  };

  // Buscar un nodo oculto por los filtros vuelve a mostrar su grupo.
  const pickFromSearch = (node: GraphNode) => {
    const group = statusGroup(node.status);
    if (hidden.has(group)) toggleGroup(group);
    setQuery('');
    onSelect(selectionFor(node));
    reveal(node.id, true);
  };

  const persist = useCallback((current: ServiceFlowNode[]) => {
    const positions: Positions = {};
    for (const n of current)
      positions[n.id] = { x: Math.round(n.position.x), y: Math.round(n.position.y) };
    savePositions(positions);
  }, []);

  const resetLayout = () => {
    clearPositions();
    setLayoutVersion((v) => v + 1);
    // Se encola hasta que lleguen los nodos recolocados.
    void fitView({ ...FIT_VIEW, duration: 400 });
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
        nodes={displayNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={(_, __, dragged) => {
          // `nodes` aún no refleja la última posición: la combinamos a mano.
          const moved = new Map(dragged.map((n) => [n.id, n.position]));
          persist(nodes.map((n) => ({ ...n, position: moved.get(n.id) ?? n.position })));
        }}
        onNodeClick={(_, node) => onSelect(selectionFor(node.data.node))}
        onNodeMouseEnter={(_, node) => setHovered(node.id)}
        onNodeMouseLeave={() => setHovered(null)}
        // En pantallas táctiles no siempre llega el mouseleave.
        onPaneClick={() => setHovered(null)}
        colorMode={theme}
        fitView
        fitViewOptions={FIT_VIEW}
        minZoom={0.2}
        maxZoom={2}
        nodesConnectable={false}
        edgesFocusable={false}
        proOptions={{ hideAttribution: true }}
        style={{ background: 'var(--bg)' }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color="var(--border)" />
        <Controls showInteractive={false} fitViewOptions={{ ...FIT_VIEW, duration: 300 }} />
        <MiniMap
          pannable
          zoomable
          className="max-sm:hidden!"
          nodeColor={(n) => STATUS_COLOR[(n as ServiceFlowNode).data.node.status]}
          maskColor="color-mix(in srgb, var(--bg) 70%, transparent)"
          style={{ background: 'var(--surface)' }}
        />
        <Panel position="top-left" className="w-[min(23rem,calc(100vw-30px))]">
          {/* Seleccionable: buscar o filtrar no cierra el panel lateral. */}
          <div
            data-dis-selectable
            className="space-y-2 rounded-lg border border-line bg-surface/90 p-2.5 font-mono text-[11px] text-muted shadow backdrop-blur"
          >
            <MapSearch
              nodes={graph.data?.nodes ?? []}
              query={query}
              onQueryChange={setQuery}
              onPick={pickFromSearch}
            />
            <MapLegend counts={counts} hidden={hidden} onToggle={toggleGroup} />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-4" style={{ backgroundColor: EDGE_OK }} /> depende de
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-4" style={{ backgroundColor: EDGE_DOWN }} /> destino caído
              </span>
              <button
                type="button"
                onClick={resetLayout}
                title="Recolocar los nodos y encuadrar el mapa"
                className="ml-auto rounded-md border border-line px-2 py-1 text-ink hover:border-accent/60"
              >
                Reordenar
              </button>
            </div>
            {graph.data && !graph.data.docker_available && (
              <p className="text-[#ef4444]">Docker no disponible</p>
            )}
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}

export function MapView(props: Props) {
  return (
    <ReactFlowProvider>
      <MapCanvas {...props} />
    </ReactFlowProvider>
  );
}
