/**
 * Facturas Store (panel del JEFE) — F7, composición según esquema-jefe de facturas.
 *
 * Fuente de la lógica (verificada línea a línea en el repo, facturas v3.0.0):
 *   - modules/facturas/index.js: contrato real de los 9 ui_handlers y señales.
 *   - services/providers/local/facturas-db/index.js: columnas reales REAL/
 *     TEXT de la tabla facturas + shape de listar/estadisticas.
 *   - modules/facturas/pipeline/pipeline-metrics.js: getDashboard() (L127).
 *   - modules/facturas/esquema-jefe/esquema.md: dualidad (jefe declara sobre las
 *     facturas ENTRANTES; utilización-sistema = factura.entrada llega sola del
 *     chat/telegram; fábrica = procesar), composición INFORMARSE → SELECCIONAR
 *     → DECLARAR, señales pareadas.
 *
 * CONTRATO REAL (index.js):
 *   - TODOS los handlers exigen `proyecto` en el payload (400 INVALID_INPUT si
 *     falta — mqttRequest NO lo inyecta, mqtt-request.ts es transparente).
 *   - subir recibe { proyecto, archivo:{nombre, contenido(base64)}, source? } —
 *     NO filePath (eso es `procesar`, la fábrica). 201 ok · 409 duplicate.
 *   - actualizar recibe { proyecto, id, datos } → UPDATE SQL libre sobre la
 *     tabla facturas: SIN señal propia → refetch por dictamen de su respuesta.
 *   - reprocesar recibe { proyecto, id } → 404 si path_original no está en disco.
 *   - exportar recibe { proyecto, semana? } → selecciona SOLO estado='procesada',
 *     genera el CSV, las marca exportadas y publica factura.exportada →
 *     { path, nombre, contenido(base64), total }.
 *   - listar recibe { proyecto, estado?, limit? } → { facturas[], total }.
 *   - estadisticas recibe { proyecto } → { total, pendientes, procesadas,
 *     errores, exportadas, porSource[] } — la cinta.
 *   - pipeline-metrics sin args → getDashboard(): { available, summary{...},
 *     cost{totalEur, totalTokens}, timing, validation }.
 *   - id es string UUID (facturas-db: id TEXT PRIMARY KEY), NO number.
 *
 * Señales pareadas (_publicarEvento aplana project_id en el envelope):
 *   subir → factura.recibida → factura.procesada | factura.error (tándem 1-3) ·
 *   reprocesar → factura.procesada | factura.error (invoice-pipeline L808/L160) ·
 *   exportar → factura.exportada · fallos → factura.error (nombrado en su fila).
 *
 * Reglas del esquema-jefe:
 *   R2 — toda mutación va por mqttRequest y NUNCA asume estado local: el store
 *        solo escribe al recibir datos de una lectura RPC.
 *   R3 — el refresco lo da la SEÑAL del bus (nunca recarga): el debounce 60ms
 *        absorbe el tándem recibida→procesada|error. actualizar (sin señal)
 *        refresca por dictamen de su respuesta.
 *   INV — importes en EUROS float (columnas REAL de sqlite): se envían €. Sin
 *        conversión a céntimos (lección eurosACentimos: NO convertir).
 *
 * Patrón del repo: molde exacto de modules/pedidos/stores/pedidos.ts
 * (mqttRequest + suscripción dot-notation con debounce + cleanup + describeError).
 */

import { writable, get } from 'svelte/store';
import { mqttRequest, MqttRequestError, MqttTimeoutError } from '$lib/ui-core/mqtt-request';
import { subscribe as mqttSubscribe } from '$lib/ui-core/mqtt';
import { activeProjectId } from '$lib/stores/projects';

// =============================================================================
// TIPOS — formas reales devueltas por facturas.listar / facturas.estadisticas
// =============================================================================

export type FacturaEstado = 'pendiente' | 'procesando' | 'procesada' | 'error' | 'exportada';
export type FacturaSource = 'telegram' | 'gmail' | 'manual';

/**
 * Fila REAL de la tabla facturas (facturas-db CREATE TABLE — SELECT * en listar).
 * Nombres de columna snake_case del schema, NO del store global viejo.
 */
