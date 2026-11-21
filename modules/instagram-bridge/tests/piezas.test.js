'use strict';

/**
 * instagram-bridge · L1 · PreparadorDePieza (CONVERSOR)
 *
 * La frontera de formato del sistema. Esta suite fija:
 *   - `admitir` no toca nada y rechaza diciendo QUE falta (caracteres, MB, s);
 *   - `adaptar` recorta el texto por frases enteras y NO cambia el sentido;
 *   - el recorte es un PREFIJO del original (no añade, no reordena, no invierte);
 *   - una frase no se corta por la mitad: ni un "no" suelto ni un "45 €" -> "4";
 *   - si la primera frase no cabe, se rechaza: recortarla seria cambiar el mensaje;
 *   - el encuadre se declara y, si perderia lo que la pieza ensena, se rechaza.
 *
 * Ejecutar: node modules/instagram-bridge/tests/piezas.test.js
 */

const assert = require('assert');

const l1 = require('../operacion/piezas');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const LARGO = 'Volvemos al torno el lunes con las plazas abiertas del taller. ';

// ---------------------------------------------------------------------------
// 1 · adaptar recorta y no cambia el sentido
// ---------------------------------------------------------------------------

test('adaptar_recorta_y_no_cambia_el_sentido', () => {
  // Un texto que no cabe: 60 frases iguales, 3780 caracteres.
  const original = LARGO.repeat(60);
  assert.ok(original.length > l1.REGLAS.instagram.texto_max);

  const r = l1.adaptar({ id: 'p-1', origen: 'proy-a', texto: original });
  assert.strictEqual(r.ok, true, r.motivo);
  assert.strictEqual(r.estado, 'preparada');
  assert.strictEqual(r.plataforma, 'instagram');

  const recortado = r.pieza.texto;
  assert.ok(recortado.length <= l1.REGLAS.instagram.texto_max, 'cabe en el limite');
  assert.ok(recortado.length > 0, 'la pieza no se queda sin mensaje');

  // LA PROPIEDAD QUE HACE IMPOSIBLE INVERTIR EL SENTIDO: es un prefijo.
  assert.strictEqual(original.startsWith(recortado), true, 'el recorte es un prefijo del original');

  // Se declara lo que se quito, con el original a la vista.
  assert.strictEqual(r.recorte.hubo, true);
  assert.strictEqual(r.recorte.campos.length, 1);
  assert.strictEqual(r.recorte.campos[0], 'texto');
  assert.ok(r.recorte.caracteres_quitados > 0);
  assert.ok(r.recorte.frases_quitadas > 0);
  assert.strictEqual(r.recorte.detalle[0].texto_original, original);

  // Y la pieza declara su preparacion: quien publica no adivina.
  assert.strictEqual(r.pieza.preparacion.recortada, true);
  assert.strictEqual(r.pieza.preparacion.destino, 'publicacion');
  assert.strictEqual(r.pieza.preparacion.texto_max, 2200);

  // El texto que cabe no se toca.
  const corto = l1.adaptar({ id: 'p-2', texto: 'Abrimos el sabado por la manana.' });
  assert.strictEqual(corto.ok, true);
  assert.strictEqual(corto.pieza.texto, 'Abrimos el sabado por la manana.');
  assert.strictEqual(corto.recorte.hubo, false);

  // `admitir` no adapta: rechaza y dice exactamente cuanto sobra.
  const rechazo = l1.admitir({ id: 'p-3', texto: original });
  assert.strictEqual(rechazo.ok, false);
  assert.strictEqual(rechazo.motivo, 'texto_no_cabe');
  assert.strictEqual(rechazo.que_falta.campo, 'texto');
  assert.strictEqual(rechazo.que_falta.maximo, 2200);
  assert.strictEqual(rechazo.que_falta.caracteres_de_mas, original.length - 2200);
  assert.strictEqual(rechazo.que_falta.arreglo, 'adaptar (recorta frases enteras por el final)');
});

// ---------------------------------------------------------------------------
// 2 · recortar no puede invertir el sentido ni comerse el dato
// ---------------------------------------------------------------------------

