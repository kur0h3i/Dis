import { describe, expect, it } from 'vitest';
import { formatAge } from './format';

describe('formatAge', () => {
  it('menos de un minuto', () => {
    expect(formatAge(30_000)).toBe('hace menos de 1 min');
  });
  it('minutos', () => {
    expect(formatAge(5 * 60_000)).toBe('hace 5 min');
    expect(formatAge(59 * 60_000 + 59_000)).toBe('hace 59 min');
  });
  it('horas', () => {
    expect(formatAge(2 * 3_600_000)).toBe('hace 2 h');
  });
});
