/**
 * Pedidos Store — la ESTACIÓN DE TRANSICIONES del jefe sobre el ciclo de vida
 * del pedido (F7, composición según esquema-jefe/pasada-4 de pedidos).
 *
 * Fuente de la lógica (verificada en el repo, pedidos v3.5.0):
 *   - modules/pizzepos/pedidos/index.js: contrato real de handlers y señales.
 *   - modules/pizzepos/pedidos/esquema-jefe/pasada-4-consolidacion-formas-ui.md:
 *     dualidad fuerte (jefe=transiciones · utilizacion=comandero), composición
 *     3 capas (SELECCIONAR → INFORMARSE → DECLARAR), señales pareadas.
 *
 * CONTRATO REAL (index.js — columnas del módulo, no del blueprint genérico):
 *   - transiciones y total reciben `id`: send-kitchen/complete/cancel/total { id }
 *     (add-item/update-item/delete-item sí usan `pedido_id` — viven en el comandero).
 *   - create recibe { cuenta_id, notas_generales? } → pedido 'borrador'.
 *   - list recibe { cuenta_id?, estado? } → { pedidos[], total }, orden desc por
 *     created_at. Estados POS: borrador · en_cocina · completado · cancelado.
 *     (la cara tienda: pendiente_recogida → recogido_y_cobrado/expirado).
 *   - confirmar-recogida recibe { cliente_nombre | pedido_id } ( query tienda).
 *   - guardas reales del servidor: send-kitchen rechaza pedido vacío (400) y
 *     ya-en-cocina (409 CONFLICT_STATE); el juez del ciclo de vida es el MÓDULO.
 *
 * Señales pareadas (publicadores reales de index.js):
 *   create → pedido.creado · send-kitchen → pedido.enviado_cocina ·
 *   complete → pedido.completado · cancel → pedido.cancelado ·
 *   recogida → pedido.recogido · items (comandero, UTILIZACIÓN fuera del panel)
 *   → pedido.item_{agregado,actualizado,eliminado} — la cinta late igual.
 *
 * Reglas del esquema-jefe:
 *   R2 — toda mutación va por mqttRequest y NUNCA asume estado local: el store
 *        solo escribe al recibir datos de una lectura RPC (list/total).
 *   R3 — el refresco lo da la SEÑAL del bus (nunca recarga): cada transición
 *        publica su señal y el re-load del estado en pantalla es el proveedor.
 *   INVARIANTE — el panel-jefe SOLO transiciona estados de pedidos ya creados:
 *        no expone add/update/delete-item (viven en components/comandero).
 *
 * Patrón del repo: molde exacto de modules/productos/stores/productos.ts y
 * modules/variaciones/stores/variaciones.ts — mqttRequest + suscripción con
 * debounce + cleanup para destroy + describeError.
 */

import { writable, derived, get } from 'svelte/store';
import { mqttRequest, MqttRequestError, MqttTimeoutError } from '$lib/ui-core/mqtt-request';
import { subscribe as mqttSubscribe } from '$lib/ui-core/mqtt';
import { sessionProjectId } from '$lib/stores/sessionProject';

// =============================================================================
// TIPOS — formas reales devueltas por pedido.list / cuenta.list (index.js)
// =============================================================================

/** Item proyectado dentro de un pedido (shape _buildPedidoItem / items tienda). */
export interface PedidoItem {
  item_id: string;
  producto_id?: string | null;
  nombre?: string | null;
  descripcion?: string | null;
  cantidad: number;
  precio_unitario?: number;
  precio_total?: number;
  estado?: string;
  notas?: string | null;
  [key: string]: unknown;
}

/**
 * Pedido tal como lo devuelve pedido.list (200): POS sin `tipo` con total en
 * EUROS (subtotal/total); tienda tipo='tienda' con total_centimos. Estado POS:
 * borrador|en_cocina|completado|cancelado; tienda: pendiente_recogida|...
 */
export interface Pedido {
  id: string;
  tipo?: 'pos' | 'tienda';
  cuenta_id?: string | null;
  canal?: string | null;
  canal_origen?: string | null;
  ref_display?: string | null;
  project_id?: string | null;
  project_slug?: string | null;
  items: PedidoItem[];
  estado: string;
  subtotal?: number;
  /** EUROS en pedidos POS (comandero suma precios del carta); CENTIMOS/100 en tienda. */
  total?: number;
  total_centimos?: number;
  cliente_nombre?: string | null;
  notas_generales?: string | null;
  created_at: string;
  updated_at?: string;
  enviado_cocina_at?: string | null;
  completado_at?: string | null;
  expira_at?: string | null;
  [key: string]: unknown;
}

