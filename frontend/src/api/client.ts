export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** GET a la API de Dis (mismo origen; en desarrollo, Vite hace de proxy). */
export async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { signal, headers: { Accept: 'application/json' } });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(0, 'Dis no responde. ¿Está en marcha el contenedor dis?');
  }
  if (!res.ok) {
    let detail = '';
    try {
      const body = (await res.json()) as { detail?: unknown };
      if (typeof body.detail === 'string') detail = body.detail;
    } catch {
      // cuerpo no JSON: nos quedamos con statusText
    }
    if (!detail && res.status >= 500)
      detail = `Error interno de Dis (HTTP ${res.status}); mira los logs del contenedor dis`;
    throw new ApiError(res.status, detail || res.statusText || `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}
