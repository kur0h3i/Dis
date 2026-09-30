import type { Tool } from '../api/types';
import { STATUS_LABEL } from '../lib/format';
import { ExternalLink } from './ExternalLink';
import { StatusDot } from './StatusDot';

interface Props {
  tool: Tool;
  onSelect: (id: string) => void;
}

export function ToolCard({ tool: t, onSelect }: Props) {
  const operational = t.stage === 'operational';
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <StatusDot status={t.status} />
          <span className="truncate font-mono text-sm font-semibold text-ink">{t.name}</span>
        </div>
        {t.is_self ? (
          <span className="shrink-0 rounded-md border border-line px-2 py-1 font-mono text-[11px] text-faint">
            estás aquí
          </span>
        ) : (
          t.url && operational && <ExternalLink href={t.url} />
        )}
      </div>
      <p className="line-clamp-2 text-sm text-muted">{t.description}</p>
      <div className="mt-auto flex items-center justify-between font-mono text-[11px] text-faint">
        <span>{STATUS_LABEL[t.status]}</span>
        {t.depends_on.length > 0 && <span className="truncate">→ {t.depends_on.join(', ')}</span>}
      </div>
    </>
  );

  const base =
    'flex h-full w-full flex-col gap-2 rounded-lg border border-line bg-surface p-4 text-left';

  if (!operational) {
    return (
      <div className={`${base} opacity-50 grayscale`} aria-disabled>
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onSelect(t.id)}
      className={`${base} transition-colors hover:border-accent/60`}
    >
      {body}
    </button>
  );
}
