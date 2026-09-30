import { useState } from 'react';
import { useAlerts, useContainers, useResources, useTools } from './api/hooks';
import type { Selection } from './api/types';
import { useTheme } from './lib/theme';
import { DashboardView } from './views/DashboardView';

type View = 'dashboard' | 'map';

export default function App() {
  const [theme, toggleTheme] = useTheme();
  const [view, setView] = useState<View>('dashboard');
  const [selection, setSelection] = useState<Selection | null>(null);

  const resources = useResources();
  const containers = useContainers();
  const tools = useTools();
  const alerts = useAlerts();

  return (
    <div className="flex h-full flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-lg font-bold tracking-[0.3em] text-accent-ink">
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
              style={{ backgroundColor: resources.error ? '#ef4444' : '#22c55e' }}
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
                className={`rounded-md px-3 py-1.5 transition-colors ${
                  view === v ? 'bg-accent text-white' : 'text-muted hover:text-ink'
                }`}
              >
                {v === 'dashboard' ? 'Dashboard' : 'Mapa'}
              </button>
            ))}
          </nav>

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
          <div className="p-6 font-mono text-sm text-faint">Mapa de servicios — pendiente.</div>
        )}
      </main>
    </div>
  );
}
