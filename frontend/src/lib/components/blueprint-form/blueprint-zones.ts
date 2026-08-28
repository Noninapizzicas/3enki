/**
 * blueprint-zones — derivación DETERMINISTA blueprint → 4 zonas de UI (patrón Windmill aplicado a Enki).
 *
 * Sin LLM para la parte mecánica: TODO lo que produce sale de secciones DECLARADAS del blueprint.
 * Nada se inventa — si una sección no está, la zona se omite:
 *
 *   1. FORMULARIO  ← transporte.rpc con args (schema en ui.ops[<op>].args, o derivado del contrato)
 *   2. ACCIONES    ← transporte.rpc sin args (o con todos los args con default)
 *   3. ESTADOS VIVOS ← eventos_que_escucho (entrada) + transporte.salida (salida) — subscripciones MQTT en vivo
 *   4. DATOS       ← ui.datos { op, titulo, refresh_on, columnas } — tabla/list del storage vía RPC
 *
 * Convención del schema (sección `ui` del blueprint, opcional y aditiva):
 *   "ui": {
 *     "ops": {
 *       "<action>": { "titulo": "...", "descripcion": "...", "args": [
 *         { "nombre": "candidatoId", "tipo": "string", "required": true },
 *         { "nombre": "confirmacion", "tipo": "select", "enum": ["PASA","NO_PASA"], "required": true },
 *         { "nombre": "ficha", "tipo": "kv", "required": true, "kvClave": "campo", "descripcion": "campo → valor" }
 *       ]}
 *     },
 *     "datos": { "op": "listar", "titulo": "Candidatos", "refresh_on": ["<evento>"], "columnas": ["a","b"] }
 *   }
 *
 * tipos de arg: string · number · boolean · select (enum) · json (textarea) · kv (clave→valor, construye { [clave]: valor })
 */

// =============================================================================
// TIPOS
// =============================================================================

export type ArgTipo = 'string' | 'number' | 'boolean' | 'select' | 'json' | 'kv' | 'ref';

export interface BlueprintArg {
  nombre: string;
  tipo: ArgTipo;
  required: boolean;
  enum?: string[];
  /** Etiquetas legibles paralelas a `enum` (mismo orden). Si falta, se muestra el valor crudo. */
  enumLabels?: string[];
  descripcion?: string;
  placeholder?: string;
  default?: unknown;
  /** Solo tipo 'kv': clave fija del par. Si se omite, el dueño la escribe en el campo clave. */
  kvClave?: string;
  /** Tipo 'ref': módulo y acción para obtener opciones (ej: "productos.carta_completa") */
  ref?: string;
  /** Tipo 'ref': campo del resultado para mostrar en el select */
  ref_label?: string;
  /** Tipo 'ref': campo del resultado para el valor */
  ref_value?: string;
}

export interface BlueprintOp {
  nombre: string; // action del RPC (dominio.nombre.request)
  dominio: string; // dominio RPC real (puede diferir del moduleId)
  titulo: string;
  descripcion?: string;
  args: BlueprintArg[];
}

export interface BlueprintEventoVivo {
  evento: string;
  descripcion?: string;
  sentido: 'entrada' | 'salida';
}

export interface BlueprintDatos {
  op: string;
  titulo: string;
  refresh_on?: string[];
  columnas?: string[];
}

export interface BlueprintEstado {
  nombre: string;
  terminal: boolean;
  color: string;
  icono: string;
}

export interface BlueprintFase {
  nombre: string;
  orden: number;
  ops: string[];
  descripcion: string;
}

export interface BlueprintDependencia {
  campo: string;
  de: string;
}

export interface BlueprintDetalle {
  op: string;
  titulo: string;
  cabecera: string[];
  campo_items: string;
  campo_total: string;
  estados: string[];
  acciones_contextuales: string[];
}

export interface BlueprintZones {
  formulario: BlueprintOp[];
  acciones: BlueprintOp[];
  estadosVivos: BlueprintEventoVivo[];
  datos: BlueprintDatos | null;
  detalle: BlueprintDetalle | null;
  estados: BlueprintEstado[];
  flujo: BlueprintFase[];
  dependencias: Record<string, BlueprintDependencia[]>;
  guardas: Record<string, { sensible_estado: boolean }>;
}

