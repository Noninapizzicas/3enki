#!/usr/bin/env node
/**
 * validate-all — Ejecuta los 8 validators arquitectonicos en serie.
 *
 * Uso:
 *   node scripts/validate-all.js                     # solo schema (rapido, ~1s)
 *   node scripts/validate-all.js --check-system      # + cross-checks (lento)
 *   node scripts/validate-all.js --check-system --baseline ./drift-baseline.json
 *                                                    # CI: falla SOLO si hay drift nuevo
 *   node scripts/validate-all.js --check-system --update-baseline
 *                                                    # regenera el baseline (capturar deuda actual)
 *
 * Modo CI:
 *   - Sin --baseline: cualquier finding (warning/error) hace exit 1
 *   - Con --baseline: solo findings NO presentes en el baseline hacen exit 1
 *   - Con --update-baseline: escribe drift-baseline.json con los findings
 *     actuales y exit 0
 *
 * El baseline captura la deuda historica como aceptada para que CI no falle
 * por los ~3000 drifts existentes; solo falla por drift nuevo introducido
 * por un commit.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');

const VALIDATORS = [
  { id: 'naming',        file: 'arquitectura/convenciones/_validators/naming.validate.js' },
  { id: 'glossary',      file: 'arquitectura/convenciones/_validators/glossary.validate.js' },
  { id: 'events',        file: 'arquitectura/decisiones/_validators/events.validate.js' },
  { id: 'lifecycle',     file: 'arquitectura/decisiones/_validators/lifecycle.validate.js' },
  { id: 'observability', file: 'arquitectura/decisiones/_validators/observability.validate.js' },
  { id: 'errors',        file: 'arquitectura/decisiones/_validators/errors.validate.js' },
  { id: 'persistence',   file: 'arquitectura/decisiones/_validators/persistence.validate.js' },
  { id: 'http',          file: 'arquitectura/decisiones/_validators/http.validate.js' },
  { id: 'chat-flow',     file: 'arquitectura/decisiones/_validators/chat-flow.validate.js' },
  { id: 'agent-flow',    file: 'arquitectura/decisiones/_validators/agent-flow.validate.js' },
  { id: 'llm-flow',      file: 'arquitectura/decisiones/_validators/llm-flow.validate.js' },
  { id: 'tools',         file: 'arquitectura/decisiones/_validators/tools.validate.js' },
  { id: 'agents-config', file: 'arquitectura/decisiones/_validators/agents-config.validate.js' },
  { id: 'module-rewrite', file: 'arquitectura/decisiones/_validators/module-rewrite.validate.js' },
  { id: 'frontend',      file: 'arquitectura/decisiones/_validators/frontend.validate.js' },
  { id: 'security',      file: 'arquitectura/decisiones/_validators/security.validate.js' },
  { id: 'testing',       file: 'arquitectura/decisiones/_validators/testing.validate.js' },
  { id: 'multi-tenancy', file: 'arquitectura/decisiones/_validators/multi-tenancy.validate.js' },
  { id: 'documentation', file: 'arquitectura/decisiones/_validators/documentation.validate.js' },
  { id: 'versionado',    file: 'arquitectura/decisiones/_validators/versionado.validate.js' },
  { id: 'deployment',    file: 'arquitectura/decisiones/_validators/deployment.validate.js' },
  { id: 'module-loading',file: 'arquitectura/decisiones/_validators/module-loading.validate.js' },
  { id: 'modulo-clase-robusta', file: 'arquitectura/decisiones/_validators/modulo-clase-robusta.validate.js' },
  { id: 'bus-transport', file: 'arquitectura/decisiones/_validators/bus-transport.validate.js' },
  { id: 'scheduling',    file: 'arquitectura/decisiones/_validators/scheduling.validate.js' },
  { id: 'resilience',    file: 'arquitectura/decisiones/_validators/resilience.validate.js' },
  { id: 'subsistema-carta', file: 'arquitectura/decisiones/_validators/subsistema-carta.validate.js' },
  { id: 'subsistema-recetario', file: 'arquitectura/decisiones/_validators/subsistema-recetario.validate.js' },
  { id: 'cajones-context-partitioning', file: 'arquitectura/decisiones/_validators/cajones-context-partitioning.validate.js' },
  { id: 'llm-runtime-discipline', file: 'arquitectura/decisiones/_validators/llm-runtime-discipline.validate.js' },
  { id: 'blueprint-eventos-conscientes', file: 'arquitectura/decisiones/_validators/blueprint-eventos-conscientes.validate.js' },
  { id: 'dinamica-de-trabajo-companero', file: 'arquitectura/decisiones/_validators/dinamica-de-trabajo-companero.validate.js' },
  { id: 'disciplina-llm-operador', file: 'arquitectura/decisiones/_validators/disciplina-llm-operador.validate.js' },
  { id: 'project-identity', file: 'arquitectura/decisiones/_validators/project-identity.validate.js' },
  { id: 'pseudocodigo-estilo', file: 'arquitectura/decisiones/_validators/pseudocodigo-estilo.validate.js' },
  { id: 'project-feature-blueprints', file: 'arquitectura/decisiones/_validators/project-feature-blueprints.validate.js' },
  { id: 'subsistema-tienda', file: 'arquitectura/decisiones/_validators/subsistema-tienda.validate.js' },
  { id: 'storage-layout', file: 'arquitectura/decisiones/_validators/storage-layout.validate.js' },
  { id: 'ui-frontend-blueprint', file: 'arquitectura/decisiones/_validators/ui-frontend-blueprint.validate.js' }
];

const RED   = '\x1b[31m';
const GREEN = '\x1b[32m';
const YEL   = '\x1b[33m';
const CYAN  = '\x1b[36m';
const BOLD  = '\x1b[1m';
const RST   = '\x1b[0m';

function stripAnsi(s) { return s.replace(/\x1b\[[0-9;]*m/g, ''); }

/**
 * Parsea la salida de un validator y extrae los findings.
 * Cada validator imprime lineas tipo:
 *   ✗ drift_xxx: <slug> <path>:<line> — <descripcion>     (error)
 *   ! drift_xxx: <slug> <path>:<line> — <descripcion>     (warning)
 *   i drift_xxx: <slug> <path>:<line> — <descripcion>     (info)
 *
 * Devuelve array de findings normalizados.
 */
