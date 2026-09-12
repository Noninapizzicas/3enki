/**
 * Ciclo Store — DUEÑO de la MÁQUINA DE ESTADOS del ciclo de impresión 3D (F7, prisma-universal).
 *
 * Fuente de la lógica (verificada en el repo):
 *   - modules/ciclo-impresion/index.js: el MICRO-AGENTE/ORQUESTADOR, DUEÑO de la
 *     máquina de estados del ciclo (en memoria, runtime, NO persiste).
 *   - modules/ciclo-impresion/ciclo-impresion.blueprint.json (F6½): ui.estados
 *     (8 estados), ui.ops.iniciar (jefe, RPC real), ui.confirmaciones_contextuales
 *     (tres confirmaciones NO-RPC con handler: null), transporte.salida (señales).
 *   - modules/ciclo-impresion/module.json: publishes, observability gauge estado.
 *   - modules/adaptador-confirmacion/index.js: PUENTE que entrega la confirmación
 *     del dueño al sistema vía adaptador-confirmacion.confirmacion_recibida.
 *
 * MATIZ CLAVE — este NO es un panel CRUD: es un panel de ESTADO de una MÁQUINA
 * DE ESTADOS. El jefe OBSERVA el punto actual de la máquina y CONFIRMA las
 * transiciones físicas que requieren su mano. NO hay RPC lectora de estado en
 * index.js (hueco [ABIERTO] del esquema-jefe): el estado se RECONSTRUYE
 * suscribiéndose a las SEÑALES publicadas por el orquestador (el panel vive del
 * bus). Tampoco hay RPC confirmación: el botón contextual emite el evento
 * adaptador-confirmacion.confirmacion_recibida, que el ciclo consume en
 * onConfirmacionRecibida.
 *
 * CONTRATO REAL (index.js):
 *   - Estádo del ciclo por proyecto (this._ciclos Map): { estado, pieza, gcode,
 *     error, esperando }. Estados canónicos ESTADOS:
 *     IDLE | OBTENIENDO_GCODE | SUBIENDO_GCODE | IMPRIMIENDO |
 *     ESPERANDO_RETIRADA | PAUSADO_FALTA_FILAMENTO | ERROR | COLA_VACIA.
 *   - RPC real (handler .request): iniciar (onIniciarRequest → _iniciar), la
 *     ÚNICA. Legal solo desde IDLE / COLA_VACIA / ERROR (409 CONFLICT_STATE si no).
 *     Sin piezas → estado COLA_VACIA + ciclo.cola_vacia; fallo → ciclo.abortado.
 *   - Sin RPC de confirmación: las 3 confirmaciones (pieza_retirada /
 *     filamento_cambiado / reanudar_ciclo) se entregan por el EVENTO
 *     adaptador-confirmacion.confirmacion_recibida (handler onConfirmacionRecibida)
 *     con d.tipo === 'pieza_retirada' | 'filamento_cambiado' | 'reanudar_ciclo'.
 *
 * Señales publicadas por el orquestador (reconstructoras de estado):
 *   ciclo.iniciado        → IMPRIMIENDO + piezaActual (item_id/modelo_id/nombre/material)
 *   impresion.completada  → ESPERANDO_RETIRADA (el módulo transiciona; la señal la refleja)
 *   filamento.falta       → PAUSADO_FALTA_FILAMENTO
 *   impresion.error       → ERROR
 *   ciclo.abortado        → ERROR (par de fallo canónico)
 *   ciclo.cola_vacia      → COLA_VACIA
 *   progreso.actualizado  → progreso% + capa/total
 *   ciclo.completado      → fin del ciclo (IDLE + pieza retirada)
 *   ciclo.esperando_confirmacion → aviso contextual "tu mano hace falta" (defensivo;
 *     el estado real ya lo reconstruyeron las señales concretas arriba)
 *
 * Regla de esquematización (F7):
 *   R2 — no hay RPC lectora: el store NUNCA asume estado local que no llegó del bus.
 *   R3 — el refresco lo da la SEÑAL del bus (nunca recarga): cada evento publicado
 *        del orquestador reconstruye el punto actual de la máquina.
 *   DUALIDAD — iniciar es la única escritura RPC (jefe, decide CUANDO arranca el
 *        reloj); las 3 confirmaciones contextuales son la mano del dueño (deciden
 *        las transiciones físicas) y viajan por adaptador-confirmacion.
 *
 * Patrón del repo: molde exacto de modules/cola-impresion/stores/cola.ts
 * (3ª iteración de la práctica F7) — sessionProjectId + subscribe + cleanup +
 * describeError + multi-tenant, pero SIN load RPC inicial: aquí el estado ES la
 * señal (la esencia es suscribirse, no listar).
 */

