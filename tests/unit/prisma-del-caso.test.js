'use strict';

/**
 * prisma-del-caso — la ABSTRACCIÓN del caso-de-dato (el molde universal).
 *
 * Verifica el espectro completo con soysuper como CASO TESTIGO (la primera luz):
 * clasificar por rasgos declarados (rectificable/irrectificable, no fuzzy/determinista),
 * descomponer en los 5 huecos con preguntas abiertas, el objetivo tipado del juez
 * (circuloCerrado FÉRTIL — nombra lo que falta, jamás un "no" pelado) y el sellado de
 * la senda ganadora (la tabla que EMERGE, no se escribe).
 *
 * Ejecutar: node tests/unit/prisma-del-caso.test.js
 */

const assert = require('assert');
const { NATURALEZA_IDS, clasificar, descomponer, circuloCerrado, sellarSenda, leyDeLaEvidencia } =
  require('../../modules/_shared/prisma-del-caso');

function test(desc, fn) {
  try { fn(); console.log(`✓ ${desc}`); }
  catch (err) { console.error(`✗ ${desc}\n  ${err.message}`); process.exit(1); }
}

console.log('prisma-del-caso — el molde universal del caso-de-dato\n');

// ── clasificar: la línea es rectificable/irrectificable, por rasgos DECLARADOS ──

test('clasificar: precio de soysuper (afirma sobre el mundo) → AFIRMACION_EXTERNA', () => {
  assert.strictEqual(clasificar({ afirma_sobre_el_mundo: true }), 'AFIRMACION_EXTERNA');
});

test('clasificar: coste_total (se deriva de líneas internas) → DERIVABLE, aunque hable del mundo', () => {
  assert.strictEqual(clasificar({ derivable_de_internos: true, afirma_sobre_el_mundo: true }), 'DERIVABLE');
});

test('clasificar: receta creativa (no afirma, no deriva) → CREACION (default)', () => {
  assert.strictEqual(clasificar({}), 'CREACION');
});

test('clasificar: registro abierto — un custom con prioridad gana a la semilla', () => {
  const extra = [{ id: 'MEDICION_SENSOR', reglas: [{ de_sensor: true }], exige_evidencia: true }];
  assert.strictEqual(clasificar({ de_sensor: true, afirma_sobre_el_mundo: true }, extra), 'MEDICION_SENSOR');
});

// ── descomponer: el caso testigo soysuper, en sus 5 huecos ──

test('descomponer(soysuper): identidad + freno del dominio + contrato con evidencia + preguntas del loop', () => {
  const h = descomponer({
    necesidad: 'precio del ingrediente', entidad: 'mozzarella rallada',
    dominio: 'escandallo', rasgos: { afirma_sobre_el_mundo: true },
    herramientas: ['crawl4rs.leer.request']
  });
  assert.strictEqual(h.identidad.naturaleza, 'AFIRMACION_EXTERNA');
  assert.strictEqual(h.restricciones.freno, 'escandallo.validar');
  assert.ok('evidencia' in h.contrato, 'el contrato de una afirmación externa lleva evidencia');
  assert.ok(h.preguntas_abiertas.some(p => /evidencia/.test(p)), 'pregunta dónde vive la evidencia');
  assert.ok(h.preguntas_abiertas.some(p => /PERSISTE|persiste/i.test(p)), 'pregunta el evento de cierre');
  assert.deepStrictEqual(h.herramientas_candidatas, ['crawl4rs.leer.request']);
});

test('descomponer(creación): el contrato NO exige evidencia y las preguntas cambian', () => {
  const h = descomponer({ necesidad: 'receta nueva', entidad: 'pizza de otoño', dominio: 'recetas' });
  assert.strictEqual(h.identidad.naturaleza, 'CREACION');
  assert.ok(!('evidencia' in h.contrato), 'la creación no lleva dirección de vuelta');
});

// ── circuloCerrado: el objetivo tipado del juez — FÉRTIL, nombra lo que falta ──

test('circuloCerrado(soysuper): valor SIN evidencia → NO cerrado, y dice que falta la dirección de vuelta', () => {
  const v = circuloCerrado({ naturaleza: 'AFIRMACION_EXTERNA', valor: 4.62, freno_verde: true, persistido: true });
  assert.strictEqual(v.cerrado, false);
  assert.ok(v.faltan.some(f => /evidencia/.test(f)), `faltan debe nombrar la evidencia: ${v.faltan}`);
});

test('circuloCerrado(soysuper): valor + evidencia(url) + freno verde + persistido → CERRADO', () => {
  const v = circuloCerrado({
    naturaleza: 'AFIRMACION_EXTERNA', valor: 4.62,
    evidencia: 'https://soysuper.com/p/mozzarella-maxi-santa-lucia-250-g',
    freno_verde: true, persistido: true
  });
  assert.deepStrictEqual(v, { cerrado: true, faltan: [] });
});

