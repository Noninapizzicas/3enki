#!/usr/bin/env node
'use strict';
/**
 * nichos__norte-dos-pisos — regresión del EJE: el norte tiene DOS PISOS y el
 * buscador nace de los dos («tenemos ∪ podemos construir»).
 *
 * El fallo que fija: el esquema viejo del norte (`nichos-capacidades-v1`)
 * declaraba, POR NICHO, el trío `captura · entrega · cobro` en estado `faltante`
 * con autor CONSTRUCTOR. Al migrar el store a `disponibles/encargos` ese eje se
 * perdió: el norte quedó con UN solo piso (lo cableado) y los `encargos` — «lo
 * que podemos construir» — vivían en el fichero sin que ningún módulo los leyera.
 * Resultado: la mina se llenaba de dominios donde no podemos servir (la
 * competencia del taller de crochet), y el segundo piso nunca se poblaba.
 *
 * Lo que se fija aquí (una cadena, de punta a punta):
 *   1. El catálogo entrega los DOS pisos en la misma lectura del norte.
 *   2. C4, al decidir CONSTRUIR, DECLARA el eje (captura · entrega · cobro): el
 *      acto llena el segundo piso — no hay formulario que nadie rellene.
 *   3. El eje declarado aterriza en el norte y re-declarar es IDEMPOTENTE por id.
 *   4. El sembrador siembra de los DOS pisos (una idea por nicho, no por pata).
 *   5. El sondeo marca el candidato que solo encaja con el piso 2.
 *   6. Sin `project_id` no se declara nada: el norte es PER-PROYECTO.
 *
 * Sin core ni MQTT: bus de mentira + stub de _rpc.
 * Ejecutar con: node tests/unit/nichos__norte-dos-pisos.test.js
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

const NICHO = 'tienda de regalos personalizados en Lorca';
const SLUG = 'tienda-de-regalos-personalizados-en-lorca';

// Los tres RPCs del eje, tal como los publica C4.
const encargosDeEje = (pub) =>
  pub.filter((x) => x.e === 'nichos.catalogo.capacidad.encargar.request').map((x) => x.p);

// ── Montajes ────────────────────────────────────────────────────────────────

function montarCatalogo() {
  const k = new (load('catalogo-capacidades'))();
  const pub = [];
  k.eventBus = { publish: (e, p) => pub.push({ e, p }) };
  k.logger = { info() {}, error() {} };
  k._persist = { marcarDirty() {}, flush: async () => {}, detener() {} };
  return { k, pub };
}

function montarCamino({ llm = null, capacidades = [] } = {}) {
  const c = new (load('camino-encontrar-construir'))();
  const pub = [];
  c.eventBus = { publish: (e, p) => pub.push({ e, p }) };
  c._rpc = async (ev) => {
    if (ev === 'nichos.catalogo.capacidad.disponibles.request') return { data: { capacidades } };
    if (ev === 'nichos.criterio.viabilidad.leer.request') return { data: { umbral_viabilidad: null } };
    if (ev === 'llm.complete.request') return llm;
    return null;
  };
  return { c, pub };
}

function montarSembrador({ capacidades = [], podemos_construir = [] } = {}) {
  const s = new (load('sembrador-norte'))();
  const pub = [];
  s.eventBus = { publish: (e, p) => pub.push({ e, p }) };
  s.logger = { info() {}, error() {} };
  s._rpc = async (ev) => {
    if (ev === 'nichos.catalogo.capacidad.disponibles.request') {
      return { status: 200, data: { capacidades, podemos_construir } };
    }
    return null;
  };
  return { s, pub };
}

const CRUDOS = [
  { titulo: 'La Mercerie Café Bouton | cursos de costura y crochet', nombre: 'La Mercerie Café Bouton | cursos de costura y crochet' },
  { titulo: 'Tienda de regalos personalizados con logo grabado en Lorca', nombre: 'Tienda de regalos personalizados con logo grabado en Lorca' }
];

function montarSondeador({ capacidades = [], podemos_construir = [] } = {}) {
  const s = new (load('sondeador-territorio'))();
  const pub = [];
  s.eventBus = { publish: (e, p) => pub.push({ e, p }) };
  s.logger = { info() {}, error() {} };
  s._rpc = async (ev) => {
    if (ev === 'nichos.catalogo.capacidad.disponibles.request') {
      return { status: 200, data: { capacidades, podemos_construir } };
    }
    if (ev === 'nichos.reglas.exclusion.consultar.request') return { data: { conjunto_reglas: { patrones_excluir: [] } } };
    if (ev === 'nichos.perfil.limite.leer.request') return { data: { perfil_limite: { limites: { max_candidatos_por_semilla: 50 } } } };
    if (ev === 'nichos.fuente.consumir.request') return { data: { resultados: CRUDOS } };
    return null;
  };
  return { s, pub };
}

const correSondeo = (s) => s._sondear({
  project_id: PROJECT_ID, correlation_id: 'cor-1',
  semilla_normalizada: { territorio: 'Lorca', firma: 'f-1', id_nicho: 's-1' }
});

// El informe REAL del embudo: sin `requisitos`, sin `dominio`, sin números.
const informeConstruir = () => ({
  id_nicho: NICHO, demanda_1er_orden: 'no determinada', disposicion_a_pagar: 'desconocida'
});
const veredictoConstruir = () => ({ decision: 'VIABLE', codigo: 'VIABLE', razon: 'sin datos economicos' });

(async () => {
  console.log('\n🧪 Running nichos — el norte de DOS PISOS (tenemos ∪ podemos construir)\n');

  // ── 1. El catálogo entrega los dos pisos ────────────────────────────────
  await test('el catálogo entrega los DOS pisos en la misma lectura del norte', async () => {
    const { k } = montarCatalogo();
    await k._promover({ project_id: PROJECT_ID, por_autor: 'dueño', capacidad: { id: 'comercio-pizzepos-pos', descripcion: 'POS' } });
    await k._encargar({ project_id: PROJECT_ID, por_autor: 'constructor', capacidad: { id: `${SLUG}:cobro`, descripcion: `capacidad cobro para: ${NICHO}` } });

    const r = k._disponibles({ project_id: PROJECT_ID });
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.data.capacidades.map((c) => c.id), ['comercio-pizzepos-pos'], 'piso 1 = tenemos');
    assert.deepStrictEqual(r.data.podemos_construir.map((c) => c.id), [`${SLUG}:cobro`], 'piso 2 = podemos construir');
  });

  // ── 2. C4 declara el eje en el acto de decidir CONSTRUIR ────────────────
  await test('C4, al decidir CONSTRUIR, declara el eje captura · entrega · cobro', async () => {
    const { c, pub } = montarCamino({ llm: null });
    const r = await c._decidir({
      project_id: PROJECT_ID, id_nicho: NICHO,
      informe: informeConstruir(), veredicto: veredictoConstruir()
    });

    assert.strictEqual(r.data.camino.tipo, 'CONSTRUIR');
    const enc = encargosDeEje(pub);
    assert.strictEqual(enc.length, 3, 'tres patas: captura, entrega, cobro');
    assert.deepStrictEqual(
      enc.map((x) => x.capacidad.id),
      [`${SLUG}:captura`, `${SLUG}:entrega`, `${SLUG}:cobro`],
      'el id de la pata es <nicho-slug>:<eje> (el esquema viejo, restaurado)'
    );
    assert.deepStrictEqual(
      r.data.camino.capacidades_por_construir,
      [`${SLUG}:captura`, `${SLUG}:entrega`, `${SLUG}:cobro`],
      'y el camino viaja con lo que hay que construir'
    );
    assert.ok(enc.every((x) => x.por_autor === 'constructor'), 'C4 ES el constructor: quien decide construir declara');
    assert.ok(enc.every((x) => x.project_id === PROJECT_ID), 'declara en la casa del ciclo (norte per-proyecto)');
    assert.ok(enc.every((x) => x.capacidad.meta.nicho_texto === NICHO), 'guarda el texto del nicho para sembrarlo despues');
    assert.strictEqual(enc[0].capacidad.meta.eje, 'captura');
  });

  // ── 3. El eje declarado aterriza en el norte — y es idempotente ─────────
  await test('el eje declarado por C4 aterriza en el norte, y re-declarar NO duplica', async () => {
    const { c, pub } = montarCamino({ llm: null });
    const { k } = montarCatalogo();
    // El bus de verdad: lo que C4 publica lo atiende el catálogo.
    c.eventBus = {
      publish: (e, p) => {
        pub.push({ e, p });
        if (e === 'nichos.catalogo.capacidad.encargar.request') k._encargar(p);
      }
    };

    const input = {
      project_id: PROJECT_ID, id_nicho: NICHO,
      informe: informeConstruir(), veredicto: veredictoConstruir()
    };
    await c._decidir(input);
    const primerCiclo = k._disponibles({ project_id: PROJECT_ID }).data.podemos_construir;
    assert.strictEqual(primerCiclo.length, 3, 'el segundo piso quedo poblado por el acto de decidir');

    await c._decidir(input);   // segundo ciclo, misma decision
    const segundoCiclo = k._disponibles({ project_id: PROJECT_ID }).data.podemos_construir;
    assert.strictEqual(segundoCiclo.length, 3, 'idempotente por id: el norte no se infla ciclo a ciclo');
  });

  // ── 4. El sembrador siembra de los DOS pisos ────────────────────────────
  await test('el sembrador siembra de los DOS pisos (una idea por nicho, no por pata)', async () => {
    const { s, pub } = montarSembrador({
      capacidades: [{ id: 'comercio-pizzepos-pos', descripcion: 'POS', meta: { dominio: 'comercio', semillas: ['pizzeria'] } }],
      podemos_construir: ['captura', 'entrega', 'cobro'].map((eje) => ({
        id: `${SLUG}:${eje}`,
        descripcion: `capacidad ${eje} para: ${NICHO}`,
        meta: { dominio: 'regalos', eje, nicho: SLUG, nicho_texto: NICHO }
      }))
    });

    const r = await s._sembrar({ project_id: PROJECT_ID, territorio: 'Lorca' });
    const ideas = pub.filter((x) => x.e === 'nichos.semilla.capturar.request').map((x) => x.p);

    assert.deepStrictEqual(
      ideas.map((i) => i.texto),
      ['pizzeria en Lorca', `${NICHO} en Lorca`],
      'piso 1 (pizzeria) + piso 2 (el nicho que decidimos construir)'
    );
    assert.strictEqual(ideas.filter((i) => /regalos/.test(i.texto)).length, 1, 'las tres patas son UNA idea');
    assert.strictEqual(ideas[1].por_construir, true, 'la idea del piso 2 viaja marcada');
    assert.strictEqual(r.data.capacidades, 1);
    assert.strictEqual(r.data.por_construir, 3);

    const fin = pub.find((x) => x.e === 'nichos.sembrador.norte.sembrado');
    assert.deepStrictEqual(fin.p.por_construir, [`${SLUG}:captura`, `${SLUG}:entrega`, `${SLUG}:cobro`]);
  });

  // ── 5. Sin ningún piso no se inventa nada ───────────────────────────────
  await test('sin ningun piso: 0 ideas y pulso sin_norte', async () => {
    const { s, pub } = montarSembrador({ capacidades: [], podemos_construir: [] });
    const r = await s._sembrar({ project_id: PROJECT_ID, territorio: 'Lorca' });
    assert.strictEqual(r.data.publicadas, 0);
    assert.strictEqual(r.data.motivo, 'sin_norte');
    assert.ok(pub.some((x) => x.e === 'nichos.sembrador.norte.sin_norte'));
  });

  // ── 6. El sondeo marca con el piso 2 ────────────────────────────────────
  await test('el sondeo marca con el piso 2: candidato que solo encaja con «podemos construir»', async () => {
    const { s, pub } = montarSondeador({
      capacidades: [{ id: 'carta-digital-hosteleria', descripcion: 'carta digital para hosteleria' }],
      podemos_construir: [{
        id: `${SLUG}:entrega`,
        descripcion: `capacidad entrega para: tienda de regalos personalizados con logo grabado`,
        meta: { dominio: 'regalos' }
      }]
    });

    const r = await correSondeo(s);
    assert.strictEqual(r.data.candidatos.length, 2, 'el norte es iman, no puerta: no se descarta a nadie');

    const cobrable = r.data.candidatos.find((x) => /regalos/i.test(x.titulo));
    assert.ok(cobrable, 'el candidato de regalos sigue en la lista');
    assert.strictEqual(cobrable.puede_cobrar, true, 'encaja: hay una pata declarada para ese nicho');
    assert.deepStrictEqual(cobrable.capacidades_por_construir, [`${SLUG}:entrega`], 'y viaja APARTE: esto hay que construirlo');

    const crochet = r.data.candidatos.find((x) => /crochet/i.test(x.titulo));
    assert.strictEqual(crochet.puede_cobrar, false, 'lo que no esta en ningun piso sigue fuera del norte');
    assert.deepStrictEqual(crochet.capacidades_por_construir, []);

    // Y el norte resumido del cierre lleva los dos pisos.
    const fin = pub.find((x) => x.e === 'nichos.sondeo.completado');
    assert.strictEqual(fin.p.norte.capacidades_total, 1, 'piso 1');
    assert.strictEqual(fin.p.norte.construibles_total, 1, 'piso 2');
    assert.deepStrictEqual(fin.p.norte.dominios_por_construir, [`${SLUG}:entrega`]);
  });

  // ── 7. El piso 2 solo no deja el sondeo a ciegas ────────────────────────
  await test('con solo el piso 2 el sondeo NO esta sin norte', async () => {
    const { s, pub } = montarSondeador({
      capacidades: [],
      podemos_construir: [{ id: `${SLUG}:captura`, descripcion: `capacidad captura para: ${NICHO}`, meta: { dominio: 'regalos' } }]
    });
    await correSondeo(s);
    assert.ok(!pub.some((x) => x.e === 'nichos.sondeo.sin_norte'), 'el piso 2 ES norte: no se pulsa sin_norte');
    const fin = pub.find((x) => x.e === 'nichos.sondeo.completado');
    assert.strictEqual(fin.p.norte.sin_norte, false);
  });

  // ── 8. Sin project_id no hay casa: C4 no declara nada ───────────────────
  await test('sin project_id C4 NO declara el eje (el norte es per-proyecto)', async () => {
    const { c, pub } = montarCamino({ llm: null });
    const r = await c._decidir({ id_nicho: NICHO, informe: informeConstruir(), veredicto: veredictoConstruir() });
    assert.strictEqual(r.data.camino.tipo, 'CONSTRUIR');
    assert.deepStrictEqual(r.data.camino.capacidades_por_construir, [], 'sin casa no se inventa encargo');
    assert.strictEqual(encargosDeEje(pub).length, 0, 'no sale ni un encargo por la puerta');
  });

  if (fallos) { console.error(`\n❌ ${fallos} test(s) fallaron`); process.exit(1); }
  console.log('\n✅ El norte de DOS PISOS NICHOS OK');
})().catch((e) => { console.error('✗ FALLO:', e.message); process.exit(1); });
