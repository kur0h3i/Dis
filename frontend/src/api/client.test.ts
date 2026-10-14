import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, getJson } from './client';

const reply = (body: string, status: number) => async () => new Response(body, { status });

afterEach(() => vi.unstubAllGlobals());

describe('getJson', () => {
  it('fallo de red', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('fail');
    });
    await expect(getJson('/x')).rejects.toMatchObject({
      status: 0,
      message: 'Dis no responde. ¿Está en marcha el contenedor dis?',
    });
  });
  it('conserva el detail del backend', async () => {
    vi.stubGlobal('fetch', reply('{"detail":"Docker no disponible: x"}', 503));
    await expect(getJson('/x')).rejects.toMatchObject({
      status: 503,
      message: 'Docker no disponible: x',
    });
  });
  it('5xx sin detail', async () => {
    vi.stubGlobal('fetch', reply('boom', 500));
    const err = await getJson('/x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toBe(
      'Error interno de Dis (HTTP 500); mira los logs del contenedor dis',
    );
  });
});