function parseFindings(validatorId, stdout) {
  const findings = [];
  const lines = stripAnsi(stdout).split('\n');
  for (const line of lines) {
    const m = line.match(/^\s*([✗!i])\s+(\w+):\s+(.*)$/);
    if (!m) continue;
    const sym = m[1];
    const driftId = m[2];
    const detail  = m[3].trim();
    const severity = sym === '✗' ? 'error' : sym === '!' ? 'warning' : 'info';
    findings.push({
      validator: validatorId,
      severity,
      drift_id:  driftId,
      detail,
      // signature para baseline matching: validator + drift_id + detail
      signature: `${validatorId}|${driftId}|${detail}`
    });
  }
  return findings;
}

function runValidator(v, args) {
  const res = spawnSync('node', [path.join(REPO_ROOT, v.file), ...args], { encoding: 'utf-8', cwd: REPO_ROOT });
  return {
    id:       v.id,
    exit:     res.status ?? -1,
    stdout:   res.stdout || '',
    stderr:   res.stderr || '',
    findings: parseFindings(v.id, res.stdout || '')
  };
}

function loadBaseline(p) {
  try {
    const raw = fs.readFileSync(p, 'utf-8');
    const data = JSON.parse(raw);
    return new Set(data.signatures || []);
  } catch (e) {
    if (e.code === 'ENOENT') return new Set();
    throw e;
  }
}

function writeBaseline(p, allFindings) {
  const signatures = Array.from(new Set(allFindings.map(f => f.signature))).sort();
  const summary = {
    generated_at: new Date().toISOString(),
    total:        signatures.length,
    by_validator: {},
    by_severity:  {},
    signatures
  };
  for (const f of allFindings) {
    summary.by_validator[f.validator] = (summary.by_validator[f.validator] || 0) + 1;
    summary.by_severity[f.severity]   = (summary.by_severity[f.severity]   || 0) + 1;
  }
  fs.writeFileSync(p, JSON.stringify(summary, null, 2) + '\n');
}

