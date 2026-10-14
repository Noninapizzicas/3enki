#!/usr/bin/env node
'use strict';
/**
 * nichos__norte-sondeo — regresion del NORTE del buscador.
 *
 * El fallo que fija: el sondeo exploraba SIN norte. F1 manda "explora amplio,
 * sin limites previos", pero sin iman la busqueda amplia cae por fisica en la
 * senal mas barata — quien YA ofrece el servicio (competencia que el sistema
 * no puede servir). El resultado: la mina se llenaba de candidatos donde Enki
 * no podia entregar ni cobrar, y TODO acababa en PUENTE.
 *
 * Lo que se fija aqui:
 *   1. El sondeo consulta el catalogo de capacidades (EL NORTE) en la ENTRADA.
 *   2. Con norte: cada candidato viaja anotado (puede_cobrar true|false|null)
 *      y los que encajan van DELANTE.
 *   3. El norte es IMAN, no puerta: no se descarta NINGUN candidato.
 *   4. Sin norte (catalogo vacio): se explora amplio, se marca null y se PULSA
 *      nichos.sondeo.sin_norte — el norte sin declarar es un dato, no silencio.
 *
 * Sin core ni MQTT: bus de mentira + stub de _rpc.
 * Ejecutar con: node tests/unit/nichos__norte-sondeo.test.js
 */

const assert = require('assert');
const N = process.env.ENKI_MODULES || '/opt/enki/modules/nichos';
const load = (m) => require(`${N}/${m}/index.js`);

let fallos = 0;
async function test(desc, fn) {
  try { await fn(); console.log(`✓ ${desc}`); }
  catch (e) { fallos++; console.error(`✗ ${desc}\n  ${e.message}`); }
}

const PROJECT_ID = 'e4bcbab9-654a-41e2-9bbd-bde6c2744379';

const SEMILLA = { territorio: 'Lorca', firma: 'f-1', id_nicho: 's-1' };

// Dos candidatos: uno de hosteleria (dominio cobrable) y uno de crochet (no).
const CRUDOS = [
  {
    titulo: 'La Mercerie Café Bouton | cursos de costura y crochet',
    nombre: 'La Mercerie Café Bouton | cursos de costura y crochet',
    evidencia: ['https://ejemplo.test/mercerie']
  },
  {
    titulo: 'Restaurante en Lorca busca carta digital y pedidos por WhatsApp',
    nombre: 'Restaurante en Lorca busca carta digital y pedidos por WhatsApp',
    evidencia: ['https://ejemplo.test/restaurante']
  }
];

const CAPACIDAD_NORTE = {
  id: 'carta-digital-hosteleria',
  descripcion: 'carta digital y pedidos por WhatsApp para hosteleria y restaurantes',
  cableada_por: 'constructor'
};

/** Monta un sondeador con el bus de mentira; `disponibles` es el catalogo. */
function montar({ disponibles = [], maxCandidatos = 50, crudos = CRUDOS } = {}) {
  const s = new (load('sondeador-territorio'))();
  const pub = [];
  s.eventBus = { publish: (e, p) => pub.push({ e, p }) };
  s.logger = { info() {}, error() {} };
  s._rpc = async (ev) => {
    if (ev === 'nichos.catalogo.capacidad.disponibles.request') {
      return { status: 200, data: { capacidades: disponibles } };
    }
    if (ev === 'nichos.reglas.exclusion.consultar.request') return { data: { conjunto_reglas: { patrones_excluir: [] } } };
    if (ev === 'nichos.perfil.limite.leer.request') {
      return { data: { perfil_limite: { limites: { max_candidatos_por_semilla: maxCandidatos } } } };
    }
    if (ev === 'nichos.fuente.consumir.request') return { data: { resultados: crudos } };
    return null;
  };
  return { s, pub };
}

const corre = (s) => s._sondear({ project_id: PROJECT_ID, correlation_id: 'cor-1', semilla_normalizada: SEMILLA });

