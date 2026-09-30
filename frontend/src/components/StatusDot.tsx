import type { ToolStatus } from '../api/types';
import { STATUS_COLOR, STATUS_LABEL } from '../lib/format';

interface Props {
  status: ToolStatus;
  withLabel?: boolean;
  className?: string;
}

/** Punto de estado; con `withLabel` añade el texto para no depender solo del color. */
export function StatusDot({ status, withLabel = false, className = '' }: Props) {
  const color = STATUS_COLOR[status];
  const pulse = status === 'running' || status === 'restarting';
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className="relative inline-flex h-2 w-2 shrink-0" aria-hidden>
        {pulse && (
          <span
            className="absolute inset-0 animate-ping rounded-full opacity-40"
            style={{ backgroundColor: color, animationDuration: '2.4s' }}
          />
        )}
        <span className="relative h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      </span>
      {withLabel ? (
        <span className="font-mono text-xs text-muted">{STATUS_LABEL[status]}</span>
      ) : (
        <span className="sr-only">{STATUS_LABEL[status]}</span>
      )}
    </span>
  );
}
