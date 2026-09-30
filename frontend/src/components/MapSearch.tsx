import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import type { GraphNode } from '../api/types';
import { matchesQuery, normalizeText } from '../lib/graphFocus';
import { ServiceIcon } from './ServiceIcon';
import { StatusDot } from './StatusDot';

const MAX_RESULTS = 6;

interface Props {
  nodes: GraphNode[];
  query: string;
  onQueryChange: (query: string) => void;
  onPick: (node: GraphNode) => void;
}

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

/**
 * Buscador del mapa (combobox): `/` lo enfoca, ↑/↓ recorren los resultados y
 * Enter lleva al nodo. Mientras hay texto, el mapa atenúa lo que no coincide.
 */
export function MapSearch({ nodes, query, onQueryChange, onPick }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const q = normalizeText(query.trim());
  const results = q ? nodes.filter((n) => matchesQuery(n, q)).slice(0, MAX_RESULTS) : [];
  const current = Math.min(active, results.length - 1);
  const expanded = open && q.length > 0;

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || isEditable(e.target)) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const pick = (node: GraphNode) => {
    onPick(node);
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (results.length === 0) return;
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setOpen(true);
      setActive((current + step + results.length) % results.length);
    } else if (e.key === 'Enter') {
      const node = results[current];
      if (node) {
        e.preventDefault();
        pick(node);
      }
    } else if (e.key === 'Escape') {
      // Escape aquí solo afecta al buscador (no cierra el panel lateral).
      e.stopPropagation();
      if (query) onQueryChange('');
      else inputRef.current?.blur();
    }
  };

  return (
    <div className="relative">
      <svg
        viewBox="0 0 16 16"
        className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-faint"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        aria-hidden
      >
        <circle cx="7" cy="7" r="4.5" />
        <path d="m10.5 10.5 3 3" strokeLinecap="round" />
      </svg>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-label="Buscar servicio en el mapa"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={expanded && current >= 0 ? `${listId}-${current}` : undefined}
        placeholder="Buscar servicio…"
        autoComplete="off"
        spellCheck={false}
        value={query}
        onChange={(e) => {
          onQueryChange(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        className="w-full rounded-md border border-line bg-bg py-1.5 pr-8 pl-8 font-mono text-xs text-ink placeholder:text-faint"
      />
      {query ? (
        <button
          type="button"
          onClick={() => {
            onQueryChange('');
            inputRef.current?.focus();
          }}
          aria-label="Limpiar búsqueda"
          className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded px-1.5 text-faint hover:text-ink"
        >
          ✕
        </button>
      ) : (
        <kbd
          className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border border-line px-1 text-[10px] text-faint"
          aria-hidden
        >
          /
        </kbd>
      )}

      {expanded && (
        <div className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-md border border-line bg-surface shadow-lg shadow-black/20">
          {results.length === 0 && <p className="px-3 py-2 text-faint">Sin resultados</p>}
          <ul id={listId} role="listbox" aria-label="Servicios encontrados">
            {results.map((n, i) => (
              <li
                key={n.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === current}
                // Evita que el input pierda el foco (y cierre la lista) antes del clic.
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(n)}
                className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 ${
                  i === current ? 'bg-surface-2 text-ink' : 'text-muted'
                }`}
              >
                <ServiceIcon icons={n.icons} name={n.label} size={16} />
                <StatusDot status={n.status} />
                <span className="truncate">{n.label}</span>
                <span className="ml-auto shrink-0 text-[10px] text-faint uppercase">
                  {n.type === 'tool' ? 'tool' : 'docker'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