test('recortar_no_puede_invertir_el_sentido_ni_comerse_el_dato', () => {
  // --- una frase no se corta por la mitad ---------------------------------
  // "No abrimos el martes" cortado a 12 daria "No abrimos e...", que dice otra
  // cosa. Con frases enteras, o entra la frase o no entra.
  const negacion = 'No abrimos el martes ni el miercoles por la tarde, solo el jueves. Abrimos el sabado.';
  const corteMedio = l1.recortar_texto(negacion, 70);
  assert.strictEqual(corteMedio.ok, true);
  assert.ok(corteMedio.texto.endsWith('.'), 'el recorte acaba en frase entera');
  assert.strictEqual(negacion.startsWith(corteMedio.texto), true);
  assert.strictEqual(corteMedio.texto.startsWith('No abrimos'), true, 'la negacion no se queda a medias');
  assert.notStrictEqual(corteMedio.texto, 'No abrimos el martes ni el mi');

  // --- un dato no se parte ------------------------------------------------
  // El precio esta dentro de la frase: si la frase no cabe, no entra; lo que no
  // puede pasar es quedarse con "45" y perder los euros.
  const conPrecio = 'El taller cuesta 45 euros al mes y empieza el lunes. Trae tu delantal.';
  const r = l1.recortar_texto(conPrecio, 60);
  assert.strictEqual(r.ok, true);
  if (r.texto.length < conPrecio.length) {
    assert.ok(!/(?:^|\s)45$/.test(r.texto), 'no puede quedarse con el numero sin su unidad');
    assert.ok(r.texto.includes('45 euros') || !r.texto.includes('45'), 'el dato entra completo o no entra');
  }

  // --- una URL no se parte ------------------------------------------------
  const conUrl = `Hola. ${'a'.repeat(2190)} https://taller.ejemplo/curso-de-ceramica`;
  const ur = l1.recortar_texto(conUrl, 2200);
  assert.strictEqual(ur.ok, true);
  assert.ok(ur.texto.length <= 2200);
  assert.strictEqual(conUrl.includes(ur.texto), true, 'es un trozo literal del original');
  assert.ok(!/https:\/\/taller\.ejem$/.test(ur.texto), 'la URL no se corta a la mitad');

  // --- la primera frase manda: si no cabe, hay rechazo, no recorte ---------
  const primeraLarga = `${'x'.repeat(2300)}. Y luego mas.`;
  const imposible = l1.recortar_texto(primeraLarga, 2200);
  assert.strictEqual(imposible.ok, false);
  assert.strictEqual(imposible.motivo, 'texto_no_cabe_sin_cambiar_el_sentido');
  // La primera frase son 2300 letras mas el punto: 101 de mas sobre 2200.
  assert.strictEqual(imposible.que_falta.caracteres_de_mas, 101);
  assert.strictEqual(imposible.texto, '', 'no devuelve un texto a medias');

  const piezaImposible = l1.adaptar({ id: 'p-larga', texto: primeraLarga });
  assert.strictEqual(piezaImposible.ok, false);
  assert.strictEqual(piezaImposible.motivo, 'texto_no_cabe_sin_cambiar_el_sentido');
  assert.strictEqual(piezaImposible.que_falta.regla, 'la primera frase no se recorta: recortarla cambia lo que la pieza dice');

  // --- las frases se localizan sin tocar el texto -------------------------
  const t = 'Uno. Dos! Tres?\nCuatro sin punto';
  assert.strictEqual(l1.frases_de(t).join(''), t, 'partir en frases no cambia ni un caracter');

  // --- lo que sobra se dice: el recorte nunca es silencioso ---------------
  const largo = LARGO.repeat(60);
  const declarado = l1.adaptar({ id: 'p-4', texto: largo });
  assert.strictEqual(declarado.recorte.hubo, true);
  assert.strictEqual(declarado.recorte.detalle[0].caracteres, largo.length);
  assert.strictEqual(declarado.recorte.detalle[0].caracteres_finales, declarado.pieza.texto.length);
  assert.strictEqual(largo.startsWith(declarado.pieza.texto), true);
});

// ---------------------------------------------------------------------------
// 3 · completitud, adjuntos y encuadre
// ---------------------------------------------------------------------------