/** Cuenta activa proyectada por cuenta.list (ref-select de la capa 1). */
export interface CuentaActiva {
  id: string;
  nombre?: string | null;
  ref_display?: string | null;
  tipo?: string | null;
  estado?: string | null;
  total?: number;
  created_at?: string;
  [key: string]: unknown;
}

/** Item del confirmador de recogida desambiguado por el servidor (409). */
export interface RecogidaCandidato {
  pedido_id: string;
  total_centimos: number;
  created_at: string;
}

// =============================================================================
// FASES DE LA ESTACIÓN — agrupación de estados para la cinta y las columnas
// =============================================================================

/** Estados "abiertos": aún no llegaron a cocina ni terminaron. */
export const ESTADOS_ABIERTOS = ['borrador', 'creado'] as const;
/** Cocina: serán completados al servirse. */
export const ESTADOS_COCINA = ['en_cocina'] as const;
/** Recogida: pedidos tienda pendientes del ancla (cliente_nombre). */
export const ESTADOS_RECOGIDA = ['pendiente_recogida'] as const;
/** Terminal completado (hoy, hasta caja.cerrada). */
export const ESTADOS_COMPLETADO = ['completado'] as const;

export const STATUS_POR_ESTADO: Record<string, { label: string; color: string; icono: string }> = {
  borrador: { label: 'abierto', color: '#9ca3af', icono: '📝' },
  creado: { label: 'abierto', color: '#60a5fa', icono: '🆕' },
  en_cocina: { label: 'en cocina', color: '#f59e0b', icono: '🔥' },
  pendiente_recogida: { label: 'recogida', color: '#a78bfa', icono: '📦' },
  completado: { label: 'completado', color: '#22c55e', icono: '✅' },
  cancelado: { label: 'cancelado', color: '#ef4444', icono: '❌' }
};

// =============================================================================
// STORES — lecturas-only (R2): solo las respuestas RPC escriben aquí
// =============================================================================

/** Pedidos en fases ACTIVAS (abiertos + cocina + recogida): la estación. */
export const pedidosActivosStore = writable<Pedido[]>([]);

/** Completados del turno (hasta caja.cerrada los limpia). */
export const completadosStore = writable<Pedido[]>([]);

/** Cuentas activas para el ref-select (proyectadas por cuenta.list). */
export const cuentasStore = writable<CuentaActiva[]>([]);

export const cintaLoading = writable<boolean>(false);
export const cintaError = writable<string | null>(null);
/** Cinta-estado: el pulso sin navegar (capa 1-2). */
export const cintaStore = derived(
  [pedidosActivosStore, completadosStore],
  ([$activos, $completados]) => {
    const en = (estados: readonly string[]) => $activos.filter((p) => estados.includes(p.estado));
    return {
      abiertos: en([...ESTADOS_ABIERTOS]).length,
      cocina: en([...ESTADOS_COCINA]).length,
      recogida: en([...ESTADOS_RECOGIDA]).length,
      completadosHoy: $completados.length,
      totalActivos: $activos.length
    };
  }
);

/** Contador de mutaciones en vuelo — la cinta muestra "sincronizando…". */
export const mutacionesPendientes = writable<number>(0);
/** Último error de transición (nombrado en la tarjeta, no modal global). */
export const errorMutacion = writable<string | null>(null);

export function describeError(err: unknown): string {
  if (err instanceof MqttTimeoutError) return 'sin respuesta del bus';
  if (err instanceof MqttRequestError) return err.message;
  return (err as Error)?.message || 'error desconocido';
}

/** CÉNTIMOS → texto € (es-ES) — pedidos tienda. */
export function formatearCentimos(centimos: number | string | null | undefined): string {
  const c = typeof centimos === 'number' ? centimos : Number(String(centimos ?? '').replace(',', '.'));
  if (!Number.isFinite(c)) return '—';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(c / 100);
}

/**
 * Dinero POS es EUROS (comandero suma precios de carta en euros) — formatea
 * tolerando que venga como string.
 */
export function formatearEuros(euros: number | string | null | undefined): string {
  const n = typeof euros === 'number' ? euros : Number(String(euros ?? '').replace(',', '.'));
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);
}

/** Dinero del pedido según su tipo (POS euros vs tienda céntimos). */
export function dineroPedido(p: Pedido): string {
  if (p.tipo === 'tienda') return formatearCentimos(p.total_centimos);
  if (typeof p.total === 'number') return formatearEuros(p.total);
  if (p.total_centimos !== undefined) return formatearCentimos(p.total_centimos);
  return '—';
}

/** Ref nominal de la cuenta/canal del pedido (confirmador-nombrado). */
export function refCuenta(p: Pedido): string {
  return p.ref_display || p.cuenta_id || p.canal_origen || p.cliente_nombre || p.id.slice(0, 8);
}

