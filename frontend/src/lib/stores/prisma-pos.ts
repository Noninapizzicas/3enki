/**
 * Prisma · UI-POS — el CIMIENTO de la superficie de venta.
 *
 * Guión: arquitectura/decisiones/propuestas/prisma-ui-pos.md (disecionado con `diseccionador`).
 *
 * CORTE MAESTRO: este store REFLEJA, no calcula. La verdad de precio, carrito y cobro vive en el
 * BACKEND prisma (carrito/cobro/cuenta/cierre, todos vivos y persistentes). La superficie:
 *   - NO tasa en el cliente      → el precio lo fija carrito.add_item (opciones.evaluar, céntimos)
 *   - NO guarda carrito propio   → el buffer es del backend; aquí se REFLEJA desde la respuesta RPC
 *   - la sesión NACE de una cuenta (el carrito se llavea por cuenta_id) → sin cuenta no hay venta
 *
 * Acciones  = mqttRequest a los RPCs prisma ya vivos + actualizar el estado DESDE la respuesta
 *             (que trae el carrito entero). Cero lógica de precio en el navegador.
 * Suscripciones = coherencia entre superficies (otro operador toca la misma cuenta) → re-sync por carrito.get.
 *
 * Verificación: EN VIVO sobre un Enki con proyecto prisma (misma disciplina que el resto del frontend).
 */
import { writable, derived, get } from 'svelte/store';
import { mqttRequest } from '$lib/ui-core/mqtt-request';
import { subscribe as mqttSubscribe } from '$lib/ui-core';

// ============================================================================
// Tipos — reflejan el contrato del backend prisma (céntimos enteros)
// ============================================================================

export type MetodoPago = 'efectivo' | 'tarjeta' | 'bizum' | 'transferencia' | 'mixto';

/** Ítem del carrito — shape del backend prisma/carrito */
export interface CarritoItem {
  id: string;
  producto_id: string | null;
  nombre: string;
  cantidad: number;
  selecciones: Record<string, string[]>;
  precio_unitario_centimos: number;
  subtotal_centimos: number;
  libres?: string[];
  notas?: string;
}

/** Desglose de un cobro mixto (split) */
export interface DesgloseMixto {
  metodo: Exclude<MetodoPago, 'mixto'>;
  monto_centimos: number;
}

/** Recibo del último cobro cerrado — alimenta la confirmación/ticket */
export interface UltimoCobro {
  referencia_pago: string | null;
  cambio_centimos: number | null;
  monto_total_centimos: number | null;
  metodo_pago: MetodoPago;
}

interface PrismaPosState {
  project_id: string | null;
  cuenta_id: string | null;       // la venta EN CURSO (la sesión POS)
  ref_display: string | null;     // T-001…
  items: CarritoItem[];           // reflejo del carrito del backend
  total_centimos: number;
  metodo_pago: MetodoPago;        // método elegido (default efectivo)
  cobrando: boolean;              // hay un cobro en vuelo
  ultimo_cobro: UltimoCobro | null;
  abriendo: boolean;              // abriendo una cuenta nueva
  error: string | null;           // dato ausente / fallo NOMBRADO — nunca silencioso
}

const initialState: PrismaPosState = {
  project_id: null,
  cuenta_id: null,
  ref_display: null,
  items: [],
  total_centimos: 0,
  metodo_pago: 'efectivo',
  cobrando: false,
  ultimo_cobro: null,
  abriendo: false,
  error: null
};

// ============================================================================
// Helpers PUROS (lógica testable, sin red — el cimiento del cimiento)
// ============================================================================

/** nº de artículos = Σ cantidades (no nº de líneas) */
export function sumaCantidades(items: CarritoItem[]): number {
  return items.reduce((s, i) => s + (i.cantidad || 0), 0);
}

/**
 * Normaliza el carrito desde una respuesta RPC. El backend devuelve el carrito
 * bajo `data.carrito` (add_item/remove/update) o plano en `data` (get). Uno u otro.
 */
export function carritoDeRespuesta(data: any): { items: CarritoItem[]; total_centimos: number } {
  const c = data && data.carrito ? data.carrito : data;
  return {
    items: Array.isArray(c?.items) ? c.items : [],
    total_centimos: Number(c?.total_centimos) || 0
  };
}

