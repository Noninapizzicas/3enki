/**
 * Encargos Store — Web de encargos del cliente (patrón comandero).
 *
 * Carga el calendario de productos (calendario.productos.leer) y enriquece
 * cada producto con su nombre/icono (productos.list). Valida una fecha
 * deseada contra el calendario (calendario.validar).
 *
 * Diseñado para mayores: el cliente NO teclea fechas. Elige HOY / MAÑANA /
 * PASADO MAÑANA y el store traduce a fecha real por debajo.
 */
import { writable, derived } from 'svelte/store';
import { mqttRequest } from '$lib/ui-core/mqtt-request';

// =============================================================================
// Types
// =============================================================================

/** Calendario de un producto: días de salida (ISO 1=Lun..7=Dom) + margen (h). */
export interface CalendarioProducto {
  dias_salida: number[];
  margen_antelacion_h: number;
}

/** Producto encargable: calendario + datos de carta (nombre, icono). */
export interface ProductoEncargo {
  id: string;
  nombre: string;
  icon: string;
  dias_salida: number[];
  margen_antelacion_h: number;
}

/** Resultado de validar una fecha deseada. */
export interface ValidacionEncargo {
  valido: boolean;
  dia_semana: string | null;
  motivo: string | null;
  propuesta: { fecha: string; dia: string | null } | null;
}

interface EncargosState {
  project_id: string | null;
  productos: ProductoEncargo[];
  loading: boolean;
  error: string | null;
}

const initialState: EncargosState = {
  project_id: null,
  productos: [],
  loading: false,
  error: null
};

// =============================================================================
// Store
// =============================================================================

export const encargosStore = writable<EncargosState>(initialState);

export const productosEncargo = derived(encargosStore, $s => $s.productos);
export const encargosLoading = derived(encargosStore, $s => $s.loading);
export const encargosError = derived(encargosStore, $s => $s.error);

// =============================================================================
// Helpers
// =============================================================================

const NOMBRE_DIA = { 1: 'lunes', 2: 'martes', 3: 'miércoles', 4: 'jueves', 5: 'viernes', 6: 'sábado', 7: 'domingo' };
const NOMBRE_DIA_CORTO = { 1: 'L', 2: 'M', 3: 'X', 4: 'J', 5: 'V', 6: 'S', 7: 'D' };

/** Día de la semana ISO (1=Lun..7=Dom) de una fecha local. */
function diaSemanaLocal(d: Date): number {
  const iso = d.getDay(); // 0=Dom..6=Sáb
  return iso === 0 ? 7 : iso;
}

/** Fecha ISO (YYYY-MM-DD) local, sin desfase UTC. */
function fechaISOLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** "HOY" / "MAÑANA" / "PASADO MAÑANA" → fecha ISO local. */
export function fechaDesdeOffset(offsetDias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDias);
  return fechaISOLocal(d);
}

/** Etiqueta legible de los días de salida: "L M X J V". */
export function etiquetaDias(dias: number[]): string {
  if (!dias || !dias.length) return 'sin días';
  return dias.map(d => NOMBRE_DIA_CORTO[d] ?? '?').join(' ');
}

/** Nombre del día de la semana (lunes..domingo) de una fecha ISO. */
export function nombreDiaDeISO(fechaISO: string): string {
  const d = new Date(`${fechaISO}T00:00:00`);
  return NOMBRE_DIA[diaSemanaLocal(d)] ?? '';
}

// =============================================================================
// Actions
// =============================================================================

/** Carga el calendario de productos + enriquece con nombre/icono de la carta. */
export async function initEncargos(project_id: string): Promise<void> {
  encargosStore.update(s => ({ ...s, project_id, loading: true, error: null }));

  try {
    // 1) Calendario: qué productos se pueden encargar y cuándo.
    const calRes = await mqttRequest('calendario', 'productos.leer', { project_id });
    const calendarios = (calRes?.data as any)?.calendarios || {};

    // 2) Carta: nombre + icono de cada producto.
    let carta: any[] = [];
    try {
      const prodRes = await mqttRequest('productos', 'list', { project_id });
      carta = (prodRes?.data as any)?.productos || [];
    } catch {
      carta = []; // sin carta, mostramos solo el id
    }

    const porId = new Map(carta.map((p: any) => [p.id, p]));

    const productos: ProductoEncargo[] = Object.entries(calendarios).map(([id, cal]) => {
      const c = cal as CalendarioProducto;
      const cartaP = porId.get(id);
      return {
        id,
        nombre: cartaP?.nombre || id,
        icon: cartaP?.icon || cartaP?.emoji || '🍞',
        dias_salida: c.dias_salida || [],
        margen_antelacion_h: c.margen_antelacion_h ?? 0
      };
    });

    encargosStore.update(s => ({ ...s, productos, loading: false }));
  } catch (err: any) {
    console.error('[Encargos] init failed', err);
    encargosStore.update(s => ({ ...s, loading: false, error: err?.message || 'No se pudo cargar' }));
  }
}

/** Valida una fecha deseada contra el calendario del producto. */
export async function validarEncargo(
  project_id: string,
  producto_id: string,
  fecha_deseada: string
): Promise<ValidacionEncargo> {
  const res = await mqttRequest('calendario', 'validar', { project_id, producto_id, fecha_deseada });
  const data = (res?.data as any) || {};
  return {
    valido: !!data.valido,
    dia_semana: data.dia_semana || null,
    motivo: data.motivo || null,
    propuesta: data.propuesta || null
  };
}

/** Resetea el store (al desmontar). */
export function resetEncargos(): void {
  encargosStore.set(initialState);
}
