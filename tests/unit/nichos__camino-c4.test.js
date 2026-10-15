#!/usr/bin/env node
'use strict';
/**
 * nichos__camino-c4 — regresión de la DECISIÓN DE CAMINO (F2 · C4).
 *
 * Fija el fallo que dejaba la rama CONSTRUIR del negocio inalcanzable:
 *
 *   La v0.1.0 decidía por RECUENTO: `capacidades.filter(activa).length /
 *   (informe.requisitos?.length || 1)`. El informe que produce estudio-demanda NO
 *   trae `requisitos` → el divisor era SIEMPRE 1 → ratio = tamaño del catálogo →
 *   'TOTAL' → ENCONTRAR incondicional. Medido en vivo con la sonda RPC: un nicho
 *   inventado ("crochet") devolvía ENCONTRAR con las 3 capacidades y cobertura TOTAL.
 *
 *   Ahora C4 decide por JUICIO (riesgo + atajo), según la regla de F3
 *   (diseno-oop.md:480-501): solo hay ENCONTRAR si hay atajo a caja Y riesgo bajo;
 *   el norte es EVIDENCIA, no puerta; y la política del dueño es la única que puede
 *   exigir su visto bueno para construir.
 *
 * Sin core ni MQTT: bus de mentira + stub de _rpc.
 * Ejecutar con: node tests/unit/nichos__camino-c4.test.js
 */

const assert = require('assert');
const path = require('path');
const N = path.resolve(__dirname, '../../modules/nichos');
const load = (m) => require(`${N}/${m}/index.js`);

let fallos = 0;
async function test(desc, fn) {
  try { await fn(); console.log(`✓ ${desc}`); }
  catch (e) { fallos++; console.error(`✗ ${desc}\n  ${e.message}`); }
}

const PROJECT_ID = 'e4bcbab9-654a-41e2-9bbd-bde6c2744379';

// El catálogo REAL del norte (3 capacidades DISPONIBLE, con sus etiquetas).
const CATALOGO = [
  {
    id: 'comercio-pizzepos-pos',
    descripcion: 'POS y carta digital para hosteleria',
    meta: { dominio: 'comercio', etiquetas: ['pizzeria', 'restaurante', 'hosteleria', 'carta digital', 'pedidos online'], semillas: ['pizzeria', 'restaurante', 'cafeteria'] }
  },
  {
    id: 'impresion-3d-por-encargo',
    descripcion: 'Taller de impresion 3D por encargo',
    meta: { dominio: 'impresion-3d', etiquetas: ['impresion 3d', 'petg', 'prototipo', 'relieve', 'logo'], semillas: ['joyeria', 'tienda de regalos personalizados'] }
  },
  {
    id: 'construccion-obra-y-mecanizado',
    descripcion: 'Construccion y mecanizado en acero inox',
    meta: { dominio: 'construccion', etiquetas: ['obra', 'reforma', 'acero', 'escuadra', 'soldadura'], semillas: ['empresa de reformas'] }
  }
];

/** Monta el módulo con bus de mentira y un _rpc a la carta. */
function montar({ capacidades = CATALOGO, criterio = null, llm = null } = {}) {
  const c = new (load('camino-encontrar-construir'))();
  const pub = [];
  c.eventBus = { publish: (e, p) => pub.push({ e, p }) };
  c._rpc = async (ev) => {
    if (ev === 'nichos.catalogo.capacidad.disponibles.request') return { data: { capacidades } };
    if (ev === 'nichos.criterio.viabilidad.leer.request') return { data: { umbral_viabilidad: criterio } };
    if (ev === 'llm.complete.request') return llm;
    return null;
  };
  return { c, pub };
}

// Informe REAL del embudo: sin `requisitos`, sin `dominio` (ese era el cebo del bug).
const informe = (extra = {}) => ({ demanda_1er_orden: 'no determinada', disposicion_a_pagar: 'desconocida', ...extra });
const veredicto = (razon = 'faltan datos economicos') => ({ decision: 'VIABLE', codigo: 'VIABLE', razon });