import { writable, derived, get } from 'svelte/store';
import { mqttRequest, MqttRequestError, MqttTimeoutError } from '$lib/ui-core/mqtt-request';
import { subscribe as mqttSubscribe, publish } from '$lib/ui-core/mqtt';
import { sessionProjectId } from '$lib/stores/sessionProject';

// =============================================================================
// TIPOS — estados reales de la máquina (index.js ESTADOS) + señales
// =============================================================================

/** Los 8 estados canónicos del ciclo (index.js ESTADOS). */
export type EstadoCiclo =
  | 'IDLE'
  | 'OBTENIENDO_GCODE'
  | 'SUBIENDO_GCODE'
  | 'IMPRIMIENDO'
  | 'ESPERANDO_RETIRADA'
  | 'PAUSADO_FALTA_FILAMENTO'
  | 'ERROR'
  | 'COLA_VACIA';

/** Tipos de confirmación contextual del jefe. NO son RPC: van por adaptador-confirmacion. */
export type TipoConfirmacion =
  | 'pieza_retirada'
  | 'filamento_cambiado'
  | 'reanudar_ciclo';

/** Pieza en curso — lo que proyecta ciclo.iniciado (campos reales de _iniciar). */
export interface PiezaEnCurso {
  item_id: string;
  modelo_id: string;
  nombre: string;
  /** Huecos como 'desconocido' (invariante 5), nunca inventados. */
  material: string;
}

/** Progreso de la impresión — lo que proyecta progreso.actualizado. */
export interface ProgresoImpresion {
  progress: number;
  current_layer?: number | null;
  total_layer?: number | null;
}

// =============================================================================
// ESTADO — reconstruido por SEÑAL (R3): la señal ES el estado, no hay load inicial
// =============================================================================

interface CicloState {
  /** Punto actual de la máquina de estados. */
  estado: EstadoCiclo;
  /** Pieza en curso (solo mientras hay ciclo vivo). */
  pieza: PiezaEnCurso | null;
  progreso: ProgresoImpresion | null;
  /** Aviso contextual "tu mano hace falta": tipo de confirmación que se pide. */
  esperando: TipoConfirmacion | null;
  error: string | null;
  /** ¿La última señal cerró el ciclo (pieza impresa y retirada)? */
  cicloCompletado: boolean;
  /** Actividad en vivo: qué evento llegó por última vez. */
  ultimaSenal: { evento: string; cuando: string } | null;
  /** RPC en curso (iniciar). */
  iniciando: boolean;
}

const initialState: CicloState = {
  estado: 'IDLE',
  pieza: null,
  progreso: null,
  esperando: null,
  error: null,
  cicloCompletado: false,
  ultimaSenal: null,
  iniciando: false
};

export const cicloStore = writable<CicloState>(initialState);