/** Céntimos → euros legibles. `null`/ausente = "Consultar" (dato NOMBRADO, no inventado). */
export function formatEuros(centimos: number | null | undefined): string {
  if (centimos == null) return 'Consultar';
  return (centimos / 100).toFixed(2).replace('.', ',') + ' €';
}

// ============================================================================
// Store + derivados
// ============================================================================

export const prismaPosStore = writable<PrismaPosState>(initialState);

export const posItems = derived(prismaPosStore, $s => $s.items);
export const posTotalCentimos = derived(prismaPosStore, $s => $s.total_centimos);
export const posNumItems = derived(prismaPosStore, $s => sumaCantidades($s.items));
export const posVacio = derived(prismaPosStore, $s => $s.items.length === 0);
export const posMetodo = derived(prismaPosStore, $s => $s.metodo_pago);
export const posCobrando = derived(prismaPosStore, $s => $s.cobrando);
export const posPuedeCobrar = derived(prismaPosStore, $s => $s.items.length > 0 && !$s.cobrando);
export const posRefDisplay = derived(prismaPosStore, $s => $s.ref_display);
export const posUltimoCobro = derived(prismaPosStore, $s => $s.ultimo_cobro);
export const posError = derived(prismaPosStore, $s => $s.error);

// ============================================================================
// Sesión — la venta NACE de una cuenta (sin cuenta no hay carrito)
// ============================================================================

/** Arranca el POS de un proyecto y abre la primera cuenta. */
export async function initPrismaPos(project_id: string): Promise<void> {
  prismaPosStore.set({ ...initialState, project_id });
  await nuevaCuenta();
}

/** Abre una cuenta/ticket nueva (idempotente en el backend por cuenta_id). Raíz de cada venta. */
export async function nuevaCuenta(): Promise<{ success: boolean; cuenta_id?: string; error?: string }> {
  const s = get(prismaPosStore);
  if (!s.project_id) return { success: false, error: 'No hay proyecto activo' };
  prismaPosStore.update(x => ({ ...x, abriendo: true, error: null }));
  try {
    const res = await mqttRequest('cuenta', 'crear', { project_id: s.project_id });
    const cuenta = res?.data as any;
    prismaPosStore.update(x => ({
      ...x,
      cuenta_id: cuenta?.id || null,
      ref_display: cuenta?.ref_display || null,
      items: [],
      total_centimos: 0,
      abriendo: false
    }));
    return { success: true, cuenta_id: cuenta?.id };
  } catch (err: any) {
    prismaPosStore.update(x => ({ ...x, abriendo: false, error: err?.message || 'No se pudo abrir la cuenta' }));
    return { success: false, error: err?.message || 'No se pudo abrir la cuenta' };
  }
}

// ============================================================================
// Carrito — el backend tasa (opciones.evaluar); la UI refleja la respuesta
// ============================================================================

export interface AddItemInput {
  producto_id?: string;
  producto?: any;                 // ProductoUniversal inline (si no hay id)
  catalogo_id?: string;
  nombre?: string;
  selecciones?: Record<string, string[]>;
  cantidad?: number;
  precio_unitario_centimos?: number;   // atajo: precio inline (salta opciones.evaluar)
  notas?: string;
}

/** Añade un producto al carrito. El precio lo fija el backend (opciones.evaluar). */
export async function addItem(input: AddItemInput): Promise<{ success: boolean; error?: string }> {
  let s = get(prismaPosStore);
  if (!s.cuenta_id) {
    const abierta = await nuevaCuenta();
    if (!abierta.success) return { success: false, error: abierta.error };
    s = get(prismaPosStore);
  }
  try {
    const res = await mqttRequest('carrito', 'add_item', {
      project_id: s.project_id,
      cuenta_id: s.cuenta_id,
      ...(input.producto_id && { producto_id: input.producto_id }),
      ...(input.producto && { producto: input.producto }),
      ...(input.catalogo_id && { catalogo_id: input.catalogo_id }),
      ...(input.nombre && { nombre: input.nombre }),
      selecciones: input.selecciones || {},
      cantidad: input.cantidad || 1,
      ...(input.precio_unitario_centimos != null && { precio_unitario_centimos: input.precio_unitario_centimos }),
      ...(input.notas && { notas: input.notas })
    });
    const { items, total_centimos } = carritoDeRespuesta(res?.data);
    prismaPosStore.update(x => ({ ...x, items, total_centimos, error: null }));
    return { success: true };
  } catch (err: any) {
    // selección inválida (409) u opciones caído (502) → NOMBRADO, la venta no avanza a ciegas
    prismaPosStore.update(x => ({ ...x, error: err?.message || 'No se pudo añadir el ítem' }));
    return { success: false, error: err?.message || 'No se pudo añadir el ítem' };
  }
}