export interface FacturaRow {
  id: string;
  nombre_archivo: string;
  path_original?: string | null;
  source?: FacturaSource;
  fecha_entrada?: string | null;
  estado: FacturaEstado;
  ocr_error?: string | null;
  factura_numero?: string | null;
  factura_fecha?: string | null;
  proveedor_nif?: string | null;
  proveedor_nombre?: string | null;
  concepto?: string | null;
  categoria?: string | null;
  base_imponible?: number | null;
  tipo_iva?: number | null;
  cuota_iva?: number | null;
  total_factura?: number | null;
  estado_pago?: 'pendiente' | 'pagada' | null;
  fecha_exportado?: string | null;
  semana_export?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
}

/** Cinta-estado: shape real de handleEstadisticas (index.js L403-431). */
export interface CintaFacturas {
  total: number;
  pendientes: number;
  procesadas: number;
  errores: number;
  exportadas: number;
  porSource?: Array<{ source?: string; total?: number }>;
}

/** Dashboard del pipeline v2 (pipeline-metrics.js getDashboard — L125-160). */
export interface PipelineDash {
  available?: boolean;
  summary?: { total: number; success: number; failed: number; duplicates: number; successRate: number };
  cost?: { totalCents?: number; totalEur?: string; totalTokens?: number };
  timing?: Record<string, unknown>;
  validation?: { total?: number; passed?: number; failed?: number };
  [key: string]: unknown;
}

/** Último factura.error nombrado (file_path + code + message del evento). */
export interface UltimoError {
  file_path?: string;
  code?: string;
  message?: string;
}

// =============================================================================
// CATÁLOGOS — estado, campos del editor y etapas del pipeline
// =============================================================================

export const ESTADOS_FACTURA: FacturaEstado[] = ['pendiente', 'procesando', 'procesada', 'error', 'exportada'];

export const STATUS_POR_ESTADO: Record<FacturaEstado, { label: string; color: string; icono: string }> = {
  pendiente: { label: 'recibida', color: '#9ca3af', icono: '📥' },
  procesando: { label: 'procesando', color: '#f59e0b', icono: '⚙️' },
  procesada: { label: 'procesada', color: '#60a5fa', icono: '✅' },
  error: { label: 'error', color: '#ef4444', icono: '⚠️' },
  exportada: { label: 'exportada', color: '#22c55e', icono: '📤' }
};

/** Campos del editor-bloque de corrección — whitelist de columnas REALES del schema. */
export const CAMPOS_EDITABLES = [
  'proveedor_nombre',
  'proveedor_nif',
  'factura_numero',
  'factura_fecha',
  'concepto',
  'categoria',
  'base_imponible',
  'tipo_iva',
  'cuota_iva',
  'total_factura',
  'estado',
  'estado_pago',
  'notas'
] as const;

/** Campos numéricos € del editor (float, sin céntimos). */
export const CAMPOS_EUROS = new Set(['base_imponible', 'tipo_iva', 'cuota_iva', 'total_factura']);

/** Las 7 etapas del pipeline v2 (invoice-pipeline.js STEPS — L21-29). */
export const ETAPAS_PIPELINE = [
  { id: 'intake', label: 'Intake' },
  { id: 'convert', label: 'Convert' },
  { id: 'prepare', label: 'Prepare' },
  { id: 'ocr', label: 'OCR' },
  { id: 'structure', label: 'Structure (IA)', ia: true },
  { id: 'validate', label: 'Validate' },
  { id: 'store', label: 'Store' }
] as const;

// =============================================================================
// STORES — lecturas-only (R2): solo las respuestas RPC escriben aquí
// =============================================================================

/** La pila de facturas (listar, orden fecha_entrada DESC por el servidor). */
export const pilaStore = writable<FacturaRow[]>([]);

/** Cinta-estado (estadisticas): el pulso del circuito sin navegar. */
export const cintaStore = writable<CintaFacturas>({ total: 0, pendientes: 0, procesadas: 0, errores: 0, exportadas: 0 });

