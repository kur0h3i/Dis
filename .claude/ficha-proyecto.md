# Ficha del proyecto — Dis

> Ficha de contexto para los agentes (arquitecto, disenador, programador, revisor, viabilidad).
> Creada a partir del estado real del repo. Revísala y corrígela si algo no cuadra con tu realidad.

## Qué es
**Dis** es el dashboard central de **server-kuro**: una única página web que muestra todos los
servicios Docker activos y las herramientas propias del ecosistema, con acceso directo a cada uno
y su estado de un vistazo. Sustituye a Homepage.

Está tematizado sobre el **Infierno de Dante**: Dis es la ciudad amurallada de hierro al rojo que
separa el Infierno alto del bajo; aquí es la puerta de entrada a todo lo que corre en el servidor.
El resto del ecosistema sigue el tema: Caronte (barquero), Minos (juez), Cerbero (guardián),
Vergil (guía), Gerión (el fraude).

## Servidor (server-kuro)
- **Hardware**: AMD 12c/12t, 12 GB RAM (~5 GB libres con los servicios corriendo), GPU AMD Vega
  (APU, no útil para cómputo), Linux.
- **Red**: LAN doméstica + acceso remoto por **Tailscale**. Dis se sirve por HTTP en la LAN/tailnet;
  no hay HTTPS salvo que se ponga un proxy externo delante.
- **Dis corre en Docker**, puerto **8088**, un solo contenedor (API + frontend compilado).

## Ecosistema (herramientas propias)
| Nombre | Estado | Qué es | Depende de |
|--------|--------|--------|-----------|
| Dis | Operativo | Este dashboard (marcado `self`, "estás aquí") | — |
| Caronte | Operativo | Visualizador de BD; sustituto de Adminer | minos-db |
| Minos | Operativo | OSINT | minos-db |
| Cerbero | En desarrollo | Monitor de recursos, Docker y accesos; API futura | — |
| Vergil | En desarrollo | Gestor de IAs | — |
| Gerión | Idea | Honeypot | — |

Contenedores Docker habituales observados: caronte, dis, grafana, minos, minos-adminer, minos-db
(postgres 16), node-exporter, prometheus, tailscale, trilium. Dis los autodetecta; no están
hardcodeados.

## Stack
- **Backend**: Python 3.12, **FastAPI**, SDK `docker` (socket `/var/run/docker.sock` en solo
  lectura), `psutil`, Pydantic v2, PyYAML, httpx. Sin base de datos propia. API stateless.
- **Frontend**: **React 18 + Vite + TypeScript**, **Tailwind CSS v4** (tokens CSS), 
  `@tanstack/react-query`, **`@xyflow/react`** (React Flow v12) para el canvas, `@dagrejs/dagre`
  para el layout del grafo.
- **Infra**: Docker Compose, un contenedor (uvicorn sirve la API y el frontend compilado).
- **Calidad**: `ruff` + `pytest` (backend), ESLint + Prettier + `tsc` (frontend).

## Estructura del repo
```
backend/app/
  main.py           rutas de la API + servido del frontend compilado (SPA)
  config.py         carga de dis.yaml + overrides por entorno + recarga en caliente
  models.py         esquemas Pydantic de las respuestas
  docker_service.py contenedores, stats, logs (solo lectura); enmascara credenciales
  host_service.py   CPU/RAM/discos (psutil) + histórico 5 min en memoria
  ecosystem.py      herramientas + grafo de servicios (une Docker y config)
  cerbero.py        proxy de alertas de Cerbero (o {connected:false})
  icons.py          resolución de logos (dis.icon / catálogo dashboard-icons / favicon)
  autodetect.py     deduce url/descripción/dependencias desde Docker
backend/tests/      pytest
frontend/src/
  views/            DashboardView.tsx, MapView.tsx
  components/        ServiceNode, ServicePanel, ContainerCard, ToolCard, ServiceIcon,
                     ResourceBar, MiniChart, StatusDot, AlertsPanel, MapSearch, MapLegend,
                     AddServiceDialog, ExternalLink, LogViewer
  api/              tipos, cliente fetch y hooks de react-query
  lib/              format, theme, a11y, selection, graphLayout, graphFocus, sortContainers, snippets
dis.yaml            configuración (herramientas, URLs, dependencias, iconos) — se recarga sola
Dockerfile · docker-compose.yml
.claude/agents/     subagentes del flujo (arquitecto, disenador, programador, revisor, viabilidad)
.agents/skills/     skills instaladas (frontend-design, ui-ux-pro-max)
```

