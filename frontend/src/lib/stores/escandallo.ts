/**
 * Escandallo Store — lecturas directas via fs.read sobre /recetas.json.
 *
 * Tras el bump de escandallo a blueprint v2.0.0 (commit b37cd7e en main),
 * los costes se persisten en cada receta dentro de /recetas.json (campos
 * coste_total, coste_porcion, ingredientes_detalle, ingredientes_sin_precio,
 * etc.). Este store agrega/sintetiza las vistas que la pagina necesita
 * leyendo ese mismo archivo — cero handler backend, mismo patron que el
 * resto del subsistema-carta tras esta rama.
 *
 * Para CALCULAR un coste nuevo (que aun no este persistido), el usuario
 * lo pide al chat ("calcula el coste de esta receta"). El blueprint v2
 * lo computa y persiste. La pagina lee el resultado al recargar.
 */

import { writable, derived, get } from 'svelte/store';
import { subscribe as mqttSubscribe } from '$lib/ui-core/mqtt';
import { mqttRequest, MqttRequestError } from '$lib/ui-core/mqtt-request';
import { activeProjectId } from './projects';

// =============================================================================
// TYPES (preservados para no romper paneles)
// =============================================================================

export interface EscandalloDesglose {
  nombre: string;
  cantidad: number;
  unidad: string;
  precio: number;
  tipo_precio: 'mercado' | 'compra';
  porcentaje: number;
}

export interface EscandalloReceta {
  receta_id: string;
  nombre: string;
  categoria: string;
  porciones: number;
  coste_total: number;
  coste_porcion: number;
  desglose: EscandalloDesglose[];
  precio_venta?: number;
  margen_euro?: number;
  margen_porcentaje?: number;
  food_cost_porcentaje?: number;
  multiplicador?: number;
  insights?: string[];
}

export interface RankingReceta {
  receta_id: string;
  nombre: string;
  categoria?: string;
  estado_operativo?: string;
  coste_porcion: number;
  coste_total: number;
}

export interface TopIngrediente {
  nombre: string;
  coste_total: number;
  apariciones: number;
}

export interface EscandalloGlobal {
  total_recetas: number;
  total_recetas_con_coste: number;
  total_ingredientes_catalogo: number;
  coste_porcion_medio: number;
  coste_porcion_min: number;
  coste_porcion_max: number;
  ranking_por_coste: RankingReceta[];
  por_categoria: Record<string, { count: number; coste_medio: number }>;
  top_ingredientes_por_coste: TopIngrediente[];
  recetas: RankingReceta[];
  costes_actualizados_at?: string;
}

export interface EscandalloState {
  escandalloReceta: EscandalloReceta | null;
  escandalloGlobal: EscandalloGlobal | null;
  loading: boolean;
  error: string | null;
  activeView: 'receta' | 'global' | 'comparativa';
}

// =============================================================================
// INTERNAL — shape de /recetas.json
// =============================================================================

interface IngredienteDetallePersisted {
  nombre: string;
  cantidad: number;
  unidad: string;
  precio_unitario: number | null;
  valor_calculado: number | null;
  fuente: string;
  precio_unidad?: number | null;
  precio_kg?: number | null;
}

interface RecetaPersisted {
  id: string;
  nombre: string;
  porciones: number;
  dificultad?: string;
  estado_operativo?: string;
  ingredientes?: Array<{ nombre: string; cantidad: number; unidad?: string }>;
  // Campos escritos por escandallo v2:
  coste_total?: number;
  coste_porcion?: number;
  coste_actualizado_at?: string;
  postcode_usado?: string;
  fuentes_precios?: string[];
  ingredientes_detalle?: IngredienteDetallePersisted[];
  ingredientes_sin_precio?: string[];
}

interface RecetasStorePersisted {
  recetas?: RecetaPersisted[];
  ingredientes_catalogo?: unknown[];
  _updated_at?: string;
}

const STORE_PATH = '/recetas.json';

// =============================================================================
// STORE
// =============================================================================

const initialState: EscandalloState = {
  escandalloReceta: null,
  escandalloGlobal: null,
  loading: false,
  error: null,
  activeView: 'global'
};

export const escandalloStore = writable<EscandalloState>(initialState);

// =============================================================================
// HELPERS
// =============================================================================

async function readRecetasStore(): Promise<RecetasStorePersisted | null> {
  try {
    const res = await mqttRequest<{ content: string }>('fs', 'read', { path: STORE_PATH });
    const content = res.data?.content;
    if (typeof content !== 'string') return null;
    return JSON.parse(content) as RecetasStorePersisted;
  } catch (err) {
    if (err instanceof MqttRequestError && err.code === 'RESOURCE_NOT_FOUND') return null;
    throw err;
  }
}