/** Salud del pipeline v2 (cinta secundaria; null = sin métricas). */
export const pipelineStore = writable<PipelineDash | null>(null);

export const cintaLoading = writable<boolean>(false);
export const cintaError = writable<string | null>(null);

/** Contador de mutaciones en vuelo — la cinta muestra "sincronizando…". */
export const mutacionesPendientes = writable<number>(0);
/** Último error de mutación (dictamen de la respuesta, no modal global). */
export const errorMutacion = writable<string | null>(null);
/** Último factura.error del bus (nombrado: archivo + code + message). */
export const ultimoErrorBus = writable<UltimoError | null>(null);

export function describeError(err: unknown): string {
  if (err instanceof MqttTimeoutError) return 'sin respuesta del bus';
  if (err instanceof MqttRequestError) return err.message;
  return (err as Error)?.message || 'error desconocido';
}

/** EUROS float formateados (es-ES) — columnas REAL de sqlite, sin céntimos. */
export function formatearEuros(euros: number | string | null | undefined): string {
  if (euros === null || euros === undefined || euros === '') return '—';
  const n = typeof euros === 'number' ? euros : Number(String(euros).replace(',', '.'));
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);
}

/** Fecha corta es-ES de un ISO (fecha de factura / entrada). */
export function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
}

/** Pill de estado reutilizable por la fila (color + icono del mapa). */
export function pillEstado(estado: string): { label: string; color: string; icono: string } {
  return STATUS_POR_ESTADO[estado as FacturaEstado] ?? { label: estado, color: '#9ca3af', icono: '❔' };
}

/** Code canónico de un ocr_error (JSON.stringify o texto plano del pipeline). */
export function errorNombrado(row: FacturaRow): { code: string; message: string } | null {
  const raw = row?.ocr_error;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(String(raw)) as { code?: string; message?: string; msg?: string };
    if (parsed && typeof parsed === 'object') {
      return { code: String(parsed.code ?? 'ERROR'), message: String(parsed.message ?? parsed.msg ?? raw).slice(0, 160) };
    }
  } catch {
    /* texto plano */
  }
  return { code: 'OCR_ERROR', message: String(raw).slice(0, 160) };
}

// =============================================================================
// LECTURAS (INFORMARSE) — las únicas escrituras (R2). `proyecto` SIEMPRE.
// =============================================================================

interface ListarResp {
  facturas?: FacturaRow[];
  total?: number;
}

/**
 * Cinta + pila + salud del pipeline en un golpe (capas 1-2). Tres lecturas
 * tolerantes: si alguna falla, las demás siguen (404 temprano = cinta en ceros).
 */
export async function loadCinta(pid: string): Promise<void> {
  cintaLoading.set(true);
  cintaError.set(null);
  try {
    const [stats, pila, dash] = await Promise.all([
      mqttRequest<CintaFacturas>('facturas', 'estadisticas', { proyecto: pid }).catch(() => null),
      mqttRequest<ListarResp>('facturas', 'listar', { proyecto: pid, limit: 100 }).catch(() => null),
      mqttRequest<PipelineDash>('facturas', 'pipeline-metrics', { proyecto: pid }).catch(() => null)
    ]);

    if (stats) cintaStore.set(stats.data);
    if (pila) pilaStore.set(pila.data?.facturas ?? []);
    if (dash) pipelineStore.set(dash.data);
    if (!stats && !pila) cintaError.set('sin respuesta del módulo facturas (¿core levantado?)');
  } finally {
    cintaLoading.set(false);
  }
}

/**
 * Refetch SOLO de estadisticas + listar tras `actualizar` (sin señal propia):
 * el dictamen de la respuesta manda, la pila se re-lee suave.
 */
export async function refrescarCinta(pid: string): Promise<void> {
  try {
    const [stats, pila] = await Promise.all([
      mqttRequest<CintaFacturas>('facturas', 'estadisticas', { proyecto: pid }),
      mqttRequest<ListarResp>('facturas', 'listar', { proyecto: pid, limit: 100 })
    ]);
    if (stats) cintaStore.set(stats.data);
    if (pila) pilaStore.set(pila.data?.facturas ?? []);
  } catch {
    /* la fila conserva su error anterior si el refetch falla */
  }
}

