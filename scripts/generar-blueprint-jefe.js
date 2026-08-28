#!/usr/bin/env node
/**
 * generar-blueprint-jefe.js — Blueprint SOLO para el actor JEFE.
 * Superficie: consulta + supervisión. Excluye ops de la vía operativa
 * (crear, componer, enviar — esas son de trabajador/cliente).
 *
 * Uso: node scripts/generar-blueprint-jefe.js <slug> [--deploy] [--no-frontend]
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = process.env.ENKI_REPO || '/home/admin/3enki';
const REPO_MODULES = path.join(REPO_ROOT, 'modules');
const DEPLOY_MODULES = process.env.ENKI_DEPLOY || '/opt/enki/modules';
const REPO_FRONTEND = path.join(REPO_ROOT, 'frontend/src/lib/modules');

// ── Utils ──

function slug(s) {
  return String(s || '').toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function pascalCase(s) {
  return String(s || '').split(/[-_]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');
}

function humanize(snake) {
  return snake.split('_').map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(' ');
}

/**
 * Mapea JSON Schema type → ArgTipo del frontend (blueprint-zones.ts).
 * ArgTipo: 'string' | 'number' | 'boolean' | 'select' | 'json' | 'kv' | 'ref'
 */
function tipoArg(jsonSchemaType) {
  return { string: 'string', number: 'number', integer: 'number', boolean: 'boolean', object: 'json', array: 'json' }[jsonSchemaType] || 'string';
}

function eventLabel(ev) {
  return ev.replace(/\.request$|\.response$/g, '').replace(/\./g, ' ').replace(/_/g, ' ').trim();
}

function esLectura(name) {
  return /^get$|^list$|get\.|\.get|list\.|\.list|listar|obtener|leer|buscar|show|status|health/i.test(name);
}

// ── Mapa de dominios conocidos para inferir ref en campos _id ──

const KNOWN_DOMAINS = {
  producto_id:    { ref: 'productos.carta_completa', ref_label: 'nombre', ref_value: 'id' },
  categoria_id:   { ref: 'productos.carta_completa', ref_label: 'nombre', ref_value: 'id' },
  ingrediente_id: { ref: 'ingredientes.listar',      ref_label: 'nombre', ref_value: 'id' },
  receta_id:      { ref: 'recetas.listar',            ref_label: 'nombre', ref_value: 'id' },
  cuenta_id:      { ref: 'cuentas.listar',            ref_label: 'nombre', ref_value: 'id' },
  pedido_id:      { ref: 'pedido.list',               ref_label: 'id',     ref_value: 'id' },
  mesa_id:        { ref: 'mesas.listar',              ref_label: 'nombre', ref_value: 'id' },
};

const SYSTEM_ID_FIELDS = new Set([
  'correlation_id', 'session_id', 'request_id', 'trace_id',
  'transaction_id', 'message_id', 'event_id',
]);

const SUB_RESOURCE_ID_FIELDS = new Set([
  'item_id', 'linea_id', 'detalle_id', 'paso_id',
]);

// ── Filtro por actor ──
// El jefe consulta y supervisa; no crea ni compone.
// Patrones de ops que SON del jefe (inclusión):
//   - consulta: list, get, buscar, listar, obtener, show
//   - supervisión: complete, cancel, confirmar-*, health, status, total
// Patrones de ops que NO son del jefe (exclusión):
//   - operativa: create, crear, add-*, update-*, delete-*, send-*, nuevo

const OPS_OPERATIVA = /^(create|crear|crear-tienda|new|nuevo|add-item|update-item|delete-item|send-kitchen|agregar|actualizar|eliminar|quitar|remove)/i;
const OPS_JEFE = /^(list|listar|get|obtener|buscar|leer|show|complete|completar|cancel|cancelar|confirmar|cerrar|close|total|health|status|metrics)/i;

function filtrarPorActor(acciones, actor) {
  if (!actor) return acciones;
  const filtradas = new Map();
  for (const [action, info] of acciones) {
    if (actor === 'jefe') {
      if (OPS_OPERATIVA.test(action)) continue;
      filtradas.set(action, info);
    } else {
      filtradas.set(action, info);
    }
  }
  return filtradas;
}

// ── Normalizar subscribes de module.json ──

