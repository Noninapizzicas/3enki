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
 *   3. suscriptor_huerfano (WARN) — un SUSCRIPTOR cuyo evento nadie EMITE (oyente
 *                                  muerto: no loguea, no lanza, no expira). Caso
 *                                  testigo: producto.creado. Se excluyen los .request
 *                                  (endpoint RPC sin llamador = superficie de API).
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
const PREFIJOS_DINAMICOS = ['${', '<', '{', '+', '*']; // placeholder o comodín → no resolubles estáticamente

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

// El canon declara subscribes/publishes como LISTA. Un manifest que los trae como
// DICT ({evento: handler}) dice lo mismo con otra forma → se NORMALIZA (y se canta el
// desvío). Antes un solo manifest así tumbaba el vigilante entero: 'subs is not iterable'.
const esDict = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const comoLista = (v) => Array.isArray(v)
  ? v
  : (esDict(v) ? Object.entries(v).map(([event, handler]) => ({ event, handler: typeof handler === 'string' ? handler : undefined })) : []);

// ── censo ────────────────────────────────────────────────────────────────────
// atendidos: evento → [quien lo escucha]        (subscribes / eventos_que_escucho / tools por nombre)
// conducidos: {evento, por, via}                (publishAndWait — espera respuesta)
// publicados: {evento, por, via}                (publish fire-and-forget / publishes / eventos_publicados)
const atendidos = new Map();
const conducidos = [];
const publicados = [];
const intenciones = [];   // trabajo_pendiente[].evento_esperado — futuro DECLARADO (forma, no prosa)
const rechazosMudos = new Map();   // blueprint → nº de INVALID_INPUT sin hint (muro sin puerta)
const manifiestosFueraDeCanon = []; // manifests que declaran subscribes/publishes como dict (forma fuera de canon)

