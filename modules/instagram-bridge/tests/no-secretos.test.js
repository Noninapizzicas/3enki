'use strict';

/**
 * instagram-bridge · V1 · ReglaDeNoAlmacenamiento (REFLEJO)
 *
 * Ningun secreto entra en el estado del puente: ni cifrado, ni "por si acaso".
 * La auditoria es sobre el estado ENTERO. Esta suite fija:
 *   - un estado completo y realista (padron, fichas, retratos, bandeja, colas,
 *     tolerancia, evidencia, confirmaciones, autorizaciones, catalogo, memoria)
 *     no tiene ni un secreto.
 *   - cuando se cuela uno, se nombra ruta y familia — y el informe NO repite el
 *     valor (un secreto truncado sigue siendo un secreto).
 *   - se descarta sin guardar y se devuelve el aviso que hay que dar.
 *   - los datos legitimos que se parecen a un secreto (autorizaciones,
 *     clave_natural, tokens_usados, code, codigo_postal) NO se marcan: un
 *     auditor con falsos positivos se acaba apagando.
 *
 * Ejecutar: node modules/instagram-bridge/tests/no-secretos.test.js
 */

const assert = require('assert');
const {
  FAMILIAS, EVENTO_AVISO, detectar_secreto, admitir_en_estado,
  auditar, rechazar, descartar, motivo
} = require('../core/no-secretos');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function sello(proyecto, cuenta) {
  return {
    proyecto,
    cuenta: cuenta || (proyecto === 'proy-a' ? '@taller_a' : '@taller_c'),
    aparato: 'movil-1',
    momento: '2026-11-11T12:00:00Z',
    quien: 'dueno'
  };
}

// Estado completo del puente para un proyecto: TODO lo que se guarda de verdad.
function estadoCompleto() {
  const sa = sello('proy-a');
  return {
    padron: {
      cuentas: [{
        cuenta: '@taller_a', proyecto: 'proy-a', aparato: 'movil-1', estado: 'vigente',
        desde: '2026-11-01T09:00:00Z', sello: sa
      }]
    },
    fichas: {
      '@taller_a': { proyecto: 'proy-a', plataforma: 'instagram', voz: 'cercana, sin promesas', sello: sa }
    },
    retratos: [{
      almacen: 'retratos', sello: sa, pantalla: 'perfil', seguidores: 1234,
      lista_de_lo_leido: ['perfil', 'metricas'], huecos: ['alcance'], provisional: true
    }],
    bandejas: [{
      almacen: 'bandejas', sello: sa, de: '@cliente_1', mensaje: 'hola, cuanto cuesta el poster?',
      estado: 'nueva', antiguedad_h: 2
    }],
    colas: [{ almacen: 'colas', sello: sa, capacidad: 'publicar', estado: 'en_cola', prioridad: 2 }],
    tolerancia: { '@taller_a': { techo_por_hora: 3, evidencia: 12, penalizacion: 1 } },
    evidencia: [{
      almacen: 'evidencia', sello: sa, ref: 'captura-001.png', veredicto: 'ocurrio', paso_final: 4
    }],
    confirmaciones: [{
      almacen: 'confirmaciones', sello: sa, accion: 'publicar', estado: 'pendiente',
      caduca: '2026-11-11T12:05:00Z'
    }],
    autorizaciones: [{
      almacen: 'autorizaciones', sello: sa, quien: 'dueno', alcance: 'publicar',
      cuando: '2026-11-11T10:00:00Z', decision: 'si'
    }],
    catalogo: {
      recetas: [{
        almacen: 'catalogo-recetas', plataforma: 'instagram', capacidad: 'publicar',
        version: 2, pasos_total: 7, sello: sa
      }]
    },
    memoria: {
      cambios: [{ almacen: 'memoria-cambios', plataforma: 'instagram', que: 'el boton Crear paso a +', sello: sa }]
    },
    cobertura: { plataforma: 'instagram', proporcion: 1, capacidades: ['publicar', 'leer'] }
  };
}

const SECRETOS = Object.freeze({
  contrasena: 'hunter2-taller',
  cookie: 'sessionid=37819%3Aabc123def; csrftoken=XYZ987',
  jwt: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.abc123',
  codigo: '483920',
  en_prosa: 'password=SuperSecreta1'
});

// El mismo estado, con cinco secretos colados a distinta profundidad.
function estadoConSecretos() {
  const e = estadoCompleto();
  e.fichas['@taller_a'].acceso = { usuario: '@taller_a', password: SECRETOS.contrasena };
  e.sesion = { estado: 'viva', cookie: SECRETOS.cookie };
  e.evidencia[0].referencia_larga = SECRETOS.jwt;
  e.confirmaciones[0].codigo = SECRETOS.codigo;
  e.memoria.nota = SECRETOS.en_prosa;
  return e;
}

