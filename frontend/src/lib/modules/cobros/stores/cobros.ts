/**
 * Cobros Store — la ESTACIÓN DE TRANSICIONES del jefe sobre el dinero del día
 * (F7, composición según esquema-jefe de cobros).
 *
 * Fuente de la lógica (verificada en el repo, cobros v3.0.0):
 *   - modules/pizzepos/cobros/index.js: contrato real de handlers y señales.
 *   - modules/pizzepos/cobros/esquema-jefe/esquema.md: el jefe GESTIONA los
 *     cobros del día (ver, confirmar, reembolsar), composición 3 capas
 *     (SELECCIONAR → INFORMARSE → DECLARAR), señales pareadas.
 *
 * CONTRATO REAL (index.js — columnas del módulo, no del blueprint genérico):
 *   - confirm/refund reciben `id` (NO cobro_id): confirm { id, referencia_pago? }
 *     → pendiente/procesando → completado; refund { id, motivo? } → completado
 *     → reembolsado.
 *   - create recibe { cuenta_id, monto, metodo_pago, ... } → 'pendiente'.
 *   - list recibe { cuenta_id?, estado?, metodo_pago? } → { cobros[], total },
 *     orden desc por created_at. Estados: pendiente · procesando · completado ·
 *     fallido · reembolsado.
 *   - get recibe { id } → cobro completo.
 *   - MONEDA: EUROS (monto + propina = monto_total; cambio = monto_recibido -
 *     monto_total). NO céntimos.
 *   - guardas reales del servidor: confirm rechaza si no está pendiente/
 *     procesando (409 CONFLICT_STATE); refund exige completado (409); create
 *     rechaza cuentas llevadoo_* (400) y cobros duplicados (409 ALREADY_EXISTS).
 *
 * Señales pareadas (publicadores reales de index.js):
 *   create → cobro.iniciado · confirm → cobro.procesado (+ periferico.abrir-cajon
 *   si efectivo, best-effort) · refund → cobro.reembolsado.
 *
 * Reglas del esquema-jefe:
 *   R2 — toda mutación va por mqttRequest y NUNCA asume estado local: el store
 *        solo escribe al recibir datos de una lectura RPC (list/get).
 *   R3 — el refresco lo da la SEÑAL del bus (nunca recarga): cada transición
 *        publica su señal y el re-load del estado en pantalla es el proveedor.
 *   INV5 — multi-tenant: TODOS los RPC llevan project_id inyectado (lección
 *        bug escandallo: la cinta fallaba con 'project_id requerido').
 *
 * Patrón del repo: molde exacto de modules/pedidos/stores/pedidos.ts y
 * modules/entrega/stores/entrega.ts — mqttRequest + suscripción con debounce
 * + cleanup para destroy + describeError.
 */

import { writable, derived, get } from 'svelte/store';
import { mqttRequest, MqttRequestError, MqttTimeoutError } from '$lib/ui-core/mqtt-request';
import { subscribe as mqttSubscribe } from '$lib/ui-core/mqtt';
import { sessionProjectId } from '$lib/stores/sessionProject';

// =============================================================================
// TIPOS — formas reales devueltas por cobro.list / cobro.get (index.js)
// =============================================================================

/** Método de pago canónico (7). */
export type MetodoPago =
  | 'efectivo'
  | 'tarjeta'
  | 'bizum'
  | 'transferencia'
  | 'mixto'
  | 'link_pago'
  | 'qr';

/** Estado del cobro (schema cobro.json + index.js). */
export type EstadoCobro =
  | 'pendiente'
  | 'procesando'
  | 'completado'
  | 'fallido'
  | 'reembolsado';

/**
 * Cobro tal como lo devuelve cobro.list/get (200). MONEDA EUROS: monto,
 * monto_total, propina, cambio. NO céntimos.
 */
export interface Cobro {
  id: string;
  cuenta_id: string;
  pedido_ids?: string[];
  monto: number;
  metodo_pago: MetodoPago;
  estado: EstadoCobro;
  propina?: number;
  monto_total: number;
  cambio?: number;
  monto_recibido?: number;
  referencia_pago?: string;
  completado_at?: string;
  motivo_reembolso?: string;
  reembolsado_at?: string;
  desglose?: Array<{ metodo: string; monto: number; referencia?: string }>;
  link_url?: string;
  qr_url?: string;
  expira_en?: string;
  created_at: string;
  [key: string]: unknown;
}

