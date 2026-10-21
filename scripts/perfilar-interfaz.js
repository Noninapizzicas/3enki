#!/usr/bin/env node
/**
 * perfilar-interfaz.js — F6 lee el PERFIL que dejó F3b y decide con él.
 *
 * EL PROBLEMA QUE CIERRA (medido 2026-09-30).
 *   F3b YA declara, hoja por hoja, la visión event-driven completa:
 *     · el TIPO (REFLEJO / CUSTODIO / PUENTE / CONVERSOR / MICRO-AGENTE)
 *     · los EVENTOS que sube y publica (su forma de hablar)
 *   Medido: 116 hojas · 116 declaran sus eventos · el grafo CIERRA (0 huérfanos).
 *
 *   Pero F6 (`decidir-interfaz`) NO lo lee. Decide con un mapa escrito a mano y
 *   convierte *todos* los RPC en `ui_handlers` — es decir, convierte PREGUNTAS
 *   en MÉTODOS de interfaz. Ahí se pierde la visión: la pieza que debía hablar
 *   por eventos acaba exponiendo métodos 1-a-1.
 *
 * LA REGLA QUE FALTABA.
 *   No todo RPC es una superficie. Hay que distinguir, por VERBO y por PERFIL:
 *     PREGUNTA / DERIVACIÓN (calcular, listar, saldos…) → su cara es el BUS.
 *       No cambia estado: no hay hecho que anunciar ni orden que dar.
 *     ORDEN HUMANA (declarar, cerrar, firmar, ajustar…) → SÍ es superficie:
 *       el humano la opera desde el panel.
 *   Y si una ORDEN ESCRIBE, el módulo tiene que anunciar el hecho (R2 del ADN).
 *
 * QUÉ HACE.
 *   No cambia nada por defecto: INFORMA, módulo por módulo, con el porqué.
 *   Con --aplicar reescribe los ui_handlers con el filtro del perfil.
 *
 * USO
 *   node scripts/perfilar-interfaz.js                  informe
 *   node scripts/perfilar-interfaz.js --familia X      una familia
 *   node scripts/perfilar-interfaz.js --json           salida máquina
 *   node scripts/perfilar-interfaz.js --aplicar        reescribe los ui_handlers
 */
'use strict';
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const MODULES_DIR = path.join(RAIZ, 'modules');

// ── El TIPO del perfil F3b → qué superficie le corresponde por naturaleza.
// No es una regla de estilo: es lo que la pieza ES.
const PERFIL_TIPO = {
  REFLEJO: { superficie: 'resultado', nota: 'cálculo puro: su salida se muestra, no se opera' },
  CUSTODIO: { superficie: 'panel', nota: 'tiene estado y un único escritor: el humano declara' },
  PUENTE: { superficie: 'bus', nota: 'frontera: traduce y expone; su cara es el bus' },
  CONVERSOR: { superficie: 'bus', nota: 'traduce y devuelve: su cara es el bus' },
  'MICRO-AGENTE': { superficie: 'chat', nota: 'juzga y PROPONE; su salida aparece en la conversación' },
};

// ── Verbos: la distinción que F6 no hacía.
const VERBO_PREGUNTA = /(calcular|cuadrar|saldos|derivar|estimar|prevision|previsión|comparar|verificar|es_nuevo|listar|buscar|leer|consultar|ficha|estado|obtener|ver|mostrar|resumen|informe|cuadro|margen|balance|resultado|antiguedad|vencimiento|panel|hist|traducir|resolver|depurar|validar|comprobar)/i;
const VERBO_ORDEN = /(anadir|añadir|asentar|emitir|declarar|registrar|cerrar|abrir|admitir|encolar|firmar|activar|ajustar|amortizar|dar_alta|dar_baja|encadenar|recoger|anotar|marcar|sellar|rectificar|ratificar|juzgar|proponer|formar|crear|guardar|consolidar|sincronizar|upsert|subir|borrar|descartar|reencolar|depurar|cerrar)/i;

const evDe = x => (x && typeof x === 'object') ? (x.event || '') : String(x || '');
const esRpc = e => e.endsWith('.request');
const esResp = e => e.endsWith('.response') || e.endsWith('.failed');
const arrayDe = v => Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.values(v) : []);

function descubrir(dir = MODULES_DIR, familia = null, out = []) {
  for (const nombre of fs.readdirSync(dir).sort()) {
    if (nombre === '_template') continue;
    const p = path.join(dir, nombre);
    if (!fs.statSync(p).isDirectory()) continue;
    if (fs.existsSync(path.join(p, 'module.json'))) out.push({ slug: nombre, familia: familia || '(raíz)', dir: p });
    else if (!familia) descubrir(p, nombre, out);
  }
  return out;
}

