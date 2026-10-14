import { useCallback, useState } from 'react';
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
import { useTheme } from './lib/theme';
import { DashboardView } from './views/DashboardView';
import { MapView } from './views/MapView';

type View = 'dashboard' | 'map';

export default function App() {
  const [theme, toggleTheme] = useTheme();
  const [view, setView] = useState<View>('dashboard');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [adding, setAdding] = useState(false);

  const resources = useResources();
  const containers = useContainers();
  const tools = useTools();
  const alerts = useAlerts();
  const config = useConfigStatus();
  useRefreshOnConfigReload(config.data?.loaded_at);
  const closePanel = useCallback(() => setSelection(null), []);

  return (
    <div className="flex min-h-full flex-col">
      {/* Seleccionable: cambiar de vista o de tema no cierra el panel lateral. */}
      <header
        data-dis-selectable
        className="sticky top-0 z-30 h-14 border-b border-line bg-bg/85 backdrop-blur"
      >
        <div className="mx-auto flex h-full max-w-7xl items-center gap-2 px-4 sm:gap-4 sm:px-6">
          <div className="flex items-center gap-2">
            {/* La ciudad de Dis del Infierno de Dante: murallas al rojo sobre la Estigia. */}
            <img src={logo} alt="" className="h-8 w-8" />
            <span className="hidden font-mono text-lg font-bold tracking-[0.3em] text-accent-ink min-[400px]:inline">
              DIS
            </span>
            <span className="hidden font-mono text-xs text-faint sm:inline">server-kuro</span>
          </div>

          <span
            className="ml-auto hidden items-center gap-1.5 font-mono text-[11px] text-faint sm:inline-flex"
            title={resources.error?.message}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: resources.error ? 'var(--danger)' : 'var(--ok)' }}
            />
            {resources.error ? 'sin conexión con la API' : 'en vivo'}
          </span>

          <nav className="ml-auto sm:ml-0 flex rounded-lg border border-line bg-surface p-0.5 font-mono text-xs">
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
            onSelect={setSelection}
          />
        ) : (
          <div className="h-[calc(100dvh-3.5rem)]">
            <MapView theme={theme} selection={selection} onSelect={setSelection} />
          </div>
        )}
      </main>

      <ServicePanel
        selection={selection}
        tools={tools.data}
        containers={containers.data}
        onSelect={setSelection}
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