/** Método de pago canónico con nombre legible (cobro.payment-methods). */
export interface MetodoPagoInfo {
  id: MetodoPago;
  nombre: string;
  activo: boolean;
}

// =============================================================================
// ESTADOS — agrupación para la cinta y las columnas
// =============================================================================

/** Pendientes de confirmar (la transición central). */
export const ESTADOS_PENDIENTE = ['pendiente', 'procesando'] as const;
/** Confirmados (completado). */
export const ESTADOS_CONFIRMADO = ['completado'] as const;
/** Reembolsados. */
export const ESTADOS_REEMBOLSADO = ['reembolsado'] as const;

export const STATUS_POR_ESTADO: Record<string, { label: string; color: string; icono: string }> = {
  pendiente: { label: 'pendiente', color: '#eab308', icono: '⏳' },
  procesando: { label: 'procesando', color: '#60a5fa', icono: '🔄' },
  completado: { label: 'completado', color: '#22c55e', icono: '✅' },
  fallido: { label: 'fallido', color: '#ef4444', icono: '❌' },
  reembolsado: { label: 'reembolsado', color: '#9ca3af', icono: '↩️' }
};

export const NOMBRE_METODO: Record<MetodoPago, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  bizum: 'Bizum',
  transferencia: 'Transferencia',
  mixto: 'Pago Mixto',
  link_pago: 'Link de Pago',
  qr: 'Código QR'
};

// =============================================================================
// STORES — lecturas-only (R2): solo las respuestas RPC escriben aquí
// =============================================================================

/** Cobros del día (todas las fases). */
export const cobrosStore = writable<Cobro[]>([]);

/** Métodos de pago canónicos (cobro.payment-methods). */
export const metodosPagoStore = writable<MetodoPagoInfo[]>([]);

export const cintaLoading = writable<boolean>(false);
export const cintaError = writable<string | null>(null);
/** Cinta-estado: el pulso sin navegar (capa 1-2). */
export const cintaStore = derived(cobrosStore, ($cobros) => {
  const en = (estados: readonly string[]) => $cobros.filter((c) => estados.includes(c.estado));
  return {
    pendientes: en([...ESTADOS_PENDIENTE]).length,
    confirmados: en([...ESTADOS_CONFIRMADO]).length,
    reembolsados: en([...ESTADOS_REEMBOLSADO]).length,
    total: $cobros.length
  };
});

/** Contador de mutaciones en vuelo — la cinta muestra "sincronizando…". */
export const mutacionesPendientes = writable<number>(0);
/** Último error de transición (nombrado en la tarjeta, no modal global). */
export const errorMutacion = writable<string | null>(null);

export function describeError(err: unknown): string {
  if (err instanceof MqttTimeoutError) return 'sin respuesta del bus';
  if (err instanceof MqttRequestError) return err.message;
  return (err as Error)?.message || 'error desconocido';
}

/** EUROS → texto € (es-ES) — el cobro trabaja en euros, no céntimos. */
export function formatearEuros(euros: number | string | null | undefined): string {
  const n = typeof euros === 'number' ? euros : Number(String(euros ?? '').replace(',', '.'));
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);
}

/** Ref nominal de la cuenta del cobro (confirmador-nombrado). */
export function refCuenta(c: Cobro): string {
  return c.cuenta_id || c.id.slice(0, 8);
}

// =============================================================================
// LECTURAS (SELECCIONAR / INFORMARSE) — las únicas escrituras (R2)
// =============================================================================

function esDeOtroProyecto(c: Cobro, pid: string): boolean {
  const deP = c.project_id ?? null;
  return deP !== null && deP !== undefined && deP !== pid;
}

/**
 * Cinta del día (capas 1-2): todos los cobros del turno + métodos de pago.
 * Dos lecturas, un solo golpe. TODOS los RPC con project_id inyectado (INV5).
 */
