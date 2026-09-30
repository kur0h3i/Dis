interface Props {
  label: string;
  /** 0–100 */
  pct: number;
  detail?: string;
  /** Umbral a partir del cual la barra avisa (amarillo) y alerta (rojo). */
  warnAt?: number;
  critAt?: number;
}

/** Barra horizontal de uso (RAM, disco...). */
export function ResourceBar({ label, pct, detail, warnAt = 75, critAt = 90 }: Props) {
  const clamped = Math.min(Math.max(pct, 0), 100);
  const color = clamped >= critAt ? '#ef4444' : clamped >= warnAt ? '#eab308' : 'var(--accent)';
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 font-mono text-xs">
        <span className="truncate text-muted">{label}</span>
        <span className="shrink-0 text-ink">
          {detail && <span className="mr-2 text-faint">{detail}</span>}
          {clamped.toFixed(0)}%
        </span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${clamped}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}
