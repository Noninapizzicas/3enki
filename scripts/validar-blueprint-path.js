#!/usr/bin/env node
/**
 * validar-blueprint-path.js — la regla que faltaba.
 *
 * EL HALLAZGO (2026-09-29): 9 módulos del repo declaraban `blueprint_driven: true`
 * SIN `blueprint_path`. Al arrancar la pila reventaban con:
 *   ai-gateway.blueprint.load.failed
 *   'The "paths[1]" argument must be of type string. Received undefined'
 * Ninguno de los 39 validadores del repo lo detectaba: la verificación estática
 * no miraba esta pareja de campos. El error SOLO aparecía en vuelo.
 *
 * LA REGLA (derivada del loader + el canon patron/modulo-hibrido.md):
 *   blueprint_driven: true  ⟹  blueprint_path declarado  Y  el fichero existe
 *   blueprint_driven ausente/false  ⟹  el módulo carga por index.js (normal)
 *
 * NO exige que TODOS los módulos tengan blueprint: 18 lo declaran bien, 365 no lo
 * necesitan. Solo vigila la COHERENCIA de la declaración.
 *
 * Uso:  node scripts/validar-blueprint-path.js
 * Salida: exit 0 = OK · exit 1 = drift (bloquea)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const MODULES_DIR = path.join(REPO_ROOT, 'modules');

const RED = '\x1b[31m', GREEN = '\x1b[32m', YEL = '\x1b[33m', CYAN = '\x1b[36m', RST = '\x1b[0m';

/** Enumera los module.json del repo (mismo criterio que module-loading.validate.js:
 *  nivel 1 y nivel 2, saltando los directorios con prefijo _ y .). */
function listManifests() {
  const out = [];
  const esDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch (_) { return false; } };
  const hijos = (dir) => {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter((n) => !n.startsWith('_') && !n.startsWith('.'))
      .map((n) => path.join(dir, n))
      .filter(esDir);
  };
  for (const sub of hijos(MODULES_DIR)) {
    const mj1 = path.join(sub, 'module.json');
    if (fs.existsSync(mj1)) { out.push(sub); continue; }
    for (const sub2 of hijos(sub)) {
      if (fs.existsSync(path.join(sub2, 'module.json'))) out.push(sub2);
    }
  }
  return out;
}

function main() {
  const errors = [];
  const warnings = [];
  const okDeclarados = [];

  let total = 0;
  for (const dir of listManifests()) {
    total++;
    let m;
    try { m = JSON.parse(fs.readFileSync(path.join(dir, 'module.json'), 'utf-8')); }
    catch (e) { errors.push(`module.json ilegible: ${path.relative(REPO_ROOT, dir)} — ${e.message}`); continue; }

    const rel = path.relative(REPO_ROOT, dir).replace(/\\/g, '/');
    const driven = m.blueprint_driven === true;
    const bp = typeof m.blueprint_path === 'string' ? m.blueprint_path.trim() : '';

    if (driven) {
      if (!bp) {
        // EL CASO QUE REVIENTA AL ARRANCAR
        errors.push(
          `drift_blueprint_driven_sin_path: ${rel}/module.json declara "blueprint_driven": true ` +
          `SIN "blueprint_path" — el ai-gateway leerá una ruta undefined y fallará al arrancar ` +
          `(ai-gateway.blueprint.load.failed / 'paths[1] ... Received undefined'). ` +
          `O el módulo es un blueprint (dale su "<slug>.blueprint.json") o NO es blueprint-driven (quita el campo).`
        );
      } else {
        const bpPath = path.resolve(dir, bp);
        if (!fs.existsSync(bpPath)) {
          errors.push(
            `drift_blueprint_path_sin_fichero: ${rel}/module.json declara "blueprint_path": "${bp}" ` +
            `pero ese fichero NO existe.`
          );
        } else {
          // ¿es un blueprint de verdad?
          // El canon (sonda/destilador/interfaz/redactor) exige `id` + `version`.
          // OJO: `schema` NO es universal — solo lo llevan los blueprints de
          // INTERFAZ v2 (blueprint-interfaz-v2: facturas, marketing-*). Exigirlo
          // daba 11 falsos positivos. El par universal es id+version.
          try {
            const b = JSON.parse(fs.readFileSync(bpPath, 'utf-8'));
            if (!b.id && !b.version) {
              warnings.push(`blueprint_path_sospechoso: ${rel}/${bp} — sin "id" NI "version" (¿es un blueprint?)`);
            }
            if (b.id && m.name && b.id !== m.name) {
              warnings.push(`blueprint_id_no_casa: ${rel} — module.json.name="${m.name}" vs blueprint.id="${b.id}"`);
            }
          } catch (e) {
            errors.push(`blueprint_ilegible: ${rel}/${bp} — ${e.message}`);
          }
        }
      }
    } else if (m.blueprint_driven !== undefined && m.blueprint_driven !== false && m.blueprint_driven !== true) {
      warnings.push(`blueprint_driven_no_booleano: ${rel} — valor ${JSON.stringify(m.blueprint_driven)}`);
    }

    if (driven && bp) okDeclarados.push(rel);
  }

  console.log(`\n${CYAN}=== blueprint_path: coherencia de la declaración ===${RST}`);
  console.log(`  módulos explorados: ${total}`);
  console.log(`  declaran blueprint_driven + path + fichero existe: ${okDeclarados.length}`);

  if (errors.length) {
    console.log(`\n${RED}✗ errors (${errors.length})${RST}`);
    for (const e of errors) console.log(`  ${RED}✗${RST} ${e}`);
  }
  if (warnings.length) {
    console.log(`\n${YEL}! warnings (${warnings.length})${RST}`);
    for (const w of warnings) console.log(`  ${YEL}!${RST} ${w}`);
  }
  if (!errors.length && !warnings.length) {
    console.log(`\n${GREEN}PASS${RST} blueprint_path: sin drift`);
  }

  process.exit(errors.length ? 1 : 0);
}

main();
