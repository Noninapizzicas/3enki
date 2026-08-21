#!/usr/bin/env node
/**
 * ESPEJO DE SKILLS — el vigilante de las dos caras de una misma skill.
 *
 * Una skill vive en DOS sitios: `modules/cosecha/cantera/enki/<n>/SKILL.md`
 * (la que Enki sirve por `cosecha.obtener`) y `.claude/skills/<n>/SKILL.md`
 * (la que carga Claude Code). Son la MISMA skill: deben ser idénticas byte a
 * byte. Cuando se sueltan, cada mitad del sistema ejecuta una versión distinta
 * y nadie se entera — así `esquematizador` acabó sirviendo 54 líneas en la
 * cantera contra 131 en .claude (el 59% del cuerpo, la sección operativa,
 * ausente en la cara que Enki entrega).
 *
 * ESCALERA (como cabecera-check): por defecto TESTIGO — canta y no rompe.
 * Las skills pasadas por `--freno` son ERROR duro: rompen el job.
 *
 *   node scripts/cantera/validate-espejo-skills.js
 *   node scripts/cantera/validate-espejo-skills.js --json
 *   node scripts/cantera/validate-espejo-skills.js --freno esquematizador,diseccionador
 */
'use strict';

const fs = require('fs');
const path = require('path');

const RAIZ    = path.resolve(__dirname, '..', '..');
const CLAUDE  = path.join(RAIZ, '.claude', 'skills');
const CANTERA = path.join(RAIZ, 'modules', 'cosecha', 'cantera', 'enki');

// ── ENCARGO ABIERTO: skills fusionadas a medias, esperando su turno ──
// Se anotan aquí porque aquí es donde se tropiezan. La nota se apaga sola: en
// cuanto las dos caras coinciden, la skill sale de `divergen` y deja de salir.
// Al fusionar una, escríbela en LAS DOS rutas y gradúala al `--freno` del
// workflow (.github/workflows/espejo-skills.yml).
const PENDIENTES = {
  // (vacío — las fusionadas se gradúan al --freno del workflow y salen de aquí)
};

function args() {
  const a = process.argv.slice(2);
  const freno = [];
  const i = a.indexOf('--freno');
  if (i !== -1 && a[i + 1]) freno.push(...a[i + 1].split(',').map(s => s.trim()).filter(Boolean));
  return { json: a.includes('--json'), freno };
}

function lineas(p) {
  try { return fs.readFileSync(p, 'utf8').split('\n').length; } catch (_) { return 0; }
}

function comparar() {
  const gemelas = [], divergen = [], soloClaude = [], soloCantera = [];
  const listar = d => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true })
    .filter(e => e.isDirectory() && fs.existsSync(path.join(d, e.name, 'SKILL.md')))
    .map(e => e.name) : []);

  const enClaude  = listar(CLAUDE);
  const enCantera = new Set(listar(CANTERA));

  for (const n of enClaude) {
    const a = path.join(CLAUDE, n, 'SKILL.md');
    const b = path.join(CANTERA, n, 'SKILL.md');
    if (!enCantera.has(n)) { soloClaude.push({ skill: n, lineas_claude: lineas(a) }); continue; }
    const ca = fs.readFileSync(a), cb = fs.readFileSync(b);
    if (ca.equals(cb)) gemelas.push(n);
    else divergen.push({ skill: n, lineas_claude: lineas(a), lineas_cantera: lineas(b), delta: lineas(a) - lineas(b) });
  }
  for (const n of enCantera) if (!enClaude.includes(n)) soloCantera.push({ skill: n, lineas_cantera: lineas(path.join(CANTERA, n, 'SKILL.md')) });

  divergen.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
  return { gemelas: gemelas.length, divergen, solo_claude: soloClaude, solo_cantera: soloCantera };
}

// ── FRENTE 2: el FRONTMATTER de cada SKILL.md ──
// La clase de fallo que barrimos: `description:` sin comillas con un ": " dentro
// ("la POLÍTICA: el pseudocódigo", "Referencia: carta-marketing"). YAML lo lee
// como un mapa anidado y revienta — la skill queda sin metadato para quien lo
// parsee. El chequeo es DETERMINISTA y sin dependencias: mira la forma del valor
// de cada clave. Si el paquete `yaml` está instalado (lo está en CI), se usa
// además como segunda opinión.
let YAML = null;
try { YAML = require('yaml'); } catch (_) { try { YAML = require('js-yaml'); } catch (_) { /* sin parser: basta el lint */ } }

function frontmatter(texto) {
  if (!texto.startsWith('---\n')) return null;
  const fin = texto.indexOf('\n---', 3);
  return fin === -1 ? null : texto.slice(4, fin + 1);
}

