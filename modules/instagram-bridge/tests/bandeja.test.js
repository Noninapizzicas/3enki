'use strict';

/**
 * instagram-bridge · N1 · BandejaDeEspera (CUSTODIO)
 *
 * La regla del bloque, fijada aqui:
 *
 *   **contestado sin veredicto "ocurrio" se RECHAZA.**
 *
 * Y se comprueba en el unico sitio donde la regla sirve de algo: la fila SIGUE
 * en la bandeja despues del rechazo. No basta con que la funcion devuelva
 * `ok:false`; si la fila se cierra igual, la deuda desaparece y la persona que
 * escribio se queda esperando detras de nadie.
 *
 * Tambien: sin evidencia no hay contestacion, lo contestado no se reabre, el
 * orden es FIFO, y un silencio no puede cerrar una queja aunque venga firmado.
 *
 * Ejecutar: node modules/instagram-bridge/tests/bandeja.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const n1 = require('../operacion/bandeja');
const silencio = require('../operacion/silencio');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const SELLO = { proyecto: 'proy-a', cuenta: 'taller_a', plataforma: 'instagram' };
const MOMENTO = '2026-11-11T10:00:00Z';

function directorio() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ib-bandeja-'));
}

function llegada(opts = {}) {
  return Object.assign({
    sello: SELLO,
    conversacion_id: 'dm-1',
    mensaje_id: 'msg-1',
    remitente: 'maria.ceramica',
    texto: 'Hola, cuanto cuesta el envio?',
    tipo: 'dm',
    clase: 'pedido',
    momento: MOMENTO
  }, opts);
}

// ---------------------------------------------------------------------------
// 1 · LA REGLA
// ---------------------------------------------------------------------------

test('contestado_sin_veredicto_ocurrio_se_rechaza', async () => {
  const dir = directorio();
  try {
    const b = new n1.BandejaDeEspera({ directorio: dir });
    const e = await b.entrar(llegada());
    assert.strictEqual(e.ok, true);

    // --- se intenta cerrar con todo lo que NO es "ocurrio" -----------------
    for (const veredicto of ['no_ocurrio', 'no_se_sabe', undefined, null, 'ok', true]) {
      const r = await b.marcar_contestado({
        espera_id: e.espera_id,
        veredicto,
        evidencia_id: 'ev-1',
        contestado_en: '2026-11-11T10:05:00Z'
      });
      assert.strictEqual(r.ok, false, `"${veredicto}" no puede cerrar una espera`);
      assert.strictEqual(r.motivo, 'contestado_sin_veredicto_ocurrio');
      assert.strictEqual(r.marcada, false);
      assert.strictEqual(r.sigue_esperando, true);
    }

    // --- y la fila SIGUE en la bandeja ------------------------------------
    const pend = await b.pendientes({ sello: SELLO });
    assert.strictEqual(pend.total, 1, 'la espera no puede desaparecer sin veredicto');
    assert.strictEqual(pend.esperas[0].estado, 'esperando');
    assert.strictEqual(pend.esperas[0].veredicto, null);

    const enDisco = JSON.parse(fs.readFileSync(path.join(dir, 'bandeja.json'), 'utf8'));
    assert.strictEqual(enDisco.esperas[0].estado, 'esperando');
    assert.strictEqual(enDisco.esperas[0].veredicto, null);

    // --- con "ocurrio" y evidencia, si se cierra --------------------------
    const bien = await b.marcar_contestado({
      espera_id: e.espera_id,
      veredicto: 'ocurrio',
      evidencia_id: 'ev-1',
      contestado_en: '2026-11-11T10:05:00Z'
    });
    assert.strictEqual(bien.ok, true);
    assert.strictEqual(bien.marcada, true);
    assert.strictEqual(bien.estado, 'contestado');
    assert.strictEqual((await b.pendientes({ sello: SELLO })).total, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('contestado_sin_evidencia_tampoco_es_contestado', async () => {
  const dir = directorio();
  try {
    const b = new n1.BandejaDeEspera({ directorio: dir });
    const e = await b.entrar(llegada());
    const r = await b.marcar_contestado({
      espera_id: e.espera_id,
      veredicto: 'ocurrio',
      contestado_en: '2026-11-11T10:05:00Z'
    });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.motivo, 'contestado_sin_evidencia');
    assert.strictEqual((await b.pendientes({ sello: SELLO })).total, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('una_contestacion_anterior_a_la_llegada_no_cuenta', async () => {
  const dir = directorio();
  try {
    const b = new n1.BandejaDeEspera({ directorio: dir });
    const e = await b.entrar(llegada());
    const r = await b.marcar_contestado({
      espera_id: e.espera_id,
      veredicto: 'ocurrio',
      evidencia_id: 'ev-1',
      contestado_en: '2026-11-11T09:00:00Z'
    });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.motivo, 'momento_invalido');
    assert.strictEqual((await b.pendientes({ sello: SELLO })).total, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 2 · la bandeja no duplica ni reabre
// ---------------------------------------------------------------------------

test('la_misma_llegada_no_se_duplica_ni_reabre_lo_contestado', async () => {
  const dir = directorio();
  try {
    const b = new n1.BandejaDeEspera({ directorio: dir });
    const a = await b.entrar(llegada());
    const repetida = await b.entrar(llegada());
    assert.strictEqual(repetida.repetido, true);
    assert.strictEqual(repetida.escrito, false);
    assert.strictEqual((await b.pendientes({ sello: SELLO })).total, 1);

    await b.marcar_contestado({ espera_id: a.espera_id, veredicto: 'ocurrio', evidencia_id: 'ev-1', contestado_en: '2026-11-11T10:05:00Z' });

    const otraVez = await b.entrar(llegada());
    assert.strictEqual(otraVez.ok, true);
    assert.strictEqual(otraVez.reabierta, false);
    assert.strictEqual(otraVez.en_bandeja, false);
    assert.strictEqual((await b.pendientes({ sello: SELLO })).total, 0, 'contestar dos veces es peor que no contestar');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('la_bandeja_atiende_por_orden_de_llegada', async () => {
  const dir = directorio();
  try {
    const b = new n1.BandejaDeEspera({ directorio: dir });
    await b.entrar(llegada({ mensaje_id: 'm-tarde', momento: '2026-11-11T12:00:00Z' }));
    await b.entrar(llegada({ mensaje_id: 'm-pronto', momento: '2026-11-11T08:00:00Z' }));
    await b.entrar(llegada({ mensaje_id: 'm-medio', momento: '2026-11-11T10:00:00Z' }));

    const pend = await b.pendientes({ sello: SELLO });
    assert.deepStrictEqual(pend.esperas.map((e) => e.mensaje_id), ['m-pronto', 'm-medio', 'm-tarde']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('cada_cuenta_tiene_su_bandeja', async () => {
  const dir = directorio();
  try {
    const b = new n1.BandejaDeEspera({ directorio: dir });
    await b.entrar(llegada());
    await b.entrar(llegada({
      sello: { proyecto: 'proy-b', cuenta: 'taller_b' },
      mensaje_id: 'msg-b'
    }));
    assert.strictEqual((await b.pendientes({ sello: SELLO })).total, 1);
    assert.strictEqual((await b.pendientes({ sello: { proyecto: 'proy-b', cuenta: 'taller_b' } })).total, 1);
    assert.strictEqual((await b.resumen({ sello: SELLO })).esperando, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 3 · el silencio, y la queja
// ---------------------------------------------------------------------------

test('un_silencio_firmado_por_n5_se_guarda', async () => {
  const dir = directorio();
  try {
    const b = new n1.BandejaDeEspera({ directorio: dir });
    const e = await b.entrar(llegada({ clase: 'spam', texto: 'Sorteo de iphone, link en bio' }));
    const decision = silencio.decidir({ clase: 'spam', texto: 'Sorteo de iphone, link en bio' });
    assert.strictEqual(decision.decision, 'silencio');

    const r = await b.marcar_silenciado({
      espera_id: e.espera_id,
      decision,
      decision_id: 'dec-1',
      decidido_en: '2026-11-11T10:10:00Z',
      decidido_por: 'agente'
    });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.estado, 'silenciado');
    assert.strictEqual((await b.pendientes({ sello: SELLO })).total, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('una_queja_no_se_silencia_ni_con_decision_firmada', async () => {
  const dir = directorio();
  try {
    const b = new n1.BandejaDeEspera({ directorio: dir });
    const texto = 'Me habeis cobrado dos veces, esto es una estafa';
    const e = await b.entrar(llegada({ clase: 'queja', texto }));

    // La decision de N5 jamas diria "silencio" para una queja, pero aqui se
    // prueba con una decision FALSA y firmada: la bandeja la rechaza igual.
    const falsa = { ok: true, clase: 'queja', decision: 'silencio', silencio: true, motivo: 'spam' };
    const r = await b.marcar_silenciado({
      espera_id: e.espera_id,
      decision: falsa,
      decision_id: 'dec-falsa',
      decidido_en: '2026-11-11T10:10:00Z'
    });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.motivo, 'una_queja_no_se_silencia');
    assert.strictEqual(r.escala_a, 'persona');
    assert.strictEqual((await b.pendientes({ sello: SELLO })).total, 1, 'la queja sigue esperando a una persona');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('sin_decision_de_silencio_no_hay_silencio', async () => {
  const dir = directorio();
  try {
    const b = new n1.BandejaDeEspera({ directorio: dir });
    const e = await b.entrar(llegada({ clase: 'consulta' }));
    for (const decision of [null, {}, { decision: 'responder' }, { decision: 'silencio', silencio: false }]) {
      const r = await b.marcar_silenciado({
        espera_id: e.espera_id,
        decision,
        decision_id: 'dec-1',
        decidido_en: '2026-11-11T10:10:00Z'
      });
      assert.strictEqual(r.ok, false);
      assert.strictEqual(r.motivo, 'sin_decision_de_silencio');
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 4 · auditoria
// ---------------------------------------------------------------------------

test('la_auditoria_encuentra_una_contestacion_sin_veredicto_ya_guardada', () => {
  const estado = {
    esquema: 'bandeja-de-espera-v1',
    almacen: 'bandeja',
    revision: 4,
    esperas: [{
      espera_id: 'p:instagram:taller_a:dm-1:msg-1',
      sello: SELLO,
      conversacion_id: 'dm-1',
      mensaje_id: 'msg-1',
      remitente: 'maria.ceramica',
      texto: 'hola',
      momento: MOMENTO,
      estado: 'contestado',
      veredicto: 'no_se_sabe',
      evidencia_id: null,
      contestado_en: '2026-11-11T10:05:00Z'
    }]
  };
  const a = n1.auditar(estado);
  assert.strictEqual(a.ok, false);
  const motivos = a.problemas.map((p) => p.motivo);
  assert.ok(motivos.includes('contestado_sin_veredicto_ocurrio'));
  assert.ok(motivos.includes('contestado_sin_evidencia'));
});

// ---------------------------------------------------------------------------
// runner
// ---------------------------------------------------------------------------

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; console.log(`  ok  ${name}`); }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[instagram-bridge__bandeja] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[instagram-bridge__bandeja] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
