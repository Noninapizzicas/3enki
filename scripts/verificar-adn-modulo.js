#!/usr/bin/env node
/**
 * verificar-adn-modulo.js — mide la FORMA de un módulo Enki (¿respeta el ADN?).
 *
 * QUÉ ES. El contrato está en `arquitectura/ADN-MODULO.md`. Este script lo MIDE.
 * No juzga intenciones: cuenta hechos declarados en el `module.json` real.
 *
 * POR QUÉ EXISTE. El estándar estaba escrito en PROSA (el empujón de
 * `proceso-negocio` dice "funciona por eventos, desacoplado") pero NINGÚN gate lo
 * verificaba. Un estándar que no se puede incumplir no es un estándar: es una
 * opinión. Y el sistema derivó — medido 2026-09-30:
 *   nichos 0.1 · prisma 0.1 · contabilidad 1.4-2.1 · pizzepos 22.7 (métodos/evento)
 * Mismo patrón que el hueco del semver (validar-blueprint-path.js): la
 * verificación miraba la forma del fichero, nunca la coherencia con el ADN.
 *
 * QUÉ MIDE (las reglas R1-R4 de arquitectura/ADN-MODULO.md):
 *   R2 · escritor mudo   — expone métodos, no publica NINGÚN evento de dominio
 *   R3 · entrada huérfana — escucha un evento que NADIE del repo emite
 *   R4 · método sin razón — declarado, sin `type`/`zone` o sin ops que lo declaren
 *   +   ratio                — métodos / eventos (la medida de la deriva)
 *
 * EXCEPCIONES LEGÍTIMAS (medidas contra el repo real, si no se excluyen el
 * validador da falsos positivos y la cura es peor que la enfermedad):
 *   · emisor = el core (`project.*`) → el core los emite, no un módulo
 *   · emisor = un sistema externo / otra vertical → la frontera está fuera
 *   · el módulo es una CUENTA (custodio con op de escritura) y aun así publica
 *   · la operación es una PREGUNTA/derivación (calcular, listar, buscar…): no
 *     cambia estado → no hay hecho que anunciar
 *
 * MODO. Por defecto NO bloquea: informa. Se pasa a bloqueante con `--gate`.
 * (Calibrar antes de bloquear: es la lección de todo este proceso.)
 *
 * USO
 *   node scripts/verificar-adn-modulo.js                    # informe de todo el repo
 *   node scripts/verificar-adn-modulo.js --familia pizzepos # solo una familia
 *   node scripts/verificar-adn-modulo.js modules/<slug>     # un módulo
 *   node scripts/verificar-adn-modulo.js --gate             # exit 1 si hay deriva
 *   node scripts/verificar-adn-modulo.js --json             # salida máquina
 */
'use strict';

const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const MODULES_DIR = path.join(RAIZ, 'modules');

// ── El emisor "core": los emite el core, no un módulo. Su escucha es legítima.
const EMISORES_CORE = new Set(['project.activated', 'project.deactivated', 'project.created', 'project.updated', 'project.deleted']);

// ── Verbos de PREGUNTA/DERIVACIÓN: no cambian estado → no hay hecho que anunciar.
// Un método así es legítimo sin evento (es un cálculo, no una escritura).
const VERBO_CONSULTA = /(calcular|cuadrar|saldos|derivar|estimar|prevision|previsión|comparar|verificar|es_nuevo|listar|buscar|leer|consultar|ficha|estado|generar|construir|exportar|salir|entrar|obtener|ver|mostrar|resumen|informe|cuadro|margen|balance|resultado|antiguedad|vencimiento|panel|hist|traducir|resolver|depurar|validar|comprobar|test)/i;

// ── Verbos de ESCRITURA: cambian estado → DEBEN anunciar el hecho (R2).
const VERBO_ESCRITURA = /(anadir|añadir|asentar|emitir|declarar|registrar|cerrar|abrir|admitir|encolar|firmar|activar|ajustar|amortizar|dar_alta|dar_baja|encadenar|recoger|anotar|marcar|sellar|rectificar|ratificar|juzgar|proponer|formar|crear|guardar|consolidar|sincronizar|upsert|subir|borrar|descartar|reencolar|juzgar)/i;