// ---- Derivados (readonly para componentes) ----
export const cicloEstado = derived(cicloStore, ($s) => $s.estado);
export const cicloPieza = derived(cicloStore, ($s) => $s.pieza);
export const cicloProgreso = derived(cicloStore, ($s) => $s.progreso);
export const cicloEsperando = derived(cicloStore, ($s) => $s.esperando);
export const cicloError = derived(cicloStore, ($s) => $s.error);
export const cicloCompletado = derived(cicloStore, ($s) => $s.cicloCompletado);
export const ultimaSenal = derived(cicloStore, ($s) => $s.ultimaSenal);
export const cicloIniciando = derived(cicloStore, ($s) => $s.iniciando);

/** Estados desde los que el jefe puede arrancar el ciclo (iniciar, 409 si no). */
const ESTADOS_INICIABLES: EstadoCiclo[] = ['IDLE', 'COLA_VACIA', 'ERROR'];
/** ¿Desde este estado el panel muestra el botón "iniciar ciclo"? */
export const puedeIniciar = derived(cicloStore, ($s) => ESTADOS_INICIABLES.includes($s.estado));

/** Confirmación que corresponde a un estado en espera de mano (contextual único). */
export const confirmacionPorEstado = derived(cicloStore, ($s): TipoConfirmacion | null => {
  switch ($s.estado) {
    case 'ESPERANDO_RETIRADA': return 'pieza_retirada';
    case 'PAUSADO_FALTA_FILAMENTO': return 'filamento_cambiado';
    case 'ERROR': return 'reanudar_ciclo';
    default: return null;
  }
});

export function describeError(err: unknown): string {
  if (err instanceof MqttTimeoutError) return 'sin respuesta del bus';
  if (err instanceof MqttRequestError) return err.message;
  return (err as Error)?.message || 'error desconocido';
}

// =============================================================================
// DISPARADOR (ROL JEFE) — iniciar: la ÚNICA RPC real del módulo
// =============================================================================

/**
 * Arranca el ciclo (iniciar.request, handler onIniciarRequest → _iniciar). El
 * jefe decide CUANDO arranca el reloj; legal solo desde IDLE / COLA_VACIA /
 * ERROR (el módulo responde 409 CONFLICT_STATE si no; una pieza a la vez,
 * invariante 7). Sin escritura local de estado: la señal ciclo.iniciado /
 * ciclo.cola_vacia / ciclo.abortado reconstruye el punto de la máquina (R3).
 */
export async function iniciarCiclo(pid: string): Promise<void> {
  cicloStore.update((s) => ({ ...s, iniciando: true, error: null, cicloCompletado: false }));
  try {
    await mqttRequest<Record<string, unknown>>('ciclo-impresion', 'iniciar', { project_id: pid });
  } catch (err) {
    cicloStore.update((s) => ({ ...s, error: describeError(err) }));
  } finally {
    cicloStore.update((s) => ({ ...s, iniciando: false }));
  }
}

// =============================================================================
// CONFIRMAR (ROL JEFE — contextual) — la MANO del dueño, NO son RPC del módulo
// =============================================================================

/**
 * Emite una confirmación contextual (pieza_retirada / filamento_cambiado /
 * reanudar_ciclo). [ABIERTO] — el módulo ciclo-impresion NO tiene handler
 * .request 'ciclo.confirmar.<tipo>': la confirmación se entrega al sistema por
 * el EVENTO adaptador-confirmacion.confirmacion_recibida (handler
 * onConfirmacionRecibida del ciclo, fire-and-forget, campo d.tipo). Elegimos la
 * vía más directa y documentada: el botón del panel (el dueño, físicamente
 * presente) publica ese evento con { project_id, tipo }. Se descarta 'confirmar'
 * RPC del adaptador-confirmacion porque ese puerto sólo PIDE por Telegram y no
 * transiciona el ciclo (el avance real lo hace confirmacion_recibida).
 */
