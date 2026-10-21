/**
 * Store BuscadorRepositorios — PUENTE de búsqueda externa de modelos 3D (chat_tool).
 *
 * DELEGA en crawl4rs.buscar (vía SearXNG) y devuelve resultados tipados
 * ResultadoRepositorio { fuente, titulo, url, autor, formatos }.
 * NO inventa resultados: refleja lo que el puerto obtiene; el dueño elige y
 * aprueba, y la importación posterior la hace importacion. CERO juicio.
 */
import { writable, derived } from 'svelte/store';
import { mqttRequest } from '$lib/ui-core/mqtt-request';

// =============================================================================
// TYPES
// =============================================================================

export interface ResultadoRepositorio {
  fuente?: string;
  titulo?: string;
  url?: string;
  autor?: string;
  formatos?: string[];
  [key: string]: unknown;
}

interface BuscadorState {
  resultados: ResultadoRepositorio[];
  query: string;
  loading: boolean;
  error: string | null;
  resultado: { type: 'ok' | 'error' | 'info'; message: string } | null;
}

const initialState: BuscadorState = {
  resultados: [],
  query: '',
  loading: false,
  error: null,
  resultado: null
};

// =============================================================================
// STORE
// =============================================================================

export const buscadorStore = writable<BuscadorState>(initialState);

// =============================================================================
// DERIVADOS
// =============================================================================

export const resultadosBusqueda = derived(buscadorStore, $s => $s.resultados);
export const buscadorLoading = derived(buscadorStore, $s => $s.loading);
export const buscadorError = derived(buscadorStore, $s => $s.error);
export const resultadosCount = derived(buscadorStore, $s => $s.resultados.length);

// =============================================================================
// ACCIONES (reflejan, no inventan)
// =============================================================================

/** Busca en repositorios externos por query (bajo demanda desde el chat). */
export async function buscarModelos(
  projectId: string,
  query: string,
  limit = 10
): Promise<ResultadoRepositorio[]> {
  if (!projectId || !query.trim()) return [];
  buscadorStore.update(s => ({
    ...s, loading: true, error: null, query,
    resultado: { type: 'info', message: 'Buscando en repositorios externos…' }
  }));
  try {
    const res = await mqttRequest<any>(
      'buscador-repositorios',
      'buscar',
      { project_id: projectId, query: query.trim(), limit },
      { timeout: 20000 }
    );
    const data = res?.data as any;
    const resultados = data?.resultados || data?.results || data?.repositorios || [];
    const list = Array.isArray(resultados) ? resultados : [];
    buscadorStore.update(s => ({
      ...s,
      resultados: list,
      loading: false,
      resultado: { type: 'ok', message: `${list.length} resultado(s)` }
    }));
    return list;
  } catch (err: any) {
    buscadorStore.update(s => ({
      ...s,
      loading: false,
      resultados: [],
      error: `buscar: ${err.message}`,
      resultado: { type: 'error', message: `❌ Búsqueda fallida: ${err.message}` }
    }));
    return [];
  }
}

export function resetBuscadorStore(): void {
  buscadorStore.set(initialState);
}
