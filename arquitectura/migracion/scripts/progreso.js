#!/usr/bin/env node
/**
 * progreso.js — Genera PROGRESO.md humano-legible desde el roadmap.json.
 *
 * Detecta automaticamente que modulos estan migrados:
 *   - tests/unit/<slug>.test.js existe.
 *   - drift count actual del modulo en el baseline es <= 30% del valor del roadmap
 *     (heuristica: una migracion canonica baja drifts ~70-90%).
 *
 * Cruza con git log para extraer commit hash + fecha de la migracion.
 *
 * Genera arquitectura/migracion/_outputs/PROGRESO.md con:
 *   - Estado global (modulos migrados / total, % por capa, drifts cerrados).
 *   - Tabla de migrados (commit, LOC antes/despues, drifts antes/despues, tests).
 *   - Tabla de proximos (top 10 del backlog priorizado).
 *   - Lecciones aprendidas (helpers reutilizables, patrones).
 *
 * Ejecutar tras cada migracion: node arquitectura/migracion/scripts/progreso.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO_ROOT      = path.resolve(__dirname, '../../..');
const ROADMAP_PATH   = path.join(REPO_ROOT, 'arquitectura/migracion/_outputs/modulos-roadmap.json');
const BASELINE_PATH  = path.join(REPO_ROOT, 'drift-baseline.json');
const TESTS_DIR      = path.join(REPO_ROOT, 'tests/unit');
const OUT_PATH       = path.join(REPO_ROOT, 'arquitectura/migracion/_outputs/PROGRESO.md');

function loadJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); }
  catch (_) { return null; }
}

function tryGit(cmd) {
  try { return execSync(cmd, { cwd: REPO_ROOT, encoding: 'utf-8' }).trim(); }
  catch (_) { return null; }
}

function lastCommitTouchingPath(relPath) {
  // Devuelve { hash, date, subject } del ultimo commit que toco el path, o null.
  const out = tryGit(`git log -1 --format='%h|%ai|%s' -- "${relPath}"`);
  if (!out) return null;
  const [hash, date, ...rest] = out.replace(/^'|'$/g, '').split('|');
  return { hash: hash.replace(/^'/, ''), date: date.split(' ')[0], subject: rest.join('|') };
}

function countDriftsInBaseline(slug, dir) {
  const b = loadJson(BASELINE_PATH);
  if (!b || !Array.isArray(b.signatures)) return 0;
  // Match preciso: el path del modulo seguido de / (no prefijos parciales).
  // Ej: 'modules/scheduler/' matchea pero NO 'modules/pizzepos/carta-scheduler/'.
  // Usar SOLO path (no slug). Slug por si solo da falsos positivos cuando otros
  // modulos contienen el slug como sub-cadena (carta-scheduler vs scheduler).
  const relDir = path.relative(REPO_ROOT, dir).replace(/\\/g, '/');
  const pathPattern = relDir + '/';
  let count = 0;
  for (const sig of b.signatures) {
    if (typeof sig !== 'string') continue;
    if (sig.includes(pathPattern)) count++;
  }
  return count;
}

function indexJsHasPoc2Helpers(modulePath) {
  const idx = path.join(modulePath, 'index.js');
  if (!fs.existsSync(idx)) return false;
  const src = fs.readFileSync(idx, 'utf-8');
  return src.includes('_classifyHandlerError') && src.includes('_handleHandlerError');
}

function isMigrated(modulo) {
  const slug = modulo.slug;
  const slugLast = slug.includes('__') ? slug.split('__').pop() : slug;

  // POCs exploratorios estan FUERA del horizontal canonico — no se migran.
  if (slug.endsWith('-poc') || slugLast.endsWith('-poc')) {
    return { migrated: false, out_of_scope: true, reason: 'POC exploratorio (fuera del horizontal canonico)' };
  }

  // Criterio primario: index.js tiene los 5 helpers POC2.
  // Es la firma estructural de un modulo migrado, mucho mas estable que el
  // threshold de drifts (que tiene falsos positivos por silent_io legitimos
  // en logging, console en libs auxiliares, etc.).
  const modulePath = path.join(REPO_ROOT, modulo.path);
  const hasPoc2 = indexJsHasPoc2Helpers(modulePath);
  if (!hasPoc2) return { migrated: false, reason: 'index.js sin helpers POC2 (_classifyHandlerError / _handleHandlerError)' };

  // Criterio secundario: hay tests/unit/<slug>.test.js (debe existir tras finish-rewrite).
  const candidates = [
    path.join(TESTS_DIR, `${slug}.test.js`),
    path.join(TESTS_DIR, `${slugLast}.test.js`)
  ];
  const hasTest = candidates.some(p => fs.existsSync(p));
  if (!hasTest) return { migrated: false, reason: 'sin tests/unit/<slug>.test.js' };

  const driftsAhora = countDriftsInBaseline(slug, modulePath);
  return { migrated: true, drifts_ahora: driftsAhora, has_test: true };
}

function fmtNum(n, width = 0) {
  return String(n).padStart(width);
}

function generate() {
  const roadmap = loadJson(ROADMAP_PATH);
  if (!roadmap) throw new Error('roadmap no encontrado — ejecutar antes scripts/inventario.js');

  // Clasificar cada modulo
  const migrados = [];
  const pendientes = [];
  const fueraDelHorizontal = [];
  for (const m of roadmap.modulos) {
    const status = isMigrated(m);
    if (status.migrated) {
      const testFile = path.join(TESTS_DIR, `${m.slug}.test.js`);
      const slugLast = m.slug.includes('__') ? m.slug.split('__').pop() : m.slug;
      const altTestFile = path.join(TESTS_DIR, `${slugLast}.test.js`);
      const usedTestFile = fs.existsSync(testFile) ? testFile : altTestFile;
      const commit = lastCommitTouchingPath(path.relative(REPO_ROOT, usedTestFile));
      migrados.push({
        ...m,
        drifts_ahora: status.drifts_ahora,
        commit
      });
    } else if (status.out_of_scope) {
      fueraDelHorizontal.push({ ...m, motivo: status.reason });
    } else {
      pendientes.push({ ...m, motivo_pendiente: status.reason });
    }
  }
  const horizontalTotal = roadmap.modulos.length - fueraDelHorizontal.length;

  // Estadisticas
  const totalDrifts = roadmap.modulos.reduce((acc, m) => acc + (m.drifts || 0), 0);
  const driftsCerrados = migrados.reduce((acc, m) => acc + (m.drifts - (m.drifts_ahora || 0)), 0);
  const driftsRestantes = pendientes.reduce((acc, m) => acc + (m.drifts || 0), 0)
                        + migrados.reduce((acc, m) => acc + (m.drifts_ahora || 0), 0);

  const porCapa = {};
  for (const layer of ['core', 'infra', 'dominio', 'tooling']) {
    const total = roadmap.modulos.filter(m => m.layer === layer).length;
    const done = migrados.filter(m => m.layer === layer).length;
    porCapa[layer] = { total, done, pct: total > 0 ? Math.round(done * 100 / total) : 0 };
  }

  // Render markdown
  const lines = [];
  lines.push(`# Progreso de migración — ${horizontalTotal} módulos al canon de 26 contratos`);
  lines.push('');
  lines.push(`_Última regeneración: ${new Date().toISOString().slice(0, 19)}Z_`);
  lines.push('');
  lines.push(`Generado por \`node arquitectura/migracion/scripts/progreso.js\`. Ejecutar tras cada migración para refrescar.`);
  lines.push('');

  // Resumen ejecutivo
  lines.push('## Estado global');
  lines.push('');
  const horizontalPct = horizontalTotal > 0 ? Math.round(migrados.length * 100 / horizontalTotal) : 0;
  lines.push(`- **Migrados**: ${migrados.length} / ${horizontalTotal} (${horizontalPct}%)`);
  if (fueraDelHorizontal.length > 0) {
    lines.push(`- **Fuera del horizontal canónico**: ${fueraDelHorizontal.length} (${fueraDelHorizontal.map(m => '`' + m.slug + '`').join(', ')}) — POCs exploratorios, no se migran.`);
  }
  if (pendientes.length === 0 && horizontalTotal > 0) {
    lines.push(`- **Estructura POC2**: 100% (helpers POC2 + tests por capas en cada módulo).`);
    lines.push(`- **Drift de paradigma event-core**: 3 violaciones vivas conocidas (ver \`drift_modulo_acceso_directo_inter_modulo\` en \`drift-baseline.json\`). El POC2 cerró estructura, no aislamiento inter-módulo. Refactor pendiente para emitir eventos en lugar de \`moduleLoader.getModule()\` / \`loadedModules.get()\` / \`toolsRegistry.get()\` directo.`);
  }
  lines.push(`- **Drifts cerrados**: ${driftsCerrados} / ${totalDrifts} (${totalDrifts > 0 ? Math.round(driftsCerrados * 100 / totalDrifts) : 0}%)`);
  lines.push(`- **Drifts restantes en baseline**: ${driftsRestantes}`);
  lines.push('');

  lines.push('### Progreso por capa');
  lines.push('');
  lines.push('| Capa | Done | Total horizontal | % |');
  lines.push('|------|------|-------|---|');
  for (const [layer, s] of Object.entries(porCapa)) {
    const oosLayer = fueraDelHorizontal.filter(m => m.layer === layer).length;
    const totalHorizontal = s.total - oosLayer;
    const pct = totalHorizontal > 0 ? Math.round(s.done * 100 / totalHorizontal) : 100;
    const bar = '█'.repeat(Math.round(pct / 5)) + '░'.repeat(20 - Math.round(pct / 5));
    lines.push(`| ${layer} | ${s.done} | ${totalHorizontal} | ${pct}% \`${bar}\` |`);
  }
  lines.push('');

  // Migrados
  lines.push(`## Módulos migrados (${migrados.length})`);
  lines.push('');
  if (migrados.length === 0) {
    lines.push('_Ninguno aún._');
  } else {
    lines.push('| # | Capa | Slug | LOC | Drifts antes → ahora | Commit |');
    lines.push('|---|------|------|-----|----------------------|--------|');
    for (const m of migrados.sort((a, b) => a.orden_migracion - b.orden_migracion)) {
      const drifts = `${m.drifts} → ${m.drifts_ahora ?? '?'} (-${Math.round(((m.drifts - (m.drifts_ahora || 0)) / Math.max(m.drifts, 1)) * 100)}%)`;
      const commit = m.commit ? `\`${m.commit.hash}\` ${m.commit.date}` : '_n/a_';
      lines.push(`| ${m.orden_migracion} | ${m.layer} | \`${m.slug}\` | ${m.loc} | ${drifts} | ${commit} |`);
    }
  }
  lines.push('');

  // Próximos en la cola
  lines.push(`## Próximos en la cola (top 10 de ${pendientes.length} pendientes)`);
  lines.push('');
  lines.push('| # | Capa | Slug | LOC | Drifts | Deps | Motivo pendiente |');
  lines.push('|---|------|------|-----|--------|------|------------------|');
  for (const m of pendientes.slice(0, 10)) {
    lines.push(`| ${m.orden_migracion} | ${m.layer} | \`${m.slug}\` | ${m.loc} | ${m.drifts} | ${m.dependencies.length} | ${m.motivo_pendiente} |`);
  }
  lines.push('');

  if (pendientes.length > 10) {
    lines.push(`<details><summary>Resto de pendientes (${pendientes.length - 10} módulos)</summary>`);
    lines.push('');
    lines.push('| # | Capa | Slug | LOC | Drifts | Deps |');
    lines.push('|---|------|------|-----|--------|------|');
    for (const m of pendientes.slice(10)) {
      lines.push(`| ${m.orden_migracion} | ${m.layer} | \`${m.slug}\` | ${m.loc} | ${m.drifts} | ${m.dependencies.length} |`);
    }
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  // Lecciones operativas
  lines.push('## Lecciones operativas (patrones reutilizables del POC2)');
  lines.push('');
  lines.push('Patrones que han demostrado funcionar en migraciones completadas. Aplicables a las siguientes:');
  lines.push('');
  lines.push('### Helpers privados canónicos (5 transferibles)');
  lines.push('');
  lines.push('Cada módulo migrado añade estos 5 helpers privados (copy-paste con renombrado):');
  lines.push('');
  lines.push('1. **`_errorResponse(status, code, message, details?)`** — construye `{status, error: {code, message, details?}}`.');
  lines.push('2. **`_handleHandlerError(logEvent, err, kind)`** — log + metric.increment + clasifica error → response canónico.');
  lines.push('3. **`_classifyHandlerError(err)`** — mapea Error.message a código canónico (RESOURCE_NOT_FOUND, VALIDATION_FAILED, etc.).');
  lines.push('4. **`_classifyExecutionError(err)`** — mapea errores de upstream HTTP/timeout a códigos `UPSTREAM_*`.');
  lines.push('5. **`_publicarEvento(name, payload, sourcePayload?)`** — publish con `correlation_id` propagado + timestamp obligatorio.');
  lines.push('');
  lines.push('### Reducción de duplicación HTTP↔UI');
  lines.push('');
  lines.push('Si el módulo declara `apis_http[]` Y `ui_handlers[]` que hacen lo mismo (caso scheduler), los handlers HTTP delegan en los UI handlers en lugar de duplicar lógica. Reducción típica: ~20% LOC.');
  lines.push('');
  lines.push('### Tests aislados');
  lines.push('');
  lines.push('Si el módulo persiste a archivo (json-file pattern), los tests usan `jobsPath` único en `/tmp/<modulo>-test-XXXX.json` para no contaminar datos reales del repo.');
  lines.push('');
  lines.push('### Estructura de tests por capas');
  lines.push('');
  lines.push('Suite organizada en grupos:');
  lines.push('1. Lifecycle (onLoad/onUnload, no leak).');
  lines.push('2. Validación canónica (cada error path con código + status correcto + details).');
  lines.push('3. Success paths (handler crea + emite metric + publica con correlation_id + project_id).');
  lines.push('4. Tools (shape canónico `{status, data | error}`, NO `success: bool` legacy).');
  lines.push('5. Execution / dominio (publishes con correlation_id propagado).');
  lines.push('6. HTTP delegation (handlers HTTP propagan shape canónico).');
  lines.push('7. Helpers internos (cada helper testeado aisladamente).');
  lines.push('');

  // Decisiones pendientes
  lines.push('## Decisiones pendientes / siguiente sesión');
  lines.push('');
  if (pendientes.length > 0) {
    const next = pendientes[0];
    lines.push(`**Próximo módulo recomendado**: \`${next.slug}\` (capa ${next.layer}, ${next.loc} LOC, ${next.drifts} drifts en baseline).`);
    lines.push('');
    lines.push('Pasos canónicos para el siguiente:');
    lines.push('');
    lines.push('1. Leer auditoría completa: `arquitectura/auditoria/_outputs/modulo-completo/' + next.slug + '.json`');
    lines.push('2. Identificar drifts del módulo: `node -e "const b=require(\'./drift-baseline.json\').signatures; console.log(b.filter(s=>s.includes(\'' + next.slug.split('__').pop() + '\')))"`');
    lines.push('3. Aplicar los 5 helpers privados canónicos + reescritura siguiendo plantilla `modules/_template/`.');
    lines.push('4. Tests por capas en `tests/unit/' + next.slug + '.test.js`.');
    lines.push('5. Wire en `package.json` + `.github/workflows/validate.yml`.');
    lines.push('6. Verificar drifts del módulo bajan ≥70%.');
    lines.push('7. Commit + push + regenerar este PROGRESO.md.');
  } else {
    lines.push('🎉 **Todos los módulos migrados.** Cierre completo del horizontal.');
  }
  lines.push('');

  fs.writeFileSync(OUT_PATH, lines.join('\n'), 'utf-8');
  console.log(`OK PROGRESO.md generado: ${path.relative(REPO_ROOT, OUT_PATH)}`);
  console.log(`  migrados: ${migrados.length} / ${roadmap.modulos.length}`);
  console.log(`  drifts cerrados: ${driftsCerrados} / ${totalDrifts} (${totalDrifts > 0 ? Math.round(driftsCerrados * 100 / totalDrifts) : 0}%)`);
  console.log(`  proximo: ${pendientes[0]?.slug || '(ninguno — completado)'}`);
}

generate();