function main() {
  const args = process.argv.slice(2);
  const checkSystem    = args.includes('--check-system');
  const updateBaseline = args.includes('--update-baseline');
  const baselineIdx    = args.indexOf('--baseline');
  const baselinePath   = baselineIdx >= 0 ? path.resolve(args[baselineIdx + 1]) : null;
  const passArgs       = checkSystem ? ['--check-system'] : [];

  console.log(`${BOLD}=== validate-all (${VALIDATORS.length} validators) ===${RST}`);
  if (checkSystem)    console.log(`${CYAN}mode: --check-system (cross-system findings habilitados)${RST}`);
  if (baselinePath)   console.log(`${CYAN}baseline: ${baselinePath}${RST}`);
  if (updateBaseline) console.log(`${CYAN}--update-baseline: regenerando baseline tras esta corrida${RST}`);
  console.log('');

  const results = [];
  let schemaFailures = 0;

  for (const v of VALIDATORS) {
    process.stdout.write(`  running ${v.id.padEnd(15)} ... `);
    const r = runValidator(v, passArgs);
    results.push(r);
    if (r.exit !== 0 && r.findings.length === 0) {
      // Probable schema fail (validator imprime FAIL antes del exit 1)
      schemaFailures++;
      console.log(`${RED}SCHEMA FAIL${RST}`);
      const errLines = r.stdout.split('\n').filter(l => /FAIL|schema/.test(l));
      for (const e of errLines.slice(0, 3)) console.log(`    ${e.trim()}`);
    } else {
      const counts = r.findings.reduce((acc, f) => { acc[f.severity] = (acc[f.severity] || 0) + 1; return acc; }, {});
      const summary = ['error', 'warning', 'info']
        .filter(s => counts[s])
        .map(s => `${s}=${counts[s]}`)
        .join(' ');
      console.log(`${GREEN}PASS${RST} ${summary || '(sin findings)'}`);
    }
  }

  console.log('');
  if (schemaFailures > 0) {
    console.log(`${RED}${schemaFailures} validator(s) fallaron schema. Bloquea PASS de validate-all.${RST}`);
    process.exit(1);
  }

  const allFindings = results.flatMap(r => r.findings);
  console.log(`${BOLD}=== resumen ===${RST}`);
  console.log(`  total findings: ${allFindings.length}`);
  console.log(`  por severidad:  errors=${allFindings.filter(f=>f.severity==='error').length}  warnings=${allFindings.filter(f=>f.severity==='warning').length}  info=${allFindings.filter(f=>f.severity==='info').length}`);

  // --update-baseline: escribir el baseline y exit 0
  if (updateBaseline && baselinePath) {
    writeBaseline(baselinePath, allFindings);
    console.log(`${GREEN}baseline actualizado: ${baselinePath} (${new Set(allFindings.map(f=>f.signature)).size} signatures unicas)${RST}`);
    process.exit(0);
  }

  // Sin baseline: cualquier finding bloquea (estricto)
  if (!baselinePath) {
    if (allFindings.length === 0) {
      console.log(`${GREEN}PASS validate-all (cero drift)${RST}`);
      process.exit(0);
    } else {
      console.log(`${YEL}sin baseline declarado: cualquier finding hace FAIL en este modo. Use --baseline para CI con deuda aceptada.${RST}`);
      process.exit(1);
    }
  }

  // Con baseline: comparar
  const baseline = loadBaseline(baselinePath);
  const newFindings = allFindings.filter(f => !baseline.has(f.signature));

  if (newFindings.length === 0) {
    console.log(`${GREEN}PASS validate-all (no drift nuevo vs baseline; ${baseline.size} entries en baseline)${RST}`);
    process.exit(0);
  }

  console.log(`${RED}FAIL validate-all (${newFindings.length} drift NUEVO no presente en baseline)${RST}`);
  console.log('');
  const groupedNew = newFindings.reduce((acc, f) => { (acc[f.validator] = acc[f.validator] || []).push(f); return acc; }, {});
  for (const [validator, items] of Object.entries(groupedNew)) {
    console.log(`  ${BOLD}${validator}${RST} (${items.length})`);
    for (const f of items.slice(0, 10)) {
      const sym = f.severity === 'error' ? `${RED}✗${RST}` : f.severity === 'warning' ? `${YEL}!${RST}` : `${CYAN}i${RST}`;
      console.log(`    ${sym} ${f.drift_id}: ${f.detail.slice(0, 120)}`);
    }
    if (items.length > 10) console.log(`    ... y ${items.length - 10} mas`);
  }
  process.exit(1);
}

main();
