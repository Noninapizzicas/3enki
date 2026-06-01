#!/usr/bin/env node
/**
 * Validador del contrato subsistema-carta.contract.json
 *
 * STUB v1.0.0 --los cross-checks completos se implementan en TP9 del
 * contrato cuando el camino subsistema-carta este wireado en runtime
 * (TP1+TP3+TP4 ejecutados por fede). Mientras tanto, este validator
 * existe para satisfacer la convencion 'todo contrato tiene su validator'
 * (drift_contrato_sin_validator del validator documentation).
 *
 * Cross-checks PLANIFICADOS (11, ver contrato seccion
 * validaciones_cross_realizadas_por_validator):
 *
 *   1. drift_consumer_oye_zona_1                       (error)
 *   2. drift_publisher_no_autorizado_de_eventos_de_zona_3 (error)
 *   3. drift_path_carta_fuera_de_canonico              (error)
 *   4. drift_path_tarifas_fuera_de_canonico            (error)
 *   5. drift_payload_shape_carta_no_envelope_minimo    (warning)
 *   6. drift_canales_de_tarifas_divergen_de_cuentas_canales (error)
 *   7. drift_shape_interno_productos_categorias_cerrado (error)
 *   8. drift_modulo_del_subsistema_no_declarado        (warning)
 *   9. drift_evento_canonico_sin_correlation_id        (error)
 *   10. drift_evento_requires_consumer_huerfano        (error)
 *   11. drift_blueprint_no_declara_requires_consumer_paralelo (warning)
 *
 * Modos:
 *   sin args        → valida estructura del contrato (presencia de claves
 *                     canonicas + id coincide + version semver).
 *   --check-system  → STUB no-op hasta TP9. Imprime mensaje informativo.
 *
 * Contrato: arquitectura/decisiones/_contratos/subsistema-carta.contract.json
 * Plan de implementacion completa: TP9 del contrato (diferido hasta
 *   TP1+TP3+TP4 ejecutados --evita falsos positivos sobre shape pre-bump).
 */

'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const CONTRACT_PATH = path.join(
  REPO_ROOT,
  'arquitectura', 'decisiones', '_contratos',
  'subsistema-carta.contract.json'
);

const CANONICAL_KEYS = [
  '_doc', 'id', 'version', 'creada', 'supersedes_nota',
  'objetivo', 'inputs', 'filosofia', 'principios',
  'decisiones_arquitectonicas', 'prohibido', 'output_shape_resumen',
  'reglas_de_extraccion', 'derivaciones',
  'validaciones_cross_realizadas_por_validator', 'salida_validador',
  'convenciones_complementarias', 'trabajo_pendiente'
];

const SEMVER_RE = /^[0-9]+\.[0-9]+\.[0-9]+$/;

function main() {
  const args = process.argv.slice(2);
  const checkSystem = args.includes('--check-system');

  if (!fs.existsSync(CONTRACT_PATH)) {
    console.error(`subsistema-carta: contrato no existe en ${CONTRACT_PATH}`);
    process.exit(1);
  }

  let contract;
  try {
    contract = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf-8'));
  } catch (err) {
    console.error(`subsistema-carta: JSON parse error -- ${err.message}`);
    process.exit(1);
  }

  const missingKeys = CANONICAL_KEYS.filter(k => !(k in contract));
  if (missingKeys.length > 0) {
    console.error(`subsistema-carta: faltan claves canonicas: ${missingKeys.join(', ')}`);
    process.exit(1);
  }

  if (contract.id !== 'subsistema-carta') {
    console.error(`subsistema-carta: contract.id="${contract.id}" debe ser "subsistema-carta"`);
    process.exit(1);
  }

  if (!SEMVER_RE.test(contract.version)) {
    console.error(`subsistema-carta: version="${contract.version}" no es semver MAJOR.MINOR.PATCH`);
    process.exit(1);
  }

  console.log(
    `subsistema-carta: schema OK (id=${contract.id}, version=${contract.version}, ` +
    `${CANONICAL_KEYS.length} claves canonicas presentes)`
  );

  if (checkSystem) {
    console.log(
      'subsistema-carta: cross-system STUB --TP9 del contrato implementa los 11 ' +
      'cross-checks declarados cuando TP1+TP3+TP4 esten ejecutados.'
    );
  }

  process.exit(0);
}

main();