function extraerSubscribes(mod) {
  let subs = mod.subscribes;
  if (!subs && mod.events && mod.events.subscribes) subs = mod.events.subscribes;
  if (!subs) return [];
  if (Array.isArray(subs)) return subs.map(s => typeof s === 'string' ? s : (s.event || ''));
  if (typeof subs === 'object') return Object.keys(subs);
  return [];
}

function extraerPublishes(mod) {
  let pubs = mod.eventos_publicados;
  if (!pubs && mod.events && mod.events.publishes) {
    pubs = mod.events.publishes.map(p => typeof p === 'string' ? p : (p.event || ''));
  }
  if (!pubs) return [];
  return pubs.filter(Boolean);
}

// ── Extraer ui_handlers como fuente primaria de acciones ──

function extraerAcciones(mod) {
  const handlers = mod.ui_handlers || [];
  const tools = mod.tools || [];
  const domain = mod.name || 'mod';
  const acciones = new Map();

  for (const h of handlers) {
    if (!h.action) continue;
    acciones.set(h.action, { domain: h.domain || domain, action: h.action });
  }

  for (const t of tools) {
    if (!t.name) continue;
    const parts = t.name.split('.');
    const action = parts.length >= 2 ? parts.slice(1).join('.') : parts[0];
    const dom = parts.length >= 2 ? parts[0] : domain;
    if (!acciones.has(action)) {
      acciones.set(action, { domain: dom, action });
    }
  }

  return acciones;
}

// ── Detección de banderas booleanas por NOMBRE (aunque el schema las tipe como string) ──
// Un filtro como `activo` suele declararse string ("true"/"false") pero se opera como sí/no.

function esBandera(name) {
  return /^(activo|activa|activos|activas|inactivo|habilitad|deshabilitad|visible|oculto|oculta|disponible|destacad|enabled|disabled|active|is_[a-z]|has_[a-z])/i.test(name);
}

// ── Singular naïve para placeholders ("productos" → "producto") ──
function singular(name) {
  return String(name || '').replace(/s$/i, '');
}

// ── Construir args de un tool (formato deriveZones) ──
// selfRef: { ref, ref_label, ref_value } de la op `list` del propio módulo — para
// convertir el `id` pelado en un desplegable de registros (el user elige por nombre,
// no teclea un id interno que no conoce).

function construirArgs(tool, moduleName, selfRef) {
  const params = (tool.parameters && tool.parameters.properties) || {};
  const required = new Set((tool.parameters && tool.parameters.required) || []);
  const args = [];

  for (const [k, v] of Object.entries(params)) {
    if (k === 'project_id' || k === 'project_slug') continue;

    const arg = {
      nombre: k,
      tipo: tipoArg(v.type || 'string'),
      required: required.has(k),
    };

    if (v.description) arg.descripcion = v.description;

    // ── Referencia por dominio conocido: *_id → select de entidades existentes ──
    if (k.endsWith('_id') && KNOWN_DOMAINS[k]) {
      arg.tipo = 'ref';
      arg.ref = KNOWN_DOMAINS[k].ref;
      arg.ref_label = KNOWN_DOMAINS[k].ref_label;
      arg.ref_value = KNOWN_DOMAINS[k].ref_value;
      arg.placeholder = `selecciona un ${k.replace(/_id$/, '').replace(/_/g, ' ')}`;
    } else if (k.endsWith('_id') && !SYSTEM_ID_FIELDS.has(k) && !SUB_RESOURCE_ID_FIELDS.has(k)) {
      // ── Referencia genérica: <dominio>_id → <dominio>.listar (RefSelect degrada a texto si no existe) ──
      arg.tipo = 'ref';
      const refDomain = k.replace(/_id$/, '');
      arg.ref = `${refDomain}.listar`;
      arg.ref_label = 'nombre';
      arg.ref_value = 'id';
      arg.placeholder = `selecciona un ${refDomain.replace(/_/g, ' ')}`;
    } else if (k === 'id' && selfRef) {
      // ── `id` pelado (get/update/delete): self-ref al list del propio módulo ──
      arg.tipo = 'ref';
      arg.ref = selfRef.ref;
      arg.ref_label = selfRef.ref_label;
      arg.ref_value = selfRef.ref_value;
      arg.placeholder = `selecciona ${singular(moduleName)}`;
    }

    // ── Enum explícito del schema → select ──
    if (Array.isArray(v.enum) && v.enum.length) {
      arg.tipo = 'select';
      arg.enum = v.enum.map(String);
    }

    // ── Booleano (por tipo o por nombre-bandera) → select Sí/No ──
    // Mejor que un checkbox para un filtro opcional: la opción vacía = «sin filtro».
    if (arg.tipo !== 'ref' && arg.tipo !== 'select' && (v.type === 'boolean' || esBandera(k))) {
      arg.tipo = 'select';
      arg.enum = ['true', 'false'];
      arg.enumLabels = ['Sí', 'No'];
    }

    args.push(arg);
  }

  return args;
}