// Devuelve los problemas de UN bloque de frontmatter (vacío = sano).
function revisarFrontmatter(texto) {
  const fm = frontmatter(texto);
  if (fm === null) return ['sin frontmatter delimitado por --- al principio'];

  const problemas = [];
  const lineas = fm.split('\n');
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i];
    if (!l.trim() || /^\s/.test(l) || l.trimStart().startsWith('#')) continue;  // continuación o comentario
    const m = /^([A-Za-z_][\w-]*):(.*)$/.exec(l);
    if (!m) { problemas.push(`línea ${i + 1}: no es \`clave: valor\` → ${l.slice(0, 48)}`); continue; }
    const [, clave, resto] = m;
    const v = resto.trim();
    if (v === '' || v.startsWith('>') || v.startsWith('|')) continue;           // escalar de bloque: sano
    if (v.startsWith('"'))  { if (!v.endsWith('"')  || v.length < 2) problemas.push(`${clave}: comilla doble sin cerrar`); continue; }
    if (v.startsWith("'"))  { if (!v.endsWith("'")  || v.length < 2) problemas.push(`${clave}: comilla simple sin cerrar`); continue; }
    if (v.startsWith('['))  { if (!v.endsWith(']')) problemas.push(`${clave}: lista sin cerrar`); continue; }
    if (v.startsWith('{'))  { if (!v.endsWith('}')) problemas.push(`${clave}: mapa sin cerrar`); continue; }
    // Escalar PLANO: aquí vive el defecto.
    if (v.includes(': ') || v.endsWith(':')) {
      problemas.push(`${clave}: valor plano con ": " dentro → YAML lo lee como mapa. Usa un escalar de bloque (>-) o comillas`);
    }
  }
  // Segunda opinión del parser real, si está disponible.
  if (!problemas.length && YAML) {
    try { (YAML.parse || YAML.load).call(YAML, fm); }
    catch (e) { problemas.push(`el parser YAML lo rechaza: ${String(e.message).split('\n')[0]}`); }
  }
  return problemas;
}

function revisarTodoElFrontmatter() {
  const rotas = [];
  const raices = [CLAUDE, ...listarCanteras()];
  for (const raiz of raices) {
    if (!fs.existsSync(raiz)) continue;
    for (const e of fs.readdirSync(raiz, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const f = path.join(raiz, e.name, 'SKILL.md');
      if (!fs.existsSync(f)) continue;
      const problemas = revisarFrontmatter(fs.readFileSync(f, 'utf8'));
      if (problemas.length) rotas.push({ skill: e.name, archivo: path.relative(RAIZ, f), problemas });
    }
  }
  return rotas;
}

// Todas las canteras (enki, hermes, hoodini, usuario…), no solo la de enki.
function listarCanteras() {
  const base = path.join(RAIZ, 'modules', 'cosecha', 'cantera');
  if (!fs.existsSync(base)) return [];
  return fs.readdirSync(base, { withFileTypes: true })
    .filter(e => e.isDirectory()).map(e => path.join(base, e.name));
}

function main() {
  const { json, freno } = args();
  const r = comparar();
  const rotas = r.divergen.filter(d => freno.includes(d.skill));
  // El frontmatter roto es ERROR SIEMPRE, sin escalera: hoy el corpus está a
  // cero y una skill sin metadato legible no sirve a nadie que la parsee.
  const frontmatterRoto = revisarTodoElFrontmatter();

  if (json) {
    const pendientes = r.divergen.filter(d => PENDIENTES[d.skill])
      .map(d => ({ skill: d.skill, nota: PENDIENTES[d.skill] }));
    console.log(JSON.stringify({ ...r, freno, rotas, pendientes, frontmatter_roto: frontmatterRoto }, null, 2));
  } else {
    console.log(`\n📐 espejo de skills — ${r.gemelas} idénticas · ${r.divergen.length} divergen · ${r.solo_claude.length} solo en .claude · ${r.solo_cantera.length} solo en cantera\n`);
    for (const d of r.divergen) {
      const marca = freno.includes(d.skill) ? '✗ FRENO' : '⚠ testigo';
      console.log(`  ${marca}  ${d.skill.padEnd(28)} .claude=${String(d.lineas_claude).padStart(4)}  cantera=${String(d.lineas_cantera).padStart(4)}  (Δ${d.delta > 0 ? '+' : ''}${d.delta})`);
    }
    const anotadas = r.divergen.filter(d => PENDIENTES[d.skill]);
    if (anotadas.length) {
      console.log('\n  📌 Encargo abierto:');
      for (const d of anotadas) console.log(`     ${d.skill} — ${PENDIENTES[d.skill]}`);
    }
    if (r.divergen.length) {
      console.log('\n  Las dos caras son la MISMA skill: escribe la versión buena en las dos rutas.');
      console.log('  Fusiona cuerpo + frontmatter (la cantera necesita fuente · dominio · lente_*) y copia byte a byte.\n');
    } else {
      console.log('  ✓ Las dos caras van al paso.\n');
    }

    if (frontmatterRoto.length) {
      console.log(`  ✗ FRONTMATTER — ${frontmatterRoto.length} skill(s) con metadato que no se puede leer:\n`);
      for (const f of frontmatterRoto) {
        console.log(`     ${f.archivo}`);
        for (const p of f.problemas) console.log(`        · ${p}`);
      }
      console.log('\n     Un valor largo se escribe como escalar de bloque:\n');
      console.log('        description: >-');
      console.log('          primera línea del texto');
      console.log('          continúa aquí\n');
    } else {
      console.log('  ✓ El frontmatter de todas las skills se lee.\n');
    }
  }
  process.exit(rotas.length || frontmatterRoto.length ? 1 : 0);
}

// Ejecuta al invocarse; al requerirse, expone sus piezas para poder probarlas.
if (require.main === module) main();
module.exports = { revisarFrontmatter, revisarTodoElFrontmatter, comparar };
