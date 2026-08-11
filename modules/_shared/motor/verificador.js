'use strict';

/**
 * P4 · Verificador de entregable (el JEFE) — REFLEJO puro (del esquema del motor).
 *
 * Al final del pipeline, comprueba el entregable prometido contra el MUNDO REAL
 * a través de un PUERTO inyectado. Determinista: verificado:false = veredicto,
 * jamás éxito; nunca acepta la palabra del generador.
 *
 * Puerto mundo (inyectado — DI para testear sin fs real):
 *   mundo.existe(path)         → boolean
 *   mundo.leer(path)           → string | null
 *   mundo.enRepo(rel)          → boolean (si el sitio lo soporta; si el puerto
 *                                 no existe, la regla en_repo NO bloquea)
 *
 * Reglas (array de strings): 'existe' (default) · 'contenido_min' · 'api_real' ·
 * 'requires_resueltos' · 'en_repo'
 *
 * Devuelve veredicto: { verificado, motivo, tipo, path, reglas: [{regla, ok, detalle}] }
 */

const path = require('path');

const REGLA_API_REAL = /require\s*\(\s*['"]\.\.\/\.\.\/_shared|require\s*\(\s*['"]\.\.\/\.\.\/_shared\/|_shared\//;

// Requires RELATIVOS ('./x', '../_shared/y') — los bare specifiers ('fs',
// 'mqtt') los resuelve node/npm, no el mundo del entregable.
const REGLA_REQUIRE_RELATIVO = /require\s*\(\s*['"](\.[^'"]*)['"]\s*\)/g;
const EXTENSIONES_CANDIDATAS = ['', '.js', '.json', '.cjs', '.mjs', '/index.js'];

function _existe(rel, _entregable, mundo) {
  const ok = !!(mundo && typeof mundo.existe === 'function' && mundo.existe(rel));
  return { regla: 'existe', ok, detalle: ok ? `existe ${rel}` : `NO existe ${rel}` };
}

function _contenidoMin(rel, entregable, mundo) {
  if (!mundo || typeof mundo.leer !== 'function') {
    return { regla: 'contenido_min', ok: false, detalle: 'puerto leer() no disponible' };
  }
  const contenido = mundo.leer(rel) || '';
  const min = typeof entregable.min_chars === 'number' ? entregable.min_chars : 100;
  const ok = contenido.length >= min;
  return {
    regla: 'contenido_min',
    ok,
    detalle: ok
      ? `${contenido.length} chars (min ${min})`
      : `solo ${contenido.length} chars (min ${min}) — entregable vacío o incompleto`
  };
}

function _apiReal(rel, _entregable, mundo) {
  // Regla de CÓDIGO: comprueba el patrón de módulo Enki (require _shared +
  // _atender 4 args) — SOLO aplica a archivos de código JS. Un module.json
  // (manifiesto puro) o un .ts/.svelte (frontend) NUNCA puede pasar esta
  // regla: es como pedirle al archivo de configuración que tenga código.
  // Lección en vivo: la F4 (construir-modulos, multi-archivo index.js +
  // module.json) fallaba con "usa _shared: false" aplicada al module.json —
  // el index.js pasaba api_real pero el JSON lo bloqueaba.
  if (!/\.(js|mjs|cjs)$/i.test(String(rel))) {
    return { regla: 'api_real', ok: true, detalle: `api_real es regla de código — no aplica a ${String(rel).split('/').pop()} (su presencia la cubre 'existe')` };
  }
  if (!mundo || typeof mundo.leer !== 'function') {
    return { regla: 'api_real', ok: false, detalle: 'puerto leer() no disponible' };
  }
  const contenido = mundo.leer(rel) || '';
  const llamaShared = REGLA_API_REAL.test(contenido);
  const atiende4 = /_atender\s*\(\s*evento\s*,\s*contexto\s*,\s*respuesta\s*,\s*siguiente\s*\)|_atender\s*\(\s*\w+\s*,\s*\w+\s*,\s*\w+\s*,\s*\w+\s*\)/.test(contenido);
  const ok = llamaShared && atiende4;
  return {
    regla: 'api_real',
    ok,
    detalle: ok
      ? 'usa _shared y _atender con 4 args (patrón de módulo Enki)'
      : `patrón de módulo no completo (usa _shared: ${llamaShared}, _atender 4 args: ${atiende4})`
  };
}

// Regla de CÓDIGO: cada require RELATIVO del archivo apunta a un destino que
// EXISTE en el mundo. api_real solo mira el TEXTO ('_shared/' aparece → ok);
// esta regla RESUELVE. Lección en vivo (banco-ideas, 2026-08-11): el módulo
// hacía require('../_shared/modulo-hibrido-reflejo') — que existe y satisface
// api_real — y también require('../_shared/prioridad') — que NO existe. El
// JEFE lo selló verificado:true y se commiteó un módulo que revienta al
// cargar. El texto no basta: el destino se resuelve o el veredicto es no.
function _requiresResueltos(rel, _entregable, mundo) {
  if (!/\.(js|mjs|cjs)$/i.test(String(rel))) {
    return { regla: 'requires_resueltos', ok: true, detalle: `regla de código — no aplica a ${String(rel).split('/').pop()}` };
  }
  if (!mundo || typeof mundo.leer !== 'function' || typeof mundo.existe !== 'function') {
    return { regla: 'requires_resueltos', ok: false, detalle: 'puertos leer()/existe() no disponibles' };
  }
  const contenido = mundo.leer(rel) || '';
  const dir = path.posix.dirname(String(rel).replace(/\\/g, '/'));
  const rotos = [];
  let fuera = 0;
  let vistos = 0;
  for (const m of contenido.matchAll(REGLA_REQUIRE_RELATIVO)) {
    const spec = m[1];
    vistos++;
    const destino = path.posix.normalize(path.posix.join(dir, spec));
    // Destino por encima de la raíz del mundo (modules/): fuera del alcance
    // del puerto → se declara, no bloquea (degradación honesta).
    if (destino.startsWith('..')) { fuera++; continue; }
    const resuelve = EXTENSIONES_CANDIDATAS.some(ext => mundo.existe(destino + ext));
    if (!resuelve) rotos.push(spec);
  }
  const ok = rotos.length === 0;
  const nota = fuera > 0 ? ` (${fuera} fuera de la raíz del mundo → no bloquean)` : '';
  return {
    regla: 'requires_resueltos',
    ok,
    detalle: ok
      ? `${vistos} require relativos, todos resuelven${nota}`
      : `require sin destino en disco: ${rotos.join(', ')} — el módulo revienta al cargar${nota}`
  };
}

function _enRepo(rel, _entregable, mundo) {
  if (!mundo || typeof mundo.enRepo !== 'function') {
    return { regla: 'en_repo', ok: true, detalle: 'repo no disponible → no bloquea' };
  }
  const resultado = mundo.enRepo(rel);
  if (resultado === undefined) {
    return { regla: 'en_repo', ok: true, detalle: 'repo no disponible → no bloquea' };
  }
  const ok = resultado === true;
  return { regla: 'en_repo', ok, detalle: ok ? `en repo ${rel}` : `NO está en el repo ${rel}` };
}

const TIPOS_CANONICOS = new Set(['workspace_module', 'chat_tool', 'inline_render', 'system_panel']);
const ZONAS_CANONICAS = new Set(['barra_modulos', 'area_chat', 'barra_chat_superior', 'input_chat', 'barra_chat_inferior', 'lateral_derecha']);

// FASE 6 — la decisión de interfaz debe estar EN DISCO: module.json con
// ui_handlers tipados (type+zone canónicos) o con ui_decision.necesita=false
// (módulo sin interfaz, documentada). El reporte del agente no cuenta.
function _interfazDecidida(rel, _entregable, mundo) {
  if (!mundo || typeof mundo.leer !== 'function') {
    return { regla: 'interfaz_decidida', ok: false, detalle: 'puerto leer() no disponible' };
  }
  const contenido = mundo.leer(rel) || '';
  let m = null;
  try { m = JSON.parse(contenido); } catch (_) { /* no JSON → no decidida */ }
  if (!m || typeof m !== 'object') {
    return { regla: 'interfaz_decidida', ok: false, detalle: `${rel} no es JSON válido — la decisión de interfaz no está en disco` };
  }
  // Sin interfaz, documentada: ui_decision.necesita === false
  if (m.ui_decision && m.ui_decision.necesita === false) {
    return { regla: 'interfaz_decidida', ok: true, detalle: `${rel} declara ui_decision.necesita=false (sin interfaz, documentada)` };
  }
  const uis = Array.isArray(m.ui_handlers) ? m.ui_handlers : [];
  if (!uis.length) {
    return { regla: 'interfaz_decidida', ok: false, detalle: `${rel} sin ui_handlers ni ui_decision.necesita=false — interfaz NO decidida` };
  }
  const malos = uis.filter(h => !h || typeof h !== 'object' || !TIPOS_CANONICOS.has(h.type) || !ZONAS_CANONICAS.has(h.zone));
  const ok = malos.length === 0;
  return {
    regla: 'interfaz_decidida',
    ok,
    detalle: ok
      ? `${uis.length} ui_handlers con type+zone canónicos (FASE 6 decidida)`
      : `${malos.length}/${uis.length} ui_handlers sin type o zone canónico — interfaz NO decidida`
  };
}

// FASE 7 — el trío OPERATIVO del frontend existe: manifest.json (autodescubre
// el loader), index.ts (UIModule) y <Slug>Panel.svelte (la vista). Sin esos 3
// archivos, un module.json tipado (F6) es una promesa sin panel.
function _interfazOperativa(rel, entregable, mundo) {
  if (!mundo || typeof mundo.existe !== 'function') {
    return { regla: 'interfaz_operativa', ok: false, detalle: 'puerto existe() no disponible' };
  }
  // rel = <dir>/manifest.json (o cualquier archivo del trío) → exigimos el trío completo.
  const dir = String(rel).replace(/\/[^/]+$/, '');
  const panelName = (() => {
    const m = String(rel).match(/\/([^/]+)\/manifest\.json$/);
    if (!m) return null;
    const slug = m[1];
    return slug.charAt(0).toUpperCase() + slug.slice(1) + 'Panel.svelte';
  })();
  const requisitos = [
    { archivo: `${dir}/manifest.json`, desc: 'manifest.json (autodescubrimiento del loader)' },
    { archivo: `${dir}/index.ts`, desc: 'index.ts (UIModule con PanelComponent)' }
  ];
  if (panelName) requisitos.push({ archivo: `${dir}/${panelName}`, desc: `${panelName} (la vista Svelte)` });
  const faltantes = requisitos.filter(r => !mundo.existe(r.archivo));
  const ok = faltantes.length === 0;
  return {
    regla: 'interfaz_operativa',
    ok,
    detalle: ok
      ? `trío operativo completo: ${requisitos.map(r => r.archivo.split('/').pop()).join(' + ')}`
      : `faltan archivos de la interfaz operativa: ${faltantes.map(f => f.archivo).join(', ')}`
  };
}

// FASE 3b — el PLANO DE ACOPLAMIENTO lleva ESPINA: un bloque ```json enki-plan
// embebido en el markdown con las hojas tipadas. Sin espina, el plano es prosa
// y el único puente hacia la FASE 4 es cosechar palabras con guion del texto
// (que recoge 'event-driven' o 'base-module' como si fueran hojas a construir).
// Con espina, el plan es CONTRATO: slug, forma, acción, dependencias y eventos.
const FORMAS_CANONICAS = new Set(['reflejo', 'custodio', 'conversor', 'puente', 'micro-agente']);
const ACCIONES_CANONICAS = new Set(['CONSTRUIR', 'ADAPTAR', 'REUTILIZAR']);
const RE_SLUG_PLANO = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const RE_ESPINA = /```json\s+enki-plan\s*\n([\s\S]*?)```/;

// Extrae la espina del markdown del plano. Exportada: la usan el JEFE y el
// orquestador (proceso-negocio) — UNA sola lectura del contrato, no dos.
function extraerEspina(contenido) {
  const m = RE_ESPINA.exec(String(contenido || ''));
  if (!m) return null;
  try {
    const espina = JSON.parse(m[1]);
    return espina && typeof espina === 'object' ? espina : null;
  } catch (_) {
    return null;
  }
}

function _planAcoplable(rel, _entregable, mundo) {
  if (!mundo || typeof mundo.leer !== 'function') {
    return { regla: 'plan_acoplable', ok: false, detalle: 'puerto leer() no disponible' };
  }
  const espina = extraerEspina(mundo.leer(rel));
  if (!espina) {
    return { regla: 'plan_acoplable', ok: false, detalle: 'sin espina: falta el bloque ```json enki-plan con hojas[] (o no es JSON válido) — el plano no es acoplable por la FASE 4' };
  }
  const hojas = Array.isArray(espina.hojas) ? espina.hojas : null;
  if (!hojas || hojas.length === 0) {
    return { regla: 'plan_acoplable', ok: false, detalle: 'la espina no declara hojas[]' };
  }
  const fallos = [];
  hojas.forEach((h, i) => {
    const donde = (h && h.slug) || `hoja[${i}]`;
    if (!h || typeof h !== 'object') { fallos.push(`${donde}: no es objeto`); return; }
    if (typeof h.slug !== 'string' || !RE_SLUG_PLANO.test(h.slug)) {
      fallos.push(`${donde}: slug inválido (kebab-case plano, sin prefijo de vertical)`);
    }
    if (!FORMAS_CANONICAS.has(h.forma)) {
      fallos.push(`${donde}: forma '${h.forma}' fuera de [${[...FORMAS_CANONICAS].join(', ')}]`);
    }
    if (!ACCIONES_CANONICAS.has(h.accion)) {
      fallos.push(`${donde}: accion '${h.accion}' fuera de [${[...ACCIONES_CANONICAS].join(', ')}]`);
    }
    const subs = Array.isArray(h.subscribes) ? h.subscribes : [];
    const pubs = Array.isArray(h.publishes) ? h.publishes : [];
    if (subs.length === 0 && pubs.length === 0) {
      fallos.push(`${donde}: sin subscribes ni publishes — una isla que ni escucha ni emite no se acopla al bus`);
    }
    if (h.depende_de !== undefined && !Array.isArray(h.depende_de)) {
      fallos.push(`${donde}: depende_de debe ser array de slugs`);
    }
  });
  // El orden de construcción, si se declara, cubre todas las hojas.
  if (Array.isArray(espina.orden)) {
    const enOrden = new Set(espina.orden);
    const sinOrden = hojas.map(h => h && h.slug).filter(s => s && !enOrden.has(s));
    if (sinOrden.length) fallos.push(`orden[] no cubre: ${sinOrden.join(', ')}`);
  }
  const ok = fallos.length === 0;
  return {
    regla: 'plan_acoplable',
    ok,
    detalle: ok
      ? `espina válida: ${hojas.length} hojas tipadas (slug · forma · accion · eventos)`
      : `espina con ${fallos.length} fallo(s): ${fallos.join(' | ')}`
  };
}

const REGLAS = {
  existe: _existe,
  contenido_min: _contenidoMin,
  api_real: _apiReal,
  requires_resueltos: _requiresResueltos,
  plan_acoplable: _planAcoplable,
  en_repo: _enRepo,
  interfaz_decidida: _interfazDecidida,
  interfaz_operativa: _interfazOperativa
};

/**
 * @param {object} entregable { tipo:'fs', path, reglas:[...], min_chars? }
 * @param {object} mundo      puerto inyectado { existe, leer, enRepo }
 * @returns {object} veredicto
 */
function verificar(entregable, mundo) {
  if (!entregable || typeof entregable !== 'object' || !entregable.path) {
    return {
      verificado: false,
      motivo: 'entregable_sin_path',
      tipo: entregable && entregable.tipo,
      path: entregable && entregable.path,
      reglas: [{ regla: 'contrato', ok: false, detalle: 'entregable sin path declarado' }]
    };
  }

  const nombres = Array.isArray(entregable.reglas) && entregable.reglas.length > 0
    ? entregable.reglas
    : ['existe'];

  const reglas = nombres.map((nombre) => {
    const fn = REGLAS[nombre];
    if (!fn) {
      return { regla: nombre, ok: false, detalle: `regla desconocida: ${nombre}` };
    }
    return fn(entregable.path, entregable, mundo);
  });

  const verificado = reglas.every(r => r.ok);
  return {
    verificado,
    motivo: verificado ? 'entregable_verificado' : 'entregable_no_verificado',
    tipo: entregable.tipo || 'fs',
    path: entregable.path,
    reglas
  };
}

module.exports = { verificar, extraerEspina };
