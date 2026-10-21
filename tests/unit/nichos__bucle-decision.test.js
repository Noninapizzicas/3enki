#!/usr/bin/env node
'use strict';
/**
 * nichos__bucle-decision — regresión del JUICIO y del BUCLE DE DECISIÓN.
 *
 * Fija los dos fallos que hacían que la vertical "no diera resultados":
 *
 *  1. CONTRATO DEL VEREDICTO. `veredicto-viabilidad` devuelve `decision`; el
 *     consumidor (batch-validacion) leía `codigo` (undefined) → TODO candidato
 *     caía a PUENTE y la vertical jamás emitía un VIABLE ("viables 0 · puentes 1").
 *     El test viejo lo ocultaba porque mockeaba `{codigo:'VIABLE'}` — un
 *     contrato que el módulo real NUNCA produce.
 *
 *  2. BUCLE DE DECISIÓN SIN LLAVE. Nadie emitía `nichos.cola.decisiones.encolar`
 *     ni `.cerrar`: la cola estaba siempre vacía y la respuesta del dueño caía
 *     al vacío. Ahora el orquestador encola el PUENTE (con su TEST DE VENTA) y
 *     el clasificador cierra la solicitud con la respuesta del dueño.
 *
 * Sin core ni MQTT: bus de mentira + stubs de _rpc/_pedirAlLLM.
 * Ejecutar con: node tests/unit/nichos__bucle-decision.test.js
 */

const assert = require('assert');
const N = '/opt/enki/modules/nichos';
const load = (m) => require(`${N}/${m}/index.js`);

let fallos = 0;
async function test(desc, fn) {
  try { await fn(); console.log(`✓ ${desc}`); }
  catch (e) { fallos++; console.error(`✗ ${desc}\n  ${e.message}`); }
}

const PROJECT_ID = 'e4bcbab9-654a-41e2-9bbd-bde6c2744379';