/** Quita un ítem del carrito. */
export async function quitarItem(item_id: string): Promise<{ success: boolean; error?: string }> {
  const s = get(prismaPosStore);
  if (!s.cuenta_id) return { success: false, error: 'No hay cuenta activa' };
  try {
    const res = await mqttRequest('carrito', 'remove_item', { project_id: s.project_id, cuenta_id: s.cuenta_id, item_id });
    const { items, total_centimos } = carritoDeRespuesta(res?.data);
    prismaPosStore.update(x => ({ ...x, items, total_centimos, error: null }));
    return { success: true };
  } catch (err: any) {
    prismaPosStore.update(x => ({ ...x, error: err?.message || 'No se pudo quitar el ítem' }));
    return { success: false, error: err?.message || 'No se pudo quitar el ítem' };
  }
}

/** Cambia la cantidad de un ítem (0 → lo quita, lo resuelve el backend). */
export async function cambiarCantidad(item_id: string, cantidad: number): Promise<{ success: boolean; error?: string }> {
  const s = get(prismaPosStore);
  if (!s.cuenta_id) return { success: false, error: 'No hay cuenta activa' };
  try {
    const res = await mqttRequest('carrito', 'update_item', { project_id: s.project_id, cuenta_id: s.cuenta_id, item_id, cantidad });
    const { items, total_centimos } = carritoDeRespuesta(res?.data);
    prismaPosStore.update(x => ({ ...x, items, total_centimos, error: null }));
    return { success: true };
  } catch (err: any) {
    prismaPosStore.update(x => ({ ...x, error: err?.message || 'No se pudo actualizar el ítem' }));
    return { success: false, error: err?.message || 'No se pudo actualizar el ítem' };
  }
}

/** Vacía el carrito de la cuenta en curso. */
export async function vaciar(): Promise<{ success: boolean; error?: string }> {
  const s = get(prismaPosStore);
  if (!s.cuenta_id) return { success: false, error: 'No hay cuenta activa' };
  try {
    await mqttRequest('carrito', 'vaciar', { project_id: s.project_id, cuenta_id: s.cuenta_id });
    prismaPosStore.update(x => ({ ...x, items: [], total_centimos: 0, error: null }));
    return { success: true };
  } catch (err: any) {
    prismaPosStore.update(x => ({ ...x, error: err?.message || 'No se pudo vaciar' }));
    return { success: false, error: err?.message || 'No se pudo vaciar' };
  }
}

/** Elige el método de pago (no toca el backend hasta cobrar). */
export function seleccionarMetodo(metodo: MetodoPago): void {
  prismaPosStore.update(x => ({ ...x, metodo_pago: metodo }));
}

// ============================================================================
// Cobro — CIERRA el círculo real (crear → confirmar). El backend reacciona:
// cuenta queda cobrada, cierre acumula la venta. La UI abre cuenta nueva.
// ============================================================================

export interface CobrarInput {
  monto_recibido_centimos?: number;   // efectivo → calcula el cambio
  desglose?: DesgloseMixto[];          // mixto → cada parte con su método
  propina_centimos?: number;
}

export async function cobrar(input: CobrarInput = {}): Promise<{ success: boolean; error?: string; cambio_centimos?: number | null; referencia_pago?: string | null }> {
  const s = get(prismaPosStore);
  if (!s.cuenta_id) return { success: false, error: 'No hay cuenta activa' };
  if (!s.items.length) return { success: false, error: 'El carrito está vacío' };
  prismaPosStore.update(x => ({ ...x, cobrando: true, error: null }));
  try {
    // 1 · crear el cobro (toma el total del carrito por cuenta_id)
    const creado = await mqttRequest('cobro', 'crear', {
      project_id: s.project_id,
      cuenta_id: s.cuenta_id,
      metodo_pago: s.metodo_pago,
      ...(input.monto_recibido_centimos != null && { monto_recibido_centimos: input.monto_recibido_centimos }),
      ...(input.desglose && { desglose: input.desglose }),
      ...(input.propina_centimos && { propina_centimos: input.propina_centimos })
    });
    const cobro = creado?.data as any;
    if (!cobro?.id) throw new Error('El cobro no se pudo crear');

    // 2 · confirmar → emite cobro.procesado (cuenta+cierre reaccionan solos)
    const confirmado = await mqttRequest('cobro', 'confirmar', { id: cobro.id, project_id: s.project_id });
    const done = confirmado?.data as any;

    const recibo: UltimoCobro = {
      referencia_pago: done?.referencia_pago ?? null,
      cambio_centimos: typeof done?.cambio_centimos === 'number' ? done.cambio_centimos : (typeof cobro?.cambio_centimos === 'number' ? cobro.cambio_centimos : null),
      monto_total_centimos: typeof done?.monto_total_centimos === 'number' ? done.monto_total_centimos : (cobro?.monto_total_centimos ?? null),
      metodo_pago: s.metodo_pago
    };
    prismaPosStore.update(x => ({ ...x, cobrando: false, ultimo_cobro: recibo }));

    // 3 · la venta quedó cerrada en el backend → abrimos cuenta nueva (limpia el carrito reflejando el cierre real)
    await nuevaCuenta();
    return { success: true, cambio_centimos: recibo.cambio_centimos, referencia_pago: recibo.referencia_pago };
  } catch (err: any) {
    // NOMBRADO: cobro no confirmado. NO se limpia el carrito ni se abre cuenta — jamás se finge cobrado.
    prismaPosStore.update(x => ({ ...x, cobrando: false, error: err?.message || 'Cobro no confirmado' }));
    return { success: false, error: err?.message || 'Cobro no confirmado' };
  }
}

// ============================================================================
// Reflejo en vivo — coherencia entre superficies (otro operador, otra pantalla)
// ============================================================================

/** Re-sincroniza el carrito de la cuenta en curso desde el backend (fuente única). */
async function _resync(): Promise<void> {
  const s = get(prismaPosStore);
  if (!s.cuenta_id) return;
  try {
    const res = await mqttRequest('carrito', 'get', { cuenta_id: s.cuenta_id, project_id: s.project_id });
    const { items, total_centimos } = carritoDeRespuesta(res?.data);
    prismaPosStore.update(x => (x.cuenta_id === s.cuenta_id ? { ...x, items, total_centimos } : x));
  } catch { /* best-effort: la próxima acción re-refleja */ }
}

/** Suscribe a los eventos del carrito para reflejar cambios de OTRA superficie sobre la misma cuenta. */
export function initPrismaPosSubscriptions(): () => void {
  const unsubs: (() => void)[] = [];
  const esDeMiCuenta = (event: any): boolean => {
    const d = event?.data || event?.payload || event;
    return !!d && d.cuenta_id === get(prismaPosStore).cuenta_id;
  };

  for (const ev of ['carrito.item_agregado', 'carrito.item_eliminado', 'carrito.item_actualizado']) {
    unsubs.push(mqttSubscribe(ev, (event: any) => { if (esDeMiCuenta(event)) _resync(); }));
  }
  unsubs.push(mqttSubscribe('carrito.vaciado', (event: any) => {
    if (esDeMiCuenta(event)) prismaPosStore.update(x => ({ ...x, items: [], total_centimos: 0 }));
  }));

  return () => unsubs.forEach(fn => fn());
}

/** Limpia el estado del POS (al salir de la pantalla). */
export function resetPrismaPos(): void {
  prismaPosStore.set(initialState);
}