// =============================================================================
// LECTURAS (SELECCIONAR / INFORMARSE) — las únicas escrituras (R2)
// =============================================================================

function esDeOtroProyecto(p: Pedido, pid: string): boolean {
  const deP = p.project_id ?? p.project_slug ?? null;
  // Pedidos POS no llevan project_id (viven atados a cuenta/caja del turno).
  return deP !== null && deP !== undefined && deP !== pid;
}

/**
 * Cinta de la estación (capas 1-2): pedidos activos por fases + completados del
 * turno + cuentas activas para el ref-select. Tres lecturas, un solo golpe.
 */
export async function loadCinta(pid: string): Promise<void> {
  cintaLoading.set(true);
  cintaError.set(null);
  try {
    const [abiertos, cocina, recogida, terminales, cuentas] = await Promise.all([
      mqttRequest<{ pedidos?: Pedido[] }>('pedido', 'list', { estado: ESTADOS_ABIERTOS[0] }).catch(() => null),
      mqttRequest<{ pedidos?: Pedido[] }>('pedido', 'list', { estado: ESTADOS_COCINA[0] }).catch(() => null),
      mqttRequest<{ pedidos?: Pedido[] }>('pedido', 'list', { estado: ESTADOS_RECOGIDA[0] }).catch(() => null),
      Promise.all([
        mqttRequest<{ pedidos?: Pedido[] }>('pedido', 'list', { estado: 'completado' }).catch(() => null),
        mqttRequest<{ pedidos?: Pedido[] }>('pedido', 'list', { estado: 'cancelado' }).catch(() => null)
      ]),
      mqttRequest<{ cuentas?: CuentaActiva[] }>('cuenta', 'list', {}).catch(() => null)
    ]);

    const activos: Pedido[] = [
      ...(abiertos?.data?.pedidos ?? []),
      ...(cocina?.data?.pedidos ?? []),
      ...(recogida?.data?.pedidos ?? [])
    ].filter((p) => !esDeOtroProyecto(p, pid));
    activos.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const [comp, canc] = terminales;
    const historico: Pedido[] = [...(comp?.data?.pedidos ?? []), ...(canc?.data?.pedidos ?? [])].filter(
      (p) => !esDeOtroProyecto(p, pid) && p.estado === 'completado'
    );
    historico.sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime());

    pedidosActivosStore.set(activos);
    completadosStore.set(historico);
    // Solo cuentas ABIERTAS del turno alimentan "abrir pedido" (ref-select).
    cuentasStore.set(
      (cuentas?.data?.cuentas ?? []).filter((c) => !c.estado || c.estado === 'pendiente' || c.estado === 'con_pedido')
    );
  } catch (err) {
    cintaError.set(describeError(err));
  } finally {
    cintaLoading.set(false);
  }
}

/** Total fresco del servidor para el confirmador de transición (opcional). */
export async function pedirTotal(pedidoId: string): Promise<string | null> {
  try {
    const res = await mqttRequest<{ total?: number }>('pedido', 'total', { id: pedidoId });
    return typeof res.data?.total === 'number' ? formatearEuros(res.data.total) : null;
  } catch {
    return null; // el confirmador ya muestra el total de la tarjeta
  }
}

/** Multi-tenant: vaciar todo al cambiar de proyecto (sin datos ajenos). */
export function resetPedidos(): void {
  pedidosActivosStore.set([]);
  completadosStore.set([]);
  cuentasStore.set([]);
  cintaError.set(null);
  errorMutacion.set(null);
}

// =============================================================================
// DECLARAR (capa 3) — TRANSICIONES del ciclo de vida (las únicas escrituras)
// CONTRATO REAL: transiciones reciben `id` (NO pedido_id) — index.js handler.
// =============================================================================

/** Abre el pedido formal (borrador) sobre una cuenta activa (ÚNICA creación jefe). */
export async function abrirPedido(cuentaId: string, notasGenerales?: string): Promise<void> {
  mutacionesPendientes.update((n) => n + 1);
  errorMutacion.set(null);
  try {
    await mqttRequest('pedido', 'create', {
      cuenta_id: cuentaId,
      ...(notasGenerales ? { notas_generales: notasGenerales } : {})
    });
    // Sin escritura local: la señal pareada (pedido.creado) re-lee la cinta (R3).
  } catch (err) {
    errorMutacion.set(describeError(err));
    throw err;
  } finally {
    mutacionesPendientes.update((n) => n - 1);
  }
}

