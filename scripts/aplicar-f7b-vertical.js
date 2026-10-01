#!/usr/bin/env node
/**
 * aplicar-f7b-vertical.js — ejecuta la FASE 7b (ENSAMBLAJE) sobre una vertical
 * cuyo trabajo vive en la BÓVEDA (boveda/<vertical>/proceso/), no en el storage
 * de un proyecto del pipeline.
 *
 * F7b es GENÉRICO (vive en modules/proceso-negocio). Esto es UNA EJECUCIÓN:
 *   entrada  boveda/<vertical>/proceso/fase3b/plan-construccion.md   (el plan)
 *   realidad modules/<slug>/module.json                              (lo escrito)
 *   salida   boveda/<vertical>/proceso/fase7b/ensamblaje.json        (el informe)
 *
 * Determinista, sin LLM: cruza dos listas y clasifica las divergencias.
 * Uso: node scripts/aplicar-f7b-vertical.js <vertical> [--repo <dir>]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const vertical = process.argv[2];
if (!vertical) {
  console.error('uso: node scripts/aplicar-f7b-vertical.js <vertical> [--repo <dir>]');
  process.exit(2);
}
const repoArg = process.argv.indexOf('--repo');
const REPO = repoArg !== -1 ? process.argv[repoArg + 1] : path.resolve(__dirname, '..');

const PLAN_PATH = path.join(REPO, 'boveda', vertical, 'proceso', 'fase3b', 'plan-construccion.md');
const OUT_DIR = path.join(REPO, 'boveda', vertical, 'proceso', 'fase7b');

// Resuelve un slug a su directorio de módulo: primero la vertical, luego el sistema.
// Mismos dos sitios que usa el orquestador (_buscarModulo), para no divergir.
function buscarModulo(slug) {
  for (const c of [path.join(REPO, 'modules', vertical, slug), path.join(REPO, 'modules', slug)]) {
    if (fs.existsSync(path.join(c, 'module.json'))) return c;
  }
  return null;
}

function main() {
  if (!fs.existsSync(PLAN_PATH)) {
    console.error(`no existe el plan: ${PLAN_PATH}`);
    process.exit(2);
  }
  const md = fs.readFileSync(PLAN_PATH, 'utf8');
  const m = md.match(/```json enki-plan\s*([\s\S]*?)```/);
  if (!m) { console.error('el plan no tiene bloque ```json enki-plan```'); process.exit(2); }
  const plan = JSON.parse(m[1]);

  // La realidad escrita: los módulos que el plan declara, leídos de disco.
  const real = {};
  const sinModulo = [];
  for (const h of (plan.hojas || [])) {
    if (!h || !h.slug) continue;
    const dir = buscarModulo(h.slug);
    if (!dir) { sinModulo.push(h.slug); continue; }
    let mj = {};
    try { mj = JSON.parse(fs.readFileSync(path.join(dir, 'module.json'), 'utf8')); } catch (_) {}
    real[h.slug] = {
      existe: true,
      subscribes: mj.subscribes || mj.events?.subscribes || [],
      publishes: mj.publishes || mj.events?.publishes || []
    };
  }

  const { Ensamblaje } = require(path.join(REPO, 'modules', 'proceso-negocio', 'ensamblaje.js'));
  const informe = new Ensamblaje(plan, real).recomponer();

  const salida = {
    ...informe,
    vertical,
    origen: path.relative(REPO, PLAN_PATH),
    hojas_sin_modulo: sinModulo,
    aplicado_el: new Date().toISOString(),
    nota: 'F7b (ENSAMBLAJE) aplicado a la vertical. Determinista: cruza el plan (F3b) con los módulos escritos.'
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'ensamblaje.json'), JSON.stringify(salida, null, 2) + '\n');

  // Resumen legible (para leer sin abrir el JSON).
  const l = [];
  l.push(`# F7b · ENSAMBLAJE — vertical \`${vertical}\``);
  l.push('');
  l.push(`> Generado por \`scripts/aplicar-f7b-vertical.js\` el ${salida.aplicado_el}. Determinista, sin LLM.`);
  l.push('');
  l.push(`**ensamblado**: \`${informe.ensamblado}\``);
  l.push('');
  l.push('| métrica | valor |');
  l.push('|---|---|');
  l.push(`| hojas del plan | ${informe.total_hojas} |`);
  l.push(`| hojas escritas | ${informe.hojas_escritas} |`);
  l.push(`| sin módulo | ${sinModulo.length} |`);
  l.push(`| hojas divergentes | ${informe.hojas_divergentes} |`);
  l.push(`| conexiones rotas | ${informe.conexiones_rotas_count} |`);
  l.push(`| · falta cablear | ${informe.conexiones_falta_cablear} |`);
  l.push(`| · hoja no escrita | ${informe.conexiones_hoja_no_escrita} |`);
  l.push(`| · sobra el publish | ${informe.conexiones_sobra_el_publish} |`);
  l.push('');
  if ((informe.trabajo || []).length) {
    l.push('## Trabajo accionable');
    l.push('');
    for (const t of informe.trabajo) l.push(`- enganchar \`${t.evento}\` en ${t.cablear_en.join(', ')}`);
    l.push('');
  }
  l.push('## Hojas divergentes');
  l.push('');
  for (const h of (informe.hojas || []).filter(x => x.divergente)) {
    const f = [];
    if (h.falta_subscribes?.length) f.push(`falta escuchar ${h.falta_subscribes.join(', ')}`);
    if (h.falta_publishes?.length) f.push(`falta publicar ${h.falta_publishes.join(', ')}`);
    if (h.extra_subscribes?.length) f.push(`escucha de más ${h.extra_subscribes.join(', ')}`);
    if (h.extra_publishes?.length) f.push(`publica de más ${h.extra_publishes.join(', ')}`);
    if (!h.escrita) f.push('NO escrita');
    l.push(`- \`${h.slug}\`: ${f.join(' · ') || 'divergente'}`);
  }
  l.push('');
  fs.writeFileSync(path.join(OUT_DIR, 'ensamblaje.md'), l.join('\n'));

  console.log(`F7b aplicado a la vertical '${vertical}'`);
  console.log(`  ensamblado       : ${informe.ensamblado}`);
  console.log(`  hojas            : ${informe.total_hojas} (escritas ${informe.hojas_escritas}, sin módulo ${sinModulo.length})`);
  console.log(`  divergentes      : ${informe.hojas_divergentes}`);
  console.log(`  conexiones rotas : ${informe.conexiones_rotas_count}`);
  console.log(`    falta cablear  : ${informe.conexiones_falta_cablear}`);
  console.log(`    hoja no escrita: ${informe.conexiones_hoja_no_escrita}`);
  console.log(`    sobra publish  : ${informe.conexiones_sobra_el_publish}`);
  console.log(`  trabajo          : ${(informe.trabajo || []).length}`);
  for (const t of (informe.trabajo || [])) console.log(`    - ${t.evento} -> ${t.cablear_en.join(', ')}`);
  console.log(`  escrito en       : ${path.relative(REPO, OUT_DIR)}/ensamblaje.{json,md}`);
  process.exit(informe.ensamblado ? 0 : 1);
}

main();
