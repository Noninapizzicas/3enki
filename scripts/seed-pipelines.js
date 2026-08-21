'use strict';
/**
 * VALIDADOR de los pipelines de proceso del REGISTRO (P2 — el custodio único).
 *
 * Un solo directorio, una sola verdad: el STORE del registro
 * (modules/agentes/registro/store/) está commiteado en el repo y es lo que el
 * custodio SIRVE en vivo (pipeline.obtener). No hay copia semilla que declarar:
 * el store ES la fuente. Antes existía un dir espejo en arquitectura/ que se
 * copiaba al store — dos copias que derivaban en silencio. Se unificó.
 *
 * Este script ya no COPIA (no hay de dónde): recorre el store y pasa cada
 * pipeline por el CONTRATO del custodio (_validarContrato). Canta el que esté
 * mal y termina con código 1 — el guardián de que el store siempre carga.
 *
 *   node scripts/seed-pipelines.js
 */
const fs = require('fs');
const path = require('path');
const Registro = require('../modules/agentes/registro/index.js');

const STORE_DIR = path.resolve(__dirname, '../modules/agentes/registro/store');

function main() {
  const registro = new Registro();

  if (!fs.existsSync(STORE_DIR)) {
    console.error(`❌ store no encontrado: ${STORE_DIR}`);
    process.exit(1);
  }

  const archivos = fs.readdirSync(STORE_DIR).filter(f => f.endsWith('.json'));
  let ok = 0, fallos = 0;

  for (const f of archivos) {
    let pipeline;
    try {
      pipeline = JSON.parse(fs.readFileSync(path.join(STORE_DIR, f), 'utf8'));
    } catch (err) {
      console.log(`  ❌ ${f}: JSON inválido — ${err.message}`);
      fallos++;
      continue;
    }
    const errores = registro._validarContrato(pipeline);
    if (errores.length === 0) {
      const destino = pipeline.entregable.path || pipeline.entregable.dir;
      console.log(`  ✅ ${pipeline.name} (${pipeline.pasos.length} pasos, entregable ${destino})`);
      ok++;
    } else {
      console.log(`  ❌ ${pipeline.name || f}: ${errores.join('; ')}`);
      fallos++;
    }
  }

  console.log(`\n${fallos === 0 ? `🎉 ${ok} pipelines válidos en el store` : `❌ ${fallos} fallos de contrato`}`);
  process.exit(fallos === 0 ? 0 : 1);
}

main();