function detalleToDesglose(detalle: IngredienteDetallePersisted[], costeTotal: number): EscandalloDesglose[] {
  if (!Array.isArray(detalle) || costeTotal <= 0) return [];
  return detalle.map(d => {
    const valor = typeof d.valor_calculado === 'number' ? d.valor_calculado : 0;
    return {
      nombre: d.nombre,
      cantidad: d.cantidad,
      unidad: d.unidad,
      precio: typeof d.precio_unitario === 'number' ? d.precio_unitario : 0,
      tipo_precio: d.fuente === 'mercadona' ? 'mercado' as const : 'compra' as const,
      porcentaje: costeTotal > 0 ? (valor / costeTotal) * 100 : 0
    };
  });
}

// =============================================================================
// ACTIONS
// =============================================================================

export async function loadEscandalloReceta(recetaId: string, precioVenta?: number): Promise<void> {
  escandalloStore.update(s => ({ ...s, loading: true, error: null }));
  try {
    const store = await readRecetasStore();
    if (!store) {
      escandalloStore.update(s => ({
        ...s, loading: false, error: 'No hay recetas — crea recetas primero en /recetas'
      }));
      return;
    }
    const r = (store.recetas || []).find(x => x.id === recetaId);
    if (!r) {
      escandalloStore.update(s => ({
        ...s, loading: false, error: `Receta ${recetaId} no encontrada`
      }));
      return;
    }
    if (typeof r.coste_total !== 'number') {
      escandalloStore.update(s => ({
        ...s,
        loading: false,
        escandalloReceta: null,
        error: 'Esta receta no tiene coste calculado todavía. Pídele al chat: "calcula el coste de la receta ' + r.nombre + '"'
      }));
      return;
    }

    const data: EscandalloReceta = {
      receta_id: r.id,
      nombre: r.nombre,
      categoria: r.estado_operativo || '',
      porciones: r.porciones,
      coste_total: r.coste_total,
      coste_porcion: typeof r.coste_porcion === 'number' ? r.coste_porcion : 0,
      desglose: detalleToDesglose(r.ingredientes_detalle || [], r.coste_total)
    };

    if (typeof precioVenta === 'number' && precioVenta > 0) {
      data.precio_venta = precioVenta;
      data.margen_euro = precioVenta - r.coste_porcion!;
      data.margen_porcentaje = ((precioVenta - r.coste_porcion!) / precioVenta) * 100;
      data.food_cost_porcentaje = (r.coste_porcion! / precioVenta) * 100;
      data.multiplicador = r.coste_porcion! > 0 ? precioVenta / r.coste_porcion! : 0;
    }

    escandalloStore.update(s => ({
      ...s, escandalloReceta: data, loading: false, activeView: 'receta'
    }));
  } catch (error) {
    escandalloStore.update(s => ({ ...s, loading: false, error: getErrorMessage(error) }));
  }
}