// ── Derivar estados del ciclo de vida desde eventos publicados ──
// Convención: "pedido.creado" → estado "creado", "pedido.enviado_cocina" → "en_cocina"
// Los estados terminales se detectan por nombre: completado, cancelado, cerrado, expirado.

const ESTADO_TERMINAL = new Set(['completado', 'cancelado', 'cerrado', 'expirado', 'rechazado', 'archivado']);

const ESTADO_VISUAL = {
  borrador:            { color: 'gray',   icono: '📝' },
  creado:              { color: 'blue',   icono: '🆕' },
  confirmado:          { color: 'blue',   icono: '✅' },
  en_cocina:           { color: 'orange', icono: '🔥' },
  enviado_cocina:      { color: 'orange', icono: '🔥' },
  pendiente_recogida:  { color: 'yellow', icono: '📦' },
  completado:          { color: 'green',  icono: '✔️' },
  cancelado:           { color: 'red',    icono: '❌' },
  pagado:              { color: 'green',  icono: '💰' },
};

const EVENTO_NO_ESTADO = new Set([
  'item_agregado', 'item_actualizado', 'item_eliminado',
  'linea_agregada', 'linea_actualizada', 'linea_eliminada',
  'detalle_agregado', 'detalle_actualizado', 'detalle_eliminado',
  'paso_agregado', 'paso_actualizado', 'paso_eliminado',
  'actualizado', 'modificado', 'editado',
]);

function derivarEstados(publishes) {
  const estados = [];
  for (const ev of publishes) {
    const parts = ev.split('.');
    if (parts.length < 2) continue;
    const sufijo = parts.slice(1).join('_');
    if (EVENTO_NO_ESTADO.has(sufijo)) continue;
    const estado = sufijo;
    const visual = ESTADO_VISUAL[estado] || { color: 'gray', icono: '⚪' };
    estados.push({
      nombre: estado,
      terminal: ESTADO_TERMINAL.has(estado),
      color: visual.color,
      icono: visual.icono,
    });
  }
  if (estados.length > 0 && !estados.find(e => e.nombre === 'borrador')) {
    estados.unshift({ nombre: 'borrador', terminal: false, ...ESTADO_VISUAL.borrador });
  }
  return estados;
}

// ── Derivar dependencias entre operaciones ──
// Si una op tiene un arg X_id y otra op se llama X o create-X, hay dependencia.

function derivarDependencias(uiOps, acciones, selfRef) {
  const deps = {};
  const opNames = new Set(acciones.keys());

  for (const [action, opDef] of Object.entries(uiOps)) {
    if (!opDef.args || !opDef.args.length) continue;
    const opDeps = [];
    for (const arg of opDef.args) {
      if (arg.tipo === 'ref' && arg.ref) {
        const refParts = arg.ref.split('.');
        const refAction = refParts.length >= 2 ? refParts[1] : refParts[0];
        if (refAction && refAction !== action && (opNames.has(refAction) || refAction === 'list')) {
          opDeps.push({ campo: arg.nombre, de: refAction });
        }
      }
    }
    if (opDeps.length > 0) deps[action] = opDeps;
  }
  return deps;
}

// ── Derivar flujo (fases del ciclo de vida) ──
// Agrupa ops por fase según su naturaleza: consulta, creación, composición, transición, utilidad.