// ── Puertas de FRONTERA: el emisor está fuera del repo (otra vertical, un
// sistema externo, un ERP). No es cadena rota: es una puerta abierta a propósito.
const PUERTA_FRONTERA = new Set([
  'nomina.recibida', 'nomina.emitida', 'vertical.hecho.emitido',
  'inventario.ajustado', 'inventario.reserva.creada',
]);

// ── Los eventos de un manifiesto, tolerando formatos rotos (hay módulos ajenos
// con `subscribes`/`publishes` en formato dict — no es deriva de forma: es un
// manifiesto malformado. Aquí no revienta: se salta y se reporta aparte).
function arrayDe(v) {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') return Object.values(v);  // dict → sus valores
  return [];
}
// ── Lo que un módulo EMITE de verdad: no solo lo declarado en `publishes`,
// también lo que su CÓDIGO publica (`eventBus.publish('x')`). Medido
// 2026-09-30: hay módulos que publican eventos de dominio sin declararlos en el
// manifiesto (producto-manager · cobro · insumos). Si solo se leyera el
// manifiesto, R3 daría FALSOS POSITIVOS (decir "nadie lo emite" cuando el código
// sí lo emite). El manifiesto y el código son dos fuentes: se miran las dos.
const RE_PUBLISH = /(?:eventBus|bus)\s*\??\.\s*publish\s*\(\s*['"`]([a-z0-9_.*-]+)['"`]/gi;

function emiteEnCodigo(dir) {
  const out = new Set();
  const idx = path.join(dir, 'index.js');
  if (!fs.existsSync(idx)) return out;
  try {
    const src = fs.readFileSync(idx, 'utf8');
    let m;
    while ((m = RE_PUBLISH.exec(src)) !== null) {
      const e = m[1];
      if (!esRespuesta(e)) out.add(e);
    }
  } catch (_) { /* ilegible → sin datos del código */ }
  return out;
}

function evDe(x) { return (x && typeof x === 'object') ? (x.event || '') : String(x || ''); }
function esRpc(e) { return e.endsWith('.request'); }
function esRespuesta(e) { return e.endsWith('.response') || e.endsWith('.failed'); }

// ── Descubrir todos los módulos (1 o 2 niveles: modules/<slug>/ o modules/<familia>/<slug>/)
function descubrir(dir = MODULES_DIR, familia = null, out = []) {
  for (const nombre of fs.readdirSync(dir).sort()) {
    if (nombre === '_template') continue;   // es la plantilla, no un módulo real
    const p = path.join(dir, nombre);
    if (!fs.statSync(p).isDirectory()) continue;
    if (fs.existsSync(path.join(p, 'module.json'))) {
      out.push({ slug: nombre, familia: familia || '(raíz)', dir: p });
    } else if (!familia) {
      descubrir(p, nombre, out);   // 2º nivel (verticales)
    }
  }
  return out;
}

function leer(m) {
  let j = {};
  try { j = JSON.parse(fs.readFileSync(path.join(m.dir, 'module.json'), 'utf8')); } catch (_) { /* manifiesto ilegible */ }
  const bp = path.join(m.dir, `${m.slug}.blueprint.json`);
  let b = null;
  if (fs.existsSync(bp)) { try { b = JSON.parse(fs.readFileSync(bp, 'utf8')); } catch (_) {} }
  return { j, b };
}

// ── Medir UN módulo (devuelve los hechos, sin juzgar todavía)
function medir(m, emisores) {
  const { j, b } = leer(m);
  const subs = arrayDe(j.subscribes).map(evDe);
  const pubs = arrayDe(j.publishes).map(evDe);
  const ops = (b && b.ui && b.ui.ops && typeof b.ui.ops === 'object') ? Object.keys(b.ui.ops) : [];

  // La escucha RELEVANTE para el ADN: eventos de DOMINIO. Se excluyen:
  //  · RPC (.request)           → es una pregunta, no un hecho
  //  · canales de respuesta (.response/.failed) → el que pregunta se suscribe a su respuesta
  //  · topics MQTT (contienen / + #) → no son eventos de dominio
  const escucha = subs.filter(e => !esRpc(e) && !esRespuesta(e) && !/[\/+#]/.test(e));
  // El módulo emite: lo declarado + lo que su código publica de verdad.
  const emite = [...new Set([...pubs.filter(e => !esRespuesta(e)), ...emiteEnCodigo(m.dir)])];
  const rpc = (j.ui_handlers || []).length;
  const tools = (j.tools || []).length;

  // R2 · ¿escribe y calla? Sus métodos RPC cuyas ops son de ESCRITURA.
  const opsEscritura = ops.filter(o => VERBO_ESCRITURA.test(o) && !VERBO_CONSULTA.test(o));
  const opsConsulta = ops.filter(o => VERBO_CONSULTA.test(o));

  // R3 · entradas huérfanas (nadie del repo emite lo que escucha)
  const huerfanas = escucha.filter(e =>
    !EMISORES_CORE.has(e) && !PUERTA_FRONTERA.has(e) && !emisores.has(e));

  // R4 · métodos declarados sin su porqué (sin titulo+descripcion en su op)
  const sinRazon = [];
  if (b && b.ui && b.ui.ops && typeof b.ui.ops === 'object') {
    for (const [k, v] of Object.entries(b.ui.ops)) {
      if (!v || typeof v !== 'object') { sinRazon.push(k); continue; }
      if (!v.titulo || !v.descripcion) sinRazon.push(k);
    }
  }

  return {
    slug: m.slug, familia: m.familia, rpc, tools,
    escucha, emite, ops, opsEscritura, opsConsulta, huerfanas, sinRazon,
    tipo: (b && b.ui && b.ui.type) || null,
    _j: j,
  };
}

// ── Juzgar un módulo medido → hallazgos + veredicto
function juzgar(x) {
  const h = [];

  // R2 · escritor mudo: tiene métodos, no publica NINGÚN evento de dominio.
  if (x.rpc > 0 && x.emite.length === 0) {
    // Excepción: un puerto/conversor puro cuyo único trabajo es traducir y
    // responder (su salida es el .response) — sigue siendo deriva si sus ops
    // son de ESCRITURA sin evento, pero se reporta como tal, no como mudo.
    const esc = x.opsEscritura.length > 0
      ? `escribe (${x.opsEscritura.slice(0, 3).join(', ')}) y NO anuncia el hecho`
      : 'expone métodos y no publica ningún evento de dominio';
    h.push({ regla: 'R2', gravedad: x.opsEscritura.length ? 'deriva' : 'revisar', msg: `${x.rpc} método(s); ${esc}` });
  }

  // R3 · entrada huérfana
  for (const e of x.huerfanas) {
    h.push({ regla: 'R3', gravedad: 'deriva', msg: `escucha '${e}' y NADIE del repo lo emite` });
  }

  // R4 · método declarado sin su porqué
  if (x.sinRazon.length) {
    h.push({ regla: 'R4', gravedad: 'revisar', msg: `${x.sinRazon.length} op(s) sin titulo+descripcion: ${x.sinRazon.slice(0, 3).join(', ')}` });
  }

  return h;
}

// ── El informe
function main() {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  const gate = argv.includes('--gate');
  const iFam = argv.indexOf('--familia');
  const familia = iFam >= 0 ? argv[iFam + 1] : null;
  const objetivo = argv.find(a => a.startsWith('modules/'));

  let mods = descubrir();
  if (objetivo) {
    const rel = objetivo.replace(/\/$/, '');
    mods = mods.filter(m => path.relative(RAIZ, m.dir) === rel);
  } else if (familia) {
    mods = mods.filter(m => m.familia === familia);
  }

  // El universo de EMISORES: lo que publica el repo entero (para R3).
  const emisores = new Set();
  for (const m of descubrir()) {
    const { j } = leer(m);
    for (const e of arrayDe(j.publishes).map(evDe)) if (!esRespuesta(e)) emisores.add(e);
    for (const e of emiteEnCodigo(m.dir)) emisores.add(e);
  }

  const medidos = mods.map(m => medir(m, emisores));
  const filas = medidos.map(x => ({ ...x, hallazgos: juzgar(x) }));

  const conDeriva = filas.filter(f => f.hallazgos.some(h => h.gravedad === 'deriva'));
  const conRevisar = filas.filter(f => f.hallazgos.length && !f.hallazgos.some(h => h.gravedad === 'deriva'));
  const ratio = (f) => f.emite.length ? (f.rpc / f.emite.length).toFixed(1) : (f.rpc > 0 ? '∞' : '0.0');

  if (json) {
    console.log(JSON.stringify({
      total: filas.length, con_deriva: conDeriva.length, a_revisar: conRevisar.length,
      modulos: filas.map(f => ({ slug: f.slug, familia: f.familia, rpc: f.rpc, herramientas: f.tools, eventos: f.emite.length, escucha: f.escucha.length, ratio: ratio(f), hallazgos: f.hallazgos })),
    }, null, 2));
    process.exit(gate && conDeriva.length ? 1 : 0);
  }

  // ── Resumen por familia
  const porFam = {};
  for (const f of filas) {
    porFam[f.familia] = porFam[f.familia] || { n: 0, rpc: 0, ev: 0, der: 0 };
    porFam[f.familia].n++;
    porFam[f.familia].rpc += f.rpc;
    porFam[f.familia].ev += f.emite.length;
    if (f.hallazgos.some(h => h.gravedad === 'deriva')) porFam[f.familia].der++;
  }
  console.log('\n=== ADN · la FORMA de los módulos (informe, no bloquea) ===\n');
  console.log('  familia                        mods   métodos  eventos  ratio   con_deriva');
  console.log('  ' + '-'.repeat(74));
  for (const [fam, v] of Object.entries(porFam).sort((a, b) => (b[1].rpc / Math.max(b[1].ev, 1)) - (a[1].rpc / Math.max(a[1].ev, 1)))) {
    const r = v.ev ? (v.rpc / v.ev).toFixed(1) : (v.rpc > 0 ? '∞' : '0.0');
    console.log(`  ${fam.padEnd(28)} ${String(v.n).padStart(4)} ${String(v.rpc).padStart(8)} ${String(v.ev).padStart(8)} ${r.padStart(6)} ${String(v.der).padStart(11)}`);
  }
  console.log('  ' + '-'.repeat(74));
  console.log(`  ${'TOTAL'.padEnd(28)} ${String(filas.length).padStart(4)} ${String(filas.reduce((a, f) => a + f.rpc, 0)).padStart(8)} ${String(filas.reduce((a, f) => a + f.emite.length, 0)).padStart(8)}`);

  // ── Detalle de los que derivan
  if (conDeriva.length) {
    console.log(`\n=== ⚠️  DERIVA (${conDeriva.length} módulos) ===\n`);
    for (const f of conDeriva.sort((a, b) => b.rpc - a.rpc)) {
      console.log(`  ${f.slug}  [${f.familia}]  métodos=${f.rpc} eventos=${f.emite.length} ratio=${ratio(f)}`);
      for (const h of f.hallazgos) console.log(`      ${h.regla} · ${h.gravedad === 'deriva' ? '⚠️' : '·'} ${h.msg}`);
    }
  }
  // ── Solo a revisar (no bloquean, pero se ven)
  if (conRevisar.length) {
    console.log(`\n=== · A REVISAR (${conRevisar.length} módulos — puede ser legítimo) ===\n`);
    for (const f of conRevisar.slice(0, 15)) {
      for (const h of f.hallazgos) console.log(`  ${f.slug} [${f.familia}] ${h.regla} · ${h.msg}`);
    }
    if (conRevisar.length > 15) console.log(`  … y ${conRevisar.length - 15} más`);
  }

  console.log(`\n=== RESULTADO: ${filas.length} módulos · ${conDeriva.length} con deriva · ${conRevisar.length} a revisar ===`);
  console.log('  (informe: NO bloquea. Con --gate, exit 1 si hay deriva.)\n');
  process.exit(gate && conDeriva.length ? 1 : 0);
}

main();