export function confirmarCiclo(pid: string, tipo: TipoConfirmacion): void {
  publish('adaptador-confirmacion.confirmacion_recibida', {
    project_id: pid,
    tipo,
    correlation_id: crypto.randomUUID?.() ?? undefined,
    contexto: { canal: 'ciclo-impresion-panel-ui', origen: 'panel-jefe' },
    timestamp: new Date().toISOString()
  });
  // La confirmación no responde con señal propia: la TRANSICIÓN se refleja en el
  // siguiente evento publicado (ciclo.iniciado si re-encadena, ciclo.completado
  // si la cola quedó vacía, progreso.actualizado si reanuda) — la vista re-lee.
}

/** Multi-tenant: vaciar todo al cambiar de proyecto (sin estado ajeno). */
export function resetCiclo(): void {
  cicloStore.set(initialState);
}

// =============================================================================
// SEÑAL-REFRESH (R3) — la esencia: el panel VIVE DEL BUS, reconstruye el estado
// =============================================================================

/** Extrae project_id del envelope tolerando los shapes del repo (como cola). */
function extraerProjectId(envelope: unknown): string | undefined {
  const e = envelope as {
    project_id?: string;
    data?: { project_id?: string; data?: { project_id?: string } };
  } | null;
  return e?.project_id ?? e?.data?.project_id ?? e?.data?.data?.project_id ?? undefined;
}

/** Toma el payload plano de la señal (tolera { data } envuelto). */
function datos(envelope: unknown): Record<string, unknown> {
  const e = envelope as { data?: Record<string, unknown> };
  return (e && e.data && typeof e.data === 'object'
    ? (e.data as Record<string, unknown>)
    : (envelope as Record<string, unknown>)) ?? {};
}

/**
 * Suscripción a TODAS las señales que el orquestador publica (transporte.salida).
 * Es LA ESENCIA de este panel de máquina de estados: NO hay RPC lectora de estado
 * en index.js, así que el estado actual se RECONSTRUYE desde cada señal del bus
 * (R3, nunca recarga). Cada suscripción usa su propio handler (el cliente no
 * entrega el topic a handlers de eventos: ver subscribe() en client.ts), así que
 * derivamos cada transición por la señal concreta que llegó.
 */
