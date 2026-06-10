/**
 * Escandallo Store — lecturas directas via fs.read sobre /pizzepos/recetas.json.
 *
 * Tras el bump de escandallo a blueprint v2.0.0 (commit b37cd7e en main),
 * los costes se persisten en cada receta dentro de /pizzepos/recetas.json (campos
 * coste_total, coste_unidad, lineas_detalle, lineas_sin_precio,
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
  coste_unidad: number;
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
  coste_unidad: number;
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
  coste_unidad_medio: number;
  coste_unidad_min: number;
  coste_unidad_max: number;
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
// INTERNAL — shape de /pizzepos/recetas.json
// =============================================================================

interface LineaDetallePersisted {
  ref?: string | null;
  nombre: string;
  cantidad: number;
  unidad: string;
  precio_unitario: number | null;
  valor_calculado: number | null;
  fuente: string;
}

interface RecetaPersisted {
  id: string;
  nombre: string;
  tipo?: string;
  rinde?: { cantidad: number; unidad: string } | null;
  estado_operativo?: string;
  lineas?: Array<{ ref?: string | null; nombre: string; cantidad: number; unidad?: string }>;
  // Campos escritos por escandallo (coste):
  coste_total?: number;
  coste_unidad?: number;
  coste_actualizado_at?: string;
  fuentes_precios?: string[];
  lineas_detalle?: LineaDetallePersisted[];
  lineas_sin_precio?: string[];
}

interface RecetasStorePersisted {
  recetas?: RecetaPersisted[];
  ingredientes_catalogo?: unknown[];
  _updated_at?: string;
}

const STORE_PATH = '/pizzepos/recetas.json';

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

function detalleToDesglose(detalle: LineaDetallePersisted[], costeTotal: number): EscandalloDesglose[] {
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
      categoria: r.tipo || r.estado_operativo || '',
      porciones: r.rinde?.cantidad ?? 1,
      coste_total: r.coste_total,
      coste_unidad: typeof r.coste_unidad === 'number' ? r.coste_unidad : 0,
      desglose: detalleToDesglose(r.lineas_detalle || [], r.coste_total)
    };

    if (typeof precioVenta === 'number' && precioVenta > 0) {
      data.precio_venta = precioVenta;
      data.margen_euro = precioVenta - r.coste_unidad!;
      data.margen_porcentaje = ((precioVenta - r.coste_unidad!) / precioVenta) * 100;
      data.food_cost_porcentaje = (r.coste_unidad! / precioVenta) * 100;
      data.multiplicador = r.coste_unidad! > 0 ? precioVenta / r.coste_unidad! : 0;
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
    const conCoste = allRecetas.filter(r => r && typeof r.coste_total === 'number' && typeof r.coste_unidad === 'number');

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

    // Agregados de coste_unidad
    const costesPorcion = conCoste.map(r => r.coste_unidad as number);
    const sum = costesPorcion.reduce((a, b) => a + b, 0);
    const coste_unidad_medio = sum / conCoste.length;
    const coste_unidad_min = Math.min(...costesPorcion);
    const coste_unidad_max = Math.max(...costesPorcion);

    // Ranking por coste_unidad descendente (top 20)
    const ranking_por_coste: RankingReceta[] = conCoste
      .slice()
      .sort((a, b) => (b.coste_unidad as number) - (a.coste_unidad as number))
      .slice(0, 20)
      .map(r => ({
        receta_id: r.id,
        nombre: r.nombre,
        categoria: r.estado_operativo || '',
        estado_operativo: r.estado_operativo,
        coste_unidad: r.coste_unidad as number,
        coste_total: r.coste_total as number
      }));

    // Por categoria (usamos estado_operativo como pivote — el blueprint no tiene categoria)
    const por_categoria: Record<string, { count: number; coste_medio: number; suma: number }> = {};
    for (const r of conCoste) {
      const key = r.estado_operativo || 'sin_estado';
      if (!por_categoria[key]) por_categoria[key] = { count: 0, coste_medio: 0, suma: 0 };
      por_categoria[key].count++;
      por_categoria[key].suma += (r.coste_unidad as number);
    }
    const por_categoria_final: Record<string, { count: number; coste_medio: number }> = {};
    for (const [k, v] of Object.entries(por_categoria)) {
      por_categoria_final[k] = { count: v.count, coste_medio: v.count > 0 ? v.suma / v.count : 0 };
    }

    // Top ingredientes por coste agregado (suma de valor_calculado en todas las recetas)
    const ingAgg: Record<string, { coste_total: number; apariciones: number }> = {};
    for (const r of conCoste) {
      const detalle = Array.isArray(r.lineas_detalle) ? r.lineas_detalle : [];
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
      coste_unidad_medio: Math.round(coste_unidad_medio * 100) / 100,
      coste_unidad_min: Math.round(coste_unidad_min * 100) / 100,
      coste_unidad_max: Math.round(coste_unidad_max * 100) / 100,
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
    coste_unidad_medio: 0,
    coste_unidad_min: 0,
    coste_unidad_max: 0,
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

  // Cuando escandallo (blueprint v3) termina de calcular y persistir, refrescamos.
  // Evento canonico del blueprint: escandallo.coste.calculado.
  cleanupFns.push(
    mqttSubscribe('escandallo.coste.calculado', (_topic, payload) => {
      const data = payload as { receta_id?: string };
      console.log('[Escandallo] Coste calculado:', data?.receta_id);
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
