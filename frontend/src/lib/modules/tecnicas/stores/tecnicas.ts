/**
 * Tecnicas Store — la cara del JEFE del catálogo de técnicas culinarias (F7,
 * composición según esquema-jefe/ de tecnicas, ciclo v2): informe del
 * catálogo + detalle con history + 2 editor-bloque (alta = codificar,
 * evolución = actualizar) con DICTAMEN por respuesta (el diff campo a campo).
 *
 * Fuente de la lógica (verificada en el repo):
 *   - modules/pizzepos/tecnicas/tecnicas.blueprint.json (391 líneas, leídas
 *     enteras): módulo BLUEPRINT-DRIVEN — SIN index.js, el LLM ES el runtime
 *     vía ai-gateway; el pseudocódigo de operaciones/ ES el contrato vivo.
 *   - modules/pizzepos/tecnicas/esquema-jefe/ (pasada-1, pasada-2, anatomía,
 *     esquema.md): composición 3 capas, formas UI, señales pareadas.
 *   - module.json v1.1.0: ui_handlers = 1 (handlePanel workspace_module).
 *
 * CONTRATO REAL (blueprint v2.0.0, operaciones preservadas):
 *   - listar {} → 200 data = lista LIGERA [{ id, nombre, categoria,
 *     descripcion, etiquetas, version }] SIN history ni instrucciones,
 *     orden alfabético, sin paginación (docenas). 404 imposible: store ausente
 *     = 200 data: [] (L191).
 *   - obtener { tecnica_id | nombre } → 200 data = técnica COMPLETA con
 *     history[] (match nombre exacto > parcial, L168-171). 404 = estado
 *     nombrado RESOURCE_NOT_FOUND, no crash.
 *   - codificar → 201 data.data = { tecnica } (nombre único normalizado
 *     lowercase+trim, L86-87: duplicado = ALREADY_EXISTS dictaminado EN la
 *     respuesta).
 *   - actualizar { tecnica_id, campos } → 200 data.data = { tecnica, diff:
 *     { campo: { antes, despues } } } (L275 — el DICTAMEN MÁS RICO del ciclo).
 *     Enum campos_permitidos L239: descripcion, categoria, parametros,
 *     materiales, instrucciones, etiquetas (id/nombre/version/history/
 *     created_at NO se tocan). Sin campo permitido → INVALID_INPUT sin disco.
 *
 * SHAPE DEL BUS (tolerante, mismo patrón que cocina.ts/cuentas.ts): el
 * envelope de ui/response puede traer el payload del reflejo en `data` o
 * envuelto una vez más (data.data = { status, data }); helpers extraen con
 * fallback — nunca se adivina: solo respuestas reales escriben el store.
 *
 * SEÑALES PAREADAS (verificadas en el contrato — garantiza #4 + transporte):
 *   codificar → publica `tecnica.creada`; actualizar → `tecnica.actualizada`
 *   { tecnica_id, nombre, version, campos_modificados }. El seed ui.datos ya
 *   declara refresh_on de AMBAS. Doble confirmación: dictamen RPC inmediato +
 *   señal que re-lee el informe (nunca recarga, nunca estado optimista).
 *
 * DATO EXACTO (temperatura 0.3 del contrato): el panel NO normaliza ni
 * calcula — parametros/materiales/instrucciones viajan VERBATIM; los rangos
 * los razona el runtime LLM. Version/history los bumpa el contrato, no la UI.
 *
 * Moneda: SIN campos € — parámetros = magnitudes físicas (°C, min, ratios).
 *
 * Reglas del esquema-jefe:
 *   R2 — toda mutación va por mqttRequest y NUNCA asume estado local.
 *   R3 — el refresco lo dan las SEÑALES del bus (tecnica.creada +
 *        tecnica.actualizada); el dictamen inmediato lo da la respuesta.
 *
 * Patrón del repo: molde exacto de entrega/stores/entrega.ts (ciclo #8) —
 * mqttRequest + suscripción dot notation + debounce + cleanup + describeError.
 */

import { writable, derived, get } from 'svelte/store';
import { mqttRequest, MqttRequestError, MqttTimeoutError } from '$lib/ui-core/mqtt-request';
import { subscribe as mqttSubscribe } from '$lib/ui-core/mqtt';
import { activeProjectId } from '$lib/stores/projects';

