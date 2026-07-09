#!/usr/bin/env node
/**
 * CÚPULA DE EVENTOS — el vigilante del contrato del bus.
 *
 * Cruza TODO lo que conduce eventos contra TODO lo que los atiende:
 *   FUENTES  module.json (publishes/subscribes/tools/tools_http)
 *            *.blueprint.json (eventos_publicados / eventos_que_escucho
 *                              + publishAndWait('X') y publish('X') en pseudocódigo)
 *            SKILL.md de la cantera (bus.publishAndWait('X'))
 *
 * CANTOS (los fallos que hoy se cazan a mano, cantados solos):
 *   1. rpc_fantasma      (ERROR) — un publishAndWait('X') que NADIE atiende.
 *                                  Caso testigo: la skill obrera sellando
 *                                  'escandallo.precio.registrar, si existe'.
 *   2. publish_huerfano  (WARN)  — un publish('X') de dominio sin subscriber
 *                                  (se excluyen *.response / *.failed: van
 *                                  correlados al caller, no a un subscriber).
 *
 * Nacimiento en fase TESTIGO (como la cúpula de la cabecera): --testigo
 * reporta y sale 0. Sin el flag, los ERROR salen 1 (para cuando gradúe).
 *
 * Uso:  node scripts/cupula-eventos/vigilante.js [--testigo] [--json]
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const MODULES = path.join(ROOT, 'modules');
const TESTIGO = process.argv.includes('--testigo');
const AS_JSON = process.argv.includes('--json');

const RED = '\x1b[31m', GREEN = '\x1b[32m', YEL = '\x1b[33m', CYAN = '\x1b[36m', RST = '\x1b[0m';

// Eventos con nombre dinámico (template) o infraestructura que el core atiende
// fuera de los manifests. Se documenta CADA entrada — la allowlist ciega es deriva.
const ATENDIDOS_POR_EL_CORE = new Set([
  'ui.request',            // UIRequestHandler (core/ui) — ui/request/# no pasa por manifests
]);
const PREFIJOS_DINAMICOS = ['${', '<', '{', '+']; // nombres con placeholder → no resolubles estáticamente

// ── barrido de ficheros ──────────────────────────────────────────────────────
function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

const rel = (p) => path.relative(ROOT, p);
const esDinamico = (ev) => !ev || PREFIJOS_DINAMICOS.some((d) => ev.includes(d));

// ── censo ────────────────────────────────────────────────────────────────────
// atendidos: evento → [quien lo escucha]        (subscribes / eventos_que_escucho / tools por nombre)
// conducidos: {evento, por, via}                (publishAndWait — espera respuesta)
// publicados: {evento, por, via}                (publish fire-and-forget / publishes / eventos_publicados)
const atendidos = new Map();
const conducidos = [];
const publicados = [];

function atiende(ev, quien) {
  if (esDinamico(ev)) return;
  if (!atendidos.has(ev)) atendidos.set(ev, []);
  atendidos.get(ev).push(quien);
}

const RE_WAIT = /publishAndWait\(\s*['"`]([^'"`]+)['"`]/g;
const RE_RPC = /_rpc\(\s*['"`]([^'"`]+)['"`]/g;
const RE_PUB = /(?<!And)[Pp]ublish\(\s*['"`]([^'"`]+)['"`]/g;
const RE_SUB = /\bsub(?:scribe)?\(\s*['"`]([^'"`]+)['"`]/g;

function escanearTexto(texto, por, via) {
  let m;
  RE_WAIT.lastIndex = 0; RE_RPC.lastIndex = 0; RE_PUB.lastIndex = 0;
  while ((m = RE_WAIT.exec(texto))) if (!esDinamico(m[1])) conducidos.push({ evento: m[1], por });
  while ((m = RE_RPC.exec(texto))) if (!esDinamico(m[1])) conducidos.push({ evento: m[1], por });
  while ((m = RE_PUB.exec(texto))) if (!esDinamico(m[1])) publicados.push({ evento: m[1], por, via });
}

// Suscripciones PROGRAMÁTICAS: módulos que se cablean en onLoad (sub/subscribe
// en código) en vez de por manifest — media-generator, carta-digital… El
// contrato vivo es la unión de manifest + código.
function escanearJS(texto, por) {
  let m; RE_SUB.lastIndex = 0;
  while ((m = RE_SUB.exec(texto))) atiende(m[1], por + ' (código)');
  escanearTexto(texto, por, 'codigo');
}

for (const f of walk(MODULES)) {
  const base = path.basename(f);

  if (base === 'module.json') {
    let mj; try { mj = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { continue; }
    const quien = rel(f);
    const subs = mj.subscribes || (mj.events && mj.events.subscribes) || [];
    for (const s of subs) atiende(typeof s === 'string' ? s : s.event, quien);
    const pubs = mj.publishes || (mj.events && mj.events.publishes) || [];
    for (const p of pubs) {
      const ev = typeof p === 'string' ? p : p.event;
      if (!esDinamico(ev)) publicados.push({ evento: ev, por: quien, via: 'manifest' });
    }
    // tools y tools_http se alcanzan por bus con su nombre (el loader las cablea)
    for (const t of [...(mj.tools || []), ...(mj.tools_http || [])]) if (t && t.name) atiende(t.name, quien + ' (tool)');
  }

  if (base.endsWith('.blueprint.json')) {
    let bp; try { bp = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { continue; }
    const quien = rel(f);
    for (const e of bp.eventos_que_escucho || []) atiende(typeof e === 'string' ? e : e.event, quien);
    for (const e of bp.eventos_publicados || []) {
      const ev = typeof e === 'string' ? e : e.event;
      if (!esDinamico(ev)) publicados.push({ evento: ev, por: quien, via: 'blueprint' });
    }
    escanearTexto(JSON.stringify(bp), quien, 'pseudocodigo');
  }

  if (base === 'SKILL.md') escanearTexto(fs.readFileSync(f, 'utf8'), rel(f), 'skill');

  if (base.endsWith('.js') && !f.includes('__tests__') && !f.includes('/frontend/')) {
    escanearJS(fs.readFileSync(f, 'utf8'), rel(f));
  }
}

// Los blueprints atienden sus propias operaciones como <modulo>.<op>.request
// (el ai-gateway responde el RPC — mecanismo request/response de blueprints).
for (const f of walk(MODULES)) {
  if (!f.endsWith('.blueprint.json')) continue;
  let bp; try { bp = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { continue; }
  if (!bp.id || !bp.operaciones) continue;
  for (const op of Object.keys(bp.operaciones)) {
    if (op.startsWith('_')) continue;
    atiende(`${bp.id}.${op}.request`, rel(f) + ' (operación blueprint)');
  }
}

const esRespuesta = (ev) => /\.(response|failed|respuesta)$/.test(ev);
const respondeAlguien = (ev) => atendidos.has(ev) || ATENDIDOS_POR_EL_CORE.has(ev);

// ── tests: los stubs no pueden perpetuar fantasmas ───────────────────────────
// Caso testigo: el stub de destilador comparaba `evento === 'propiocepcion.leer.request'`
// — el nombre fantasma vivía en el test y por eso el bug jamás cantó. Se censan los
// literales con forma de evento .request/.response cuyo PRIMER segmento sea un módulo
// real (los fixtures inventados tipo 'foo.bar.request' no molestan) y no estén atendidos.
const prefijosReales = new Set();
for (const ev of atendidos.keys()) prefijosReales.add(ev.split('.')[0]);
const RE_EV_TEST = /['"`]([a-z0-9_-]+(?:\.[a-z0-9_]+){1,3}\.request)['"`]/g;
const testFantasma = [];
const TESTS_DIR = path.join(ROOT, 'tests');
if (fs.existsSync(TESTS_DIR)) {
  for (const f of walk(TESTS_DIR)) {
    if (!f.endsWith('.js')) continue;
    const texto = fs.readFileSync(f, 'utf8');
    let m; RE_EV_TEST.lastIndex = 0;
    const vistos = new Set();
    while ((m = RE_EV_TEST.exec(texto))) {
      const ev = m[1];
      if (vistos.has(ev) || esDinamico(ev)) continue;
      vistos.add(ev);
      if (prefijosReales.has(ev.split('.')[0]) && !respondeAlguien(ev)) {
        testFantasma.push({ evento: ev, por: rel(f) });
      }
    }
  }
}

// ── veto por nombre: ningún freno veta PROCEDENCIA con lista cerrada ─────────
// Ley de la evidencia (prisma-del-caso): la fuente jamás se veta por nombre — se
// califica por su evidencia. Un `['a','b'].includes(x.fuente)` que RECHAZA es un
// muro que crece con cada fuente nueva (caso testigo: soysuper vs actualizar_precio).
const RE_VETO = /\[(?:\s*['"][a-z0-9_-]+['"]\s*,?)+\]\s*\.includes\([^)]*(?:fuente|canal|proveedor|origen|motor|provider|source)/i;
const vetoPorNombre = [];
for (const f of walk(MODULES)) {
  if (!(f.endsWith('.js') || f.endsWith('.blueprint.json'))) continue;
  if (f.includes('__tests__')) continue;
  const texto = fs.readFileSync(f, 'utf8');
  const lineas = texto.split('\n');
  for (let i = 0; i < lineas.length; i++) {
    if (RE_VETO.test(lineas[i])) vetoPorNombre.push({ donde: `${rel(f)}:${i + 1}`, linea: lineas[i].trim().slice(0, 120) });
  }
}

// ── cantos ───────────────────────────────────────────────────────────────────
const rpcFantasma = [];
for (const c of conducidos) {
  // un publishAndWait de 'X.response' no existe; lo conducido es el .request o el nombre de tool
  if (!respondeAlguien(c.evento)) rpcFantasma.push(c);
}

const vistosPub = new Set();
const publishHuerfano = [];
for (const p of publicados) {
  if (esRespuesta(p.evento)) continue;             // .response/.failed van correlados, no a subscriber
  const key = p.evento + '|' + p.por;
  if (vistosPub.has(key)) continue;
  vistosPub.add(key);
  if (!respondeAlguien(p.evento)) publishHuerfano.push(p);
}

// dedup para el reporte
const dedup = (arr) => { const s = new Set(); return arr.filter((x) => { const k = x.evento + '|' + x.por; if (s.has(k)) return false; s.add(k); return true; }); };
const errores = dedup(rpcFantasma);
const avisos = dedup(publishHuerfano);

// ── reporte ──────────────────────────────────────────────────────────────────
if (AS_JSON) {
  console.log(JSON.stringify({ atendidos: atendidos.size, conducidos: conducidos.length, publicados: publicados.length, rpc_fantasma: errores, publish_huerfano: avisos, test_fantasma: testFantasma }, null, 1));
} else {
  console.log(`cúpula-eventos: ${atendidos.size} eventos atendidos · ${conducidos.length} RPCs conducidos · ${publicados.length} publicaciones`);
  for (const e of errores) console.log(`${RED}✗ RPC FANTASMA${RST} ${e.evento}  ← conducido por ${e.por} y NADIE lo atiende`);
  // En consola solo los huérfanos de pseudocódigo/skill (cerca del bug real);
  // los de manifest son eventos de dominio que el frontend consume por MQTT
  // dinámico — viven completos en --json, no ahogan la señal aquí.
  const avisosFuertes = avisos.filter((a) => a.via === 'pseudocodigo' || a.via === 'skill');
  for (const a of avisosFuertes) console.log(`${YEL}⚠ publish huérfano${RST} ${a.evento}  ← ${a.por} (${a.via}) — sin subscriber`);
  for (const t of testFantasma) console.log(`${YEL}⚠ test con fantasma${RST} ${t.evento}  ← ${t.por} — el stub perpetúa un evento que nadie atiende`);
  for (const v of vetoPorNombre) console.log(`${YEL}⚠ veto por nombre${RST} ${v.donde} — la procedencia se califica por EVIDENCIA (ley del prisma), no por lista: ${v.linea}`);
  const veredicto = errores.length ? `${errores.length} fantasma(s)` : 'contrato íntegro';
  console.log(`${errores.length ? RED : GREEN}${TESTIGO ? '(testigo) ' : ''}${veredicto}${RST} · ${avisosFuertes.length} aviso(s) fuertes · ${avisos.length - avisosFuertes.length} de manifest (ver --json)`);
}

process.exit(TESTIGO ? 0 : (errores.length ? 1 : 0));
