'use strict';
/**
 * SEED de los pipelines de proceso en el REGISTRO (P2 — el custodio único).
 *
 * Ejecutar tras el deploy (el registro lo carga el core; este script declara
 * los pipelines de proceso del motor en su store):
 *   node scripts/seed-pipelines.js
 *
 * Declara vía el CUSTODIO (pipeline.declarar.request directo al módulo) —
 * nunca escribiendo el store del registro a mano.
 */
const fs = require('fs');
const path = require('path');
const Registro = require('../modules/agentes/registro/index.js');

const PIPELINES_DIR = path.resolve(__dirname, '../arquitectura/esquema-motor-agentes/pipelines');

async function main() {
  const registro = new Registro();
  await registro.onLoad({ eventBus: null, logger: console });

  const archivos = fs.readdirSync(PIPELINES_DIR).filter(f => f.endsWith('.json'));
  let ok = 0, fallos = 0;

  for (const f of archivos) {
    const pipeline = JSON.parse(fs.readFileSync(path.join(PIPELINES_DIR, f), 'utf8'));
    const eventos = [];
    const bus = { publish: (topic, payload) => eventos.push({ topic, payload }) };
    registro.eventBus = bus;
    await registro.onPipelineDeclararRequest({ data: { request_id: `seed-${pipeline.name}`, pipeline } });
    const r = eventos.find(e => e.topic === 'pipeline.declarado');
    const err = eventos.find(e => e.topic === 'pipeline.declarar.failed');
    if (r) { console.log(`  ✅ ${pipeline.name} declarado (${pipeline.pasos.length} pasos, entregable ${pipeline.entregable.path})`); ok++; }
    else { console.log(`  ❌ ${pipeline.name}: ${err ? err.payload.error.message : 'sin respuesta'}`); fallos++; }
  }

  console.log(`\n${fallos === 0 ? `🎉 ${ok} pipelines declarados en el registro` : `❌ ${fallos} fallos`}`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });
