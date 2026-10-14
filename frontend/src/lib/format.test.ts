import { describe, expect, it } from 'vitest';
import { formatAge, logLevel } from './format';

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

describe('logLevel', () => {
  it('errores', () => {
    expect(logLevel('ERROR: x')).toBe('error');
    expect(logLevel('panic: boom')).toBe('error');
    expect(logLevel('fatal: no')).toBe('error');
  });
  it('avisos', () => {
    expect(logLevel('level=warning')).toBe('warn');
  });
  it('lo dem�s', () => {
    expect(logLevel('0 errors')).toBeNull();
    expect(logLevel('info ok')).toBeNull();
  });
});
