import type { MouseEvent } from 'react';

interface Props {
  href: string;
  label?: string;
  className?: string;
}

/** Botón "Abrir ↗" que no propaga el clic (las tarjetas son clicables). */
export function ExternalLink({ href, label = 'Abrir', className = '' }: Props) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      onClick={(e: MouseEvent) => e.stopPropagation()}
      className={`inline-flex items-center gap-1 rounded-md border border-accent/40 bg-accent/10 px-2 py-1 font-mono text-xs text-accent-ink transition-colors hover:border-accent-2 hover:bg-accent/20 ${className}`}
    >
      {label}
      <svg
        viewBox="0 0 16 16"
        className="h-3 w-3"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
      >
        <path d="M6 3h7v7M13 3 6 10M11 13H3V5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </a>
  );
}