// =============================================================================
// PARSER DE NOTACIÓN DE CONTRATO  ("{ project_id:uuid!, mensaje:str!, x?:int }")
// =============================================================================

const CONTRATO_TIPOS: Record<string, ArgTipo> = {
  str: 'string', string: 'string', text: 'string', uuid: 'string',
  int: 'number', num: 'number', number: 'number', float: 'number', decimal: 'number',
  bool: 'boolean', boolean: 'boolean',
  obj: 'json', object: 'json', json: 'json',
  enum: 'select'
};

export function parseContrato(expr: string): BlueprintArg[] {
  if (!expr || typeof expr !== 'string') return [];
  const args: BlueprintArg[] = [];
  // El valor admite espacios y pipes (enum literal "a | b | c"), con o sin comillas.
  const re = /([A-Za-z_][A-Za-z0-9_]*)(\??)\s*:\s*([^,}]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(expr)) !== null) {
    const nombre = m[1];
    const required = m[2] !== '?';
    const tipoRaw = m[3].trim().replace(/^"+|"+$/g, '');
    let tipo: ArgTipo = 'string';
    let enumValues: string[] | undefined;

    // Enum literal: "PASA | NO_PASA" o "ver | listar | confirmar"
    if (tipoRaw.includes('|')) {
      tipo = 'select';
      enumValues = tipoRaw.split('|').map((s) => s.trim()).filter(Boolean);
    } else if (CONTRATO_TIPOS[tipoRaw]) {
      tipo = CONTRATO_TIPOS[tipoRaw];
    }

    args.push({ nombre, tipo, required, enum: enumValues });
  }
  return args;
}

// =============================================================================
// HELPERS
// =============================================================================