function derivarFlujo(uiOps, acciones, estados) {
  const fases = [];
  const consultas = [];
  const creacion = [];
  const composicion = [];
  const transicion = [];
  const utilidad = [];

  for (const [action, opDef] of Object.entries(uiOps)) {
    if (/^(list|listar|get|obtener|buscar|leer|show)$/i.test(action)) {
      consultas.push(action);
    } else if (/^(create|crear|new|nuevo)$/i.test(action) || action === 'crear-tienda') {
      creacion.push(action);
    } else if (/add|agregar|update|actualizar|delete|eliminar|remove|quitar/i.test(action)) {
      composicion.push(action);
    } else if (/send|enviar|complete|completar|cancel|cancelar|confirm|confirmar|close|cerrar/i.test(action)) {
      transicion.push(action);
    } else {
      utilidad.push(action);
    }
  }

  if (consultas.length)   fases.push({ nombre: 'consulta',    orden: 1, ops: consultas,   descripcion: 'Ver y buscar' });
  if (creacion.length)    fases.push({ nombre: 'creacion',    orden: 2, ops: creacion,    descripcion: 'Crear nuevo' });
  if (composicion.length) fases.push({ nombre: 'composicion', orden: 3, ops: composicion, descripcion: 'Componer contenido' });
  if (transicion.length)  fases.push({ nombre: 'transicion',  orden: 4, ops: transicion,  descripcion: 'Cambiar estado' });
  if (utilidad.length)    fases.push({ nombre: 'utilidad',     orden: 5, ops: utilidad,    descripcion: 'Herramientas' });

  return fases;
}

// ── Derivar detalle: la vista drill-down de una entidad ──
// Si existe una op `get` con arg `id`, el detalle se deriva automáticamente.
// Estructura: { op, campos_cabecera, campo_items, campo_total }

function derivarDetalle(uiOps, acciones, estados, name) {
  const getAction = [...acciones.keys()].find(a => /^get$/i.test(a));
  if (!getAction) return null;

  const opDef = uiOps[getAction];
  if (!opDef) return null;

  const estadoNames = estados.map(e => e.nombre);

  const transiciones = [];
  for (const [action] of acciones) {
    if (/^(list|listar|get|obtener|health|status|total)$/i.test(action)) continue;
    transiciones.push(action);
  }

  return {
    op: getAction,
    titulo: `Detalle de ${singular(name)}`,
    cabecera: ['id', 'estado', 'created_at'],
    campo_items: 'items',
    campo_total: 'total',
    estados: estadoNames,
    acciones_contextuales: transiciones,
  };
}

// ── Derivar guardas: ops con CONFLICT_STATE en errores_conocidos ──

function derivarGuardas(tools) {
  const guardas = {};
  for (const t of tools) {
    if (!t.name || !t.errores_conocidos) continue;
    if (t.errores_conocidos.includes('CONFLICT_STATE')) {
      const parts = t.name.split('.');
      const action = parts.length >= 2 ? parts.slice(1).join('.') : parts[0];
      guardas[action] = { sensible_estado: true };
    }
  }
  return guardas;
}

// ── Buscar module.json (con resolución de verticales) ──

function buscarModulo(baseDir, slugModule) {
  const dirs = [
    path.join(baseDir, slugModule),
    ...['pizzepos', 'prisma'].map(v => path.join(baseDir, v, slugModule)),
  ];
  for (const d of dirs) {
    const p = path.join(d, 'module.json');
    if (fs.existsSync(p)) return { dir: d, path: p };
  }
  return null;
}

// ── Generar trío frontend ──

