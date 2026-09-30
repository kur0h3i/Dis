import { STATUS_GROUPS, type StatusGroup } from '../lib/graphFocus';

interface Props {
  counts: Record<StatusGroup, number>;
  hidden: ReadonlySet<StatusGroup>;
  onToggle: (group: StatusGroup) => void;
}

/** Leyenda de estados con recuento; cada entrada muestra u oculta sus nodos. */
export function MapLegend({ counts, hidden, onToggle }: Props) {
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label="Filtrar por estado">
      {STATUS_GROUPS.map(({ group, label, color }) => {
        const off = hidden.has(group);
        return (
          <button
            key={group}
            type="button"
            onClick={() => onToggle(group)}
            aria-pressed={!off}
            title={off ? `Mostrar ${label}` : `Ocultar ${label}`}
            className={`inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 transition-colors ${
              off
                ? 'border-transparent text-faint line-through opacity-60'
                : 'border-line text-muted hover:border-accent/60 hover:text-ink'
            }`}
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={
                group === 'inactive'
                  ? { border: `1.5px dashed ${color}` }
                  : { backgroundColor: color }
              }
            />
            {label}
            <span className="text-faint">{counts[group]}</span>
          </button>
        );
      })}
    </div>
  );
}