export function initCicloSubscriptions(): () => void {
  const unsubs: Array<() => void> = [];

  // Guarda de pertenencia al proyecto activo (multi-tenant): se comparte.
  const pertenece = (envelope: unknown): boolean => {
    const activo = get(sessionProjectId);
    if (!activo) return false;
    const pid = extraerProjectId(envelope);
    return pid === undefined || pid === activo;
  };

  // ciclo.iniciado → el ciclo arrancó: IMPRIMIENDO + pieza en curso.
  unsubs.push(mqttSubscribe('ciclo.iniciado', (envelope) => {
    if (!pertenece(envelope)) return;
    const d = datos(envelope);
    cicloStore.update((s) => aplicar(s, 'ciclo.iniciado', {
      estado: 'IMPRIMIENDO',
      pieza: {
        item_id: String(d.item_id ?? ''),
        modelo_id: String(d.modelo_id ?? ''),
        nombre: String(d.nombre ?? ''),
        material: String(d.material ?? 'desconocido')
      },
      esperando: null,
      error: null,
      cicloCompletado: false
    }));
  }));

  // impresion.completada → la pieza terminó: ESPERANDO_RETIRADA (mano del jefe).
  unsubs.push(mqttSubscribe('impresion.completada', (envelope) => {
    if (!pertenece(envelope)) return;
    cicloStore.update((s) => aplicar(s, 'impresion.completada', { estado: 'ESPERANDO_RETIRADA', esperando: 'pieza_retirada', error: null }));
  }));

  // filamento.falta → PAUSADO_FALTA_FILAMENTO (mano del jefe: cambiar filamento).
  unsubs.push(mqttSubscribe('filamento.falta', (envelope) => {
    if (!pertenece(envelope)) return;
    cicloStore.update((s) => aplicar(s, 'filamento.falta', { estado: 'PAUSADO_FALTA_FILAMENTO', esperando: 'filamento_cambiado', error: null }));
  }));

  // impresion.error → ERROR (mano del jefe: reanudar tras error).
  unsubs.push(mqttSubscribe('impresion.error', (envelope) => {
    if (!pertenece(envelope)) return;
    const d = datos(envelope);
    cicloStore.update((s) => aplicar(s, 'impresion.error', {
      estado: 'ERROR',
      esperando: 'reanudar_ciclo',
      error: (d.error ? String(d.error) : '') || 'error de impresión'
    }));
  }));

  // ciclo.abortado → ERROR (par de fallo canónico; _abortar fija estado ERROR).
  unsubs.push(mqttSubscribe('ciclo.abortado', (envelope) => {
    if (!pertenece(envelope)) return;
    const d = datos(envelope);
    cicloStore.update((s) => aplicar(s, 'ciclo.abortado', {
      estado: 'ERROR',
      esperando: 'reanudar_ciclo',
      error: (d.motivo ? String(d.motivo) : '') || 'ciclo abortado'
    }));
  }));

  // ciclo.cola_vacia → COLA_VACIA (iniciar con nueva pieza, legal).
  unsubs.push(mqttSubscribe('ciclo.cola_vacia', (envelope) => {
    if (!pertenece(envelope)) return;
    cicloStore.update((s) => aplicar(s, 'ciclo.cola_vacia', {
      estado: 'COLA_VACIA',
      pieza: null,
      esperando: null,
      error: null,
      cicloCompletado: false
    }));
  }));

  // ciclo.completado → fin del ciclo (pieza impresa y retirada; la máquina vuelve a IDLE).
  unsubs.push(mqttSubscribe('ciclo.completado', (envelope) => {
    if (!pertenece(envelope)) return;
    cicloStore.update((s) => aplicar(s, 'ciclo.completado', {
      estado: 'IDLE',
      pieza: null,
      progreso: null,
      esperando: null,
      error: null,
      cicloCompletado: true
    }));
  }));

  // ciclo.esperando_confirmacion → aviso defensivo "tu mano hace falta". El tipo
  // concreto ya lo reconstruyeron las señales específicas; aquí solo latimos y,
  // si el estado no refleja aún la espera (transición intermedia), el botón
  // contextual lo decide por confirmacionPorEstado.
  unsubs.push(mqttSubscribe('ciclo.esperando_confirmacion', (envelope) => {
    if (!pertenece(envelope)) return;
    const d = datos(envelope);
    const motivo = String(d.motivo ?? '');
    const tipo: TipoConfirmacion | null =
      motivo === 'filamento' ? 'filamento_cambiado' :
      motivo === 'error' ? 'reanudar_ciclo' :
      motivo === 'retirar' || motivo === 'pieza' ? 'pieza_retirada' : null;
    cicloStore.update((s) => aplicar(s, 'ciclo.esperando_confirmacion', {
      esperando: tipo ?? s.esperando ?? 'pieza_retirada'
    }));
  }));

  // progreso.actualizado → % + capa actual/total (vigilia en IMPRIMIENDO).
  unsubs.push(mqttSubscribe('progreso.actualizado', (envelope) => {
    if (!pertenece(envelope)) return;
    const d = datos(envelope);
    const progress = Number(d.progress ?? s_prog_none);
    if (Number.isNaN(progress)) return;
    cicloStore.update((s) => aplicar(s, 'progreso.actualizado', {
      progreso: {
        progress,
        current_layer: d.current_layer != null ? Number(d.current_layer) : null,
        total_layer: d.total_layer != null ? Number(d.total_layer) : null
      }
    }));
  }));

  return () => unsubs.forEach((u) => u());
}

/** Aplica un ajuste parcial + latido de actividad, preservando el resto del estado. */
function aplicar(s: CicloState, evento: string, p: Partial<CicloState>): CicloState {
  return { ...s, ...p, ultimaSenal: { evento, cuando: new Date().toISOString() } };
}

/** Centinela: progreso ausente (no confundir con 0 real). */
const s_prog_none = Number.NaN;
