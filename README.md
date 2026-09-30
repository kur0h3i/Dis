# Dis

Dashboard central de **server-kuro**: una única página con todos los contenedores Docker,
las herramientas propias del ecosistema y el estado del servidor, con acceso directo a cada
servicio. Sustituye a Homepage.

> Dis es la ciudad amurallada que separa el Infierno superior del inferior; aquí es la puerta
> de entrada a todo lo que corre en el servidor.

- **Dashboard**: recursos del servidor (CPU, RAM, discos con sparklines de 5 min), tarjetas de
  contenedores y de herramientas, alertas de Cerbero.
- **Mapa**: canvas (React Flow) con un nodo por servicio y aristas de dependencia; las aristas
  se vuelven naranjas si el destino está caído.
  - Al pasar el ratón por un nodo (o al seleccionarlo) se resaltan sus dependencias y
    dependientes y se atenúa el resto; si el panel lateral lo tapa, la vista se desplaza.
  - Buscador (atajo `/`, ↑/↓ y Enter) por nombre, id, contenedor o descripción: centra el
    servicio y abre su panel.
  - Leyenda con recuento por estado que funciona como filtro (p. ej. ocultar las herramientas
    en desarrollo/idea, que se dibujan con borde discontinuo); se recuerda en
    `localStorage` (`dis_graph_hidden`).
  - Los nodos se arrastran y su posición se guarda en `localStorage` (`dis_graph_positions`);
    «Reordenar» vuelve al layout automático y encuadra el mapa.
- **Panel de servicio**: al hacer clic en un contenedor o herramienta se abre un panel lateral
  con métricas en vivo (5 s), puertos, variables de entorno (credenciales enmascaradas) y los
  últimos 100 logs.

Consumo medido: **~45 MB de RAM** en reposo y ~55 MB con carga (límite en compose: 150 MB).

## Estructura

```
dis/
├── backend/            FastAPI + docker SDK + psutil (Python 3.12)
│   ├── app/
│   │   ├── main.py            rutas de la API + servido del frontend compilado
│   │   ├── config.py          carga de dis.yaml + overrides por entorno
│   │   ├── models.py          esquemas Pydantic de las respuestas
│   │   ├── docker_service.py  contenedores, stats, logs (solo lectura)
│   │   ├── host_service.py    CPU/RAM/discos + histórico de 5 min en memoria
│   │   ├── ecosystem.py       herramientas y grafo de servicios
│   │   └── cerbero.py         proxy de alertas de Cerbero
│   └── tests/
├── frontend/           React 18 + Vite + TypeScript + Tailwind + React Flow
│   └── src/
│       ├── views/             DashboardView, MapView
│       ├── components/        ServiceNode, ServicePanel, ContainerCard, ...
│       ├── api/               tipos, cliente y hooks de react-query
│       └── lib/               formato, tema, layout y foco/filtros del grafo
├── dis.yaml            configuración (herramientas, URLs, dependencias)
├── Dockerfile
└── docker-compose.yml
```

## Producción (Docker Compose)

En server-kuro, desde la raíz del repo:

```bash
docker compose up -d --build
```

Dis queda en `http://<host>:8088` (LAN o Tailscale). Un solo contenedor: uvicorn sirve la API
y el frontend compilado.

El compose monta:

| Volumen | Para qué |
|---|---|
| `/var/run/docker.sock:ro` | leer contenedores, stats y logs |
| `/:/hostfs:ro` | medir el uso de los discos del host (`DIS_HOST_ROOT=/hostfs`) |
| `./dis.yaml:/app/dis.yaml:ro` | configuración editable sin reconstruir |

Tras editar `dis.yaml`: `docker compose restart dis`.

> **Sobre el socket de Docker**: el `:ro` protege el fichero, no la API. Cualquiera que
> controle el proceso de Dis podría hablar con Docker con permisos completos. Dis solo hace
> llamadas de lectura y no expone acciones de escritura. Si en el futuro se quiere blindar,
> la opción es un `docker-socket-proxy` delante (a costa de un segundo contenedor).
>
> Dis **no tiene autenticación**: está pensado para la LAN/tailnet. No lo publiques a
> Internet sin un proxy con auth delante.

CPU y RAM no necesitan `pid: host`: `/proc/stat` y `/proc/meminfo` ya muestran el host desde
dentro del contenedor. Solo los discos necesitan el montaje de `/hostfs`.

## Desarrollo

