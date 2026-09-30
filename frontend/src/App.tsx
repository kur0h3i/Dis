import { useState } from 'react';
import { mockAlerts, mockContainers, mockResources, mockTools } from './api/mock';
import type { Selection } from './api/types';
import { useTheme } from './lib/theme';
import { DashboardView } from './views/DashboardView';

type View = 'dashboard' | 'map';

const ok = <T,>(data: T) => ({ data, error: null, isLoading: false });

export default function App() {
  const [theme, toggleTheme] = useTheme();
  const [view, setView] = useState<View>('dashboard');
  const [selection, setSelection] = useState<Selection | null>(null);

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

          <nav className="ml-auto flex rounded-lg border border-line bg-surface p-0.5 font-mono text-xs">
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
            resources={ok(mockResources)}
            containers={ok(mockContainers)}
            tools={ok(mockTools)}
            alerts={ok(mockAlerts)}
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