function generarFrontend(slugModule, name, description, blueprint, uiDecision) {
  const pascal = pascalCase(name);
  const icon = uiDecision.icon || '📦';
  const zone = uiDecision.zone || 'work-bar';
  const order = uiDecision.order || 50;
  const label = pascal;
  const frontDir = path.join(REPO_FRONTEND, slugModule);

  const manifest = {
    id: name,
    name: pascal,
    version: '0.1.0',
    zone,
    order,
    icon,
    label,
  };

  const indexTs = `import type { UIModule } from '$lib/ui-core';
import ${pascal}Panel from './${pascal}Panel.svelte';

export const ${name.replace(/-/g, '_')}Module: UIModule = {
  manifest: {
    id: '${name}',
    name: '${pascal}',
    version: '0.1.0',
    zone: '${zone}',
    button: {
      id: '${name}-btn',
      icon: '${icon}',
      label: '${label}',
      action: { type: 'panel', panelId: '${name}-panel' },
      order: ${order}
    },
    panels: [{
      id: '${name}-panel',
      title: '${pascal}',
      size: 'lg'
    }]
  },
  PanelComponent: ${pascal}Panel
};

export default ${name.replace(/-/g, '_')}Module;

export { default as ${pascal}Panel } from './${pascal}Panel.svelte';
`;

  const panelSvelte = `<script lang="ts">
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './${name}.blueprint.json';

  export let panelId = '';
</script>

<div data-${name}-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="${name}" titulo="${icon} ${pascal} — generado del blueprint" />
</div>
`;

  try {
    fs.mkdirSync(frontDir, { recursive: true });
    fs.writeFileSync(path.join(frontDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
    fs.writeFileSync(path.join(frontDir, 'index.ts'), indexTs, 'utf-8');
    fs.writeFileSync(path.join(frontDir, `${pascal}Panel.svelte`), panelSvelte, 'utf-8');
    fs.writeFileSync(path.join(frontDir, `${name}.blueprint.json`), JSON.stringify(blueprint, null, 2) + '\n', 'utf-8');
    console.log(`✅ Frontend: ${frontDir}/`);
    console.log(`   manifest.json · index.ts · ${pascal}Panel.svelte · ${name}.blueprint.json`);
  } catch (e) {
    console.log(`⚠️  No se pudo escribir frontend (permisos): ${e.message}`);
    console.log(`   Dir: ${frontDir}`);
  }
}

// ── Generar blueprint en formato deriveZones ──

function generar(slugModule, deploy, noFrontend, actor) {
  let found = buscarModulo(REPO_MODULES, slugModule);
  if (!found) {
    found = buscarModulo(DEPLOY_MODULES, slugModule);
    if (!found) {
      console.error(`❌ Módulo "${slugModule}" no encontrado ni en repo ni en deploy`);
      process.exit(1);
    }
  }

  const raw = fs.readFileSync(found.path, 'utf-8');
  const mod = JSON.parse(raw);
  const name = mod.name || slugModule.split('/').pop();
  const description = mod.description || name;
  const tools = mod.tools || [];
  const uiDecision = mod.ui_decision || { type: 'workspace_module', zone: 'work-bar' };

  const accionesRaw = extraerAcciones(mod);
  const acciones = filtrarPorActor(accionesRaw, actor);
  const subscribes = extraerSubscribes(mod);
  const publishes = extraerPublishes(mod);

  if (actor) {
    console.log(`🎭 Actor: ${actor} — ${acciones.size}/${accionesRaw.size} ops (excluidas ${accionesRaw.size - acciones.size})`);
  }

  // ── transporte.rpc: líneas "dominio.accion.request -> .response" ──
  const rpcLines = [];
  for (const [action, info] of acciones) {
    rpcLines.push(`${info.domain}.${action}.request -> .response`);
  }

  // ── ui.ops: dict keyed by action, con titulo + args en formato deriveZones ──
  const uiOps = {};
  const toolsByAction = new Map();
  for (const t of tools) {
    if (!t.name) continue;
    const parts = t.name.split('.');
    const action = parts.length >= 2 ? parts.slice(1).join('.') : parts[0];
    toolsByAction.set(action, t);
  }

  // ── selfRef: la op de listado del propio módulo, para que el `id` pelado sea un
  //    desplegable de registros (el user elige por nombre, no teclea el id interno). ──
  let selfRef = null;
  const listAction = [...acciones.keys()].find(a => /^(list|listar)$/i.test(a))
    || [...acciones.keys()].find(a => /(^|_)list(ar)?$/i.test(a));
  if (listAction) {
    const dom = acciones.get(listAction).domain;
    const knownSelf = KNOWN_DOMAINS[`${name}_id`] || KNOWN_DOMAINS[`${singular(name)}_id`];
    selfRef = {
      ref: `${dom}.${listAction}`,
      ref_label: knownSelf ? knownSelf.ref_label : 'nombre',
      ref_value: 'id'
    };
  }

  const datosOps = [];
  let formularioCount = 0;
  let accionesCount = 0;

  for (const [action] of acciones) {
    const tool = toolsByAction.get(action);
    const args = tool ? construirArgs(tool, name, selfRef) : [];
    const desc = tool ? (tool.description || '').substring(0, 200) : '';

    const op = { titulo: humanize(action) };
    if (desc) op.descripcion = desc;
    if (args.length > 0) op.args = args;

    uiOps[action] = op;

    if (args.length > 0) formularioCount++;
    else accionesCount++;

    if (esLectura(action)) datosOps.push(action);
  }

  const datosOp = datosOps.find(a => /^(list|listar)$/i.test(a))
    || datosOps.find(a => /^(get|obtener|leer|buscar)$/i.test(a))
    || datosOps.find(a => !/^(health|status|metrics)$/i.test(a))
    || datosOps[0] || null;

  // ── eventos de negocio (sin RPCs internos .request/.response) ──
  const bizEvents = publishes.filter(e => !e.endsWith('.request') && !e.endsWith('.response'));

  // ── ui.datos: refresh_on = eventos de negocio ──
  let datos = undefined;
  if (datosOp) {
    const refreshOn = bizEvents.length > 0
      ? bizEvents
      : subscribes.filter(s => !s.startsWith('project.') && !s.endsWith('.request') && !s.endsWith('.response'));
    datos = {
      op: datosOp,
      titulo: humanize(datosOp),
      ...(refreshOn.length && { refresh_on: refreshOn }),
    };
  }

  // ── eventos_que_escucho (root level, para zona estadosVivos) ──
  const eventosQueEscucho = subscribes.filter(Boolean);

  // ── Derivar inteligencia de negocio (esquematizador mecánico) ──
  const estados = derivarEstados(bizEvents);
  const dependencias = derivarDependencias(uiOps, acciones, selfRef);
  const flujo = derivarFlujo(uiOps, acciones, estados);
  const guardas = derivarGuardas(tools);
  const detalle = derivarDetalle(uiOps, acciones, estados, name);

  // ── Blueprint final ──
  const blueprint = {
    schema: 'blueprint-interfaz-v2',
    id: name,
    version: 'blueprint-2.0.0',
    moduleId: name,
    ...(actor && { actor }),
    titulo: description.charAt(0).toUpperCase() + description.slice(1),
    ...(bizEvents.length && { eventos_publicados: bizEvents }),
    ...(eventosQueEscucho.length && { eventos_que_escucho: eventosQueEscucho }),
    transporte: {
      rpc: rpcLines,
      ...(bizEvents.length && { salida: bizEvents }),
    },
    ui: {
      ...(Object.keys(uiOps).length && { ops: uiOps }),
      ...(datos && { datos }),
      ...(estados.length && { estados }),
      ...(flujo.length && { flujo }),
      ...(Object.keys(dependencias).length && { dependencias }),
      ...(Object.keys(guardas).length && { guardas }),
      ...(detalle && { detalle }),
    },
  };

  // ── Escribir ──
  const outDir = path.join(REPO_MODULES, slugModule);
  const outPath = path.join(outDir, `${name}.blueprint.json`);
  const contenido = JSON.stringify(blueprint, null, 2) + '\n';

  try {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outPath, contenido, 'utf-8');
    console.log(`✅ Blueprint: ${outPath}`);
  } catch (e) {
    const tmpPath = `/tmp/${slugModule}.blueprint.json`;
    fs.writeFileSync(tmpPath, contenido, 'utf-8');
    console.log(`⚠️  No se pudo escribir en repo (permisos): ${outPath}`);
    console.log(`   Archivo temporal: ${tmpPath}`);
    console.log(`   Para copiar: sudo cp ${tmpPath} ${outPath} && sudo chown admin:admin ${outPath}`);
  }

  if (!noFrontend) {
    generarFrontend(slugModule, name, description, blueprint, uiDecision);
  }

  if (deploy) {
    const deployDir = path.join(DEPLOY_MODULES, slugModule);
    const deployPath = path.join(deployDir, `${name}.blueprint.json`);
    try {
      fs.mkdirSync(deployDir, { recursive: true });
      fs.writeFileSync(deployPath, JSON.stringify(blueprint, null, 2) + '\n', 'utf-8');
      console.log(`✅ Deploy:    ${deployPath}`);
    } catch (e) {
      console.log(`⚠️  No se pudo escribir en deploy (permisos): ${e.message}`);
    }
  }

  console.log(`   ${formularioCount} formularios · ${accionesCount} acciones · ${datosOp ? 1 : 0} datos · ${eventosQueEscucho.length} eventos`);
  console.log(`   ${estados.length} estados · ${flujo.length} fases · ${Object.keys(dependencias).length} dependencias · ${Object.keys(guardas).length} guardas · ${detalle ? '1 detalle' : '0 detalle'}`);
}

// ── Arranque ──

const args = process.argv.slice(2);
const target = args.find(a => !a.startsWith('--'));
const deploy = args.includes('--deploy');
const noFrontend = args.includes('--no-frontend');

if (!target) {
  console.error('Uso: node scripts/generar-blueprint-jefe.js <slug> [--deploy] [--no-frontend]');
  process.exit(1);
}

try {
  generar(slug(target), deploy, noFrontend, 'jefe');
} catch (err) {
  console.error('❌ Error:', err.message);
  process.exit(1);
}