test('sin_mensaje_no_hay_pieza_y_el_encuadre_se_declara', () => {
  const vacia = l1.adaptar({ id: 'p-5' });
  assert.strictEqual(vacia.ok, false);
  assert.strictEqual(vacia.motivo, 'sin_mensaje');
  assert.deepStrictEqual(vacia.faltan, ['mensaje']);

  // El limite de texto no es el unico: peso, duracion y numero de adjuntos.
  const pesada = l1.adaptar({ texto: 'hola', adjuntos: [{ tipo: 'imagen', referencia: 'a.jpg', peso_mb: 12 }] });
  assert.strictEqual(pesada.motivo, 'pesa_de_mas');
  assert.strictEqual(pesada.que_falta.mb_de_mas, 4);

  const largaDuracion = l1.adaptar({ texto: 'hola', adjuntos: [{ tipo: 'video', referencia: 'a.mp4', proporcion: '9:16', duracion_s: 120 }] }, { destino: 'reel' });
  assert.strictEqual(largaDuracion.motivo, 'duracion_de_mas');
  assert.strictEqual(largaDuracion.que_falta.segundos_de_mas, 30);

  const muchas = l1.adaptar({ texto: 'hola', adjuntos: Array.from({ length: 11 }, (_, i) => ({ tipo: 'imagen', referencia: `a${i}.jpg` })) });
  assert.strictEqual(muchas.motivo, 'adjuntos_de_mas');
  assert.strictEqual(muchas.que_falta.sobran, 1);

  // 16:9 en publicacion: se lleva a 1.91:1 y se declara (no se toca el pixel).
  const imagen = l1.adaptar({ texto: 'hola', adjuntos: [{ tipo: 'imagen', referencia: 'a.jpg', proporcion: '16:9' }] });
  assert.strictEqual(imagen.ok, true);
  assert.strictEqual(imagen.encuadres[0].proporcion_pedida, '16:9');
  assert.strictEqual(imagen.encuadres[0].proporcion_de_salida, '1.91:1');
  assert.strictEqual(imagen.encuadres[0].se_recorta, true);
  assert.strictEqual(imagen.encuadres[0].ejecuta_el_recorte, 'aparato');

  // Un cuadrado en historia perderia casi la mitad: se rechaza, no se recorta.
  const cuadradoEnHistoria = l1.adaptar({ texto: 'hola', adjuntos: [{ tipo: 'imagen', referencia: 'a.jpg', proporcion: '1:1' }] }, { destino: 'historia' });
  assert.strictEqual(cuadradoEnHistoria.ok, false);
  assert.strictEqual(cuadradoEnHistoria.motivo, 'proporcion_no_admisible');
  assert.strictEqual(cuadradoEnHistoria.que_falta.minimo, 0.6);

  // Sin proporcion declarada no se inventa una: se dice que falta.
  const sinProporcion = l1.adaptar({ texto: 'hola', adjuntos: [{ tipo: 'imagen', referencia: 'a.jpg' }] });
  assert.strictEqual(sinProporcion.ok, true);
  assert.strictEqual(sinProporcion.encuadres[0].proporcion_de_salida, null);
  assert.deepStrictEqual(sinProporcion.encuadres[0].faltan, ['proporcion']);

  // Un adjunto sin referencia no es un adjunto.
  const sinRef = l1.comprobar_completitud({ texto: 'hola', adjuntos: [{ tipo: 'imagen' }] });
  assert.strictEqual(sinRef.ok, false);
  assert.deepStrictEqual(sinRef.faltan, ['adjuntos[0].referencia']);
});

// ---------------------------------------------------------------------------
// 4 · el conversor no se sale de su sitio
// ---------------------------------------------------------------------------

test('el_conversor_no_publica_ni_elige_por_nadie', () => {
  // No opina del origen (eso es T1) ni del sello: solo del formato.
  const sinOrigen = l1.adaptar({ id: 'p-6', texto: 'Hola' });
  assert.strictEqual(sinOrigen.ok, true, 'el formato no juzga la procedencia');

  // No escribe: la pieza que entra no se muta.
  const pieza = { id: 'p-7', texto: LARGO.repeat(20), adjuntos: [{ tipo: 'imagen', referencia: 'a.jpg', proporcion: '16:9' }] };
  const copia = JSON.parse(JSON.stringify(pieza));
  l1.adaptar(pieza);
  assert.deepStrictEqual(pieza, copia, 'la pieza original queda intacta');

  // Plataforma y destino desconocidos se nombran, no se suponen.
  assert.strictEqual(l1.adaptar({ texto: 'hola' }, { plataforma: 'tiktok' }).motivo, 'plataforma_desconocida');
  assert.strictEqual(l1.adaptar({ texto: 'hola' }, { destino: 'stories' }).motivo, 'destino_desconocido');

  // Las reglas son datos consultables, no constantes escondidas.
  assert.strictEqual(l1.reglas_de('instagram').texto_max, 2200);
  assert.strictEqual(l1.reglas_de('otra'), null);
  assert.deepStrictEqual(l1.reglas_de().proporciones.historia, ['9:16']);
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
  if (fails.length === 0) { console.log(`\n[instagram-bridge__piezas] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[instagram-bridge__piezas] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
