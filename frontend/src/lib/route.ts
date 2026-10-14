import type { Selection } from '../api/types';

export type View = 'dashboard' | 'map';

export interface Route {
  view: View;
  selection: Selection | null;
}

const HOME: Route = { view: 'dashboard', selection: null };

/** `#/`, `#/c/<nombre>`, `#/t/<id>`, `#/mapa`, `#/mapa/c/<nombre>`, `#/mapa/t/<id>`; lo demás es el inicio. */
export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/');
  const view: View = parts[0] === 'mapa' ? 'map' : 'dashboard';
  if (view === 'map') parts.shift();
  if (parts.length === 0 || (parts.length === 1 && parts[0] === ''))
    return { view, selection: null };
  const [kind, value] = parts;
  if (parts.length !== 2 || !value || (kind !== 'c' && kind !== 't')) return HOME;
  try {
    const v = decodeURIComponent(value);
    return {
      view,
      selection: kind === 'c' ? { kind: 'container', name: v } : { kind: 'tool', id: v },
    };
  } catch {
    return HOME;
  }
}

export function formatHash({ view, selection }: Route): string {
  const base = view === 'map' ? '#/mapa' : '#';
  if (!selection) return view === 'map' ? base : '#/';
  const [kind, value] = selection.kind === 'tool' ? ['t', selection.id] : ['c', selection.name];
  return `${base}/${kind}/${encodeURIComponent(value)}`;
}
