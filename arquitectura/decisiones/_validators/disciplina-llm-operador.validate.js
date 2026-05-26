#!/usr/bin/env node
/**
 * Validador estructural minimo del contrato disciplina-llm-operador.
 *
 * Patron cultural: la disciplina la enforce el propio LLM declarando el
 * protocolo verbal de fase 1 en su primer mensaje de cada tarea de
 * auditoria / debugging / investigacion. NO hay validacion semantica
 * posible — no se puede chequear mecanicamente que el LLM "haya tirado del
 * hilo de cada sintoma" o "haya verificado codigo sobre doc".
 *
 * Lo que SI se valida (estructural):
 *   1. contrato_existe                              (error)
 *   2. contrato_compila_json                        (error)
 *   3. contrato_tiene_secciones_canonicas           (error)
 *   4. principios_no_vacios                         (error)
 *   5. protocolo_tiene_las_seis_fases_canonicas     (error)
 *   6. prohibido_no_vacio                           (warning)
 *   7. casos_testigo_no_vacio                       (warning)
 *
 * Contrato: arquitectura/decisiones/_contratos/disciplina-llm-operador.contract.json
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const REPO_ROOT     = path.resolve(__dirname, '../../..');
const CONTRACT_PATH = path.join(REPO_ROOT, 'arquitectura/decisiones/_contratos/disciplina-llm-operador.contract.json');

const RED='\x1b[31m', GREEN='\x1b[32m', YEL='\x1b[33m', RST='\x1b[0m';

const SECCIONES_CANONICAS = [
  '_doc', 'id', 'version', 'creada', 'supersedes_nota',
  'objetivo', 'inputs', 'filosofia', 'principios',
  'protocolo_de_observacion', 'decisiones_arquitectonicas',
  'prohibido', 'casos_testigo', 'convenciones_complementarias',
  'validador', 'trabajo_pendiente'
];

const FASES_CANONICAS = [
  'fase_1_declaracion_de_axiomas',
  'fase_2_verificacion',
  'fase_3_observacion_de_detalles_minimos',
  'fase_4_tirar_del_hilo',
  'fase_5_cierre_con_axiomas_explicitos',
  'fase_6_si_usuario_pide_otra_mirada'
];

function main() {
  // 1. contrato_existe
  if (!fs.existsSync(CONTRACT_PATH)) {
    console.log(`${RED}FAIL${RST} disciplina-llm-operador — contrato no existe: ${CONTRACT_PATH}`);
    return 1;
  }

  // 2. contrato_compila_json
  let contract;
  try {
    contract = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
  } catch (e) {
    console.log(`${RED}FAIL${RST} disciplina-llm-operador — JSON invalido (${e.message})`);
    return 1;
  }

  const errors = [];
  const warnings = [];

  // 3. contrato_tiene_secciones_canonicas
  for (const k of SECCIONES_CANONICAS) {
    if (!(k in contract)) errors.push(`seccion canonica ausente: '${k}'`);
  }

  // 4. principios_no_vacios
  if (!Array.isArray(contract.principios) || contract.principios.length === 0) {
    errors.push('principios[] vacio o no es array');
  } else {
    for (const p of contract.principios) {
      if (!p.id || !p.regla || !p.anti_patron) {
        errors.push(`principio sin id/regla/anti_patron: ${JSON.stringify(p).slice(0, 80)}...`);
      }
    }
  }

  // 5. protocolo_tiene_las_seis_fases_canonicas
  const fases = (contract.protocolo_de_observacion && contract.protocolo_de_observacion.fases) || {};
  for (const f of FASES_CANONICAS) {
    if (!fases[f]) {
      errors.push(`fase canonica ausente: '${f}'`);
    } else if (!Array.isArray(fases[f].pseudocodigo) || fases[f].pseudocodigo.length === 0) {
      errors.push(`fase '${f}' sin pseudocodigo[] no vacio`);
    }
  }

  // 6. prohibido_no_vacio
  if (!Array.isArray(contract.prohibido) || contract.prohibido.length === 0) {
    warnings.push('prohibido[] vacio — contrato sin anti-patrones declarados');
  }

  // 7. casos_testigo_no_vacio
  if (!Array.isArray(contract.casos_testigo) || contract.casos_testigo.length === 0) {
    warnings.push('casos_testigo[] vacio — contrato sin evidencia empirica anclada');
  }

  // Resultado
  if (errors.length === 0 && warnings.length === 0) {
    console.log(`${GREEN}PASS${RST} disciplina-llm-operador (contrato valido, ${contract.principios.length} principios, ${Object.keys(fases).length} fases)`);
    return 0;
  }

  if (errors.length) {
    console.log(`${RED}FAIL${RST} disciplina-llm-operador — ${errors.length} errors`);
    for (const e of errors) console.log(`  ${RED}![${RST}] ${e}`);
  }
  if (warnings.length) {
    console.log(`${YEL}WARN${RST} disciplina-llm-operador — ${warnings.length} warnings`);
    for (const w of warnings) console.log(`  ${YEL}!${RST} ${w}`);
  }
  return errors.length > 0 ? 1 : 0;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = { main };