export async function enviarCocina(pedidoId: string): Promise<void> {
  mutacionesPendientes.update((n) => n + 1);
  errorMutacion.set(null);
  try {
    await mqttRequest('pedido', 'send-kitchen', { id: pedidoId });
  } catch (err) {
    errorMutacion.set(describeError(err));
    throw err;
  } finally {
    mutacionesPendientes.update((n) => n - 1);
  }
}

export async function completarPedido(pedidoId: string): Promise<void> {
  mutacionesPendientes.update((n) => n + 1);
  errorMutacion.set(null);
  try {
    await mqttRequest('pedido', 'complete', { id: pedidoId });
  } catch (err) {
    errorMutacion.set(describeError(err));
    throw err;
  } finally {
    mutacionesPendientes.update((n) => n - 1);
  }
}

export async function cancelarPedido(pedidoId: string, motivo?: string): Promise<void> {
  mutacionesPendientes.update((n) => n + 1);
  errorMutacion.set(null);
  try {
    await mqttRequest('pedido', 'cancel', { id: pedidoId, ...(motivo ? { motivo } : {}) });
  } catch (err) {
    errorMutacion.set(describeError(err));
    throw err;
  } finally {
    mutacionesPendientes.update((n) => n - 1);
  }
}

/**
 * Cierre de la cara TIENDA: confiere recogida por ANCLA (cliente_nombre) o
 * pedido_id. 409 con varios pendientes a un mismo nombre es estado legítimo:
 * devuelve los candidatos para que el jefe elija el pedido_id exacto.
 */
export async function confirmarRecogida(
  params: { cliente_nombre?: string; pedido_id?: string }
): Promise<{ ok: true } | { ok: false; candidatos?: RecogidaCandidato[]; mensaje?: string }> {
  mutacionesPendientes.update((n) => n + 1);
  errorMutacion.set(null);
  try {
    await mqttRequest('pedido', 'confirmar-recogida', params);
    return { ok: true };
  } catch (err) {
    const msg = describeError(err);
    errorMutacion.set(msg);
    if (err instanceof MqttRequestError) {
      const detalles = (
        err as unknown as { response?: { error?: { details?: { candidatos?: RecogidaCandidato[] } } } }
      ).response?.error?.details;
      if (Array.isArray(detalles?.candidatos) && detalles.candidatos.length > 0) {
        return { ok: false, candidatos: detalles.candidatos };
      }
    }
    return { ok: false, mensaje: msg };
  } finally {
    mutacionesPendientes.update((n) => n - 1);
  }
}

// =============================================================================
// SEÑAL-REFRESH (R3) — las señales reales del módulo → re-lectura de la cinta
// =============================================================================

/** Extrae project_id del envelope tolerando los shapes del repo (como productos). */
function extraerProjectId(envelope: unknown): string | undefined {
  const e = envelope as {
    project_id?: string;
    data?: { project_id?: string; data?: { project_id?: string } };
  } | null;
  return e?.project_id ?? e?.data?.project_id ?? e?.data?.data?.project_id ?? undefined;
}

const SENALES_PEDIDO = [
  'pedido.creado',
  'pedido.enviado_cocina',
  'pedido.completado',
  'pedido.cancelado',
  'pedido.recogido',
  // Los items cambian desde el COMANDERO (utilización): la cinta del jefe late igual.
  'pedido.item_agregado',
  'pedido.item_actualizado',
  'pedido.item_eliminado',
  // Pago online de tienda → estado del pedido avanza (capa de pago).
  'pago.confirmado'
];

/**
 * Suscripción a las señales pareadas. El debounce absorbe el tándem
 * pedido.creado + enviado_cocina (bridge comandero). Solo re-lee la cinta:
 * NUNCA recarga la vista.
 */
export function initPedidosSubscriptions(): () => void {
  const unsubs: Array<() => void> = [];

  let recargaProgramada: ReturnType<typeof setTimeout> | null = null;

  function encolarRecarga(): void {
    const pid = get(sessionProjectId);
    if (!pid) return;
    if (recargaProgramada) return; // debounce: las señales llegan en tándem
    recargaProgramada = setTimeout(() => {
      recargaProgramada = null;
      const activo = get(sessionProjectId);
      if (activo) void loadCinta(activo);
    }, 60);
  }

  function onSenal(envelope: unknown): void {
    const activo = get(sessionProjectId);
    if (!activo) return;
    const pid = extraerProjectId(envelope);
    if (pid !== undefined && pid !== activo) return; // señal de otro proyecto
    encolarRecarga();
  }

  for (const senal of SENALES_PEDIDO) {
    unsubs.push(mqttSubscribe(senal, onSenal));
  }

  return () => {
    if (recargaProgramada) {
      clearTimeout(recargaProgramada);
      recargaProgramada = null;
    }
    unsubs.forEach((u) => u());
  };
}