#!/usr/bin/env node
/**
 * Validador estructural minimo del contrato dinamica-de-trabajo-companero.
 *
 * Patron cultural: la disciplina la enforce el propio LLM al inicio de cada
 * sesion leyendo el contrato. NO hay validacion semantica posible — no se
 * puede chequear mecanicamente que el LLM 'respete los 11 pilares' o que
 * 'haya hecho ritual de limpieza cuando tocaba'.
 *
 * Lo que SI se valida (estructural):
 *   1. contrato_existe                                  (error)
 *   2. contrato_compila_json                            (error)
 *   3. contrato_tiene_secciones_canonicas               (error)
 *   4. pilares_no_vacios                                (error)
 *   5. flujos_estan_los_cuatro_canonicos                (error)
 *   6. prohibido_no_vacio                               (warning)
 *
 * Contrato: arquitectura/decisiones/_contratos/dinamica-de-trabajo-companero.contract.json
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const REPO_ROOT     = path.resolve(__dirname, '../../..');
const CONTRACT_PATH = path.join(REPO_ROOT, 'arquitectura/decisiones/_contratos/dinamica-de-trabajo-companero.contract.json');

const RED='\x1b[31m', GREEN='\x1b[32m', YEL='\x1b[33m', RST='\x1b[0m';

const SECCIONES_CANONICAS = [
  '_doc', 'id', 'version', 'creada', 'supersedes_nota',
  'objetivo', 'inputs', 'filosofia', 'pilares',
  'clasificacion_de_trabajo', 'flujos', 'prohibido',
  'convenciones_complementarias', 'validador', 'trabajo_pendiente'
];

const FLUJOS_CANONICOS = [
  'flujo_fix_pequenyo',
  'flujo_horizonte_grande',
  'flujo_decision_punto_por_punto',
  'flujo_ritual_de_limpieza'
];

function main() {
  // 1. contrato_existe
  if (!fs.existsSync(CONTRACT_PATH)) {
    console.log(`${RED}FAIL${RST} dinamica-de-trabajo-companero — contrato no existe: ${CONTRACT_PATH}`);
    return 1;
  }

  // 2. contrato_compila_json
  let contract;
  try {
    contract = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
  } catch (e) {
    console.log(`${RED}FAIL${RST} dinamica-de-trabajo-companero — JSON invalido (${e.message})`);
    return 1;
  }

  const errors = [];
  const warnings = [];

  // 3. contrato_tiene_secciones_canonicas
  for (const k of SECCIONES_CANONICAS) {
    if (!(k in contract)) errors.push(`seccion canonica ausente: '${k}'`);
  }

  // 4. pilares_no_vacios
  if (!Array.isArray(contract.pilares) || contract.pilares.length === 0) {
    errors.push('pilares[] vacio o no es array');
  } else {
    for (const p of contract.pilares) {
      if (!p.id || !p.regla || !p.razon) {
        errors.push(`pilar sin id/regla/razon: ${JSON.stringify(p).slice(0, 80)}...`);
      }
    }
  }

  // 5. flujos_estan_los_cuatro_canonicos
  const flujos = contract.flujos || {};
  for (const f of FLUJOS_CANONICOS) {
    if (!flujos[f]) errors.push(`flujo canonico ausente: '${f}'`);
    else if (!Array.isArray(flujos[f].pseudocodigo) || flujos[f].pseudocodigo.length === 0) {
      errors.push(`flujo '${f}' sin pseudocodigo[] no vacio`);
    }
  }

  // 6. prohibido_no_vacio
  if (!Array.isArray(contract.prohibido) || contract.prohibido.length === 0) {
    warnings.push('prohibido[] vacio — contrato sin anti-patrones declarados');
  }

  // Resultado
  if (errors.length === 0 && warnings.length === 0) {
    console.log(`${GREEN}PASS${RST} dinamica-de-trabajo-companero (contrato valido, ${contract.pilares.length} pilares, ${Object.keys(flujos).length} flujos)`);
    return 0;
  }

  if (errors.length) {
    console.log(`${RED}FAIL${RST} dinamica-de-trabajo-companero — ${errors.length} errors`);
    for (const e of errors) console.log(`  ${RED}![${RST}] ${e}`);
  }
  if (warnings.length) {
    console.log(`${YEL}WARN${RST} dinamica-de-trabajo-companero — ${warnings.length} warnings`);
    for (const w of warnings) console.log(`  ${YEL}!${RST} ${w}`);
  }
  return errors.length > 0 ? 1 : 0;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = { main };
