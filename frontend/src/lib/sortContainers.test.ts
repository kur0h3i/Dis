import { describe, expect, it } from 'vitest';
import type { ContainerStatus, ContainerSummary } from '../api/types';
import { familyOf, groupByFamily, sortContainers } from './sortContainers';

const mk = (name: string, status: ContainerStatus = 'running', url: string | null = null) =>
  ({ id: name, name, status, url, ports: [] }) as unknown as ContainerSummary;
const names = (l: ContainerSummary[]) => l.map((c) => c.name);

describe('familyOf', () => {
  it('corta en - o _', () => {
    expect(familyOf('minos-db')).toBe('minos');
    expect(familyOf('caronte_web_1')).toBe('caronte');
    expect(familyOf('trilium')).toBe('trilium');
  });
});

describe('groupByFamily', () => {
  it('las familias de uno van a Otros', () => {
    const g = groupByFamily([mk('minos'), mk('minos-db'), mk('node-exporter'), mk('trilium')]);
    expect(g.map((f) => [f.label, names(f.items)])).toEqual([
      ['minos', ['minos', 'minos-db']],
      ['Otros', ['node-exporter', 'trilium']],
    ]);
  });
  it('la familia con problemas va antes aunque su nombre sea mayor', () => {
    const g = groupByFamily([mk('a-1'), mk('a-2'), mk('z-1', 'unhealthy'), mk('z-2')]);
    expect(g.map((f) => f.label)).toEqual(['z', 'a']);
  });
});

describe('sortContainers', () => {
  const list = [mk('a'), mk('b', 'stopped'), mk('c', 'unhealthy'), mk('d', 'running', 'http://d')];
  it('por defecto sube el problema; el parado no', () => {
    expect(names(sortContainers(list, 'default'))).toEqual(['c', 'a', 'b', 'd']);
  });
  it('abribles primero: problemas, abribles, resto', () => {
    expect(names(sortContainers(list, 'active-first'))).toEqual(['c', 'd', 'a', 'b']);
  });
  it('restarting también sube', () => {
    expect(names(sortContainers([mk('a'), mk('b', 'restarting')], 'default'))).toEqual(['b', 'a']);
  });
});
