"""Herramientas propias y grafo de servicios.

Combina la config (herramientas, dependencias) con el estado real de Docker.
Si una herramienta declara ``container`` (o hay un contenedor que se llama como
su id), herramienta y contenedor son el mismo nodo en el grafo: hereda estado y
métricas del contenedor.
"""

from __future__ import annotations

from .config import Settings, ToolConfig, resolve_url
from .models import ContainerSummary, Graph, GraphEdge, GraphNode, Tool, ToolStatus


def linked_container(
    tool: ToolConfig, settings: Settings, containers: dict[str, ContainerSummary] | None
) -> str | None:
    """Contenedor de la herramienta: el declarado o, si no declara ninguno, el que
    se llama igual que su id (``caronte`` ↔ contenedor ``caronte``). Sin esto, ese
    contenedor y la herramienta chocarían en el grafo por tener el mismo id."""
    if tool.container:
        return tool.container
    if containers is None or tool.id not in containers:
        return None
    # Si otra herramienta ya lo reclama explícitamente, es suyo.
    claimed = any(t.container == tool.id for t in settings.tools)
    return None if claimed else tool.id


def tool_status(
    tool: ToolConfig, container: str | None, containers: dict[str, ContainerSummary] | None
) -> ToolStatus:
    if tool.self:
        return "running"
    if tool.stage != "operational":
        return tool.stage
    if container and containers is not None:
        summary = containers.get(container)
        return summary.status if summary else "stopped"
    # Operativa sin contenedor asociado (o Docker caído): nos fiamos de la config.
    # TODO: health-check HTTP opcional por herramienta cuando Cerbero exista.
    return "running"


def build_tools(
    settings: Settings, containers: list[ContainerSummary] | None, request_host: str | None
) -> list[Tool]:
    by_name = {c.name: c for c in containers} if containers is not None else None
    tools: list[Tool] = []
    for t in settings.tools:
        container = linked_container(t, settings, by_name)
        tools.append(
            Tool(
                id=t.id,
                name=t.name,
                description=t.description,
                url=None if t.self else resolve_url(t.url, request_host, settings),
                status=tool_status(t, container, by_name),
                stage=t.stage,
                depends_on=t.depends_on,
                container=container,
                is_self=t.self,
            )
        )
    return tools


def build_graph(
    settings: Settings, containers: list[ContainerSummary] | None, request_host: str | None
) -> Graph:
    tools = build_tools(settings, containers, request_host)
    nodes: dict[str, GraphNode] = {}
    # Nombre de contenedor → id de la herramienta que lo "reclama".
    alias: dict[str, str] = {}

    for tool in tools:
        nodes[tool.id] = GraphNode(
            id=tool.id,
            label=tool.name,
            type="tool",
            status=tool.status,
            url=tool.url,
            description=tool.description,
            container=tool.container,
            is_self=tool.is_self,
        )
        if tool.container:
            alias[tool.container] = tool.id

    for c in containers or []:
        if c.name in alias:
            continue
        nodes[c.name] = GraphNode(
            id=c.name,
            label=c.name,
            type="container",
            status=c.status,
            url=resolve_url(c.url, request_host, settings),
            description=c.description or c.image,
            container=c.name,
        )

    raw_edges = [(t.id, dep) for t in tools for dep in t.depends_on]
    raw_edges += [(c.name, dep) for c in containers or [] for dep in c.depends_on]
    raw_edges += [(e.source, e.target) for e in settings.edges]

    edges: list[GraphEdge] = []
    seen: set[tuple[str, str]] = set()
    for source, target in raw_edges:
        source, target = alias.get(source, source), alias.get(target, target)
        for endpoint in (source, target):
            # Dependencia declarada pero sin contenedor: nodo "fantasma" parado,
            # para que la arista se vea (en naranja) en vez de desaparecer.
            if endpoint not in nodes:
                nodes[endpoint] = GraphNode(
                    id=endpoint,
                    label=endpoint,
                    type="container",
                    status="stopped",
                    container=endpoint,
                    description="No encontrado en Docker",
                )
        if (source, target) in seen or source == target:
            continue
        seen.add((source, target))
        edges.append(GraphEdge(source=source, target=target))

    return Graph(nodes=list(nodes.values()), edges=edges, docker_available=containers is not None)
