import { useState } from 'react';

// URLs ya resueltas en esta sesión: al volver a montar un nodo o una tarjeta
// (cambiar de vista, filtrar) ni se reintentan las rotas ni parpadea la inicial.
const failed = new Set<string>();
const loaded = new Set<string>();

// Logos del catálogo dashboard-icons (ver backend/app/icons.py): transparentes y
// muchos oscuros (Adminer, Valkey, GitHub...), así que van sobre una baldosa
// clara, como el icono de una app; en el tema oscuro no se verían. Los favicons
// (Dis, Caronte, Cerbero...) ya están pensados para verse solos en la pestaña
// del navegador: se pintan tal cual, sin el marco blanco alrededor.
const CATALOG = '/homarr-labs/dashboard-icons/';

/** Tono estable por nombre, para que cada monograma tenga su color. */
function hue(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) % 360;
  return h;
}

interface Props {
  /** URLs candidatas en orden de preferencia (las calcula el backend, ver icons.py). */
  icons: string[];
  name: string;
  /** Lado en px. */
  size?: number;
  className?: string;
}

/**
 * Logo del servicio: la primera URL candidata que carga. Mientras tanto, o si
 * ninguna carga, un monograma con la inicial. Es decorativo: el nombre siempre
 * va al lado.
 */
export function ServiceIcon({ icons, name, size = 20, className = '' }: Props) {
  const [, setFailures] = useState(0);
  const [ready, setReady] = useState<string | null>(null);
  const src = icons.find((u) => !failed.has(u));
  const shown = src != null && (ready === src || loaded.has(src));
  const tile = shown && src.includes(CATALOG);

  return (
    <span
      aria-hidden
      className={`relative inline-flex shrink-0 items-center justify-center rounded-md ${
        tile ? 'bg-zinc-100' : ''
      } ${className}`}
      style={{ width: size, height: size, padding: tile ? Math.round(size * 0.1) : 0 }}
    >
      {!shown && (
        <span
          className="flex h-full w-full items-center justify-center rounded-md font-mono font-bold text-white select-none"
          style={{
            backgroundColor: `hsl(${hue(name)} 42% 42%)`,
            fontSize: Math.round(size * 0.55),
          }}
        >
          {(name.trim()[0] ?? '?').toUpperCase()}
        </span>
      )}
      {src != null && (
        <img
          key={src}
          src={src}
          alt=""
          draggable={false}
          decoding="async"
          // El CDN no necesita saber desde qué host se abre Dis.
          referrerPolicy="no-referrer"
          onLoad={() => {
            loaded.add(src);
            setReady(src);
          }}
          onError={() => {
            failed.add(src);
            setFailures((n) => n + 1);
          }}
          className={`h-full w-full object-contain ${shown ? '' : 'absolute inset-0 opacity-0'}`}
        />
      )}
    </span>
  );
}