export function humanize(snake: string): string {
  return snake
    .split('_')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/**
 * Etiqueta legible para un campo de formulario: quita el sufijo `_id` (interno) y
 * humaniza — `categoria_id` → "Categoría", `q` → "Q". El user ve un nombre de negocio,
 * no la clave interna del payload.
 */
export function labelize(nombre: string): string {
  const base = nombre.replace(/_id$/i, '');
  return humanize(base || nombre);
}

/** Normaliza un arg declarado en ui.ops (valida tipo y enum). */
function normalizeArg(raw: Record<string, unknown>): BlueprintArg | null {
  if (!raw || typeof raw !== 'object') return null;
  const nombre = String(raw.nombre || '');
  if (!nombre) return null;
  let tipo: ArgTipo = 'string';
  const tipoRaw = String(raw.tipo || 'string');
  if ((['string', 'number', 'boolean', 'select', 'json', 'kv', 'ref'] as ArgTipo[]).includes(tipoRaw as ArgTipo)) {
    tipo = tipoRaw as ArgTipo;
  }
  const arg: BlueprintArg = {
    nombre,
    tipo,
    required: raw.required !== false,
    descripcion: typeof raw.descripcion === 'string' ? raw.descripcion : undefined,
    placeholder: typeof raw.placeholder === 'string' ? raw.placeholder : undefined,
    kvClave: typeof raw.kvClave === 'string' && raw.kvClave ? raw.kvClave : undefined,
    ref: typeof raw.ref === 'string' && raw.ref ? raw.ref : undefined,
    ref_label: typeof raw.ref_label === 'string' && raw.ref_label ? raw.ref_label : undefined,
    ref_value: typeof raw.ref_value === 'string' && raw.ref_value ? raw.ref_value : undefined,
  };
  if (Array.isArray(raw.enum)) arg.enum = raw.enum.map(String);
  if (Array.isArray(raw.enumLabels)) arg.enumLabels = raw.enumLabels.map(String);
  if (raw.default !== undefined) arg.default = raw.default;
  return arg;
}

/** Extrae { dominio, accion } de una línea transporte.rpc: "interfaz.listar.request -> .response (…)". */
function parseRpcLine(line: string): { dominio: string; accion: string } | null {
  if (!line || typeof line !== 'string') return null;
  const m = line.match(/([a-z0-9_]+)\.([a-z0-9_]+)\.request/);
  if (!m) return null;
  return { dominio: m[1], accion: m[2] };
}

// =============================================================================
// DERIVACIÓN PRINCIPAL
// =============================================================================

export function deriveZones(blueprint: Record<string, unknown> | null | undefined): BlueprintZones {
  const bp = blueprint ?? {};
  const transporte = (bp.transporte as Record<string, unknown>) ?? {};
  const ui = (bp.ui as Record<string, unknown>) ?? {};
  const uiOps = (ui.ops as Record<string, Record<string, unknown>>) ?? {};
  const bpModuleId = typeof bp.moduleId === 'string' ? bp.moduleId : '';

  // --- Operaciones: transporte.rpc (+ ui.ops que añaden args o titulo) ---
  const opPorAccion = new Map<string, BlueprintOp>();
  const rpcLines: unknown[] = Array.isArray(transporte.rpc) ? transporte.rpc : [];
  const accionesDeclaradas = new Set<string>();

  for (const raw of rpcLines) {
    const parsed = parseRpcLine(typeof raw === 'string' ? raw : '');
    if (!parsed) continue;
    accionesDeclaradas.add(parsed.accion);
    const uiOp = uiOps[parsed.accion] as Record<string, unknown> | undefined;
    const args = Array.isArray(uiOp?.args)
      ? (uiOp.args as Record<string, unknown>[]).map(normalizeArg).filter((a): a is BlueprintArg => a !== null)
      : [];
    opPorAccion.set(parsed.accion, {
      nombre: parsed.accion,
      dominio: parsed.dominio,
      titulo: typeof uiOp?.titulo === 'string' && uiOp.titulo ? uiOp.titulo : humanize(parsed.accion),
      descripcion: typeof uiOp?.descripcion === 'string' ? uiOp.descripcion : undefined,
      args
    });
  }

  // ui.ops adicionales (acciones no listadas en transporte.rpc — explícitas)
  for (const [accion, uiOp] of Object.entries(uiOps)) {
    if (accionesDeclaradas.has(accion)) continue;
    const args = Array.isArray(uiOp.args)
      ? (uiOp.args as Record<string, unknown>[]).map(normalizeArg).filter((a): a is BlueprintArg => a !== null)
      : [];
    opPorAccion.set(accion, {
      nombre: accion,
      dominio: bpModuleId,
      titulo: typeof uiOp.titulo === 'string' && uiOp.titulo ? uiOp.titulo : humanize(accion),
      descripcion: typeof uiOp.descripcion === 'string' ? uiOp.descripcion : undefined,
      args
    });
  }

  // --- Reparto FORMULARIO / ACCIONES ---
  const formulario: BlueprintOp[] = [];
  const acciones: BlueprintOp[] = [];
  for (const op of opPorAccion.values()) {
    const argsSinDefault = op.args.filter((a) => a.default === undefined);
    if (argsSinDefault.length === 0) {
      acciones.push(op); // sin args (o todos con default) → botón directo
    } else {
      formulario.push(op);
    }
  }

  // --- ESTADOS VIVOS: eventos_que_escucho (entrada) + transporte.salida (salida) ---
  const estadosVivos: BlueprintEventoVivo[] = [];
  const escucho = Array.isArray(bp.eventos_que_escucho) ? bp.eventos_que_escucho : [];
  for (const e of escucho) {
    const evento = typeof e === 'string' ? e : (e as Record<string, unknown>)?.evento;
    if (!evento || typeof evento !== 'string') continue;
    estadosVivos.push({
      evento,
      descripcion: typeof (e as Record<string, unknown>)?.description === 'string'
        ? (e as Record<string, unknown>).description as string
        : undefined,
      sentido: 'entrada'
    });
  }
  const salida = Array.isArray(transporte.salida) ? transporte.salida : [];
  for (const s of salida) {
    const evento = typeof s === 'string' ? s.trim() : '';
    if (!evento) continue;
    estadosVivos.push({ evento, sentido: 'salida' });
  }

  // --- DATOS: ui.datos (si se declara) ---
  let datos: BlueprintDatos | null = null;
  const uiDatos = (ui.datos as Record<string, unknown>) ?? null;
  if (uiDatos && typeof uiDatos.op === 'string') {
    datos = {
      op: uiDatos.op,
      titulo: typeof uiDatos.titulo === 'string' ? uiDatos.titulo : humanize(uiDatos.op),
      refresh_on: Array.isArray(uiDatos.refresh_on) ? uiDatos.refresh_on.map(String) : undefined,
      columnas: Array.isArray(uiDatos.columnas) ? uiDatos.columnas.map(String) : undefined
    };
  }

  // --- DETALLE: ui.detalle (vista drill-down) ---
  let detalle: BlueprintDetalle | null = null;
  const uiDetalle = (ui.detalle as Record<string, unknown>) ?? null;
  if (uiDetalle && typeof uiDetalle.op === 'string') {
    detalle = {
      op: uiDetalle.op,
      titulo: typeof uiDetalle.titulo === 'string' ? uiDetalle.titulo : humanize(uiDetalle.op),
      cabecera: Array.isArray(uiDetalle.cabecera) ? uiDetalle.cabecera.map(String) : ['id', 'estado'],
      campo_items: typeof uiDetalle.campo_items === 'string' ? uiDetalle.campo_items : 'items',
      campo_total: typeof uiDetalle.campo_total === 'string' ? uiDetalle.campo_total : 'total',
      estados: Array.isArray(uiDetalle.estados) ? uiDetalle.estados.map(String) : [],
      acciones_contextuales: Array.isArray(uiDetalle.acciones_contextuales) ? uiDetalle.acciones_contextuales.map(String) : [],
    };
  }

  // --- ESTADOS: ui.estados (ciclo de vida) ---
  const estados: BlueprintEstado[] = [];
  const uiEstados = Array.isArray(ui.estados) ? ui.estados : [];
  for (const e of uiEstados) {
    const raw = e as Record<string, unknown>;
    if (!raw || typeof raw.nombre !== 'string') continue;
    estados.push({
      nombre: raw.nombre,
      terminal: raw.terminal === true,
      color: typeof raw.color === 'string' ? raw.color : 'gray',
      icono: typeof raw.icono === 'string' ? raw.icono : '',
    });
  }

  // --- FLUJO: ui.flujo (fases del ciclo de vida) ---
  const flujo: BlueprintFase[] = [];
  const uiFlujo = Array.isArray(ui.flujo) ? ui.flujo : [];
  for (const f of uiFlujo) {
    const raw = f as Record<string, unknown>;
    if (!raw || typeof raw.nombre !== 'string') continue;
    flujo.push({
      nombre: raw.nombre,
      orden: typeof raw.orden === 'number' ? raw.orden : 0,
      ops: Array.isArray(raw.ops) ? raw.ops.map(String) : [],
      descripcion: typeof raw.descripcion === 'string' ? raw.descripcion : '',
    });
  }

  // --- DEPENDENCIAS: ui.dependencias ---
  const dependencias: Record<string, BlueprintDependencia[]> = {};
  const uiDeps = (ui.dependencias as Record<string, unknown[]>) ?? {};
  for (const [action, deps] of Object.entries(uiDeps)) {
    if (!Array.isArray(deps)) continue;
    dependencias[action] = deps
      .filter((d): d is Record<string, unknown> => d !== null && typeof d === 'object')
      .map(d => ({ campo: String(d.campo || ''), de: String(d.de || '') }))
      .filter(d => d.campo && d.de);
  }

  // --- GUARDAS: ui.guardas ---
  const guardas: Record<string, { sensible_estado: boolean }> = {};
  const uiGuardas = (ui.guardas as Record<string, Record<string, unknown>>) ?? {};
  for (const [action, g] of Object.entries(uiGuardas)) {
    guardas[action] = { sensible_estado: g?.sensible_estado === true };
  }

  return { formulario, acciones, estadosVivos, datos, detalle, estados, flujo, dependencias, guardas };
}