(async () => {
  console.log('\n🧪 Running nichos — decisión de camino (F2 · C4)\n');

  // ── 1. LA REGRESIÓN: un nicho que NO encaja no puede dar ENCONTRAR ────────
  await test('crochet (nada que ver con el norte) → CONSTRUIR, no ENCONTRAR', async () => {
    const { c, pub } = montar({ llm: null }); // sin LLM → juicio determinista
    const r = await c._decidir({
      project_id: PROJECT_ID,
      id_nicho: 'taller-de-crochet',
      informe: informe({ id_nicho: 'taller-de-crochet' }),
      veredicto: veredicto('demanda de crochet en redes, sin precios')
    });
    assert.strictEqual(r.data.camino.tipo, 'CONSTRUIR', 'el bug devolvía ENCONTRAR');
    assert.deepStrictEqual(r.data.camino.capacidades_encajadas, [], 'ninguna capacidad del norte sirve al crochet');
    const pulso = pub.find((x) => x.e === 'nichos.camino.decidido');
    assert.strictEqual(pulso.p.tipo, 'CONSTRUIR');
    assert.strictEqual(pulso.p.riesgo, 'ALTO');
  });

  // ── 2. El caso VIVO que la sonda midió: el catálogo no basta para ENCONTRAR ─
  await test('catálogo lleno y informe SIN `requisitos` → ya no da TOTAL/ENCONTRAR', async () => {
    const { c } = montar({ llm: null });
    const r = await c._decidir({
      project_id: PROJECT_ID,
      id_nicho: 'prueba-crochet',
      informe: informe({ id_nicho: 'prueba-crochet' }),   // el payload exacto de la sonda viva
      veredicto: veredicto()
    });
    assert.strictEqual(r.data.camino.tipo, 'CONSTRUIR');
    assert.ok(!('cobertura' in r.data.camino), 'el campo cobertura del bug desaparece');
  });

  // ── 3. Nicho que SÍ encaja + números + LLM → ENCONTRAR ────────────────────
  await test('pizzeria con demanda demostrada y precio → ENCONTRAR', async () => {
    const { c } = montar({
      llm: { content: '{"atajo_existe":true,"riesgo":"BAJO","razon":"demanda ya existente y sabemos servirla"}' }
    });
    const r = await c._decidir({
      project_id: PROJECT_ID,
      id_nicho: 'pizzeria-en-lorca',
      informe: informe({
        id_nicho: 'pizzeria-en-lorca',
        demanda_1er_orden: '3 pizzerias en Lorca sin carta digital, 12 pedidos/semana',
        disposicion_a_pagar: '80 EUR/mes'
      }),
      veredicto: veredicto('hosteleria con demanda demostrada')
    });
    assert.strictEqual(r.data.camino.tipo, 'ENCONTRAR');
    assert.strictEqual(r.data.camino.riesgo, 'BAJO');
    assert.strictEqual(r.data.camino.capacidades_encajadas[0].id, 'comercio-pizzepos-pos');
  });

  // ── 4. El LLM cae (timeout) → fallback determinista, sin colgarse ─────────
  await test('LLM caído → decide el determinista (no cuelga, no ENCONTRAR)', async () => {
    const { c } = montar({ llm: null }); // _rpc devuelve null → null.content → fallback
    const r = await c._decidir({
      project_id: PROJECT_ID,
      id_nicho: 'taller-de-crochet',
      informe: informe({ id_nicho: 'taller-de-crochet' }),
      veredicto: veredicto()
    });
    assert.strictEqual(r.status, 200, 'nunca 502 por LLM ausente');
    assert.strictEqual(r.data.camino.tipo, 'CONSTRUIR');
  });

  // ── 5. La política del dueño manda: VB previo → SolicitudDecision ─────────
  await test('exige_vb_previo_construir=true + riesgo ALTO → encola CAMINO_CONSTRUIR_VB', async () => {
    const { c, pub } = montar({
      criterio: { umbral: { exige_vb_previo_construir: true } },
      llm: null
    });
    const r = await c._decidir({
      project_id: PROJECT_ID,
      id_nicho: 'taller-de-crochet',
      informe: informe({ id_nicho: 'taller-de-crochet' }),
      veredicto: veredicto()
    });
    assert.strictEqual(r.data.camino.tipo, 'CAMINO_CONSTRUIR_VB', 'no se arroga el riesgo');
    const enc = pub.find((x) => x.e === 'nichos.cola.decisiones.encolar.request');
    assert.ok(enc, 'DEBE encolar la solicitud para que el dueño pueda responderla');
    assert.strictEqual(enc.p.solicitud_decision.tipo, 'CAMINO_CONSTRUIR_VB');
    assert.strictEqual(enc.p.solicitud_decision.id_nicho, 'taller-de-crochet');
    assert.strictEqual(enc.p.project_id, PROJECT_ID);
  });

  // ── 6. ABIERTO NO es true: la política sin declarar no enciende el gate ──
  await test('exige_vb_previo_construir ABIERTO → CONSTRUIR sin solicitud (dato ausente no se asume)', async () => {
    const { c, pub } = montar({
      criterio: { umbral: { exige_vb_previo_construir: 'ABIERTO' } },
      llm: null
    });
    const r = await c._decidir({
      project_id: PROJECT_ID,
      id_nicho: 'taller-de-crochet',
      informe: informe({ id_nicho: 'taller-de-crochet' }),
      veredicto: veredicto()
    });
    assert.strictEqual(r.data.camino.tipo, 'CONSTRUIR');
    assert.ok(!pub.find((x) => x.e === 'nichos.cola.decisiones.encolar.request'), 'ABIERTO no encola nada');
  });

  // ── 7. El encaje cruza DE VERDAD (no cuenta el catálogo entero) ───────────
  await test('_evaluarEncaje devuelve solo lo que sirve, con su puntuación', async () => {
    const { c } = montar();
    const enc = c._evaluarEncaje(CATALOGO, {
      id_nicho: 'escuadras-de-acero-inoxidable-para-fregadero',
      informe: { demanda_1er_orden: 'reformas de hosteleria en Lorca' },
      veredicto: { razon: 'hace falta mecanizado en acero inox' }
    });
    assert.ok(enc.length >= 1 && enc.length < CATALOGO.length, 'no devuelve el catálogo entero');
    assert.strictEqual(enc[0].id, 'construccion-obra-y-mecanizado');
    assert.ok(enc[0].aciertos > 0);
  });

  if (fallos) { console.error(`\n❌ ${fallos} test(s) fallaron`); process.exit(1); }
  console.log('\n✅ Decisión de camino NICHOS (F2 · C4) OK');
})().catch((e) => { console.error('✗ FALLO:', e.message); process.exit(1); });