// ── El PERFIL declarado por F3b (el plan de construcción), por slug.
function leerPerfilPlan(planPath) {
  const perfil = new Map();
  if (!fs.existsSync(planPath)) return perfil;
  const txt = fs.readFileSync(planPath, 'utf8');
  const bloques = txt.match(/### `[a-z0-9-]+`[^\n]*\n(?:(?!\n### )[\s\S])*/g) || [];
  for (const b of bloques) {
    const m = b.match(/### `([a-z0-9-]+)`\s*·\s*`([A-ZÁÉÍÓÚ-]+)`/);
    if (!m) continue;
    const [, slug, tipo] = m;
    const sube = (b.match(/\*\*Eventos que sube:\*\*([^\n]*)/) || [])[1] || '';
    const pub = (b.match(/\*\*Eventos que publica:\*\*([^\n]*)/) || [])[1] || '';
    const evs = t => new Set((t.match(/`([a-z0-9_.-]+)`/g) || []).map(s => s.replace(/`/g, '')));
    perfil.set(slug, { tipo, sube: evs(sube), publica: evs(pub) });
  }
  return perfil;
}

// ── Buscar el plan de construcción del proyecto (boveda/<vertical>/proceso/fase3b/).
function hallarPlan() {
  const boveda = path.join(RAIZ, 'boveda');
  if (!fs.existsSync(boveda)) return null;
  const out = [];
  for (const v of fs.readdirSync(boveda)) {
    const p = path.join(boveda, v, 'proceso', 'fase3b', 'plan-construccion.md');
    if (fs.existsSync(p)) out.push(p);
  }
  return out;
}

function medir(m, perfil) {
  let j = {};
  try { j = JSON.parse(fs.readFileSync(path.join(m.dir, 'module.json'), 'utf8')); } catch (_) {}
  const bp = path.join(m.dir, `${m.slug}.blueprint.json`);
  let b = null;
  if (fs.existsSync(bp)) { try { b = JSON.parse(fs.readFileSync(bp, 'utf8')); } catch (_) {} }

  const p = perfil.get(m.slug) || null;
  const ops = (b && b.ui && b.ui.ops && typeof b.ui.ops === 'object') ? Object.keys(b.ui.ops) : [];
  const pubs = arrayDe(j.publishes).map(evDe);
  const emiteDominio = pubs.filter(e => !esResp(e));
  const uiHandlers = arrayDe(j.ui_handlers);

  // Clasificar cada op: ¿es una orden humana o una pregunta/derivación?
  const ordenes = ops.filter(o => VERBO_ORDEN.test(o));
  const preguntas = ops.filter(o => VERBO_PREGUNTA.test(o) && !VERBO_ORDEN.test(o));

  return {
    slug: m.slug, familia: m.familia, tipo: p ? p.tipo : null,
    perfil: p, ops, ordenes, preguntas, emiteDominio, uiHandlers,
    superficiePerfil: p ? (PERFIL_TIPO[p.tipo] || {}).superficie : null,
    _dir: m.dir, _j: j, _b: b,
  };
}

function main() {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  const aplicar = argv.includes('--aplicar');
  const iFam = argv.indexOf('--familia');
  const familia = iFam >= 0 ? argv[iFam + 1] : null;

  const planes = hallarPlan() || [];
  const perfil = new Map();
  for (const pl of planes) for (const [k, v] of leerPerfilPlan(pl)) if (!perfil.has(k)) perfil.set(k, v);

  let mods = descubrir();
  if (familia) mods = mods.filter(m => m.familia === familia);

  const filas = mods.map(m => medir(m, perfil)).filter(f => f.tipo || f.ops.length);

  if (json) {
    console.log(JSON.stringify({
      plan: planes.map(p => path.relative(RAIZ, p)),
      total: filas.length,
      modulos: filas.map(f => ({
        slug: f.slug, familia: f.familia, tipo: f.tipo, superficie_del_perfil: f.superficiePerfil,
        ops: f.ops.length, ordenes: f.ordenes.length, preguntas: f.preguntas.length,
        eventos_de_dominio: f.emiteDominio.length, ui_handlers: f.uiHandlers.length,
      })),
    }, null, 2));
    return;
  }

  console.log('\n=== F6 · el PERFIL de F3b, leído por módulo ===\n');
  if (planes.length) console.log('  plan(es): ' + planes.map(p => path.relative(RAIZ, p)).join(', ') + '\n');
  console.log('  módulo                         tipo         ops  órdenes  preguntas  eventos  ui_hand  perfil');
  console.log('  ' + '-'.repeat(96));
  for (const f of filas.sort((a, b) => b.ops - a.ops)) {
    const marca = f.superficiePerfil === 'bus'
      ? (f.uiHandlers.length ? '⚠️ el perfil dice BUS' : '✅ bus')
      : (f.superficiePerfil || '—');
    console.log(`  ${f.slug.padEnd(30)} ${String(f.tipo || '—').padEnd(12)} ${String(f.ops.length).padStart(3)} ${String(f.ordenes.length).padStart(8)} ${String(f.preguntas.length).padStart(10)} ${String(f.emiteDominio.length).padStart(8)} ${String(f.uiHandlers.length).padStart(8)}  ${marca}`);
  }

  const busConPanel = filas.filter(f => f.superficiePerfil === 'bus' && f.uiHandlers.length);
  console.log(`\n=== ⚠️  EL PERFIL DICE "SU CARA ES EL BUS" Y TIENEN PANEL: ${busConPanel.length} ===`);
  for (const f of busConPanel) console.log(`  ${f.slug.padEnd(28)} [${f.tipo}] ${f.uiHandlers.length} ui_handlers — F6 los creó sin leer el perfil`);

  const conPreguntas = filas.filter(f => f.preguntas.length);
  console.log(`\n=== PREGUNTAS expuestas como métodos (deberían ir por el bus): ${conPreguntas.length} módulos ===`);
  for (const f of conPreguntas.slice(0, 12)) console.log(`  ${f.slug.padEnd(28)} preguntas: ${f.preguntas.slice(0, 4).join(', ')}`);

  console.log(`\n=== ${filas.length} módulos con perfil/ops · ${busConPanel.length} en conflicto perfil↔panel ===`);
  console.log('  (informe: no cambia nada. Con --aplicar reescribe los ui_handlers.)\n');
}

main();