(async () => {
  console.log('\n🧪 Running nichos — el NORTE del buscador\n');

  // ── 1. El sondeo consulta el NORTE en la entrada ──────────────────────
  await test('el sondeo consulta el catalogo (el NORTE) antes de filtrar', async () => {
    const llamadas = [];
    const { s } = montar();
    const rpc = s._rpc;
    s._rpc = async (ev, p, o) => { llamadas.push(ev); return rpc(ev, p, o); };

    await corre(s);
    assert.ok(
      llamadas.includes('nichos.catalogo.capacidad.disponibles.request'),
      'el sondeo debe pedir el norte al catalogo de capacidades'
    );
  });

  // ── 2. Con norte: anota y pone DELANTE lo que sabemos servir ──────────
  await test('con norte: el candidato cobrable va primero y anotado true', async () => {
    const { s, pub } = montar({ disponibles: [CAPACIDAD_NORTE] });
    const r = await corre(s);

    const c = r.data.candidatos;
    assert.strictEqual(c.length, 2, 'siguen los dos candidatos');
    assert.ok(/carta digital y pedidos/i.test(c[0].titulo), 'el restaurante (cobrable) va PRIMERO');
    assert.strictEqual(c[0].puede_cobrar, true, 'el restaurante puede_cobrar=true');
    assert.ok(c[0].capacidades_cobrables.includes('carta-digital-hosteleria'), 'cita la capacidad que lo cubre');
    assert.ok(c[0].encaje_cobrable > 0, 'lleva su encaje medido');
  });

  // ── 3. El norte es IMAN, no puerta: lo que no encaja NO se descarta ───
  await test('sin norte el candidato fuera lleva puede_cobrar=false pero SIGUE', async () => {
    const { s, pub } = montar({ disponibles: [CAPACIDAD_NORTE] });
    const r = await corre(s);

    const crochet = r.data.candidatos.find((x) => /crochet/i.test(x.titulo));
    assert.ok(crochet, 'el candidato de crochet NO se descarta: el norte es iman, no puerta');
    assert.strictEqual(crochet.puede_cobrar, false, 'pero viaja marcado: este dominio no es nuestro');
    // Y el pulso tambien lo lleva anotado.
    const detectados = pub.filter((x) => x.e === 'nichos.candidato.detectado');
    assert.strictEqual(detectados.length, 2, 'se pulsan los dos candidatos');
    assert.ok(detectados.every((d) => ['true', 'false'].includes(String(d.p.puede_cobrar))), 'todos anotados');
  });

  // ── 4. El norte viaja resumido en el pulso de cierre ───────────────────
  await test('nichos.sondeo.completado lleva el norte con su mina', async () => {
    const { s, pub } = montar({ disponibles: [CAPACIDAD_NORTE] });
    await corre(s);

    const fin = pub.find((x) => x.e === 'nichos.sondeo.completado');
    assert.ok(fin, 'pulsa el cierre del sondeo');
    assert.strictEqual(fin.p.norte.sin_norte, false);
    assert.strictEqual(fin.p.norte.capacidades_total, 1);
    assert.deepStrictEqual(fin.p.norte.dominios, ['carta-digital-hosteleria']);
    assert.strictEqual(fin.p.norte.mina.cobrables, 1, 'un candidato cobrable en la mina');
    assert.strictEqual(fin.p.norte.mina.fuera_del_norte, 1, 'y uno fuera del norte');
  });

  // ── 5. Norte ABIERTO: explora amplio, marca null y lo PULSA ───────────
  await test('sin norte declarado: explora amplio, marca null y pulsa sin_norte', async () => {
    const { s, pub } = montar({ disponibles: [] });
    const r = await corre(s);

    assert.strictEqual(r.data.candidatos.length, 2, 'sin norte NO se pierde ni un candidato (explora amplio)');
    assert.ok(r.data.candidatos.every((c) => c.puede_cobrar === null), 'marca null: no se afirma ni se niega');

    const aviso = pub.find((x) => x.e === 'nichos.sondeo.sin_norte');
    assert.ok(aviso, 'DEBE pulsar que el norte espera ser declarado');
    assert.ok(/catalogo/i.test(aviso.p.detalle));
    const fin = pub.find((x) => x.e === 'nichos.sondeo.completado');
    assert.strictEqual(fin.p.norte.sin_norte, true);
    assert.strictEqual(fin.p.norte.mina.indeterminados, 2);
  });

  // ── 6. Sin norte el orden de la fuente se respeta (iman inerte) ───────
  await test('sin norte el orden de la fuente se respeta', async () => {
    const { s } = montar({ disponibles: [] });
    const r = await corre(s);
    assert.ok(/crochet/i.test(r.data.candidatos[0].titulo), 'sin iman, orden estable: primero el de la fuente');
  });

  // ── 7. El tope del perfil sigue mandando (el norte no lo salta) ───────
  await test('el tope del perfil sigue recortando la mina', async () => {
    const { s } = montar({ disponibles: [CAPACIDAD_NORTE], maxCandidatos: 1 });
    const r = await corre(s);
    assert.strictEqual(r.data.candidatos.length, 1);
    assert.ok(/carta digital/i.test(r.data.candidatos[0].titulo), 'y el que sobrevive es el cobrable (el iman ordena antes del corte)');
  });

  // ── 8. Catalogos con forma vieja (nombre/estado) tambien sirven ───────
  await test('el norte acepta capacidades con la forma {nombre, descripcion}', async () => {
    const { s } = montar({
      disponibles: [
        { nombre: 'carta-digital-hosteleria:entrega', descripcion: 'carta digital y pedidos por WhatsApp para hosteleria y restaurantes' }
      ]
    });
    const r = await corre(s);
    assert.strictEqual(r.data.candidatos[0].puede_cobrar, true);
    assert.ok(r.data.candidatos[0].capacidades_cobrables.includes('carta-digital-hosteleria:entrega'));
  });

  // ── 9-12. EL NORTE SE DECLARA EN UN ACTO (catalogo: promover es FÁBRICA) ──
  // El viejo 404 'encargar primero' era el antipatrón 'declara antes de actuar':
  // exigía pre-registrar el recurso antes de poder declararlo. Quien cablea una
  // capacidad la declara; declararla ES traerla a la existencia.

  function montarCatalogo() {
    const k = new (load('catalogo-capacidades'))();
    const pub = [];
    k.eventBus = { publish: (e, p) => pub.push({ e, p }) };
    k.logger = { info() {}, error() {} };
    k._persist = { marcarDirty() {}, flush: async () => {}, detener() {} };
    return { k, pub };
  }

  await test('el norte se declara en UN acto: promover una capacidad NO encargada la trae a la existencia', async () => {
    const { k, pub } = montarCatalogo();
    const r = await k._promover({
      project_id: PROJECT_ID,
      por_autor: 'dueño',
      capacidad: { id: 'carta-digital-hosteleria', descripcion: 'carta digital y pedidos por WhatsApp para hosteleria' }
    });

    assert.strictEqual(r.status, 200, 'promover declara: no hay pre-registro que lo frene');
    assert.strictEqual(r.data.estado_catalogo.disponibles.length, 1);
    assert.strictEqual(r.data.estado_catalogo.disponibles[0].id, 'carta-digital-hosteleria');
    assert.strictEqual(r.data.estado_catalogo.disponibles[0].cableada_por, 'dueño');

    const disponible = pub.find((x) => x.e === 'nichos.catalogo.capacidad.disponible');
    assert.ok(disponible, 'pulsa que la capacidad ya esta disponible');
    assert.strictEqual(disponible.p.capacidad_id, 'carta-digital-hosteleria');

    // Y desde ese mismo instante el sondeo lo ve como norte.
    const leido = k._disponibles({ project_id: PROJECT_ID });
    assert.strictEqual(leido.data.capacidades.length, 1);
  });

  await test('la autoridad sigue: un autor no autorizado no declara el norte (403)', async () => {
    const { k } = montarCatalogo();
    const r = await k._promover({
      project_id: PROJECT_ID,
      por_autor: 'cualquiera',
      capacidad: { id: 'lo-que-sea' }
    });
    assert.strictEqual(r.status, 403);
    assert.strictEqual(k._disponibles({ project_id: PROJECT_ID }).data.capacidades.length, 0, 'no entro nada');
  });

  await test('promover sigue saldando el encargo que ya existia', async () => {
    const { k } = montarCatalogo();
    await k._encargar({ project_id: PROJECT_ID, por_autor: 'ensamblador', capacidad: { id: 'c1', descripcion: 'lo que falta' } });
    const r = await k._promover({ project_id: PROJECT_ID, por_autor: 'constructor', capacidad: { id: 'c1' } });
    assert.strictEqual(r.data.estado_catalogo.encargos.length, 0, 'el encargo queda saldado');
    assert.strictEqual(r.data.estado_catalogo.disponibles.length, 1);
    assert.strictEqual(r.data.estado_catalogo.disponibles[0].descripcion, 'lo que falta', 'hereda la descripcion del encargo');
  });

  await test('promover es idempotente por id: no duplica el norte', async () => {
    const { k } = montarCatalogo();
    await k._promover({ project_id: PROJECT_ID, por_autor: 'constructor', capacidad: { id: 'c1', descripcion: 'x' } });
    await k._promover({ project_id: PROJECT_ID, por_autor: 'constructor', capacidad: { id: 'c1', descripcion: 'y' } });
    const cap = k._disponibles({ project_id: PROJECT_ID }).data.capacidades;
    assert.strictEqual(cap.length, 1, 'declarar dos veces el mismo dominio no lo duplica');
    assert.strictEqual(cap[0].descripcion, 'x', 'y no lo pisa');
  });

  if (fallos) { console.error(`\n❌ ${fallos} test(s) fallaron`); process.exit(1); }
  console.log('\n✅ NORTE del buscador NICHOS OK');
})().catch((e) => { console.error('✗ FALLO:', e.message); process.exit(1); });
