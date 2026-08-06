/**
 * cimiento — el JEFE del framework de agentes v3 (CIMIENTO).
 *
 * Implementa el esquema "cimiento de agentes v3" (esquema-framework-v3/esquema.md):
 *   · CONTRATO:  valida el manifest v2 del agente (presupuesto + entregable).
 *   · JEFE:      verifica el ENTREGABLE contra el mundo real ANTES de permitir
 *                el success. El humo ("success" sin trabajo) se vuelve
 *                estructuralmente imposible.
 *   · PUERTOS:   verificar(juicio) para entregables fuzzy — se declaran
 *                no-verificables, nunca se fingen.
 *
 * Regla de oro (P3): el trabajador produce, el sistema juzga. Esta pieza es
 * REFLEJO puro — determinista, un test puede afirmar su veredicto.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// El árbol de módulos del SISTEMA (el JEFE mira el mundo real, no el storage del proyecto).
// Ojo: este archivo vive en modules/conversacion/ai-agent-framework/ → subir DOS niveles.
const MODULES_DIR = path.resolve(__dirname, '../..');

// El data root del core (para entregables tipo 'storage/' — los del proyecto).
const DATA_DIR = path.resolve(__dirname, '../../../data');

// El repo de desarrollo (para la regla 'en_repo' — el deploy rsync --delete
// borra lo que no está commiteado; misma lección que el gate de proceso-negocio).
const REPO_MODULES_DIR = (() => {
  try {
    const home = require('os').homedir();
    const p = path.join(home, '3enki', 'modules');
    return fs.existsSync(p) ? p : null;
  } catch (_) { return null; }
})();

// ── CONTRATO: extrae y valida el manifest v2 del agente ──
// Devuelve { entregable, presupuesto } o null (agente v1 sin contrato).
function preparar(agent) {
  if (!agent) return null;
  const entregable = agent.entregable || null;
  const presupuesto = agent.presupuesto || null;
  if (!entregable && !presupuesto) return null;   // v1: sin cimiento
  return { entregable, presupuesto };
}

// Valida que el contrato declarado es reconocible (no acepta basura en silencio).
function validarContrato(entregable) {
  if (!entregable) return { ok: true, nota: 'sin_entregable_declarado' };
  if (!entregable.tipo) return { ok: false, error: 'entregable.tipo requerido (fs | evento | juicio | ninguno)' };
  if (!['fs', 'evento', 'juicio', 'ninguno'].includes(entregable.tipo)) {
    return { ok: false, error: `entregable.tipo '${entregable.tipo}' no soportado` };
  }
  if (entregable.tipo === 'fs' && !entregable.path) {
    return { ok: false, error: 'entregable.path requerido para tipo fs' };
  }
  return { ok: true };
}

// ── JEFE: verifica el entregable contra el mundo real ──
// ctx: { task, context, project_id } — permite resolver plantillas <slug> del path.
async function verificar(entregable, ctx = {}) {
  if (!entregable) {
    return { verificado: false, motivo: 'sin_entregable_declarado', reglas: [] };
  }
  const c = validarContrato(entregable);
  if (!c.ok) return { verificado: false, motivo: 'contrato_invalido', detalle: c.error, reglas: [] };

  switch (entregable.tipo) {
    case 'ninguno':
      return { verificado: false, motivo: 'entregable_declarado_ninguno', reglas: [] };

    case 'juicio':
      // Puerto verificar(juicio): una decisión no se verifica como un objeto.
      // Se reporta NO verificable — el invocador decide. NUNCA se finge.
      return { verificado: false, motivo: 'entregable_fuzzy_no_verificable', puerto: 'verificar(juicio)', reglas: [] };

    case 'evento':
      // Puerto verificar(evento): requeriría escucha correlacionada; hoy se
      // declara como pendiente de verificación por el dominio (no se finge).
      return { verificado: false, motivo: 'entregable_evento_pendiente_dominio', reglas: [] };

    case 'fs':
      return _verificarFs(entregable, ctx);
  }
  return { verificado: false, motivo: 'tipo_desconocido', reglas: [] };
}

// Verificación de sistema de archivos: el JEFE mira modules/ del SISTEMA.
function _verificarFs(entregable, ctx) {
  // Resolver plantillas <slug> (y <nombre>) desde task/context del mandato.
  let rel = entregable.path;
  const slug = (ctx.task && typeof ctx.task === 'string' && ctx.task.match(/[a-z][a-z0-9]*(?:-[a-z0-9]+)+/))
    ? ctx.task.match(/[a-z][a-z0-9]*(?:-[a-z0-9]+)+/)[0] : null;
  const ctxStr = JSON.stringify({ task: ctx.task, context: ctx.context || {} });
  const m = ctxStr.match(/[a-z][a-z0-9]*(?:-[a-z0-9]+)+/);
  const slugCtx = slug || (m ? m[0] : null);
  if (slugCtx) rel = rel.replace(/<slug>/g, slugCtx).replace(/<nombre>/g, slugCtx);

  const abs = rel.startsWith('storage/')
    ? path.join(DATA_DIR, 'projects', ctx.project_id || 'system', 'storage', rel.replace(/^storage\//, ''))
    : path.join(MODULES_DIR, rel);
  const reglas = Array.isArray(entregable.reglas) ? entregable.reglas : ['existe'];
  const resultados = [];

  for (const regla of reglas) {
    let ok = false, detalle = '';
    switch (regla) {
      case 'existe':
        ok = fs.existsSync(abs);
        detalle = ok ? `existe ${rel}` : `NO existe ${rel}`;
        break;
      case 'api_real': {
        // API interna real: import _shared/modulo-hibrido-reflejo + _atender 4 args + name/version
        const src = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : '';
        ok = src.includes("require('../_shared/modulo-hibrido-reflejo')")
          && /_atender\([^)]*,\s*[^)]*,\s*[^)]*,\s*[^)]*\)/.test(src)
          && src.includes('this.name') && src.includes('this.version');
        detalle = ok ? 'API real (_shared + _atender 4 args + name/version)' : 'API NO real (import/_atender/constructor incorrectos)';
        break;
      }
      case 'en_repo': {
        if (REPO_MODULES_DIR) {
          try {
            const cp = require('child_process');
            const out = cp.execFileSync('git', ['ls-files', '--', `modules/${rel.replace(/^\//, '')}`],
              { cwd: path.join(REPO_MODULES_DIR, '..'), encoding: 'utf8' }).trim();
            ok = out.length > 0;
          } catch (_) { ok = false; }
          detalle = ok ? `commiteado (${rel})` : `NO commiteado (${rel}) — el deploy lo borraría`;
        } else {
          ok = true; detalle = 'repo no disponible → no bloquea';
        }
        break;
      }
      case 'contenido_min': {
        const min = entregable.min_chars || 100;
        const n = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8').length : 0;
        ok = n >= min;
        detalle = ok ? `${n} chars (≥${min})` : `solo ${n} chars (min ${min}) — skill vacía`;
        break;
      }
      default:
        ok = false; detalle = `regla '${regla}' desconocida`;
    }
    resultados.push({ regla, ok, detalle });
  }

  const ok = resultados.every(r => r.ok);
  return {
    verificado: ok,
    tipo: 'fs',
    path: rel,
    reglas: resultados,
    motivo: ok ? 'entregable_verificado' : 'entregable_no_verificado'
  };
}

// ── BITÁCORA (CUSTODIO — single-writer del registro de pasos de cada ejecución) ──
// El esquema: "bitácora · CUSTODIO (único escritor del registro de pasos)".
// El framework es el único que la escribe; la vitrina solo la proyecta.
// Vive en el storage del proyecto: storage/agentes/bitacoras/<request_id>.json
// → sobrevive a reinicios y permite REANUDAR (P4: checkpoint por paso).

function bitacoraPath(project_id, request_id) {
  return path.join(DATA_DIR, 'projects', project_id || 'system', 'storage', 'agentes', 'bitacoras', request_id + '.json');
}

function crearBitacora({ project_id, request_id, agent_name, task, startedAt }) {
  const doc = {
    request_id, agent_name,
    task: typeof task === 'string' ? task.slice(0, 500) : '',
    estado: 'ejecutando',       // ejecutando | pausada | verificada | fallida
    pasos: [{ paso: 'started', ts: startedAt || Date.now(), message: `Agente ${agent_name} iniciando` }],
    startedAt: startedAt || Date.now(),
    veredicto: null,
    punto_reanudacion: null
  };
  try {
    fs.mkdirSync(path.dirname(bitacoraPath(project_id, request_id)), { recursive: true });
    fs.writeFileSync(bitacoraPath(project_id, request_id), JSON.stringify(doc, null, 2), 'utf8');
  } catch (_) { /* best-effort: sin bitácora no se bloquea la ejecución */ }
  return doc;
}