/** Multi-tenant: vaciar todo al cambiar de proyecto (sin datos ajenos). */
export function resetFacturas(): void {
  pilaStore.set([]);
  cintaStore.set({ total: 0, pendientes: 0, procesadas: 0, errores: 0, exportadas: 0 });
  pipelineStore.set(null);
  cintaError.set(null);
  errorMutacion.set(null);
  ultimoErrorBus.set(null);
}

// =============================================================================
// DECLARAR (capa 3) — LOS 4 GESTOS DEL JEFE (las únicas escrituras)
// CONTRATO REAL: subir {proyecto, archivo{nombre,contenido}} · actualizar
// {proyecto, id, datos} · reprocesar {proyecto, id} · exportar {proyecto,
// semana?} — index.js L267/L303/L383/L433.
// =============================================================================

/**
 * H1 — meter una factura al circuito. El canal natural (chat/telegram) no pasa
 * por aquí; desde el panel el shape exige contenido base64 (index.js L267-301).
 * Devuelve el dictamen del pipeline para el informe de la fila.
 */
export async function subirFactura(
  nombre: string,
  contenidoBase64: string,
  source: FacturaSource = 'manual'
): Promise<{ success: boolean; duplicate?: boolean; error?: string }> {
  const pid = get(activeProjectId);
  if (!pid) return { success: false, error: 'sin proyecto activo' };
  mutacionesPendientes.update((n) => n + 1);
  errorMutacion.set(null);
  try {
    const res = await mqttRequest<{ success?: boolean; facturaId?: string; duplicate?: boolean; error?: string }>(
      'facturas',
      'subir',
      { proyecto: pid, archivo: { nombre, contenido: contenidoBase64 }, source }
    );
    return { success: true, duplicate: !!res?.data?.duplicate };
    // Sin escritura local: el tándem pareado recibida→procesada re-lee (R3).
  } catch (err) {
    errorMutacion.set(describeError(err));
    return { success: false, error: describeError(err) };
  } finally {
    mutacionesPendientes.update((n) => n - 1);
  }
}

/**
 * H2 — corregir datos extraídos. RPC directo a la DB SIN señal: el refetch lo
 * da el dictamen (campos updated[]). `datos` sale con solo las columnas
 * EDITADAS, filtradas por la whitelist de columnas reales y con los € en float.
 */
export async function actualizarFactura(
  id: string,
  datos: Record<string, unknown>
): Promise<{ ok: boolean; campos?: string[]; error?: string }> {
  const pid = get(activeProjectId);
  if (!pid) return { ok: false, error: 'sin proyecto activo' };
  mutacionesPendientes.update((n) => n + 1);
  errorMutacion.set(null);
  try {
    const limpios: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(datos)) {
      if (!(CAMPOS_EDITABLES as readonly string[]).includes(k)) continue;
      if (v === undefined) continue;
      if (CAMPOS_EUROS.has(k)) {
        if (v === null || v === '') continue;
        const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
        if (!Number.isFinite(n)) continue;
        limpios[k] = n; // € float, sin céntimos (INV del esquema-jefe)
        continue;
      }
      if (typeof v === 'string' && !v.trim()) continue;
      limpios[k] = typeof v === 'string' ? v.trim() : v;
    }
    if (Object.keys(limpios).length === 0) return { ok: false, error: 'nada que actualizar' };

    const res = await mqttRequest<{ updated?: string[] }>('facturas', 'actualizar', { proyecto: pid, id, datos: limpios });
    await refrescarCinta(pid);
    return { ok: true, campos: res?.data?.updated };
  } catch (err) {
    const msg = describeError(err);
    errorMutacion.set(msg);
    return { ok: false, error: msg };
  } finally {
    mutacionesPendientes.update((n) => n - 1);
  }
}

