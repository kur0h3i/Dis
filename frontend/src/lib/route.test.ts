import { describe, expect, it } from 'vitest';
import { formatHash, parseHash, type Route } from './route';

const HOME: Route = { view: 'dashboard', selection: null };

describe('route', () => {
  const cases: [string, Route][] = [
    ['#/', HOME],
    ['#/c/minos', { view: 'dashboard', selection: { kind: 'container', name: 'minos' } }],
    ['#/t/caronte', { view: 'dashboard', selection: { kind: 'tool', id: 'caronte' } }],
    ['#/mapa', { view: 'map', selection: null }],
    ['#/mapa/c/minos', { view: 'map', selection: { kind: 'container', name: 'minos' } }],
    ['#/mapa/t/caronte', { view: 'map', selection: { kind: 'tool', id: 'caronte' } }],
  ];
  it.each(cases)('ida y vuelta de %s', (hash, route) => {
    expect(parseHash(hash)).toEqual(route);
    expect(formatHash(route)).toBe(hash);
  });
  it('vacío es el inicio', () => {
    expect(parseHash('')).toEqual(HOME);
    expect(parseHash('#')).toEqual(HOME);
  });
  it('decodifica el nombre', () => {
    expect(parseHash('#/c/a%2Fb').selection).toEqual({ kind: 'container', name: 'a/b' });
    expect(formatHash({ view: 'dashboard', selection: { kind: 'container', name: 'a/b' } })).toBe(
      '#/c/a%2Fb',
    );
  });
  it.each(['#/xyz', '#/c/', '#/c/%E0', '#/mapa/x/y', '#/c/a/b'])('basura %s va al inicio', (h) => {
    expect(parseHash(h)).toEqual(HOME);
  });
});
