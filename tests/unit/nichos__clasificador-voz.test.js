/**
 * Tests unitarios para nichos/clasificador-intencion — LA VOZ del puerto.
 *
 * Cubre el hueco que hacia que el dueno escribiera al bot y NO le volviera nada:
 * el clasificador solo arrancaba el ciclo con SEMILLA (`if` sin rama contraria);
 * cualquier otra intencion (CONSULTA, RESPUESTA_DECISION, AJUSTE_CONFIG,
 * DESCONOCIDO) moria en el bus en silencio → "la vertical no me responde".
 *
 * Ahora toda intencion que NO arranca ciclo publica la boca nativa
 * `nichos.canal.enviar.request` (el puerto resuelve destino → telegram).
 * Sin core ni MQTT: bus de mentira + LLM stub.
 *
 * Ejecutar con: node tests/unit/nichos__clasificador-voz.test.js
 */

const assert = require('assert');
const ClasificadorIntencion = require('../../modules/nichos/clasificador-intencion');

let fallos = 0;
async function test(description, fn) {
  try {
    await fn();
    console.log(`✓ ${description}`);
  } catch (error) {
    fallos++;
    console.error(`✗ ${description}\n  ${error.message}`);
  }
}

// Monta el modulo con bus de mentira y LLM stub (devuelve `tipo`).
function montar(tipo) {
  const mod = new ClasificadorIntencion();
  const publicados = [];
  mod.eventBus = { publish: (ev, data) => publicados.push({ ev, data }) };
  mod._pedirAlLLM = async () => ({ tipo, confianza: 0.9 });
  const eventos = (ev) => publicados.filter((p) => p.ev === ev);
  return { mod, publicados, eventos };
}

const PROJECT_ID = 'e4bcbab9-654a-41e2-9bbd-bde6c2744379';
const ENTRADA = { project_id: PROJECT_ID, mensaje_entrante: 'No es nicho para nosotros' };

(async () => {
  console.log('\n🧪 Running clasificador-intencion (la voz) Tests\n');

  await test('SEMILLA → arranca el ciclo y NO responde por la boca (lo hace el aviso)', async () => {
    const { mod, eventos } = montar('SEMILLA');
    await mod.onMensajeRecibido({ data: ENTRADA });
    assert.strictEqual(eventos('nichos.semilla.capturar.request').length, 1);
    assert.strictEqual(eventos('nichos.canal.enviar.request').length, 0);
  });

  await test('CONSULTA → responde por la boca con la guia', async () => {
    const { mod, eventos } = montar('CONSULTA');
    await mod.onMensajeRecibido({ data: { ...ENTRADA, mensaje_entrante: 'Hola' } });
    const enviar = eventos('nichos.canal.enviar.request');
    assert.strictEqual(enviar.length, 1);
    assert.strictEqual(enviar[0].data.project_id, PROJECT_ID);
    assert.ok(/idea de negocio/i.test(enviar[0].data.mensaje.cuerpo));
    assert.strictEqual(eventos('nichos.semilla.capturar.request').length, 0);
  });

  await test('RESPUESTA_DECISION → acuse (el caso real del dueno)', async () => {
    const { mod, eventos } = montar('RESPUESTA_DECISION');
    await mod.onMensajeRecibido({ data: ENTRADA });
    const cuerpo = eventos('nichos.canal.enviar.request')[0].data.mensaje.cuerpo;
    assert.ok(/decisi/i.test(cuerpo));
  });

  await test('DESCONOCIDO → guia, nunca silencio', async () => {
    const { mod, eventos } = montar('DESCONOCIDO');
    await mod.onMensajeRecibido({ data: { ...ENTRADA, mensaje_entrante: 'Hola' } });
    assert.strictEqual(eventos('nichos.canal.enviar.request').length, 1);
  });

  await test('toda respuesta lleva project_id (el puerto resuelve destino por el)', async () => {
    for (const tipo of ['CONSULTA', 'RESPUESTA_DECISION', 'AJUSTE_CONFIG', 'DESCONOCIDO']) {
      const { mod, eventos } = montar(tipo);
      await mod.onMensajeRecibido({ data: ENTRADA });
      assert.strictEqual(eventos('nichos.canal.enviar.request')[0].data.project_id, PROJECT_ID, tipo);
    }
  });

  await test('LLM que falla → failed explicito, sin boca', async () => {
    const { mod, eventos } = montar('X');
    mod._pedirAlLLM = async () => { throw new Error('timeout'); };
    await mod.onMensajeRecibido({ data: ENTRADA });
    assert.strictEqual(eventos('nichos.intencion.clasificada.failed').length, 1);
    assert.strictEqual(eventos('nichos.canal.enviar.request').length, 0);
  });

  await test('mensaje sin texto → no molesta al LLM ni responde', async () => {
    const { mod, publicados } = montar('SEMILLA');
    await mod.onMensajeRecibido({ data: { project_id: PROJECT_ID } });
    assert.strictEqual(publicados.length, 0);
  });

  if (fallos) {
    console.error(`\n❌ ${fallos} test(s) fallaron`);
    process.exit(1);
  }
  console.log('\n✅ Todos los tests del clasificador-intencion pasaron');
})();