export async function loadEscandalloGlobal(): Promise<void> {
  escandalloStore.update(s => ({ ...s, loading: true, error: null }));
  try {
    const pid = get(activeProjectId);
    if (!pid) {
      escandalloStore.update(s => ({ ...s, loading: false }));
      return;
    }

    const store = await readRecetasStore();
    if (!store) {
      escandalloStore.update(s => ({
        ...s,
        loading: false,
        escandalloGlobal: emptyGlobal()
      }));
      return;
    }

    const allRecetas = Array.isArray(store.recetas) ? store.recetas : [];
    const conCoste = allRecetas.filter(r => r && typeof r.coste_total === 'number' && typeof r.coste_porcion === 'number');

    if (conCoste.length === 0) {
      escandalloStore.update(s => ({
        ...s,
        loading: false,
        escandalloGlobal: {
          ...emptyGlobal(),
          total_recetas: allRecetas.length,
          total_ingredientes_catalogo: Array.isArray(store.ingredientes_catalogo) ? store.ingredientes_catalogo.length : 0
        }
      }));
      return;
    }

    // Agregados de coste_porcion
    const costesPorcion = conCoste.map(r => r.coste_porcion as number);
    const sum = costesPorcion.reduce((a, b) => a + b, 0);
    const coste_porcion_medio = sum / conCoste.length;
    const coste_porcion_min = Math.min(...costesPorcion);
    const coste_porcion_max = Math.max(...costesPorcion);

    // Ranking por coste_porcion descendente (top 20)
    const ranking_por_coste: RankingReceta[] = conCoste
      .slice()
      .sort((a, b) => (b.coste_porcion as number) - (a.coste_porcion as number))
      .slice(0, 20)
      .map(r => ({
        receta_id: r.id,
        nombre: r.nombre,
        categoria: r.estado_operativo || '',
        estado_operativo: r.estado_operativo,
        coste_porcion: r.coste_porcion as number,
        coste_total: r.coste_total as number
      }));

    // Por categoria (usamos estado_operativo como pivote — el blueprint no tiene categoria)
    const por_categoria: Record<string, { count: number; coste_medio: number; suma: number }> = {};
    for (const r of conCoste) {
      const key = r.estado_operativo || 'sin_estado';
      if (!por_categoria[key]) por_categoria[key] = { count: 0, coste_medio: 0, suma: 0 };
      por_categoria[key].count++;
      por_categoria[key].suma += (r.coste_porcion as number);
    }
    const por_categoria_final: Record<string, { count: number; coste_medio: number }> = {};
    for (const [k, v] of Object.entries(por_categoria)) {
      por_categoria_final[k] = { count: v.count, coste_medio: v.count > 0 ? v.suma / v.count : 0 };
    }

    // Top ingredientes por coste agregado (suma de valor_calculado en todas las recetas)
    const ingAgg: Record<string, { coste_total: number; apariciones: number }> = {};
    for (const r of conCoste) {
      const detalle = Array.isArray(r.ingredientes_detalle) ? r.ingredientes_detalle : [];
      for (const d of detalle) {
        if (!d || typeof d.nombre !== 'string' || typeof d.valor_calculado !== 'number') continue;
        const k = d.nombre.toLowerCase();
        if (!ingAgg[k]) ingAgg[k] = { coste_total: 0, apariciones: 0 };
        ingAgg[k].coste_total += d.valor_calculado;
        ingAgg[k].apariciones++;
      }
    }
    const top_ingredientes_por_coste: TopIngrediente[] = Object.entries(ingAgg)
      .map(([nombre, v]) => ({ nombre, coste_total: Math.round(v.coste_total * 100) / 100, apariciones: v.apariciones }))
      .sort((a, b) => b.coste_total - a.coste_total)
      .slice(0, 15);

    // Último timestamp de cálculo
    const timestamps = conCoste
      .map(r => r.coste_actualizado_at)
      .filter((t): t is string => typeof t === 'string')
      .sort();
    const costes_actualizados_at = timestamps.length > 0 ? timestamps[timestamps.length - 1] : undefined;

    const escandalloGlobal: EscandalloGlobal = {
      total_recetas: allRecetas.length,
      total_recetas_con_coste: conCoste.length,
      total_ingredientes_catalogo: Array.isArray(store.ingredientes_catalogo) ? store.ingredientes_catalogo.length : 0,
      coste_porcion_medio: Math.round(coste_porcion_medio * 100) / 100,
      coste_porcion_min: Math.round(coste_porcion_min * 100) / 100,
      coste_porcion_max: Math.round(coste_porcion_max * 100) / 100,
      ranking_por_coste,
      por_categoria: por_categoria_final,
      top_ingredientes_por_coste,
      recetas: ranking_por_coste,
      costes_actualizados_at
    };

    escandalloStore.update(s => ({ ...s, escandalloGlobal, loading: false }));
  } catch (error) {
    escandalloStore.update(s => ({ ...s, loading: false, error: getErrorMessage(error) }));
  }
}

function emptyGlobal(): EscandalloGlobal {
  return {
    total_recetas: 0,
    total_recetas_con_coste: 0,
    total_ingredientes_catalogo: 0,
    coste_porcion_medio: 0,
    coste_porcion_min: 0,
    coste_porcion_max: 0,
    ranking_por_coste: [],
    por_categoria: {},
    top_ingredientes_por_coste: [],
    recetas: []
  };
}

export function setActiveView(view: EscandalloState['activeView']): void {
  escandalloStore.update(s => ({ ...s, activeView: view }));
}

export function clearError(): void {
  escandalloStore.update(s => ({ ...s, error: null }));
}

// =============================================================================
// SUBSCRIPTIONS
// =============================================================================

let cleanupFns: (() => void)[] = [];

export function initEscandalloSubscriptions(): () => void {
  cleanupFns.forEach(fn => fn());
  cleanupFns = [];

  // Cuando escandallo v2 termina de calcular y persistir, refrescamos.
  cleanupFns.push(
    mqttSubscribe('escandallo.coste.actualizado', (_topic, payload) => {
      const data = payload as { receta_id?: string };
      console.log('[Escandallo] Coste actualizado:', data?.receta_id);
      loadEscandalloGlobal();
    })
  );

  loadEscandalloGlobal();

  return () => {
    cleanupFns.forEach(fn => fn());
    cleanupFns = [];
  };
}

// =============================================================================
// HELPERS
// =============================================================================

function getErrorMessage(error: unknown): string {
  if (error instanceof MqttRequestError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Error desconocido';
}

// =============================================================================
// DERIVED
// =============================================================================

export const escandalloReceta = derived(escandalloStore, $s => $s.escandalloReceta);
export const escandalloGlobal = derived(escandalloStore, $s => $s.escandalloGlobal);
export const escandalloLoading = derived(escandalloStore, $s => $s.loading);
export const escandalloError = derived(escandalloStore, $s => $s.error);