export async function loadCinta(pid: string): Promise<void> {
  cintaLoading.set(true);
  cintaError.set(null);
  try {
    const [cobros, metodos] = await Promise.all([
      mqttRequest<{ cobros?: Cobro[] }>('cobro', 'list', { project_id: pid }).catch(() => null),
      mqttRequest<{ metodos_disponibles?: MetodoPagoInfo[] }>('cobro', 'payment-methods', { project_id: pid }).catch(() => null)
    ]);

    const lista: Cobro[] = (cobros?.data?.cobros ?? []).filter((c) => !esDeOtroProyecto(c, pid));
    lista.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    cobrosStore.set(lista);
    metodosPagoStore.set(metodos?.data?.metodos_disponibles ?? []);
  } catch (err) {
    cintaError.set(describeError(err));
  } finally {
    cintaLoading.set(false);
  }
}

/** Detalle fresco del servidor para el confirmador de transición (opcional). */
export async function pedirCobro(cobroId: string): Promise<Cobro | null> {
  const pid = get(sessionProjectId);
  if (!pid) return null;
  try {
    const res = await mqttRequest<{ cobro?: Cobro }>('cobro', 'get', { project_id: pid, id: cobroId });
    return res.data?.cobro ?? null;
  } catch {
    return null; // el confirmador ya muestra el monto de la tarjeta
  }
}

/** Multi-tenant: vaciar todo al cambiar de proyecto (sin datos ajenos). */
export function resetCobros(): void {
  cobrosStore.set([]);
  metodosPagoStore.set([]);
  cintaError.set(null);
  errorMutacion.set(null);
}

// =============================================================================
// DECLARAR (capa 3) — TRANSICIONES del dinero del día (las únicas escrituras)
// CONTRATO REAL: confirm/refund reciben `id` (NO cobro_id) — index.js handler.
// =============================================================================

/** Confirma un cobro pendiente/procesando → completado (LA TRANSICIÓN). */
export async function confirmarCobro(cobroId: string, referenciaPago?: string): Promise<void> {
  const pid = get(sessionProjectId);
  if (!pid) throw new Error('sin proyecto activo');
  mutacionesPendientes.update((n) => n + 1);
  errorMutacion.set(null);
  try {
    await mqttRequest('cobro', 'confirm', {
      project_id: pid,
      id: cobroId,
      ...(referenciaPago ? { referencia_pago: referenciaPago } : {})
    });
    // Sin escritura local: la señal pareada (cobro.procesado) re-lee la cinta (R3).
  } catch (err) {
    errorMutacion.set(describeError(err));
    throw err;
  } finally {
    mutacionesPendientes.update((n) => n - 1);
  }
}

/** Reembolsa un cobro completado → reembolsado (transición inversa). */
export async function reembolsarCobro(cobroId: string, motivo?: string): Promise<void> {
  const pid = get(sessionProjectId);
  if (!pid) throw new Error('sin proyecto activo');
  mutacionesPendientes.update((n) => n + 1);
  errorMutacion.set(null);
  try {
    await mqttRequest('cobro', 'refund', {
      project_id: pid,
      id: cobroId,
      ...(motivo ? { motivo } : {})
    });
  } catch (err) {
    errorMutacion.set(describeError(err));
    throw err;
  } finally {
    mutacionesPendientes.update((n) => n - 1);
  }
}

// =============================================================================
// SEÑAL-REFRESH (R3) — las señales reales del módulo → re-lectura de la cinta
// =============================================================================

/** Extrae project_id del envelope tolerando los shapes del repo (como pedidos). */
function extraerProjectId(envelope: unknown): string | undefined {
  const e = envelope as {
    project_id?: string;
    data?: { project_id?: string; data?: { project_id?: string } };
  } | null;
  return e?.project_id ?? e?.data?.project_id ?? e?.data?.data?.project_id ?? undefined;
}

const SENALES_COBRO = [
  'cobro.iniciado',
  'cobro.procesado',
  'cobro.reembolsado'
];

/**
 * Suscripción a las señales pareadas. El debounce absorbe el tándem de señales
 * (confirm → cobro.procesado + periferico.abrir-cajon). Solo re-lee la cinta:
 * NUNCA recarga la vista.
 */
export function initCobrosSubscriptions(): () => void {
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

  for (const senal of SENALES_COBRO) {
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