// =============================================================================
// TIPOS — formas reales devueltas por tecnicas.listar / obtener (contrato)
// =============================================================================

/** Elemento del catálogo — salida LIGERA de listar (L200-204, sin history). */
export interface TecnicaLista {
  id: string;
  nombre: string;
  categoria: string | null;
  descripcion: string;
  etiquetas: string[];
  version: number;
  [key: string]: unknown;
}

/** Técnica COMPLETA — respuesta de obtener / dentro de codificar/actualizar. */
export interface TecnicaCompleta {
  id: string;
  nombre: string;
  descripcion: string;
  categoria: string | null;
  /** Datos EXACTOS (°C, min, ratios) — viajan verbatim (temperatura 0.3). */
  parametros: Record<string, unknown>;
  materiales: string[];
  instrucciones: string[];
  etiquetas: string[];
  version: number;
  history: Array<Record<string, unknown>>;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

/** Payload de actualizar (L275): la técnica nueva + diff campo a campo. */
export interface RespuestaActualizar {
  tecnica?: TecnicaCompleta;
  diff?: Record<string, { antes?: unknown; despues?: unknown }>;
  [key: string]: unknown;
}

/** Diff de un campo para el dictamen legible del editor de evolución. */
export interface DiffCampo {
  campo: string;
  antes: string;
  despues: string;
}

/** Desenvuelve el payload tolerando 1 nivel de envoltura (data.data). */
function desenvolver<T>(payload: unknown): T | undefined {
  if (payload == null) return undefined;
  const p = payload as { data?: unknown };
  if (p.data !== undefined && (typeof p.data === 'object' || Array.isArray(p.data))) {
    return p.data as T;
  }
  return payload as T;
}

// =============================================================================
// STORES — lecturas-only (R2): solo las respuestas RPC escriben aquí
// =============================================================================

/** Última lectura del catálogo (la ÚNICA fuente del informe). */
export const catalogoStore = writable<TecnicaLista[]>([]);

export const lecturaLoading = writable<boolean>(false);
export const lecturaError = writable<string | null>(null);

/** Detalle bajo demanda (obtener) — alimenta el informe extenso y el borrador. */
export const detalleStore = writable<TecnicaCompleta | null>(null);
export const detalleLoading = writable<boolean>(false);
export const detalleError = writable<string | null>(null);

/** Contador de mutaciones en vuelo — la vista muestra 'sincronizando…'. */
export const mutacionesPendientes = writable<number>(0);
/** Último error de mutación (global; los por-editor los anota el panel). */
export const errorMutacion = writable<string | null>(null);

/**
 * Cinta del catálogo, derivada SOLO de la lectura (nunca asumida).
 */
export const cinta = derived(catalogoStore, ($c) => {
  const lista = $c ?? [];
  const categorias = new Set<string>();
  let sinCategoria = 0;
  for (const t of lista) {
    if (t.categoria) categorias.add(t.categoria);
    else sinCategoria += 1;
  }
  return {
    /** Nº de técnicas codificadas en el catálogo del proyecto. */
    total: lista.length,
    /** Categorías distintas en uso (texto libre — hueco [ABIERTO] del enum). */
    categorias: categorias.size,
    /** Técnicas sin categoria (hueco ABIERTO: enum canónico pendiente). */
    sinCategoria,
    /** Catálogo vacío = estado de inicio (no error). */
    vacio: lista.length === 0
  };
});

export function describeError(err: unknown): string {
  if (err instanceof MqttTimeoutError) return 'sin respuesta del bus';
  if (err instanceof MqttRequestError) return err.message;
  return (err as Error)?.message || 'error desconocido';
}

/** Valor diff → texto legible (objetos/arrays en JSON compacto). */
export function formatearValor(v: unknown): string {
  if (v == null) return '(vacío)';
  if (typeof v === 'string') return v === '' ? '(vacío)' : v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/** Texto → object de parámetros. Vacío = undefined (no se envía el campo). */
export function parsearParametros(txt: string): { valor: Record<string, unknown> | undefined; error?: string } {
  const t = (txt ?? '').trim();
  if (t === '') return { valor: undefined }; // campo no enviado (se preserva)
  let parsed: unknown;
  try {
    parsed = JSON.parse(t);
  } catch {
    return { valor: undefined, error: 'parámetros: JSON no válido (objeto, ej. {"temperatura": 280})' };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { valor: undefined, error: 'parámetros: debe ser un objeto JSON {...}' };
  }
  return { valor: parsed as Record<string, unknown> };
}

/** Texto multilinea → array de strings (1 por línea). Vacío = no enviado. */
export function parsearArrayLineas(txt: string): { valor: string[] | undefined; error?: string } {
  const lineas = (txt ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  return { valor: lineas.length ? lineas : undefined };
}

// =============================================================================
// LECTURA (INFORMARSE) — la única escritura del store (R2)
// =============================================================================

/** Carga el catálogo alfabético (salida ligera — INV del contrato). Un store
 *  ausente es catálogo vacío (200 [] — L191), no error. */
export async function loadCatalogo(): Promise<void> {
  const pid = get(activeProjectId);
  if (!pid) return;
  lecturaLoading.set(true);
  lecturaError.set(null);
  try {
    const res = await mqttRequest<unknown>('tecnicas', 'listar', { project_id: pid });
    const payload = desenvolver<unknown>(res.data);
    const lista: TecnicaLista[] = Array.isArray(payload)
      ? (payload as TecnicaLista[])
      : Array.isArray((payload as { tecnicas?: TecnicaLista[] })?.tecnicas)
        ? (payload as { tecnicas: TecnicaLista[] }).tecnicas
        : [];
    catalogoStore.set(lista);
  } catch (err) {
    lecturaError.set(describeError(err));
  } finally {
    lecturaLoading.set(false);
  }
}

/** Detalle completo con history (obtener). 404 = estado nombrado → el store
 *  queda null + error nombrado (RESOURCE_NOT_FOUND), nunca crash. */
export async function loadDetalle(idONombre: string): Promise<boolean> {
  const pid = get(activeProjectId);
  if (!pid || !idONombre.trim()) return false;
  detalleLoading.set(true);
  detalleError.set(null);
  try {
    // El contrato acepta tecnica_id O nombre (exacto > parcial, L168-171).
    const esId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idONombre.trim());
    const res = await mqttRequest<unknown>('tecnicas', 'obtener', {
      project_id: pid,
      ...(esId ? { tecnica_id: idONombre.trim() } : { nombre: idONombre.trim() })
    });
    const tecnica = desenvolver<TecnicaCompleta>(res.data);
    if (!tecnica || !tecnica.id) {
      detalleStore.set(null);
      detalleError.set('técnica no encontrada (RESOURCE_NOT_FOUND)');
      return false;
    }
    detalleStore.set(tecnica);
    return true;
  } catch (err) {
    detalleError.set(describeError(err));
    return false;
  } finally {
    detalleLoading.set(false);
  }
}

/** Multi-tenant: vaciar todo al cambiar de proyecto (sin datos ajenos). */
export function resetTecnicas(): void {
  catalogoStore.set([]);
  detalleStore.set(null);
  lecturaError.set(null);
  detalleError.set(null);
  errorMutacion.set(null);
}

// =============================================================================
// DECLARAR (capa 3) — LA ALTA y LA EVOLUCIÓN del catálogo. El dictamen llega
// en la respuesta (codificar → 201 tecnica · actualizar → 200 + diff) y las
// señales tecnica.creada/actualizada re-leen la vista (R3) — nunca se asume.
// =============================================================================
export type CamposTecnica = {
  descripcion?: string;
  categoria?: string;
  parametros?: Record<string, unknown>;
  materiales?: string[];
  instrucciones?: string[];
  etiquetas?: string[];
};

/** Dictamen legible del editor de evolución (diff campo a campo). */
export interface DictamenEvolucion {
  tecnica: TecnicaCompleta;
  diff: DiffCampo[];
}

/** Dictamen legible del editor de alta. */
export interface DictamenAlta {
  tecnica: TecnicaCompleta;
}

/** codificar → 201 { tecnica }; duplicado = ALREADY_EXISTS (lanza con nombre). */
export async function codificarTecnica(
  datos: Omit<CamposTecnica, never> & { nombre: string }
): Promise<DictamenAlta> {
  const pid = get(activeProjectId);
  if (!pid) throw new Error('sin proyecto activo');
  mutacionesPendientes.update((n) => n + 1);
  errorMutacion.set(null);
  try {
    // El dato EXACTO viaja verbatim — sin recortes ni normalización (INV6).
    const res = await mqttRequest<unknown>('tecnicas', 'codificar', {
      project_id: pid,
      nombre: datos.nombre,
      ...(datos.descripcion !== undefined ? { descripcion: datos.descripcion } : {}),
      ...(datos.categoria !== undefined ? { categoria: datos.categoria } : {}),
      ...(datos.parametros !== undefined ? { parametros: datos.parametros } : {}),
      ...(datos.materiales !== undefined ? { materiales: datos.materiales } : {}),
      ...(datos.instrucciones !== undefined ? { instrucciones: datos.instrucciones } : {}),
      ...(datos.etiquetas !== undefined ? { etiquetas: datos.etiquetas } : {})
    });
    const payload = desenvolver<{ tecnica?: TecnicaCompleta }>(res.data);
    const tecnica = payload?.tecnica ?? (payload as unknown as TecnicaCompleta);
    if (!tecnica || !tecnica.id) throw new Error('respuesta de codificar sin tecnica');
    return { tecnica };
  } catch (err) {
    errorMutacion.set(describeError(err));
    throw err;
  } finally {
    mutacionesPendientes.update((n) => n - 1);
  }
}

/** LA EVOLUCIÓN: actualiza campos permitidos → dictamen con diff (L275). */
export async function actualizarTecnica(tecnicaId: string, campos: CamposTecnica): Promise<DictamenEvolucion> {
  const pid = get(activeProjectId);
  if (!pid) throw new Error('sin proyecto activo');
  const limpios = Object.fromEntries(Object.entries(campos).filter(([, v]) => v !== undefined));
  if (Object.keys(limpios).length === 0) {
    throw new Error('nada que modificar: al menos un campo permitido (INVALID_INPUT del contrato)');
  }
  mutacionesPendientes.update((n) => n + 1);
  errorMutacion.set(null);
  try {
    const res = await mqttRequest<unknown>('tecnicas', 'actualizar', {
      project_id: pid,
      tecnica_id: tecnicaId,
      campos: limpios
    });
    const payload = desenvolver<RespuestaActualizar>(res.data);
    const tecnica = payload?.tecnica;
    if (!tecnica || !tecnica.id) throw new Error('respuesta de actualizar sin tecnica');
    const diff: DiffCampo[] = Object.entries(payload?.diff ?? {}).map(([campo, d]) => ({
      campo,
      antes: formatearValor(d?.antes),
      despues: formatearValor(d?.despues)
    }));
    return { tecnica, diff };
  } catch (err) {
    errorMutacion.set(describeError(err));
    throw err;
  } finally {
    mutacionesPendientes.update((n) => n - 1);
  }
}

// =============================================================================
// SEÑAL-REFRESH (R3) — tecnica.creada + tecnica.actualizada re-leen el informe
// =============================================================================

/** Extrae project_id del envelope tolerando los shapes del repo (como entrega). */
function extraerProjectId(envelope: unknown): string | undefined {
  const e = envelope as {
    project_id?: string;
    data?: { project_id?: string; data?: { project_id?: string } };
  } | null;
  return e?.project_id ?? e?.data?.project_id ?? e?.data?.data?.project_id ?? undefined;
}

const SENALES_TECNICAS = ['tecnica.creada', 'tecnica.actualizada'];

/**
 * Suscripción a las señales pareadas (las 2 del contrato, refresh_on del seed
 * ui.datos). El debounce absorbe tandems (alta + detalle) en 1 re-lectura; si
 * la señal no llegara (bus degradado), el dictamen del editor sigue asignando
 * el estado paso a paso — doble confirmación, nunca recarga.
 */
export function initTecnicasSubscriptions(): () => void {
  const unsubs: Array<() => void> = [];
  let recargaProgramada: ReturnType<typeof setTimeout> | null = null;

  function encolarRecarga(): void {
    if (recargaProgramada) return;
    recargaProgramada = setTimeout(() => {
      recargaProgramada = null;
      const activo = get(activeProjectId);
      if (activo) void loadCatalogo();
    }, 60);
  }

  function onSenal(envelope: unknown): void {
    const activo = get(activeProjectId);
    if (!activo) return;
    const pid = extraerProjectId(envelope);
    if (pid !== undefined && pid !== activo) return; // señal de otro proyecto
    encolarRecarga();
  }

  for (const senal of SENALES_TECNICAS) {
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