Requisitos: Python 3.12, Node 20+ y acceso al socket de Docker (opcional: sin él la API
devuelve 503 en `/api/containers` y el resto sigue funcionando).

**Backend** (puerto 8000):

```bash
cd backend
python3.12 -m venv .venv
.venv/bin/pip install -e '.[dev]'
.venv/bin/uvicorn app.main:app --reload --port 8000
```

La config se busca en `DIS_CONFIG`, luego en `./dis.yaml` y en `../dis.yaml` (la de la raíz).

**Frontend** (puerto 5173, con proxy de `/api` a `:8000`):

```bash
cd frontend
npm install
npm run dev
```

**Calidad**:

```bash
# backend
cd backend && .venv/bin/ruff check . && .venv/bin/ruff format --check . && .venv/bin/pytest
# frontend
cd frontend && npm run lint && npm run format:check && npm run build
```

## Configuración

`dis.yaml` en la raíz, comentado. Resumen:

```yaml
cerbero_url: null            # URL de Cerbero; null = "Cerbero no conectado"
public_host: null            # host fijo para los enlaces; null = el de la petición
disks: [/]                   # puntos de montaje del host a mostrar

containers:                  # metadatos de contenedores
  minos-adminer:
    url: "http://{host}:9080"

tools:                       # herramientas propias
  - id: caronte
    name: Caronte
    description: Visualizador de BD
    stage: operational       # operational | development | idea
    url: "http://{host}:8081"
    container: caronte       # opcional: hereda estado/métricas del contenedor
    depends_on: [minos-db]   # aristas del grafo

edges:                       # dependencias extra entre contenedores
  - { source: minos-adminer, target: minos-db }
```

- `{host}` se sustituye por el host con el que accedes a Dis, así el mismo enlace funciona
  por la LAN y por Tailscale.
- Un contenedor también puede declarar su enlace con labels: `dis.url` y `dis.description`,
  que tienen prioridad sobre `dis.yaml`.
- Si una herramienta declara `container`, en el mapa herramienta y contenedor son un único
  nodo. Si no lo declara pero hay un contenedor que se llama igual que su `id` (p. ej.
  `caronte`), se enlazan automáticamente.

Variables de entorno (tienen prioridad sobre el YAML):

| Variable | Descripción |
|---|---|
| `DIS_CONFIG` | ruta al YAML |
| `CERBERO_URL` | URL base de Cerbero (se consulta `GET {url}/api/alerts`) |
| `DIS_PUBLIC_HOST` | host para los enlaces `{host}` |
| `DIS_HOST_ROOT` | raíz del host montada (`/hostfs` en Docker) |
| `DIS_DISKS` | discos separados por comas (`/,/home`) |
| `DIS_STATIC_DIR` | carpeta del frontend compilado |
| `DIS_LOG_LEVEL` | nivel de log (`INFO`) |

## API

| Método | Ruta | Devuelve |
|---|---|---|
| GET | `/api/containers` | lista con `id, name, image, status, ports, uptime_s, cpu_pct, mem_mb, url` |
| GET | `/api/containers/{id}` | detalle: lo anterior + `env` (enmascarado), `labels`, `command` |
| GET | `/api/containers/{id}/stats` | `cpu_pct, mem_mb, mem_limit_mb, net_rx_b, net_tx_b` |
| GET | `/api/containers/{id}/logs` | `{lines}`: últimas 100 líneas |
| GET | `/api/resources` | `cpu_pct, ram_used_gb, ram_total_gb, disks, history_5m` |
| GET | `/api/tools` | herramientas con `status` calculado |
| GET | `/api/graph` | `{nodes, edges, docker_available}` |
| GET | `/api/alerts` | proxy de Cerbero o `{connected: false}` |
| GET | `/api/health` | `{status: "ok"}` (healthcheck) |

`{id}` acepta id o nombre del contenedor. Las variables de entorno cuyo nombre contiene
`PASSWORD`, `SECRET`, `KEY` o `TOKEN` se devuelven como `***`.

Estados normalizados: `running` (verde), `stopped` (gris), `restarting`/`paused` (amarillo),
`unhealthy` (rojo). Las herramientas añaden `development` e `idea` (gris).

## Pendiente (fuera del MVP)

- Acciones start/stop/restart (marcadas con `TODO` en `docker_service.py`, `main.py` y
  `ServicePanel.tsx`), que requieren autenticación primero.
- Autenticación de Dis.
- Cerbero en vivo (streaming de alertas) cuando exista su API.
- Health-check HTTP de herramientas que no corren en Docker.
