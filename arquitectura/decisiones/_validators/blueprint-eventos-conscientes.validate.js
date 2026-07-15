#!/usr/bin/env node
/**
 * Validador del patron 'eventos conscientes en el diseno de blueprints'.
 *
 * Cross-checks (3):
 *   1. evento_publicado_sin_consumer_declarado          (error)
 *      Para cada blueprint con eventos_publicados_que_requieren_consumer[],
 *      cada entrada debe tener al menos un subscriber registrado en el repo
 *      (otro blueprint con eventos_que_escucho[] o module.json con
 *      events.subscribes[]).
 *
 *   2. evento_escuchado_sin_publisher_declarado         (warning)
 *      Para cada blueprint con eventos_que_escucho[], cada entrada debe
 *      tener al menos un publisher en el repo. Complementa el check
 *      eventos_que_escucho_apunta_a_evento_canonico del validator
 *      llm-runtime-discipline (mas estricto: tambien acepta module.json).
 *
 *   3. evento_publicado_sin_declarar_requirement        (info)
 *      Si el pseudocodigo del blueprint publica un evento que parece de
 *      dominio (verbo en participio: creada, actualizada, eliminada,
 *      registrada) y el evento NO esta en
 *      eventos_publicados_que_requieren_consumer[], recordatorio para el
 *      disenador (no bloquea, no warning — info).
 *
 * Tambien produce output curado:
 *   arquitectura/decisiones/_outputs/eventos-publish-subscribe.json
 *   { _meta, eventos: { <event_name>: { publishers: [...], subscribers: [...] } } }
 *
 * Opt-in v1: blueprints sin el campo eventos_publicados_que_requieren_consumer[]
 * NO disparan drift. El validator solo se queja donde se ha declarado.
 *
 * Aplica SOLO a blueprints en v1. modules JS POC2 cuentan como
 * publishers/subscribers en el catalogo, pero no se les exige declarar
 * requires_consumer todavia (decision v2).
 *
 * Contrato: arquitectura/decisiones/_contratos/blueprint-eventos-conscientes.contract.json
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const REPO_ROOT      = path.resolve(__dirname, '../../..');
const MODULES_DIR    = path.join(REPO_ROOT, 'modules');
const OUTPUT_PATH    = path.join(REPO_ROOT, 'arquitectura/decisiones/_outputs/eventos-publish-subscribe.json');

const RED='\x1b[31m', GREEN='\x1b[32m', YEL='\x1b[33m', CYAN='\x1b[36m', RST='\x1b[0m';

// Verbos en participio que sugieren evento de dominio (publish fire-and-forget
// que tipicamente requiere consumer). Heuristica para check 3.
const VERBOS_DOMINIO_PARTICIPIO = [
  'creada','creado','actualizada','actualizado','eliminada','eliminado',
  'registrada','registrado','procesada','procesado','aprobada','aprobado',
  'rechazada','rechazado','archivada','archivado','restaurada','restaurado',
  'completada','completado','iniciada','iniciado','fallida','fallido',
  'calculada','calculado','generada','generado','enviada','enviado',
  'recibida','recibido','guardada','guardado','modificada','modificado'
];

// Eventos de observabilidad / lifecycle / RPC que NO necesitan consumer
// (fire-and-forget puro). Heuristica para evitar falsos positivos en check 3.
const VERBOS_NO_DOMINIO = new Set([
  'request','response','progress','loaded','ready','started','stopped',
  'tick','heartbeat','metric','log','trace','audit'
]);

// ============================================================
// Helpers de filesystem
// ============================================================

function walkSync(dir, predicate, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('_') || entry.name === 'node_modules' || entry.name === 'tests') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkSync(full, predicate, acc);
    else if (predicate(entry.name)) acc.push(full);
  }
  return acc;
}

function loadJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (_) { return null; }
}

function relativeTo(p) {
  return path.relative(REPO_ROOT, p);
}

// ============================================================
// Construccion del catalogo publish/subscribe
// ============================================================

function buildCatalog() {
  const eventos = {}; // event_name -> { publishers: [{source, ref}], subscribers: [{source, handler}] }

  const ensure = (name) => {
    if (!eventos[name]) eventos[name] = { publishers: [], subscribers: [] };
    return eventos[name];
  };

  // 1. Blueprints: eventos_que_escucho + parseo de pseudocodigo para publishers.
  const blueprints = walkSync(MODULES_DIR, n => n.endsWith('.blueprint.json'));
  for (const bp of blueprints) {
    const j = loadJson(bp);
    if (!j) continue;
    const rel = relativeTo(bp);
    // Subscribers declarados
    const escucho = j.eventos_que_escucho || [];
    if (Array.isArray(escucho)) {
      for (const e of escucho) {
        const ev = typeof e === 'string' ? e : e?.evento;
        const handler = typeof e === 'object' ? e?.handler : undefined;
        if (typeof ev === 'string' && ev) {
          ensure(ev).subscribers.push({ source: rel, handler });
        }
      }
    }
    // Publishers: parseo crudo de operaciones[].pseudocodigo[].
    // Captura publish('<x>', ...) y publishAndWait('<x>', ...) — los names
    // de evento de dominio que el blueprint emite explicitamente.
    const ops = j.operaciones || {};
    const stringifyOps = JSON.stringify(ops);
    const publishRe = /(?:publishAndWait|publish)\(['"]([a-z][a-z0-9_.-]+)['"]/gi;
    let m;
    const seenInOps = new Set();
    while ((m = publishRe.exec(stringifyOps)) !== null) {
      const ev = m[1];
      const key = `${rel}::${ev}`;
      if (seenInOps.has(key)) continue;
      seenInOps.add(key);
      ensure(ev).publishers.push({ source: rel, ref: 'operaciones.pseudocodigo' });
    }
  }

  // 2. module.json de modulos JS: events.publishes[] + events.subscribes[].
  const moduleJsons = walkSync(MODULES_DIR, n => n === 'module.json');
  for (const mj of moduleJsons) {
    const j = loadJson(mj);
    if (!j) continue;
    if (j.blueprint_driven) continue; // su shape lo cubre el blueprint.json
    const rel = relativeTo(mj);
    const events = j.events || {};
    for (const p of (events.publishes || [])) {
      const ev = typeof p === 'string' ? p : p?.event;
      if (typeof ev === 'string' && ev) {
        ensure(ev).publishers.push({ source: rel, ref: 'module.json.events.publishes' });
      }
    }
    for (const s of (events.subscribes || [])) {
      const ev = typeof s === 'string' ? s : s?.event;
      const handler = typeof s === 'object' ? s?.handler : undefined;
      if (typeof ev === 'string' && ev) {
        ensure(ev).subscribers.push({ source: rel, handler });
      }
    }
  }

  return { eventos };
}

// ============================================================
// Cross-checks
// ============================================================

function findings(catalog) {
  const out = { errors: [], warnings: [], infos: [] };
  const blueprints = walkSync(MODULES_DIR, n => n.endsWith('.blueprint.json'));

  for (const bp of blueprints) {
    const j = loadJson(bp);
    if (!j) continue;
    const rel = relativeTo(bp);

    // ----- Check 1: evento_publicado_sin_consumer_declarado (error) -----
    // Solo si el blueprint OPTO-IN al campo. Si no esta, no se queja.
    const declarados = j.eventos_publicados_que_requieren_consumer || [];
    if (Array.isArray(declarados)) {
      for (const d of declarados) {
        const ev = typeof d === 'string' ? d : d?.evento;
        if (typeof ev !== 'string' || !ev) continue;
        const entry = catalog.eventos[ev];
        const subscribers = entry?.subscribers || [];
        if (subscribers.length === 0) {
          out.errors.push(
            `eventos|evento_publicado_sin_consumer_declarado|${rel} declara '${ev}' en eventos_publicados_que_requieren_consumer[] pero NINGUN modulo ni blueprint del repo lo escucha (eventos_que_escucho[] / events.subscribes[]). Riesgo: evento fire-and-forget se pierde silenciosamente.`
          );
        }
      }
    }

    // ----- Check 2: evento_escuchado_sin_publisher_declarado (warning) -----
    const escucho = j.eventos_que_escucho || [];
    if (Array.isArray(escucho)) {
      for (const e of escucho) {
        const ev = typeof e === 'string' ? e : e?.evento;
        if (typeof ev !== 'string' || !ev) continue;
        const entry = catalog.eventos[ev];
        const publishers = entry?.publishers || [];
        if (publishers.length === 0) {
          out.warnings.push(
            `eventos|evento_escuchado_sin_publisher_declarado|${rel} declara escuchar '${ev}' en eventos_que_escucho[] pero NINGUN modulo ni blueprint del repo lo publica. Posible typo o evento de origen externo no escaneable.`
          );
        }
      }
    }

    // ----- Check 3: evento_publicado_sin_declarar_requirement (info) -----
    // Si el blueprint NO declara campo eventos_publicados_que_requieren_consumer[],
    // skip check 3 (opt-in en v1).
    if (!Array.isArray(j.eventos_publicados_que_requieren_consumer)) continue;

    const declaradosSet = new Set(
      (j.eventos_publicados_que_requieren_consumer || [])
        .map(d => typeof d === 'string' ? d : d?.evento)
        .filter(Boolean)
    );
    // Eventos que el blueprint publica en su pseudocodigo (de catalog).
    for (const [ev, entry] of Object.entries(catalog.eventos)) {
      const isPublisher = (entry.publishers || []).some(p => p.source === rel);
      if (!isPublisher) continue;
      if (declaradosSet.has(ev)) continue;
      // Heuristica: ultimo segmento debe ser verbo en participio dominio.
      const segments = ev.split('.');
      const last = segments[segments.length - 1];
      if (VERBOS_NO_DOMINIO.has(last)) continue;
      if (!VERBOS_DOMINIO_PARTICIPIO.includes(last)) continue;
      out.infos.push(
        `eventos|evento_publicado_sin_declarar_requirement|${rel} publica '${ev}' en pseudocodigo pero NO esta clasificado en eventos_publicados_que_requieren_consumer[]. Recordatorio para el disenador: si necesita consumer, declararlo; si es fire-and-forget de observabilidad, ignorar este info.`
      );
    }
  }

  return out;
}

// ============================================================
// Output: catalogo curado
// ============================================================

function writeCatalog(catalog) {
  // Sort por nombre de evento para output estable.
  const sorted = {};
  for (const k of Object.keys(catalog.eventos).sort()) {
    sorted[k] = catalog.eventos[k];
  }
  const payload = {
    _meta: {
      convencion: 'eventos-publish-subscribe',
      version: '1.0.0',
      creado_en: '2026-05-25',
      contrato_referencia: 'arquitectura/decisiones/_contratos/blueprint-eventos-conscientes.contract.json',
      generado_por: 'arquitectura/decisiones/_validators/blueprint-eventos-conscientes.validate.js',
      notas: 'Catalogo curado de eventos del bus indexado por nombre. Incluye publishers (blueprints con publish/publishAndWait en su pseudocodigo + module.json.events.publishes[]) y subscribers (blueprints con eventos_que_escucho[] + module.json.events.subscribes[]). El validador lo regenera cada vez. NO editar a mano.'
    },
    total_eventos: Object.keys(sorted).length,
    eventos: sorted
  };
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

// ============================================================
// Main
// ============================================================

function main() {
  const args = process.argv.slice(2);
  const checkSystem = args.includes('--check-system');

  const catalog = buildCatalog();
  writeCatalog(catalog);

  if (!checkSystem) {
    console.log(`${GREEN}PASS${RST} blueprint-eventos-conscientes (catalogo regenerado: ${Object.keys(catalog.eventos).length} eventos)`);
    return 0;
  }

  const f = findings(catalog);
  const total = f.errors.length + f.warnings.length + f.infos.length;

  console.log('');
  console.log(`${CYAN}=== cross-checks contra el repo (blueprint-eventos-conscientes) ===${RST}`);
  if (total === 0) {
    console.log(`${GREEN}cross-system OK${RST} (0 findings)`);
    return 0;
  }
  // Cada finding es "categoria|drift_slug|detalle". Se imprime en el formato de
  // la casa "<sym> <drift_slug>: <detalle>" para que scripts/validate-all.js
  // (parseFindings) lo entienda. Antes usaba "![]"/pipes que el harness no sabia
  // leer (findings=0 + exit!=0 => se contaba como SCHEMA FAIL). El simbolo por
  // severidad: ✗ error, ! warning, i info.
  const emitir = (sym, color, arr) => {
    for (const s of arr) {
      const p = String(s).split('|');
      const slug = p[1] || p[0];
      const detalle = (p.slice(2).join('|') || p.slice(1).join('|') || s).trim();
      console.log(`  ${color}${sym}${RST} ${slug}: ${detalle}`);
    }
  };
  if (f.errors.length) {
    console.log(`${RED}cross-system errors (${f.errors.length})${RST}`);
    emitir('✗', RED, f.errors);
  }
  if (f.warnings.length) {
    console.log(`${YEL}cross-system warnings (${f.warnings.length})${RST}`);
    emitir('!', YEL, f.warnings);
  }
  if (f.infos.length) {
    console.log(`${CYAN}cross-system info (${f.infos.length})${RST}`);
    emitir('i', CYAN, f.infos);
  }
  return f.errors.length > 0 ? 1 : 0;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = { buildCatalog, findings };
