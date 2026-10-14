import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useAlerts,
  useConfigStatus,
  useContainers,
  useRefreshOnConfigReload,
  useResources,
  useTools,
} from './api/hooks';
import type { Selection } from './api/types';
import logo from './assets/dis-logo.svg';
import { AddServiceDialog } from './components/AddServiceDialog';
import { ServicePanel } from './components/ServicePanel';
import { formatHash, parseHash, type Route, type View } from './lib/route';
import { useTheme } from './lib/theme';
import { DashboardView } from './views/DashboardView';
import { MapView } from './views/MapView';

export default function App() {
  const [theme, toggleTheme] = useTheme();
  const [route, setRoute] = useState(() => parseHash(location.hash));
  const { view, selection } = route;
  const [adding, setAdding] = useState(false);

  const resources = useResources();
  const containers = useContainers();
  const tools = useTools();
  const alerts = useAlerts();
  const config = useConfigStatus();
  useRefreshOnConfigReload(config.data?.loaded_at);
  const liveError = resources.error ?? containers.error;

  // Estable (los nodos del mapa guardan onSelect): decide push/replace leyendo el hash en el momento.
  const go = useCallback((next: Route, push: boolean, state?: object) => {
    const url = formatHash(next);
    if (push) history.pushState(state ?? null, '', url);
    else history.replaceState(history.state, '', url);
    setRoute(next);
  }, []);
  // history.back() es asíncrono: sin esto, dos Escape seguidos retroceden dos veces y salen de Dis.
  const closing = useRef(false);
  useEffect(() => {
    const onPop = () => {
      closing.current = false;
      setRoute(parseHash(location.hash));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const selectService = useCallback(
    (s: Selection) => {
      const cur = parseHash(location.hash);
      // Abrir el panel es una entrada de historial (Atrás lo cierra); cambiar de servicio, no.
      if (cur.selection) go({ ...cur, selection: s }, false);
      else go({ view: cur.view, selection: s }, true, { panel: true });
    },
    [go],
  );
  const setView = useCallback(
    (v: View) => {
      const cur = parseHash(location.hash);
      if (v !== cur.view) go({ view: v, selection: cur.selection }, true);
    },
    [go],
  );
  const closePanel = useCallback(() => {
    if (history.state?.panel) {
      if (closing.current) return;
      closing.current = true;
      history.back();
    } else go({ view: parseHash(location.hash).view, selection: null }, false);
  }, [go]);

  return (
    <div className="flex min-h-full flex-col">
      {/* Seleccionable: cambiar de vista o de tema no cierra el panel lateral. */}
      <header
        data-dis-selectable
        className="sticky top-0 z-30 h-14 border-b border-line bg-bg/85 backdrop-blur"
      >
        <h1 className="sr-only">Dis, panel de server-kuro</h1>
        <div className="mx-auto flex h-full max-w-7xl items-center gap-2 px-4 sm:gap-4 sm:px-6">
          <div className="flex items-center gap-2">
            {/* La ciudad de Dis del Infierno de Dante: murallas al rojo sobre la Estigia. */}
            <img src={logo} alt="" className="h-8 w-8" />
            <span className="hidden font-mono text-lg font-bold tracking-[0.3em] text-accent-ink min-[400px]:inline">
              DIS
            </span>
            <span className="hidden font-mono text-xs text-faint sm:inline">server-kuro</span>
          </div>

          {/* En móvil solo aparece si hay error: no cabe un punto fijo en 360 px. */}
          <span
            className={`ml-auto inline-flex items-center gap-1.5 font-mono text-[11px] text-faint ${liveError ? '' : 'max-sm:hidden'}`}
            title={liveError?.message}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: liveError ? 'var(--danger)' : 'var(--ok)' }}
            />
            <span className="sr-only sm:not-sr-only">
              {resources.error
                ? 'sin conexión con la API'
                : containers.error
                  ? 'Docker sin actualizar'
                  : 'en vivo'}
            </span>
          </span>

          <nav
            className={`${liveError ? '' : 'ml-auto sm:ml-0'} flex rounded-lg border border-line bg-surface p-0.5 font-mono text-xs`}
          >
            {(['dashboard', 'map'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={`min-h-10 rounded-md px-2 py-1.5 transition-colors sm:min-h-0 sm:px-3 ${
                  view === v ? 'bg-accent text-white' : 'text-muted hover:text-ink'
                }`}
              >
                {v === 'dashboard' ? 'Dashboard' : 'Mapa'}
              </button>
            ))}
          </nav>

          {config.data?.error && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              title={`dis.yaml no se pudo recargar: ${config.data.error}`}
              aria-label="dis.yaml no se pudo recargar"
              className="flex min-h-10 min-w-10 items-center justify-center font-mono text-[11px] text-danger hover:underline sm:min-h-0 sm:min-w-0"
            >
              ⚠<span className="hidden sm:inline"> dis.yaml</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-line bg-surface px-2.5 py-1.5 font-mono text-xs text-muted hover:text-ink sm:min-h-0 sm:min-w-0"
            aria-label="Añadir servicio"
            title="Añadir servicio"
          >
            +<span className="hidden sm:inline"> Añadir</span>
          </button>

          <button
            type="button"
            onClick={toggleTheme}
            className="flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-line bg-surface px-2.5 py-1.5 font-mono text-xs text-muted hover:text-ink sm:min-h-0 sm:min-w-0"
            aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
          >
            {theme === 'dark' ? '☾' : '☀'}
          </button>
        </div>
      </header>

      {/* 520 = PANEL_MAX_WIDTH (ServicePanel.tsx); el mapa usa su propio reveal */}
      <main className={`flex-1 ${view === 'dashboard' && selection ? 'lg:pr-[520px]' : ''}`}>
        {view === 'dashboard' ? (
          <DashboardView
            resources={resources}
            containers={containers}
            tools={tools}
            alerts={alerts}
            selection={selection}
            onSelect={selectService}
          />
        ) : (
          <div className="h-[calc(100dvh-3.5rem)]">
            <MapView theme={theme} selection={selection} onSelect={selectService} />
          </div>
        )}
      </main>

      <ServicePanel
        selection={selection}
        tools={tools.data}
        containers={containers.data}
        onSelect={selectService}
        view={view}
        onToggleView={() => setView(view === 'map' ? 'dashboard' : 'map')}
        onClose={closePanel}
      />

      {adding && (
        <AddServiceDialog
          tools={tools.data}
          containers={containers.data}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  );
}
