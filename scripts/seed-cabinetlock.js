/**
 * seed-cabinetlock.js — siembra el set CabinetLOCK en el catálogo de modelos
 * y la cola de impresión del taller 3D, usando las PROYECCIONES REALES de los
 * reflejos catalogo-modelos y cola-impresion.
 *
 *   node scripts/seed-cabinetlock.js [project_id]    (default: taller-3d)
 *
 * Registra 8 modelos (7 piezas + torre de calibración) en el catálogo,
 * y encola la torre de calibración primero (urgencia 5) seguida de una
 * ESQUINA-L de prueba (urgencia 4). El resto queda en catálogo listo
 * para encolar cuando el dueño lo decida.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const CatalogoModelos = require('../modules/catalogo-modelos/index.js');
const ColaImpresion = require('../modules/cola-impresion/index.js');

const PID = process.argv[2] || 'taller-3d';
const STORAGE = path.join(process.cwd(), 'data', 'projects', PID, 'storage');

function fsStub(ev, p) {
  if (ev !== 'fs.write.request' && ev !== 'fs.read.request') return null;
  const abs = path.join(STORAGE, p.path.replace(/^\//, ''));
  if (ev === 'fs.write.request') {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, typeof p.content === 'string' ? p.content : JSON.stringify(p.content, null, 2), 'utf-8');
    return { status: 201 };
  }
  return fs.existsSync(abs) ? { status: 200, content: fs.readFileSync(abs, 'utf-8') } : { status: 404 };
}

const catalogo = new CatalogoModelos();
catalogo._rpc = async (ev, p) => fsStub(ev, p);
catalogo._publicarEvento = () => {};
catalogo.eventBus = { publish: () => {} };

const cola = new ColaImpresion();
cola._rpc = async (ev, p) => {
  if (ev === 'catalogo.obtener.request') {
    return catalogo._obtener(p);
  }
  return fsStub(ev, p);
};
cola._publicarEvento = () => {};
cola.eventBus = { publish: () => {} };

const MODELOS = [
  {
    id: 'cabinetlock-calibracion',
    nombre: 'CabinetLOCK Torre Calibración',
    categoria: 'cabinetlock',
    origen: 'diseno-propio',
    metadatos: {
      material: 'PETG',
      dimensiones: '170×45×19mm',
      tiempo_estimado: '45 min',
      peso_estimado: '12g'
    }
  },
  {
    id: 'cabinetlock-esquina-l',
    nombre: 'CabinetLOCK Esquina-L',
    categoria: 'cabinetlock',
    origen: 'diseno-propio',
    metadatos: {
      material: 'PETG',
      dimensiones: '40×40×23mm',
      tiempo_estimado: '35 min',
      peso_estimado: '22g'
    }
  },
  {
    id: 'cabinetlock-esquina-3d',
    nombre: 'CabinetLOCK Esquina-3D',
    categoria: 'cabinetlock',
    origen: 'diseno-propio',
    metadatos: {
      material: 'PETG',
      dimensiones: '40×40×43mm',
      tiempo_estimado: '55 min',
      peso_estimado: '32g'
    }
  },
  {
    id: 'cabinetlock-t-interior',
    nombre: 'CabinetLOCK T-Interior',
    categoria: 'cabinetlock',
    origen: 'diseno-propio',
    metadatos: {
      material: 'PETG',
      dimensiones: '40×40×23mm',
      tiempo_estimado: '40 min',
      peso_estimado: '18g'
    }
  },
  {
    id: 'cabinetlock-soporte-balda',
    nombre: 'CabinetLOCK Soporte Balda',
    categoria: 'cabinetlock',
    origen: 'diseno-propio',
    metadatos: {
      material: 'PETG',
      dimensiones: 'Ø15×14mm',
      tiempo_estimado: '8 min',
      peso_estimado: '2g'
    }
  },
  {
    id: 'cabinetlock-recto',
    nombre: 'CabinetLOCK Recto',
    categoria: 'cabinetlock',
    origen: 'diseno-propio',
    metadatos: {
      material: 'PETG',
      dimensiones: '22.3×80×23mm',
      tiempo_estimado: '50 min',
      peso_estimado: '28g'
    }
  },
  {
    id: 'cabinetlock-tapon',
    nombre: 'CabinetLOCK Tapón',
    categoria: 'cabinetlock',
    origen: 'diseno-propio',
    metadatos: {
      material: 'PETG',
      dimensiones: '22.3×25×23mm',
      tiempo_estimado: '15 min',
      peso_estimado: '6g'
    }
  },
  {
    id: 'cabinetlock-union-vertical',
    nombre: 'CabinetLOCK Unión Vertical',
    categoria: 'cabinetlock',
    origen: 'diseno-propio',
    metadatos: {
      material: 'PETG',
      dimensiones: '22.3×40×43mm',
      tiempo_estimado: '50 min',
      peso_estimado: '30g'
    }
  }
];

async function main() {
  console.log(`Sembrando CabinetLOCK en proyecto '${PID}'...\n`);

  // 1. Registrar modelos en el catálogo
  console.log('=== CATÁLOGO DE MODELOS ===');
  for (const m of MODELOS) {
    const r = catalogo._registrar({ project_id: PID, ...m });
    if (r.status >= 400) {
      console.log(`  ✗ ${m.nombre}: ${r.data?.code || r.status}`);
    } else {
      console.log(`  ✓ ${m.nombre} (${m.id})`);
    }
  }

  // Persistir catálogo
  await catalogo._persist.flush();

  // 2. Encolar calibración (urgencia 5 — imprime primero) y una esquina-L de prueba (urgencia 4)
  console.log('\n=== COLA DE IMPRESIÓN ===');

  const encolar = [
    { modelo_id: 'cabinetlock-calibracion', nombre: 'Torre Calibración CabinetLOCK', material: 'PETG', urgencia: 5 },
    { modelo_id: 'cabinetlock-esquina-l', nombre: 'Esquina-L CabinetLOCK (prueba)', material: 'PETG', urgencia: 4 }
  ];

  for (const item of encolar) {
    const r = await cola._entrar({ project_id: PID, ...item });
    if (r.status >= 400) {
      console.log(`  ✗ ${item.nombre}: ${r.data?.code || r.status} — ${r.data?.message || ''}`);
    } else {
      console.log(`  ✓ ${item.nombre} → cola (urgencia ${item.urgencia})`);
    }
  }

  // Persistir cola
  await cola._persist.flush();

  // 3. Resumen
  const longitud = await cola._longitud({ project_id: PID });
  console.log(`\n=== RESUMEN ===`);
  console.log(`  Modelos en catálogo: ${MODELOS.length}`);
  console.log(`  Piezas en cola: ${longitud.data.pendientes} pendientes / ${longitud.data.total} total`);
  console.log(`  Orden de impresión: 1) Torre Calibración  2) Esquina-L prueba`);
  console.log(`  Resto del set: en catálogo, listo para encolar cuando valides la calibración.\n`);
}

main().catch(err => { console.error(err); process.exit(1); });
