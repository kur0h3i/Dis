# Plan de mejora y refactorización — Dis

> Plan autocontenido para el programador. Léelo entero antes de tocar nada.
> Compañero de `/home/user/Dis/.claude/ficha-proyecto.md` (contexto del proyecto).
> Rama de partida: `claude/brave-fermat-0a8lyf`.

## Objetivo y qué problema resuelve

Mejorar Dis **sin cambiar su comportamiento ni su identidad** (morado Caronte + tema Dante),
atacando los problemas reales que hay hoy:

1. **El rediseño UI/UX pendiente** (lo que el objetivo justifica de verdad): las fuentes se
   nombran pero no se cargan, los colores de estado/severidad están repartidos como hex a pelo en
   una decena de ficheros en vez de en tokens, no se respeta `prefers-reduced-motion`, el contraste
   de los textos secundarios es flojo, falta una franja de salud de un vistazo en el dashboard, la
   severidad se codifica solo con un punto de 8 px, y hay detalles de accesibilidad (panel lateral
   bajo `aria-hidden` con foco dentro, sin gestión de foco) y de móvil.
2. **Pequeña deuda transversal**: duplicación puntual en el frontend, cero tests de frontend y
   ausencia de CI que proteja el refactor.

El **backend está muy sano** (buena separación, tests completos, tipado, pensado para < 150 MB y
stateless). Por eso casi todo el backend va a "Qué NO se toca": no hay problema que justifique
reescribirlo.

## Estado actual (lo que encontré, con rutas)

### Backend — `backend/app/` (calidad alta, poco que tocar)
- `main.py`: rutas FastAPI + servido del SPA. El catch-all `spa()` ya está protegido contra path
  traversal (`candidate.is_file() and STATIC_DIR.resolve() in candidate.parents`). Correcto.
- `config.py`: carga de `dis.yaml` con recarga en caliente por `mtime`, overrides por entorno,
  bloqueo con `threading.Lock`, mantiene la última config buena si la nueva falla. Sólido.
- `models.py`: Pydantic v2, `Literal` para estados. Es el espejo de `frontend/src/api/types.ts`
  (sincronización manual, documentada).
- `docker_service.py`: solo lectura, stats en `ThreadPoolExecutor` para no sumar latencias,
  enmascara credenciales, normaliza estados. Bien.
- `host_service.py`: `psutil` + buffer circular de 5 min en una tarea asyncio. Bien.
- `ecosystem.py`, `autodetect.py`, `icons.py`, `cerbero.py`: responsabilidades claras, sin
  duplicación relevante.
- `backend/tests/`: 8 ficheros, cobertura real y buena (status, puertos, stats, env, autodetect,
  iconos con/sin catálogo, recarga de config, grafo, alertas). `conftest.py` evita salidas a red.
- Detalles menores (opcionales, bajo impacto): `cerbero.py` crea un `httpx.AsyncClient` por
  petición; `docker_service._client` es un singleton sin lock (carrera improbable y benigna). No
  justifican trabajo por sí solos.

### Frontend — `frontend/src/` (aquí está el grueso del trabajo)
- **Fuentes no cargadas**: `src/index.css` nombra `'Inter'` y `'JetBrains Mono'` en `--font-sans`
  / `--font-mono`, pero **no hay `@font-face`, ni `<link>` en `index.html`, ni ficheros de fuente**
  (grep de `@font-face|woff|font-display` = 0 resultados). Hoy se ve la fuente de sistema.
- **Color sin tokens semánticos**: `src/lib/format.ts` define `STATUS_COLOR` con hex literales, y
  además hay hex sueltos (`#ef4444`, `#eab308`, `#22c55e`, `#f97316`...) repartidos en 10 ficheros:
  `views/DashboardView.tsx`, `components/ServicePanel.tsx`, `views/MapView.tsx`, `App.tsx`,
  `components/AddServiceDialog.tsx`, `components/LogViewer.tsx`, `components/AlertsPanel.tsx`,
  `components/ResourceBar.tsx`, `lib/format.ts` (+ `assets/dis-logo.svg`, que no se toca). El CSS
  solo tiene tokens de fondo/acento, no de estado/semántica.
  - **Ojo (hallazgo clave)**: `STATUS_COLOR` alimenta el `nodeColor` del `MiniMap` de React Flow,
    que pinta sobre **canvas** y **no resuelve `var(--...)`**. Las aristas del mapa usan `stroke`
    en SVG, que sí acepta `var()`. Conclusión: el palette de estado debe seguir siendo una
    constante JS con hex concretos (fuente única para canvas); los hex ad-hoc de JSX (rojo de
    error, amarillo de aviso en `ResourceBar`, etc.) son los que deben pasar a tokens.