function registrarPaso(project_id, request_id, paso) {
  try {
    const p = bitacoraPath(project_id, request_id);
    if (!fs.existsSync(p)) return null;
    const doc = JSON.parse(fs.readFileSync(p, 'utf8'));
    doc.pasos.push({ ...paso, ts: paso.ts || Date.now() });
    fs.writeFileSync(p, JSON.stringify(doc, null, 2), 'utf8');
    return doc;
  } catch (_) { return null; }
}

// Punto de reanudación: timeout/interrupción → estado 'pausada' + dónde seguir.
function pausarBitacora(project_id, request_id, { session_id, prev_state }) {
  try {
    const p = bitacoraPath(project_id, request_id);
    if (!fs.existsSync(p)) return null;
    const doc = JSON.parse(fs.readFileSync(p, 'utf8'));
    doc.estado = 'pausada';
    doc.punto_reanudacion = { session_id: session_id || null, prev_state: prev_state || null };
    doc.pasos.push({ paso: 'pausada', ts: Date.now(), message: 'Ejecución pausada — reanudable' });
    fs.writeFileSync(p, JSON.stringify(doc, null, 2), 'utf8');
    return doc;
  } catch (_) { return null; }
}

// Sellar con el veredicto del JEFE (P1): verificada / fallida + reglas.
function sellarBitacora(project_id, request_id, veredicto, duracion_ms) {
  try {
    const p = bitacoraPath(project_id, request_id);
    if (!fs.existsSync(p)) return null;
    const doc = JSON.parse(fs.readFileSync(p, 'utf8'));
    doc.estado = veredicto && veredicto.verificado ? 'verificada' : 'fallida';
    doc.veredicto = veredicto || null;
    doc.duracion_ms = duracion_ms || doc.duracion_ms || null;
    doc.pasos.push({ paso: 'final', ts: Date.now(), message: doc.estado });
    fs.writeFileSync(p, JSON.stringify(doc, null, 2), 'utf8');
    return doc;
  } catch (_) { return null; }
}

function leerBitacora(project_id, request_id) {
  try {
    const p = bitacoraPath(project_id, request_id);
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
  } catch (_) { return null; }
}

module.exports = {
  preparar, validarContrato, verificar,
  crearBitacora, registrarPaso, pausarBitacora, sellarBitacora, leerBitacora,
  MODULES_DIR, REPO_MODULES_DIR
};
