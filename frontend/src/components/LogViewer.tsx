import { useEffect, useRef, useState } from 'react';
import { logLevel } from '../lib/format';

interface Props {
  lines: string[] | undefined;
  loading: boolean;
  error?: string | null;
  onRefresh: () => void;
  onClear: () => void;
  updatedAt?: number;
}

/** Últimas líneas de log en monoespaciada, con scroll automático al final. */
export function LogViewer({ lines, loading, error, onRefresh, onClear, updatedAt }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState('');
  const shown =
    lines && filter ? lines.filter((l) => l.toLowerCase().includes(filter.toLowerCase())) : lines;

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [shown]);

  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <div className="flex items-center justify-between gap-2 border-b border-line bg-surface-2 px-3 py-1.5">
        <span className="font-mono text-[11px] text-faint">
          {lines
            ? filter
              ? `${shown?.length} de ${lines.length} líneas`
              : `${lines.length} líneas`
            : '—'}
          {updatedAt ? ` · ${new Date(updatedAt).toLocaleTimeString()}` : ''}
        </span>
        <input
          type="text"
          aria-label="Filtrar logs"
          placeholder="filtrar…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="min-w-0 flex-1 rounded border border-line bg-bg px-2 py-0.5 pointer-coarse:min-h-10 font-mono text-[11px] text-ink placeholder:text-faint"
        />
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onClear}
            className="rounded px-2 py-0.5 pointer-coarse:min-h-10 font-mono text-[11px] text-muted hover:bg-surface hover:text-ink"
          >
            limpiar
          </button>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="rounded px-2 py-0.5 pointer-coarse:min-h-10 font-mono text-[11px] text-accent-ink hover:bg-surface disabled:opacity-50"
          >
            {loading ? 'cargando…' : 'refrescar'}
          </button>
        </div>
      </div>
      <div
        ref={scrollRef}
        className="h-72 overflow-auto bg-bg px-3 py-2 font-mono text-[11px] leading-relaxed text-muted"
      >
        {error && <div className="text-danger">{error}</div>}
        {!error && shown && shown.length === 0 && <div className="text-faint">(sin líneas)</div>}
        {shown?.map((line, i) => (
          <div
            key={i}
            className={`break-all whitespace-pre-wrap hover:bg-surface-2 ${
              { error: 'text-danger', warn: 'text-warn', none: '' }[logLevel(line) ?? 'none']
            }`}
          >
            {line || ' '}
          </div>
        ))}
      </div>
    </div>
  );
}