- **Sin `prefers-reduced-motion`**: animaciones activas sin respetar la preferencia: `animate-ping`
  del pulso en `components/StatusDot.tsx`, `animate-pulse` de los esqueletos, transiciones de
  aristas en `index.css`, deslizamiento del panel y `transition-[width]` de `ResourceBar`.
- **Contraste flojo**: `--faint` (#737373 sobre #0a0a0a ≈ 4.0:1) se usa muchísimo y en textos de
  11/10 px con información útil (metadatos de tarjetas, puertos, etiquetas del mapa).
- **Falta franja de salud**: `views/DashboardView.tsx` tiene tres secciones pero ningún resumen de
  cabecera (en marcha/total, alertas, CPU/RAM de un vistazo).
- **Severidad poco codificada**: `components/ContainerCard.tsx` y `ToolCard.tsx` marcan estado con
  `StatusDot` (punto de 8 px) + `opacity`. La severidad (unhealthy/parado) no destaca más allá del
  color del punto. (Lo bueno: `StatusDot` ya lleva texto `sr-only` y `STATUS_LABEL` visible, así
  que no se depende solo del color; falta refuerzo visual por forma/borde.)
- **Accesibilidad / móvil**:
  - `components/ServicePanel.tsx`: cuando está cerrado sigue en el DOM con `aria-hidden={!open}`
    **y un botón de cerrar enfocable dentro** (violación: foco dentro de `aria-hidden`). No mueve
    el foco al abrir ni lo restaura al cerrar. Mejor `inert` + gestión de foco.
  - `components/MiniChart.tsx`: tooltip solo con ratón (sin teclado/táctil); lleva `aria-label`, es
    aceptable, pero conviene anotarlo.
  - Cabecera (`App.tsx`) con dos `ml-auto`; repasar en pantallas estrechas.
- **Duplicación puntual**: el "chip de dependencia" que decide tool vs contenedor y navega aparece
  dos veces en `components/ServicePanel.tsx` (en `ContainerSections` y en la sección "Herramienta").
- **Cero tests de frontend**: no hay runner (vitest/jest) ni specs. Lógica intrincada sin cubrir:
  `lib/snippets.ts` (genera YAML/labels), `lib/graphLayout.ts`, `lib/graphFocus.ts`,
  `lib/sortContainers.ts`, `lib/format.ts`.

### Transversal
- **Calidad**: ruff + pytest (backend) y eslint + prettier + tsc + build (frontend) ya configurados
  y documentados en `README.md`. **No hay CI** (`.github/workflows` no existe).
- **Docker/compose**: correctos. El frontend usa `npm ci` con `package-lock.json`; el backend
  instala con `pip install .` y rangos `>=` (build no 100% reproducible). Bajo impacto.
- **Seguridad**: bien documentada en `README.md` (sin auth → LAN/tailnet, socket solo lectura,
  credenciales enmascaradas). Auth y acciones de escritura son TODO de producto → fuera de alcance.
- **Docs**: `README.md` es extenso y correcto; hay que mantenerlo en sync tras los cambios.

## Decisiones tomadas (y alternativas descartadas)

- **Autoalojar las fuentes** (woff2 + `@font-face` con `font-display: swap`, subconjunto latino).
  Descartado Google Fonts CDN: Dis vive en LAN/tailnet (a veces sin Internet) y no queremos
  dependencia externa ni fuga de host. Son ficheros estáticos: no afectan a los < 150 MB de RAM.
- **Tokens de color en dos planos**: tokens semánticos CSS (`--ok/--warn/--danger/--neutral/--info`)
  en `index.css` para DOM/SVG, y **mantener `STATUS_COLOR`/`EDGE_*` como constante JS con hex**
  para el canvas del MiniMap. Descartado pasar `STATUS_COLOR` a `var()`: rompería el MiniMap.
- **Refactor de color en dos commits**: primero mover los hex a tokens **sin cambiar el valor**
  (diff revisable, cero regresión visual); el ajuste de contraste va aparte. Descartado hacerlo de
  golpe: mezcla "mover" con "cambiar" y hace irrevisable el cambio.
- **`inert` para el panel cerrado** en vez de `aria-hidden`. Descartado dejarlo como está: foco
  enfocable dentro de `aria-hidden` es una violación real de accesibilidad.
- **CSS/SVG propio para la franja de salud y la severidad**, sin librerías. Cumple "no añadir
  dependencias pesadas".
- **Tests de frontend con Vitest** (dev-only, ligero) solo para `lib/`. Descartado Jest (más pesado
  de configurar con Vite). Marcado como paso que requiere aprobación (añade dependencia de dev).
- **CI con GitHub Actions** que ejecute la suite de calidad de ambos lados. Marcado como paso que
  requiere aprobación (toca el repo en GitHub `kur0h3i/Dis`).
- **No tocar el backend salvo cosmética nula**: ningún problema lo justifica.

## Pasos (pequeños, ordenados, un commit cada uno)

> Antes de cada commit: pasar la suite de calidad del lado tocado.
> - Backend: `cd backend && .venv/bin/ruff check . && .venv/bin/ruff format --check . && .venv/bin/pytest`
> - Frontend: `cd frontend && npm run lint && npm run format:check && npm run build`
> Commits en español, uno por paso.

### Paso 1 — Rama y línea base verde (SIEMPRE primero, no toca código)
- Crear rama de trabajo desde la actual: `git switch -c mejora/refactor-general` (sobre
  `claude/brave-fermat-0a8lyf`).
- Instalar entornos si hace falta (ver `README.md` → Desarrollo).
- Ejecutar **ambas** suites de calidad y `npm run build` y anotar que todo pasa (línea base).
- **Comprobación**: backend `ruff` + `pytest` en verde; frontend `lint` + `format:check` + `build`
  en verde. Si algo falla ya, anotarlo aquí antes de continuar.
- Ficheros: ninguno (solo rama). Sin commit de código.

### Paso 2 — Tokens semánticos de color + base de `prefers-reduced-motion` (aditivo)
- En `frontend/src/index.css`:
  - Añadir variables semánticas en `:root` y `:root.dark` con los **mismos valores de hoy**:
    `--ok:#22c55e; --warn:#eab308; --danger:#ef4444; --neutral:#6b7280; --info/edge-down:#f97316;`
    (ajustar por tema si procede, pero sin cambiar el aspecto todavía).
  - Exponerlas en `@theme inline` como `--color-ok`, `--color-warn`, `--color-danger`,
    `--color-neutral`, `--color-edge-down` (habilita utilidades `text-danger`, `bg-warn/10`, etc.).
  - Añadir bloque `@media (prefers-reduced-motion: reduce)` que anule/acorte animaciones y
    transiciones globales (incluidas `.react-flow__edge`).
- **Comprobación**: `npm run build` verde; la app se ve **idéntica** (solo se añadieron tokens y un
  media query); con "reduce motion" activado en el SO, el pulso del `StatusDot`, los esqueletos y
  el deslizamiento del panel ya no animan.
- Ficheros: `frontend/src/index.css`.

### Paso 3 — Sustituir hex ad-hoc por tokens (sin cambiar valores)
- Reemplazar los `#ef4444`/`#eab308`/`#22c55e`/`#f97316` literales de JSX por utilidades/tokens en:
  `components/ResourceBar.tsx` (warn/crit), `components/AlertsPanel.tsx`, `components/LogViewer.tsx`,
  `views/DashboardView.tsx` (`ErrorBox`), `components/ServicePanel.tsx`, `App.tsx` (punto de estado
  de conexión), `AddServiceDialog.tsx`.
- **Mantener** `STATUS_COLOR` y `EDGE_OK/EDGE_DOWN` como hex en `lib/format.ts` / `views/MapView.tsx`
  (fuente única para el canvas del MiniMap). Dejar comentario explicando por qué no son `var()`.
- **Comprobación**: `grep -R "#ef4444\|#eab308\|#22c55e\|#f97316" frontend/src` solo debe quedar en
  `lib/format.ts`, `views/MapView.tsx` (constantes de canvas/SVG) y `assets/dis-logo.svg`. Build
  verde. Aspecto idéntico.
- Ficheros: los 6-7 componentes citados; `lib/format.ts` sin cambio de valores.

### Paso 4 — Cargar las fuentes de verdad
- Añadir ficheros woff2 subconjunto latino (Inter var o 400/500/600; JetBrains Mono 400/600) en
  `frontend/public/fonts/` (o `src/assets/fonts/` importados por CSS).
- Declarar `@font-face` con `font-display: swap` en `frontend/src/index.css`; conservar la pila de
  respaldo actual en `--font-sans`/`--font-mono`.
- **Comprobación**: en el navegador, pestaña Network muestra las woff2 cargando; el `computed
  font-family` del cuerpo resuelve a Inter y el de los datos a JetBrains Mono. Build verde. Confirmar
  licencias OFL en el commit (Inter y JetBrains Mono son OFL, autoalojables).
- Ficheros: `frontend/src/index.css`, `frontend/public/fonts/*` (o `src/assets/fonts/*`).

### Paso 5 — Franja de salud en el dashboard
- Nuevo componente `frontend/src/components/HealthBand.tsx`: resumen de un vistazo (en marcha/total,
  nº unhealthy/parados, estado de alertas de Cerbero, CPU y RAM actuales). Reutiliza datos que ya
  tiene `DashboardView` (resources, containers, alerts). CSS/SVG propio, tokens del paso 2.
- Montarlo arriba del todo en `views/DashboardView.tsx`.
- **Comprobación**: con Docker arriba, la franja refleja los mismos números que las secciones; con
  API caída, degrada sin romper. Build + lint verdes. Respeta reduced-motion.
- Ficheros: `frontend/src/components/HealthBand.tsx` (nuevo), `frontend/src/views/DashboardView.tsx`.

### Paso 6 — Codificar severidad en las tarjetas
- En `components/ContainerCard.tsx` y `ToolCard.tsx`: añadir refuerzo visual por estado (p. ej.
  borde/filo izquierdo o anillo con el color del estado vía `STATUS_COLOR`), de modo que unhealthy
  y parado destaquen más que con el punto. **Conservar** el texto de estado (no solo color).
- **Comprobación**: un contenedor unhealthy y uno parado se distinguen de un vistazo entre varias
  tarjetas; en escala de grises siguen legibles por el texto. Build verde.
- Ficheros: `frontend/src/components/ContainerCard.tsx`, `frontend/src/components/ToolCard.tsx`
  (y `StatusDot.tsx` si se reutiliza).

### Paso 7 — Gestión de foco y `inert` en el panel lateral
- En `components/ServicePanel.tsx`: cuando `!open`, marcar el `<aside>` como `inert` (y quitar el
  `aria-hidden` con hijos enfocables). Al abrir, mover el foco al panel (al botón cerrar o al
  encabezado); al cerrar, devolver el foco al elemento que lo abrió.
- **Comprobación**: con teclado, al abrir el panel el foco entra y Tab no se va "detrás"; al cerrar
  (Escape/clic fuera) el foco vuelve a la tarjeta/nodo de origen; un pase de axe/Lighthouse no
  reporta "focusable element inside aria-hidden". Build verde. Comportamiento de cierre intacto.
- Ficheros: `frontend/src/components/ServicePanel.tsx`.

### Paso 8 — Subir contraste de textos secundarios
- En `frontend/src/index.css`: subir `--faint` (y revisar `--muted`) en oscuro y claro hasta ≥ 4.5:1
  para texto pequeño que lleva información; donde `faint` sea puramente decorativo, dejarlo.
- Repasar usos de `text-faint`/`text-[10px]`/`text-[11px]` con dato útil en tarjetas, puertos y
  etiquetas del mapa y promover a `muted` si hace falta.
- **Comprobación**: medir con DevTools/axe que los textos de dato llegan a 4.5:1 (3:1 si ≥ 18px/
  bold). La identidad (morado + oscuro) se mantiene. Build verde.
- Ficheros: `frontend/src/index.css` y, si procede, los componentes con `text-faint` de dato.

### Paso 9 — Pulido móvil
- Revisar a 360 px: cabecera (`App.tsx`) sin solapes ni desbordes, tarjetas en una columna, panel a
  pantalla completa (ya lo es), barra del mapa y leyenda sin tapar nodos, áreas táctiles ≥ 40 px.
- **Comprobación**: en responsive a 360/768 px no hay scroll horizontal ni solapes; los botones se
  pulsan cómodos. Build verde.
- Ficheros: `frontend/src/App.tsx`, `frontend/src/views/MapView.tsx` y componentes que lo necesiten.

### Paso 10 — Extraer duplicación del panel (refactor sin cambio de conducta)
- Extraer el "chip/lista de dependencias" repetido en `components/ServicePanel.tsx` a un
  subcomponente (p. ej. `DepList`) y usarlo en los dos sitios.
- **Comprobación**: pinchar una dependencia abre el mismo destino que antes (tool vs contenedor);
  build + lint verdes; diff solo mueve código.
- Ficheros: `frontend/src/components/ServicePanel.tsx`.

### Paso 11 (OPCIONAL — requiere aprobación: añade dependencia de dev) — Tests de `lib/`
- Añadir Vitest (dev-only) y specs para `lib/format.ts`, `lib/snippets.ts` (generación de
  YAML/labels y `copyText` lógica pura), `lib/graphFocus.ts`, `lib/sortContainers.ts` y casos clave
  de `lib/graphLayout.ts`. Añadir script `test` en `frontend/package.json`.
- **Comprobación**: `npm test` verde; los tests cubren la generación de snippets y el agrupado del
  grafo. Documentar el comando en `README.md`.
- Ficheros: `frontend/package.json`, config de Vitest, `frontend/src/lib/*.test.ts` (nuevos),
  `README.md`.

### Paso 12 (OPCIONAL — requiere aprobación: toca el repo en GitHub) — CI
- `.github/workflows/ci.yml`: job de backend (ruff + pytest) y job de frontend (lint +
  format:check + build, y `test` si se hizo el paso 11).
- **Comprobación**: el workflow pasa en un PR de prueba.
- Ficheros: `.github/workflows/ci.yml` (nuevo).

### Paso 13 — Actualizar documentación
- Reflejar en `README.md` (y `ficha-proyecto.md` si cambia algo de proceso) lo hecho: fuentes
  autoalojadas, tokens de color, reduced-motion, franja de salud, y el comando de test/CI si
  aplican. Mover de "En curso / pendiente" lo ya resuelto.
- **Comprobación**: el README no menciona como pendiente nada ya hecho; capturas de `docs/` siguen
  representativas (regenerarlas si la UI cambió visiblemente).
- Ficheros: `README.md`, `.claude/ficha-proyecto.md`.

## Qué NO se toca

- **Backend `backend/app/`**: estructura, lógica y contratos de la API. No se refactoriza nada:
  está sano y con tests. (Los detalles menores de `cerbero.py`/singleton quedan anotados, sin
  acción.)
- **`backend/tests/`**: no se modifican salvo que un cambio de API lo exija (no está previsto).
- **Contrato de la API y `models.py` ↔ `api/types.ts`**: no se cambian campos ni formas.
- **Identidad visual**: paleta morada Caronte, tema Dante, `assets/dis-logo.svg`, `public/dis.svg`.
  Se ajusta contraste y se añaden tokens, pero no se cambia la marca ni se repintan los acentos.
- **`STATUS_COLOR` / colores del MiniMap como `var()`**: se quedan en hex (canvas no resuelve vars).
- **Docker/Dockerfile/compose, `dis.yaml`, el servidor y las credenciales**.
- **Autenticación y acciones de escritura (start/stop/restart)**: fuera de alcance (TODO de
  producto; requieren auth y aprobación aparte).
- **Dependencias de runtime**: no se añade ninguna. Solo, y con aprobación, Vitest (dev) en el paso
  11.

## Riesgos y pasos que necesitan aprobación humana

- **Aprobación explícita antes de ejecutar**:
  - **Paso 11 (Vitest)**: añade dependencia de desarrollo.
  - **Paso 12 (CI)**: crea workflow en el repo GitHub.
  - Cualquier `git push` (la ficha dice: no hacer push sin que lo pida el usuario).
- **Riesgos y mitigaciones**:
  - *Regresión visual al mover colores* (paso 3): se mitiga no cambiando valores; el ajuste de
    contraste va aislado en el paso 8 para que el diff sea revisable.
  - *MiniMap roto si se "tokeniza" `STATUS_COLOR`*: evitado por decisión; verificar el MiniMap tras
    el paso 3.
  - *Fuentes*: subir el peso del bundle (decenas de KB, aceptable y no afecta a la RAM del proceso);
    confirmar licencia OFL de Inter y JetBrains Mono en el commit del paso 4.
  - *`inert` (paso 7)*: soporte muy amplio en navegadores actuales; si el objetivo incluyera
    navegadores muy viejos, dejar fallback con gestión de foco manual. Confirmar el cierre por clic
    fuera / Escape sigue intacto.
  - *`prefers-reduced-motion`*: asegurarse de que reducir animaciones no rompe función (el fade de
    aristas del mapa pasa a cambio instantáneo de opacidad, sigue informando).
  - *Franja de salud y severidad (pasos 5-6)*: cambios de layout; revisar que no desplazan ni tapan
    contenido en móvil (se valida en el paso 9).

## Duda a resolver con el usuario (no supongo)

- **Alcance de los pasos 11 y 12**: ¿se quieren tests de frontend y CI en esta tanda, o se dejan
  fuera? Afectan a añadir dependencia de dev y a tocar el repo en GitHub. Hasta tener respuesta,
  tratarlos como opcionales y no ejecutarlos.
