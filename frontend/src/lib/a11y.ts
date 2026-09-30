import type { KeyboardEvent } from 'react';

/**
 * Props para un elemento clicable que no puede ser <button> (porque contiene
 * enlaces): rol, foco y activación con Enter/Espacio.
 */
export function clickableProps(onActivate: () => void) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    onClick: onActivate,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onActivate();
      }
    },
  };
}