/** H3 — relanzar el pipeline sobre la factura fallida (404 si el archivo original ya no está en disco). */
export async function reprocesarFactura(id: string): Promise<{ ok: boolean; duplicate?: boolean; error?: string }> {
  const pid = get(activeProjectId);
  if (!pid) return { ok: false, error: 'sin proyecto activo' };
  mutacionesPendientes.update((n) => n + 1);
  errorMutacion.set(null);
  try {
    await mqttRequest('facturas', 'reprocesar', { proyecto: pid, id });
    return { ok: true };
    // La señal pareada (procesada | error) re-lee la pila (R3).
  } catch (err) {
    const msg = describeError(err);
    errorMutacion.set(msg);
    return { ok: false, error: msg };
  } finally {
    mutacionesPendientes.update((n) => n - 1);
  }
}

/**
 * H4 — cerrar el ciclo fiscal: CSV de las PROCESADAS (todas, el RPC es por
 * lote) y marca exportadas. Devuelve {nombre, contenidoB64, total} para la
 * descarga en el panel.
 */
export async function exportarFacturas(
  semana?: string
): Promise<{ ok: boolean; nombre?: string; contenidoB64?: string; total?: number; error?: string }> {
  const pid = get(activeProjectId);
  if (!pid) return { ok: false, error: 'sin proyecto activo' };
  mutacionesPendientes.update((n) => n + 1);
  errorMutacion.set(null);
  try {
    const res = await mqttRequest<{ nombre?: string; contenido?: string; total?: number }>(
      'facturas',
      'exportar',
      semana && semana.trim() ? { proyecto: pid, semana: semana.trim() } : { proyecto: pid }
    );
    return {
      ok: true,
      nombre: res?.data?.nombre,
      contenidoB64: res?.data?.contenido,
      total: res?.data?.total
    };
    // La señal factura.exportada re-lee la cinta (R3).
  } catch (err) {
    const msg = describeError(err);
    errorMutacion.set(msg);
    return { ok: false, error: msg };
  } finally {
    mutacionesPendientes.update((n) => n - 1);
  }
}

/** Descarga del CSV en el navegador (base64 → blob). */
export function descargarCsv(nombre: string, contenidoB64: string): void {
  const bin = atob(contenidoB64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre || 'facturas.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// =============================================================================
// SEÑAL-REFRESH (R3) — las señales reales del módulo → re-lectura de la pila
// =============================================================================

/** Extrae project_id del envelope tolerando los shapes del repo (como pedidos). */
function extraerProjectId(envelope: unknown): string | undefined {
  const e = envelope as {
    project_id?: string;
    projectId?: string;
    data?: { project_id?: string; projectId?: string };
  } | null;
  return e?.project_id ?? e?.projectId ?? e?.data?.project_id ?? e?.data?.projectId ?? undefined;
}

const SENALES_FACTURA = [
  'factura.recibida',
  'factura.procesada',
  'factura.error',
  'factura.exportada'
];

/**
 * Suscripción a las señales pareadas (dot-notation). El debounce 60ms absorbe
 * el tándem recibida→procesada/error de UNA subida (1-3 eventos). factura.error
 * además NOMBRA el último error (archivo + código) para la cinta. El cleanup
 * cancela el timer y desuscribe todo.
 */
export function initFacturasSenales(): () => void {
  const unsubs: Array<() => void> = [];

  let recargaProgramada: ReturnType<typeof setTimeout> | null = null;

  function encolarRecarga(): void {
    if (recargaProgramada) return; // debounce: las señales llegan en tándem
    recargaProgramada = setTimeout(() => {
      recargaProgramada = null;
      const activo = get(activeProjectId);
      if (activo) void loadCinta(activo);
    }, 60);
  }

  function onSenal(envelope: unknown): void {
    const activo = get(activeProjectId);
    if (!activo) return;
    const pid = extraerProjectId(envelope);
    if (pid !== undefined && pid !== activo) return; // señal de otro proyecto

    const ev = (envelope ?? {}) as { data?: UltimoError; code?: string; message?: string; file_path?: string };
    const errData = ev.data ?? ev;
    if (errData && typeof errData === 'object' && (errData.code || errData.message || errData.file_path) && !('estado' in errData)) {
      ultimoErrorBus.set({
        file_path: errData.file_path,
        code: errData.code,
        message: errData.message
      });
    }

    encolarRecarga();
  }

  for (const senal of SENALES_FACTURA) {
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