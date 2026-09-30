import { useId, useState, type MouseEvent } from 'react';

interface Props {
  values: number[];
  /** Etiqueta de cada punto para el tooltip (p. ej. hora). */
  labels?: string[];
  /** Escala fija (p. ej. 0–100 para %). Si no, se ajusta a los datos. */
  min?: number;
  max?: number;
  color?: string;
  height?: number;
  format?: (v: number) => string;
  ariaLabel: string;
  /** Nº de huecos esperados, para que la línea crezca de izquierda a derecha. */
  capacity?: number;
}

/**
 * Sparkline SVG sin dependencias: línea de 2px, área tenue y crosshair con tooltip.
 * La geometría usa un viewBox 0–100 estirado; el trazo no escala gracias a
 * `vector-effect`, y el marcador/tooltip se posicionan en % sobre el contenedor.
 */
export function MiniChart({
  values,
  labels,
  min,
  max,
  color = 'var(--accent)',
  height = 48,
  format = (v) => v.toFixed(1),
  ariaLabel,
  capacity,
}: Props) {
  const gradientId = useId();
  const [hover, setHover] = useState<number | null>(null);

  const slots = Math.max(capacity ?? values.length, values.length, 2);
  const lo = min ?? Math.min(...values, 0);
  const hiRaw = max ?? Math.max(...values, 1);
  const hi = hiRaw === lo ? lo + 1 : hiRaw;
  const offset = slots - values.length; // alinea a la derecha los datos más recientes

  const xAt = (i: number) => ((i + offset) / (slots - 1)) * 100;
  const yAt = (v: number) => 100 - ((Math.min(Math.max(v, lo), hi) - lo) / (hi - lo)) * 100;

  const points = values.map((v, i) => `${xAt(i).toFixed(2)},${yAt(v).toFixed(2)}`);
  const line = points.length ? `M${points.join(' L')}` : '';
  const area =
    points.length > 1
      ? `${line} L${xAt(values.length - 1).toFixed(2)},100 L${xAt(0).toFixed(2)},100 Z`
      : '';

  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!values.length) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const slot = Math.round(((e.clientX - rect.left) / rect.width) * (slots - 1));
    setHover(Math.min(Math.max(slot - offset, 0), values.length - 1));
  };

  const hv = hover != null ? values[hover] : undefined;

  return (
    <div
      className="relative w-full select-none"
      style={{ height }}
      onMouseMove={onMove}
      onMouseLeave={() => setHover(null)}
      role="img"
      aria-label={ariaLabel}
    >
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full overflow-visible"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.22} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <line
          x1="0"
          x2="100"
          y1="100"
          y2="100"
          stroke="var(--grid)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
        {area && <path d={area} fill={`url(#${gradientId})`} />}
        {line && (
          <path
            d={line}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      {hover != null && hv != null && (
        <>
          <div
            className="pointer-events-none absolute inset-y-0 w-px bg-faint/50"
            style={{ left: `${xAt(hover)}%` }}
          />
          <div
            className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
            style={{
              left: `${xAt(hover)}%`,
              top: `${yAt(hv)}%`,
              backgroundColor: color,
              borderColor: 'var(--surface)',
            }}
          />
          <div
            className="pointer-events-none absolute -top-1 z-10 rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-[11px] whitespace-nowrap text-ink shadow"
            style={{
              left: `${xAt(hover)}%`,
              transform: `translate(${xAt(hover) > 70 ? '-100%' : xAt(hover) < 30 ? '0' : '-50%'}, -100%)`,
            }}
          >
            {format(hv)}
            {labels?.[hover] && <span className="ml-1.5 text-faint">{labels[hover]}</span>}
          </div>
        </>
      )}
    </div>
  );
}