test('ningun_secreto_en_el_estado_completo', () => {
  const estado = estadoCompleto();

  const reporte = auditar(estado);
  assert.strictEqual(reporte.estado, 'limpio', `hallazgos: ${JSON.stringify(reporte.rutas)}`);
  assert.strictEqual(reporte.total, 0);
  assert.deepStrictEqual(reporte.hallazgos, []);
  assert.strictEqual(admitir_en_estado(estado), true);

  // Y con los cinco secretos dentro, el invariante se rompe de forma audible.
  const sucio = auditar(estadoConSecretos());
  assert.strictEqual(sucio.estado, 'con_hallazgos');
  assert.strictEqual(sucio.total, 5, `hallazgos: ${JSON.stringify(sucio.rutas)}`);
  assert.deepStrictEqual(
    sucio.familias,
    [FAMILIAS.CODIGO_UNICO, FAMILIAS.CONTRASENA, FAMILIAS.COOKIE, FAMILIAS.CREDENCIAL, FAMILIAS.TOKEN].sort()
  );
  assert.deepStrictEqual(sucio.rutas.sort(), [
    'confirmaciones[0].codigo',
    'evidencia[0].referencia_larga',
    'fichas.@taller_a.acceso.password',
    'memoria.nota',
    'sesion.cookie'
  ]);
  assert.strictEqual(admitir_en_estado(estadoConSecretos()), false);

  // El informe NO repite el secreto: ni entero, ni recortado.
  const serializado = JSON.stringify(sucio);
  for (const [familia, valor] of Object.entries(SECRETOS)) {
    assert.strictEqual(serializado.includes(valor), false, `el informe repite el secreto (${familia})`);
  }
  for (const h of sucio.hallazgos) {
    assert.strictEqual(h.oculto, true);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(h, 'valor'), false);
    assert.ok(h.motivo && h.motivo.length > 10, 'cada hallazgo lleva su motivo');
  }
});

test('se_descarta_sin_guardar_y_se_avisa', () => {
  const recibido = { cuenta: '@taller_a', acceso: { password: SECRETOS.contrasena } };
  const r = rechazar(recibido);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.descartado, true);
  assert.strictEqual(r.guardado, false);
  assert.strictEqual(r.motivo, 'secreto_recibido');
  assert.deepStrictEqual(r.familias, [FAMILIAS.CONTRASENA]);
  assert.strictEqual(r.aviso.evento, EVENTO_AVISO);
  assert.strictEqual(r.aviso.guardado, false);
  assert.strictEqual(r.aviso.oculto, true);
  assert.strictEqual(JSON.stringify(r).includes(SECRETOS.contrasena), false, 'el aviso tampoco lo copia');

  // `descartar` es el nombre del diseno para la misma operacion.
  assert.strictEqual(descartar, rechazar);

  // Un dato limpio no se descarta.
  const limpio = rechazar({ cuenta: '@taller_a', estado: 'vigente' });
  assert.strictEqual(limpio.descartado, false);
  assert.strictEqual(limpio.guardado, true);
  assert.strictEqual(limpio.aviso, null);
});

test('los_datos_legitimos_que_se_parecen_a_un_secreto_no_se_marcan', () => {
  const legitimo = {
    autorizaciones: [{ quien: 'dueno', alcance: 'publicar', decision: 'si', cuando: '2026-11-11T10:00:00Z' }],
    clave_natural: '@taller_a',
    claves: ['publicar', 'leer'],
    tokens_usados: 1200,
    tokens_totales: 4000,
    code: 'INVALID_INPUT',
    mensaje: 'la receta no tiene postcondicion',
    codigo_postal: '28001',
    codigo_error: 'E_RECETA',
    estado: 'vigente',
    sesion: 'viva',
    cuenta: '@taller_a',
    momento: '2026-11-11T12:00:00Z',
    sello: sello('proy-a')
  };
  assert.deepStrictEqual(detectar_secreto(legitimo), []);
  assert.strictEqual(auditar(legitimo).estado, 'limpio');
});

test('el_valor_delata_aunque_la_clave_no_lo_diga', () => {
  assert.deepStrictEqual(detectar_secreto({ cabecera: 'Bearer abcdefghij0123456789' }).map((h) => h.familia), [FAMILIAS.TOKEN]);
  assert.deepStrictEqual(detectar_secreto({ destino: 'https://taller:clave1234@proxy.local/x' }).map((h) => h.familia), [FAMILIAS.CREDENCIAL]);
  assert.deepStrictEqual(detectar_secreto({ adjunto: '-----BEGIN RSA PRIVATE KEY-----MIIEow' }).map((h) => h.familia), [FAMILIAS.CLAVE_PRIVADA]);
  assert.deepStrictEqual(detectar_secreto({ nota: SECRETOS.en_prosa }).map((h) => h.familia), [FAMILIAS.CREDENCIAL]);
  // Dentro de una lista tambien: la bandeja guarda texto de terceros.
  const enLista = detectar_secreto({ bandejas: [{ mensaje: 'mi contrasena: hunter2' }] });
  assert.strictEqual(enLista.length, 1);
  assert.strictEqual(enLista[0].ruta, 'bandejas[0].mensaje');
});

test('motivo_nombra_la_familia_y_nunca_es_generico_por_vago', () => {
  for (const familia of Object.values(FAMILIAS)) {
    const m = motivo(familia);
    assert.ok(m && m.length > 10, `la familia ${familia} tiene motivo propio`);
    assert.notStrictEqual(m, motivo(), 'no cae en el generico');
  }
  assert.match(motivo(FAMILIAS.TOKEN), /token/);
  assert.match(motivo(), /secreto/);
  const hallazgo = detectar_secreto({ cookie: SECRETOS.cookie })[0];
  assert.strictEqual(motivo(hallazgo), motivo(FAMILIAS.COOKIE));
});

test('un_estado_circular_no_cuelga_la_auditoria', () => {
  const ciclico = { cuenta: '@taller_a' };
  ciclico.yo = ciclico;
  assert.deepStrictEqual(detectar_secreto(ciclico), []);
});

test('la_auditoria_tambien_vale_sobre_una_lista_de_estados', () => {
  const r = auditar([estadoCompleto(), estadoCompleto()]);
  assert.strictEqual(r.estado, 'limpio');
  const sucio = auditar([estadoCompleto(), { acceso: { password: SECRETOS.contrasena } }]);
  assert.strictEqual(sucio.total, 1);
  assert.strictEqual(sucio.rutas[0], '[1].acceso.password');
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; console.log(`  ok  ${name}`); }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[instagram-bridge__no-secretos] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[instagram-bridge__no-secretos] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