// Corta el comentario de línea (// …) respetando URLs (http://, https://). La línea
// comentada del pseudocódigo es intención/prosa, NO conducción — caso testigo:
// carta-marketing 'conducía' agent-observer.consultar dentro de un comentario (falso fantasma).
function sinComentario(linea) {
  const m = linea.match(/(^|[^:])\/\//);
  return m ? linea.slice(0, m.index + m[1].length) : linea;
}

function atiende(ev, quien, via = 'manifest') {
  if (esDinamico(ev)) return;
  if (!atendidos.has(ev)) atendidos.set(ev, []);
  atendidos.get(ev).push({ quien, via });
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
  while ((m = RE_SUB.exec(texto))) atiende(m[1], por + ' (código)', 'codigo');
  escanearTexto(texto, por, 'codigo');
}

for (const f of walk(MODULES)) {
  const base = path.basename(f);

  if (base === 'module.json') {
    let mj; try { mj = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { continue; }
    const quien = rel(f);
    const crudoSubs = mj.subscribes || (mj.events && mj.events.subscribes);
    const crudoPubs = mj.publishes || (mj.events && mj.events.publishes);
    const camposFueraDeCanon = [];
    if (esDict(crudoSubs)) camposFueraDeCanon.push('subscribes');
    if (esDict(crudoPubs)) camposFueraDeCanon.push('publishes');
    if (esDict(mj.tools)) camposFueraDeCanon.push('tools');
    if (camposFueraDeCanon.length) manifiestosFueraDeCanon.push({ donde: quien, campos: camposFueraDeCanon });
    for (const s of comoLista(crudoSubs)) atiende(typeof s === 'string' ? s : s.event, quien, 'manifest');
    for (const p of comoLista(crudoPubs)) {
      const ev = typeof p === 'string' ? p : p.event;
      if (!esDinamico(ev)) publicados.push({ evento: ev, por: quien, via: 'manifest' });
    }
    // tools y tools_http se alcanzan por bus con su nombre (el loader las cablea)
    for (const t of [...comoLista(mj.tools), ...comoLista(mj.tools_http)]) if (t && t.name) atiende(t.name, quien + ' (tool)', 'tool');
  }

  if (base.endsWith('.blueprint.json')) {
    let bp; try { bp = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { continue; }
    const quien = rel(f);
    for (const e of comoLista(bp.eventos_que_escucho)) atiende(typeof e === 'string' ? e : e.event, quien, 'blueprint');
    for (const e of comoLista(bp.eventos_publicados)) {
      const ev = typeof e === 'string' ? e : e.event;
      if (!esDinamico(ev)) publicados.push({ evento: ev, por: quien, via: 'blueprint' });
    }
    // SOLO el pseudocódigo conduce — la prosa (_doc, changelogs, descripciones) NO lleva
    // contratos. Y dentro del pseudocódigo, la línea comentada es intención, no conducción.
    const lineasPseudo = [];
    (function recoger(nodo, bajoPseudo) {
      if (typeof nodo === 'string') { if (bajoPseudo) lineasPseudo.push(sinComentario(nodo)); return; }
      if (Array.isArray(nodo)) { nodo.forEach((n) => recoger(n, bajoPseudo)); return; }
      if (nodo && typeof nodo === 'object') for (const [k, v] of Object.entries(nodo)) recoger(v, bajoPseudo || k === 'pseudocodigo');
    })(bp, false);
    escanearTexto(lineasPseudo.join('\n'), quien, 'pseudocodigo');
    // RECHAZO MUDO: un INVALID_INPUT sin hint es un muro sin puerta — el LLM que choca
    // sin prescripción RODEA (curl, fs.edit, eventos inventados), y el rodeo es peor.
    // Mandato del freno fértil: todo rechazo lleva su camino. Aquí solo se CUENTA (WARN).
    let mudos = 0;
    for (const l of lineasPseudo) {
      if (/INVALID_INPUT\s*\{/.test(l) && !/hint/.test(l)) mudos++;
      else if (/return INVALID_INPUT\s*$/.test(l.trim())) mudos++;
    }
    if (mudos > 0) rechazosMudos.set(quien, mudos);
    // INTENCIONES declaradas: el futuro con forma. Cuando su evento exista, la cúpula lo OFRECE.
    for (const t of bp.trabajo_pendiente || []) {
      if (t && typeof t.evento_esperado === 'string') intenciones.push({ evento: t.evento_esperado, por: quien, id: t.id || null, estado: t.estado || null });
    }
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
    atiende(`${bp.id}.${op}.request`, rel(f) + ' (operación blueprint)', 'blueprint');
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

// 3. suscriptor_huerfano (WARN) — un SUSCRIPTOR cuyo evento NADIE emite. El punto ciego
//    del contrato: un oyente muerto no loguea, no lanza, no expira — nadie lo espera.
//    Caso testigo: producto.creado (4 orejas, ningún altavoz). Se excluyen los .request/
//    .response/.failed: un endpoint RPC sin llamador es superficie de API, no fantasma.
const esRpc = (ev) => /\.(request|response|failed|respuesta)$/.test(ev);
const publicadosSet = new Set(publicados.map((p) => p.evento));
const conducidosSet = new Set(conducidos.map((c) => c.evento));
const suscriptorHuerfano = [];
for (const [ev, quienas] of atendidos) {
  if (esRpc(ev) || esDinamico(ev) || ATENDIDOS_POR_EL_CORE.has(ev)) continue;
  if (ev.startsWith('core.')) continue;   // el core los emite fuera de manifests (no estáticos)
  // Solo se canta el CONTRATO duro: oyentes declarados en module.json (manifest) o
  // cableados en código (sub()). Los de blueprint/LLM/UI escuchan eventos que el repo
  // no emite estáticamente (llegan por MQTT o de un turno LLM) — ruido, no fantasma.
  const declarados = quienas.filter((q) => q.via === 'manifest' || q.via === 'codigo');
  if (declarados.length === 0) continue;
  if (publicadosSet.has(ev) || conducidosSet.has(ev)) continue;
  suscriptorHuerfano.push({ evento: ev, por: [...new Set(declarados.map((q) => q.quien))].join(', '), via: declarados[0].via });
}
suscriptorHuerfano.sort((a, b) => a.evento.localeCompare(b.evento));

// dedup para el reporte
const dedup = (arr) => { const s = new Set(); return arr.filter((x) => { const k = x.evento + '|' + x.por; if (s.has(k)) return false; s.add(k); return true; }); };
const errores = dedup(rpcFantasma);
const avisos = dedup(publishHuerfano);

// ── reporte ──────────────────────────────────────────────────────────────────
if (AS_JSON) {
  console.log(JSON.stringify({ atendidos: atendidos.size, conducidos: conducidos.length, publicados: publicados.length, rpc_fantasma: errores, publish_huerfano: avisos, suscriptor_huerfano: suscriptorHuerfano, manifiestos_fuera_de_canon: manifiestosFueraDeCanon, test_fantasma: testFantasma, veto_por_nombre: vetoPorNombre, intenciones, rechazos_mudos: Object.fromEntries(rechazosMudos) }, null, 1));
} else {
  console.log(`cúpula-eventos: ${atendidos.size} eventos atendidos · ${conducidos.length} RPCs conducidos · ${publicados.length} publicaciones`);
  for (const e of errores) console.log(`${RED}✗ RPC FANTASMA${RST} ${e.evento}  ← conducido por ${e.por} y NADIE lo atiende`);
  // En consola solo los huérfanos de pseudocódigo/skill (cerca del bug real);
  // los de manifest son eventos de dominio que el frontend consume por MQTT
  // dinámico — viven completos en --json, no ahogan la señal aquí.
  const avisosFuertes = avisos.filter((a) => a.via === 'pseudocodigo' || a.via === 'skill');
  for (const a of avisosFuertes) console.log(`${YEL}⚠ publish huérfano${RST} ${a.evento}  ← ${a.por} (${a.via}) — sin subscriber`);
  for (const s of suscriptorHuerfano) console.log(`${YEL}⚠ suscriptor huérfano${RST} ${s.evento}  ← ${s.por} — nadie EMITE este evento (oyente muerto)`);
  for (const m of manifiestosFueraDeCanon) console.log(`${CYAN}◆ manifest fuera de canon${RST} ${m.donde} — ${m.campos.join('/')} declarado como dict (el canon es lista; se normalizó)`);
  for (const t of testFantasma) console.log(`${YEL}⚠ test con fantasma${RST} ${t.evento}  ← ${t.por} — el stub perpetúa un evento que nadie atiende`);
  for (const v of vetoPorNombre) console.log(`${YEL}⚠ veto por nombre${RST} ${v.donde} — la procedencia se califica por EVIDENCIA (ley del prisma), no por lista: ${v.linea}`);
  // El canto POSITIVO: una intención declarada cuyo evento YA vive — ofrécela, ciérrala.
  for (const it of intenciones.filter((i) => i.estado !== 'cerrado' && respondeAlguien(i.evento))) {
    console.log(`${GREEN}✦ INTENCIÓN MADURA${RST} ${it.evento} ya se atiende — cierra '${it.id}' en ${it.por}`);
  }
  // Rechazos mudos: línea base agregada (el detalle por blueprint vive en --json).
  const totalMudos = [...rechazosMudos.values()].reduce((a, b) => a + b, 0);
  if (totalMudos > 0) {
    const top = [...rechazosMudos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([q, n]) => `${q.split('/').pop()}:${n}`).join(' · ');
    console.log(`${YEL}⚠ rechazos mudos${RST} ${totalMudos} INVALID_INPUT sin hint en blueprints (muro sin puerta) — top: ${top}`);
  }
  const veredicto = errores.length ? `${errores.length} fantasma(s)` : 'contrato íntegro';
  console.log(`${errores.length ? RED : GREEN}${TESTIGO ? '(testigo) ' : ''}${veredicto}${RST} · ${avisosFuertes.length} aviso(s) fuertes · ${avisos.length - avisosFuertes.length} de manifest (ver --json)`);
}

process.exit(TESTIGO ? 0 : (errores.length ? 1 : 0));