test('circuloCerrado: sin persistir (lo que pasó en nonina: precio en el chat, nada guardado) → NO cerrado', () => {
  const v = circuloCerrado({ naturaleza: 'AFIRMACION_EXTERNA', valor: 0.91, evidencia: 'https://soysuper.com/p/x', freno_verde: true });
  assert.strictEqual(v.cerrado, false);
  assert.ok(v.faltan.some(f => /persistido/.test(f)), 'el círculo no cierra hasta que el evento de cierre se emite');
});

test('circuloCerrado(DERIVABLE): no exige evidencia — se re-deriva', () => {
  const v = circuloCerrado({ naturaleza: 'DERIVABLE', valor: 12.4, freno_verde: true, persistido: true });
  assert.strictEqual(v.cerrado, true);
});

// ── sellarSenda: la senda ganadora, lista para la cantera (la tabla emerge) ──

test('sellarSenda(soysuper): pasos + evento_cierre + tipo_evidencia → senda sellable', () => {
  const s = sellarSenda({
    caso: { necesidad: 'precio del ingrediente', entidad: 'mozzarella', dominio: 'escandallo' },
    naturaleza: 'AFIRMACION_EXTERNA',
    pasos: [
      { evento: 'crawl4rs.leer.request', hace: 'buscar la ficha en soysuper /search' },
      { evento: 'crawl4rs.leer.request', hace: 'leer la ficha /p/<slug> (precio en markdown)' },
      { evento: 'recetas.actualizar_precio.request', hace: 'cachear {precio, fuente:soysuper, url}' }
    ],
    evento_cierre: 'recetas.actualizar_precio.request',
    tipo_evidencia: 'url'
  });
  assert.ok(s, 'senda sellada');
  assert.strictEqual(s.nombre, 'senda-escandallo-precio-del-ingrediente');
  assert.strictEqual(s.evento_cierre, 'recetas.actualizar_precio.request');
  assert.ok(/reflejo/.test(s.escalera), 'declara la escalera de determinismo');
});

test('sellarSenda: una afirmación SIN tipo_evidencia NO se sella (senda no de fiar)', () => {
  const s = sellarSenda({
    caso: { dominio: 'escandallo' }, naturaleza: 'AFIRMACION_EXTERNA',
    pasos: [{ evento: 'crawl4rs.leer.request', hace: 'x' }], evento_cierre: 'recetas.actualizar_precio.request'
  });
  assert.strictEqual(s, null);
});

test('sellarSenda: sin pasos o sin evento de cierre → null (aún no hay senda)', () => {
  assert.strictEqual(sellarSenda({ caso: {}, naturaleza: 'CREACION', pasos: [], evento_cierre: 'x' }), null);
  assert.strictEqual(sellarSenda({ caso: {}, naturaleza: 'CREACION', pasos: [{ evento: 'a', hace: 'b' }] }), null);
});

console.log(`\n✓ prisma-del-caso: todas las aserciones pasan (naturalezas: ${[...NATURALEZA_IDS].join(', ')})`);


// ── LEY DE LA EVIDENCIA: la fuente jamás se veta por nombre ──
test('ley: derivadas internas (catalogo, sub_receta) pasan sin evidencia — se re-derivan', () => {
  assert.strictEqual(leyDeLaEvidencia({ fuente: 'catalogo' }).ok, true);
  assert.strictEqual(leyDeLaEvidencia({ fuente: 'sub_receta' }).naturaleza, 'DERIVABLE');
});

test('ley: manual pasa — el humano es la evidencia (testimonio)', () => {
  assert.deepStrictEqual(leyDeLaEvidencia({ fuente: 'manual' }), { ok: true, naturaleza: 'TESTIMONIO' });
});

test('ley: mercadona pasa — su producto_id cacheado es la vuelta', () => {
  assert.strictEqual(leyDeLaEvidencia({ fuente: 'mercadona' }).ok, true);
});

test('ley: una fuente DESCONOCIDA con evidencia ENTRA (makro + url, sin tocar código)', () => {
  const r = leyDeLaEvidencia({ fuente: 'makro', url: 'https://tienda.makro.es/p/x' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.naturaleza, 'AFIRMACION_EXTERNA');
});

test('ley: una fuente desconocida SIN evidencia no entra — y el fallo es FÉRTIL (nombra el camino)', () => {
  const r = leyDeLaEvidencia({ fuente: 'adivinada' });
  assert.strictEqual(r.ok, false);
  assert.ok(/nombra tu evidencia/.test(r.falta), 'el no lleva su gemelo positivo dentro');
});

test('ley: la estimación es IRRECTIFICABLE — jamás pasa como real, con o sin lo que sea', () => {
  const r = leyDeLaEvidencia({ fuente: 'estimado_llm', url: 'https://da-igual.com' });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.naturaleza, 'IRRECTIFICABLE');
});
