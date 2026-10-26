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
import { StatusStrip } from './components/Hud';
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
      <div data-dis-selectable className="sticky top-0 z-30 bg-bg/90 backdrop-blur">
        <div className="mx-auto max-w-[96rem] px-4 pt-2 sm:px-6">
          <StatusStrip
            resources={resources.data}
            containers={containers.data}
            tools={tools.data}
            offline={!!resources.error}
          />
        </div>
        <header className="border-b border-line">
          <div className="mx-auto flex h-16 max-w-[96rem] items-center gap-4 px-4 sm:px-6">
            <div className="flex items-center gap-3">
              {/* La ciudad de Dis del Infierno de Dante: murallas al rojo sobre la Estigia. */}
              <img src={logo} alt="" className="h-9 w-9" />
              <h1 className="cy-title" data-t="DIS">
                DIS
              </h1>
              <span className="hidden font-mono text-xs text-faint sm:inline">
                puerta de server-kuro
              </span>
            </div>

            <nav className="ml-auto sm:ml-0 flex rounded-lg border border-line bg-surface p-0.5 font-mono text-xs">
              {(['dashboard', 'map'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  aria-pressed={view === v}
                  className={`rounded-md px-3 py-1.5 transition-colors ${
                    view === v
                      ? 'bg-accent text-[color:var(--on-accent)]'
                      : 'text-muted hover:text-ink'
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
                className="font-mono text-[11px] text-[#ef4444] hover:underline"
              >
                ⚠ dis.yaml
              </button>
            )}

            <button
              type="button"
              onClick={() => setAdding(true)}
              className="rounded-lg border border-line bg-surface px-2.5 py-1.5 font-mono text-xs text-muted hover:text-ink"
              aria-label="Añadir servicio"
              title="Añadir servicio"
            >
              +<span className="hidden sm:inline"> Añadir</span>
            </button>

            <button
              type="button"
              data-cyber-calm
              className="rounded-lg border border-line bg-surface px-2.5 py-1.5 font-mono text-xs text-muted hover:text-ink"
              title="Fondo animado (modo completo) / sereno"
              aria-label="Alternar modo sereno"
            >
              ◈
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              className="rounded-lg border border-line bg-surface px-2.5 py-1.5 font-mono text-xs text-muted hover:text-ink"
              aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
              title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
            >
              {theme === 'dark' ? '☾' : '☀'}
            </button>
          </div>
        </header>
      </div>

      <main className="flex-1">
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
          <div className="h-[calc(100dvh-7rem)] p-3">
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