(async () => {
  console.log('\n🧪 Running nichos — juicio + bucle de decisión\n');

  // ── 1. El veredicto emite `decision` Y su alias `codigo` ──────────────
  await test('veredicto-viabilidad emite decision + alias codigo', async () => {
    const v = new (load('veredicto-viabilidad'))();
    const pub = [];
    v.eventBus = { publish: (e, p) => pub.push({ e, p }) };
    v._leerCriterio = async () => ({ fuente: 'test' });
    v._pedirAlLLM = async () => ({ decision: 'VIABLE', razon: 'cumple el criterio' });

    const r = await v._emitir({ project_id: PROJECT_ID, informe: { id_nicho: 'c1' } });
    assert.strictEqual(r.data.veredicto.decision, 'VIABLE');
    assert.strictEqual(r.data.veredicto.codigo, 'VIABLE', 'alias codigo presente');
    const pulso = pub.find((x) => x.e === 'nichos.veredicto.emitido');
    assert.strictEqual(pulso.p.codigo, 'VIABLE', 'el pulso también lleva el alias');
  });

  // ── 2. batch-validacion lee el veredicto REAL (decision), no `codigo` ──
  await test('batch-validacion: veredicto {decision:VIABLE} → viables 1', async () => {
    const b = new (load('batch-validacion'))();
    b._rpc = async (ev) => {
      if (ev === 'nichos.cola.candidatos.sacar.request') {
        return { data: { candidatos: [{ id_nicho: 'c1', payload: { semilla: { vertical_sugerido: 'taller ebike' } } }] } };
      }
      if (ev === 'nichos.demanda.estudiar.request') return { data: { informe: { demanda_1er_orden: 'x' } } };
      // El veredicto REAL trae `decision` (no `codigo`) — el mock viejo mentía.
      if (ev === 'nichos.veredicto.emitir.request') return { data: { veredicto: { decision: 'VIABLE', razon: 'ok' } } };
      if (ev === 'nichos.camino.decidir.request') return { data: { camino: { tipo: 'CONSTRUIR' } } };
      return { data: {} };
    };
    const pub = [];
    b.eventBus = { publish: (e, p) => pub.push({ e, p }) };
    b.logger = { error() {}, info() {} };

    await b._correr({ project_id: 'p', correlation_id: 'cor' });
    const lote = pub.find((x) => x.e === 'nichos.validacion.lote.completado');
    assert.strictEqual(lote.p.viables, 1, 'un veredicto VIABLE real debe contar como viable');
    assert.strictEqual(lote.p.puentes, 0);
    assert.strictEqual(lote.p.detalle[0].id_nicho, 'c1');
  });

  // ── 3. El orquestador ENCOLA el PUENTE y compone el TEST DE VENTA ─────
  await test('orquestador: PUENTE → test de venta + encola la decisión', async () => {
    const o = new (load('orquestador'))();
    const pub = [];
    o.eventBus = { publish: (e, p) => pub.push({ e, p }) };
    o.logger = { info() {}, error() {} };
    o._rpc = async () => ({ data: { umbral_viabilidad: { umbral: { disposicion_pagar_min: 30 } } } });

    o._ciclos.set('cor', {
      project_id: PROJECT_ID,
      inicio: new Date().toISOString(),
      semilla_normalizada: { territorio: 'Lorca', vertical_sugerido: 'taller de crochet' },
      resumen: { viables: 0, puentes: 1, no_viables: 0 },
      evaluados: [{ id_nicho: 'c1', codigo: 'PUENTE', veredicto: { decision: 'PUENTE', codigo: 'PUENTE', razon: 'faltan datos económicos' } }]
    });

    await o._cerrarCiclo('cor', { viables: 0 });

    const aviso = pub.find((x) => x.e === 'nichos.canal.enviar.request');
    assert.ok(aviso, 'debe avisar al dueño');
    const cuerpo = aviso.p.mensaje.cuerpo;
    assert.ok(/Test de venta/.test(cuerpo), 'el aviso trae un test de venta concreto');
    assert.ok(/Lorca/.test(cuerpo), 'cita el territorio');
    assert.ok(/30 €/.test(cuerpo), 'cita el precio declarado (disposición mínima)');
    assert.ok(/7 días/.test(cuerpo), 'cita el plazo');
    assert.ok(/cuenta como SÍ/.test(cuerpo), 'define el criterio de éxito');

    const enc = pub.find((x) => x.e === 'nichos.cola.decisiones.encolar.request');
    assert.ok(enc, 'DEBE encolar la decisión (la llave que faltaba)');
    assert.deepStrictEqual(enc.p.solicitud_decision.opciones, ['SI', 'NO']);
    assert.strictEqual(enc.p.solicitud_decision.tipo, 'VALIDACION_PUENTE');
    assert.strictEqual(enc.p.project_id, PROJECT_ID);
  });

  // ── 4. El clasificador CIERRA la solicitud con el voto del dueño ──────
  await test('clasificador: RESPUESTA_DECISION cierra la solicitud abierta', async () => {
    const c = new (load('clasificador-intencion'))();
    const pub = [];
    const cierres = [];
    c.eventBus = { publish: (e, p) => pub.push({ e, p }) };
    c._pedirAlLLM = async () => ({ tipo: 'RESPUESTA_DECISION', confianza: 0.9, opcion: null });
    c._rpc = async (ev, payload) => {
      if (ev === 'nichos.cola.decisiones.siguientes.request') {
        return { data: { solicitudes: [{ id: 'dec_1', tipo: 'VALIDACION_PUENTE', opciones: ['SI', 'NO'], estado: 'ABIERTA' }] } };
      }
      if (ev === 'nichos.cola.decisiones.cerrar.request') { cierres.push(payload); return { status: 200, data: { cerrada: true } }; }
      return null;
    };

    await c.onMensajeRecibido({ data: { project_id: PROJECT_ID, mensaje_entrante: 'Sí, dale' } });

    assert.strictEqual(cierres.length, 1, 'debe cerrar exactamente una solicitud');
    assert.strictEqual(cierres[0].solicitud_id, 'dec_1');
    assert.strictEqual(cierres[0].respuesta, 'SI', 'interpreta el voto afirmativo');
    const boca = pub.find((x) => x.e === 'nichos.canal.enviar.request');
    assert.ok(/registrada/i.test(boca.p.mensaje.cuerpo), 'la voz confirma la decisión');
  });

  await test('clasificador: "no" cierra con NO', async () => {
    const c = new (load('clasificador-intencion'))();
    const cierres = [];
    c.eventBus = { publish: () => {} };
    c._pedirAlLLM = async () => ({ tipo: 'RESPUESTA_DECISION', confianza: 0.9, opcion: null });
    c._rpc = async (ev, payload) => {
      if (ev === 'nichos.cola.decisiones.siguientes.request') {
        return { data: { solicitudes: [{ id: 'dec_2', tipo: 'VALIDACION_PUENTE', opciones: ['SI', 'NO'], estado: 'ABIERTA' }] } };
      }
      if (ev === 'nichos.cola.decisiones.cerrar.request') { cierres.push(payload); return { status: 200, data: {} }; }
      return null;
    };
    await c.onMensajeRecibido({ data: { project_id: PROJECT_ID, mensaje_entrante: 'no, descarta' } });
    assert.strictEqual(cierres[0].respuesta, 'NO');
  });

  // ── 5. La cola enriquece .respondida con tipo + contexto ─────────────
  await test('cola-decisiones: .respondida lleva tipo y contexto', async () => {
    const q = new (load('cola-decisiones'))();
    const pub = [];
    q.eventBus = { publish: (e, p) => pub.push({ e, p }) };
    q._persist = { marcarDirty() {}, flush: async () => {}, detener() {} };

    q._encolar({ project_id: PROJECT_ID, solicitud_decision: { tipo: 'VALIDACION_PUENTE', contexto: 'faltan datos', opciones: ['SI', 'NO'] } });
    const abierta = pub.find((x) => x.e === 'nichos.decision.solicitud.abierta');
    const sid = abierta.p.solicitud_id;

    q._cerrar({ project_id: PROJECT_ID, solicitud_id: sid, respuesta: 'SI', dueno: 'dueño' });
    const resp = pub.find((x) => x.e === 'nichos.decision.solicitud.respondida');
    assert.strictEqual(resp.p.tipo, 'VALIDACION_PUENTE');
    assert.strictEqual(resp.p.contexto, 'faltan datos');
    assert.strictEqual(resp.p.opcion_elegida, 'SI');
  });

  if (fallos) { console.error(`\n❌ ${fallos} test(s) fallaron`); process.exit(1); }
  console.log('\n✅ Juicio + bucle de decisión NICHOS OK');
})().catch((e) => { console.error('✗ FALLO:', e.message); process.exit(1); });