## Identidad visual (paleta Caronte)
- Fondo `#0a0a0a` / `#111`. Acento morado `#7c3aed` (primario) / `#a78bfa` (hover/activo).
- Fuente **monoespaciada para datos** (nombres, puertos, métricas, logs); sans para el cuerpo.
- Estados: running `#22c55e`, stopped/exited `#6b7280`, restarting/paused `#eab308`,
  unhealthy `#ef4444`. En el mapa, aristas moradas; naranja `#f97316` si el destino está caído.
- **Oscuro por defecto**, claro opcional (misma paleta sobre `#f8f8f8`).
- El logo (`frontend/src/assets/dis-logo.svg`) es la ciudad amurallada en llamas sobre la Estigia.

## Qué hace hoy
- **Dashboard**: recursos (CPU/RAM/discos con sparklines de 5 min), herramientas y contenedores en
  tarjetas, alertas de Cerbero. Herramientas van encima de los contenedores. Botón "ordenar"
  (abribles primero). Botón "+ Añadir" que genera la config de un servicio.
- **Mapa** (React Flow): un nodo por servicio, aristas de dependencia, foco al hover, buscador `/`,
  filtros por estado, arrastre con posiciones en localStorage, botón "Reordenar".
- **Panel lateral** de detalle: métricas en vivo (5 s), puertos, env (credenciales enmascaradas),
  últimos 100 logs. No modal; se cierra con Escape o clic fuera.
- **Autodetección** desde Docker (url/descripción/dependencias/iconos) y **recarga en caliente** de
  `dis.yaml`.

## Endpoints API
`GET /api/containers`, `/containers/{id}`, `/containers/{id}/stats`, `/containers/{id}/logs`,
`/api/resources`, `/api/tools`, `/api/graph`, `/api/alerts`, `/api/config`, `/api/health`.
Las env vars con PASSWORD/SECRET/KEY/TOKEN se devuelven como `***`.

## Restricciones (duras)
- Dis debe consumir **< 150 MB de RAM** (medido ~45 MB). Sin Redis, sin workers extra, API stateless.
- **No añadir dependencias pesadas** sin justificarlo: preferir CSS/SVG propio.
- El socket de Docker va `:ro` a nivel de fichero, pero la API de Docker da acceso completo igual;
  Dis **solo hace lecturas**. Acciones start/stop/restart siguen fuera del MVP.
- **Sin autenticación**: pensado para LAN/tailnet. No publicar a Internet sin un proxy con auth.

## Cómo arrancar y probar
- **Producción** (en server-kuro): `docker compose up -d --build` → `http://<host>:8088`.
- **Desarrollo**: backend `uvicorn app.main:app --reload --port 8000`; frontend `npm run dev`
  (Vite hace proxy de `/api` a `:8000`).
- **Calidad** antes de dar por bueno un cambio:
  - backend: `cd backend && .venv/bin/ruff check . && .venv/bin/ruff format --check . && .venv/bin/pytest`
  - frontend: `cd frontend && npm run lint && npm run build` (incluye typecheck) y `npx prettier --check "src/**/*.{ts,tsx,css}"`

## Convenciones
- Código, comentarios y mensajes de commit **en español**. Un commit por paso, mensaje claro.
- Rama de trabajo actual: `claude/brave-fermat-0a8lyf`. No hacer push sin que lo pida el usuario.

## En curso / pendiente
- **Rediseño UI/UX** (en marcha). El diagnóstico del arquitecto apunta a: cargar de verdad las
  fuentes (hoy `Inter`/`JetBrains Mono` se nombran pero no se cargan), tokens semánticos de color,
  respetar `prefers-reduced-motion`, subir contraste, franja de salud en el dashboard, codificar
  severidad en las tarjetas, y mejoras de móvil/accesibilidad. Mantener morado + tema Dante.
- TODOs de producto: acciones start/stop/restart (con auth antes), autenticación de Dis, Cerbero en
  vivo, health-check HTTP de herramientas sin contenedor.
