/**
 * Tests unitarios — pizzepos/reporte-cierre.
 *
 * Qué cubren:
 *   (a) cierre completo  → 1 telegram.send_message.request con botName/chatId,
 *       texto con fecha, total, efectivo esperado/contado y top de productos.
 *   (b) sin chat_id      → NO publica telegram y lo declara en `abierto`.
 *   (c) email_destino    → publica tambien local.gmail.send.request con html.
 *   (d) mismo cierre x2  → la segunda vez no reenvia (duplicado:true).
 *   (e) formato ES       → 1.234,56 € (punto de miles, coma decimal).
 *   (f) Set acotado      → la idempotencia no crece sin limite (max. 100 claves).
 *
 * Ejecutar: node tests/unit/pizzepos__reporte-cierre.test.js
 */

'use strict';

const assert = require('assert');

const ReporteCierreModule = require('../../modules/pizzepos/reporte-cierre/index.js');

// ==========================================
// Bus falso
// ==========================================

function makeBus() {
  const published = [];
  const subs = new Map();

  return {
    published,
    subscribe(event, fn) {
      if (!subs.has(event)) subs.set(event, new Set());
      subs.get(event).add(fn);
      return () => subs.get(event).delete(fn);
    },
    async publish(event, payload) {
      published.push({ event, payload });
    },
    // Atajo de lectura: eventos de un tipo concreto.
    de(tipo) {
      return published.filter(p => p.event === tipo);
    }
  };
}

function makeLogger() {
  const logs = [];
  const push = (nivel) => (evento, datos) => logs.push({ nivel, evento, datos });
  return { logs, debug: push('debug'), info: push('info'), warn: push('warn'), error: push('error') };
}

async function cargar(config) {
  const bus = makeBus();
  const logger = makeLogger();
  const mod = new ReporteCierreModule();
  await mod.onLoad({ logger, metrics: { increment: () => {} }, eventBus: bus, moduleConfig: config || {} });
  return { mod, bus, logger };
}

// ==========================================
// Payload de caja.cerrada de muestra
// ==========================================

function eventoCierre(overrides) {
  const o = overrides || {};
  const cierre = {
    cierre_id: 'cierre_1761868800000',
    project_id: o.project_id || 'p-nonina',
    fecha_jornada: '2026-10-30',
    hora_inicio: '2026-10-30T09:00:00.000Z',
    hora_cierre: '2026-10-30T23:12:45.000Z',
    arqueo: { efectivo: 845, monedas: 0, total_contado: 845 },
    totales: null, // se rellena abajo
    diferencia: -5,
    estado: 'faltante',
    desglose_productos: {
      porFamilia: { Pizzas: { cantidad: 3, importe: 33 }, Bebidas: { cantidad: 12, importe: 24 } },
      porProducto: {
        Folk: { cantidad: 3, importe: 33, familia: 'Pizzas' },
        Margarita: { cantidad: 6, importe: 60, familia: 'Pizzas' },
        Tiramisu: { cantidad: 2, importe: 12, familia: 'Postres' },
        CocaCola: { cantidad: 8, importe: 16, familia: 'Bebidas' },
        Agua: { cantidad: 4, importe: 8, familia: 'Bebidas' },
        Pan: { cantidad: 2, importe: 5, familia: 'Pan' }
      },
      totalUnidades: 25
    },
    cuentas_cerradas_forzadas: [
      { cuenta_id: 'c-1', nombre: 'Mesa 4', total: 25 },
      { cuenta_id: 'c-2', nombre: 'Juan', total: 30 }
    ]
  };

  const totales = {
    total_ventas: 42,
    total_ingresos: 1234.56,
    total_propinas: 12.5,
    por_metodo_pago: { efectivo: 850, tarjeta: 300, bizum: 84.56, transferencia: 0, externo_llevadoo: 0 },
    por_tipo_cuenta: { mesa: 900, telefono: 200, llevar: 134.56, llevadoo: 0 },
    por_camarero: { Ana: 700 }
  };
  cierre.totales = totales;

  return {
    event: 'caja.cerrada',
    metadata: { correlation_id: 'corr-cierre-1' },
    data: {
      fecha: '2026-10-30',
      project_id: o.project_id || 'p-nonina',
      arqueo: cierre.arqueo,
      totales,
      diferencia: o.diferencia !== undefined ? o.diferencia : -5,
      cierre: Object.assign({}, cierre, o.cierre || {}),
      informe: 'INFORME DE TEXTO YA GENERADO (no se usa: el puente compone el suyo)'
    }
  };
}

// ==========================================
// Runner
// ==========================================

const pruebas = [];
function test(nombre, fn) { pruebas.push({ nombre, fn }); }

// ------------------------------------------
// (a) cierre completo → un solo mensaje de Telegram bien formado
// ------------------------------------------
test('(a) cierre completo → publica 1 telegram con botName/chatId y el contenido del día', async () => {
  const { mod, bus } = await cargar({ bot_name: 'Pro_nonina_bot', chat_id: '-1001234567890', telegram_activo: true });

  const salida = await mod.onCajaCerrada(eventoCierre());

  const tg = bus.de('telegram.send_message.request');
  assert.strictEqual(tg.length, 1, 'debe publicar exactamente un telegram.send_message.request');

  const payload = tg[0].payload;
  assert.strictEqual(payload.botName, 'Pro_nonina_bot');
  assert.strictEqual(payload.chatId, -1001234567890, 'chatId numerico');
  assert.strictEqual(payload.parseMode, 'HTML');
  assert.ok(payload.text && payload.text.length > 0);

  const texto = payload.text;
  assert.ok(texto.includes('30/10/2026'), 'lleva la fecha del cierre en formato ES');
  assert.ok(texto.includes('1.234,56 €'), 'lleva el total del día formateado');
  assert.ok(texto.includes('42 ventas'), 'lleva el número de ventas');
  assert.ok(texto.includes('esperado 850,00 €'), 'lleva el efectivo esperado');
  assert.ok(texto.includes('contado 845,00 €'), 'lleva el efectivo contado (arqueo)');
  assert.ok(texto.includes('dif. -5,00 €'), 'lleva la diferencia del efectivo');
  assert.ok(texto.includes('<b>Folk</b> · 3 ud · 33,00 €'), 'top de productos con formato pedido');
  assert.ok(texto.includes('Margarita'), 'el top va ordenado por importe (Margarita, 60 €, entra)');
  assert.ok(texto.indexOf('Margarita') < texto.indexOf('Folk'), 'ordenado por importe descendente');
  assert.ok(texto.includes('Total: 25 ud'), 'total de unidades del desglose');
  assert.ok(texto.includes('Propinas'), 'propinas > 0');
  assert.ok(texto.includes('2 cuentas cerradas a la fuerza'), 'aviso de cuentas forzadas');
  assert.ok(texto.includes('Faltante 5,00 €'), 'estado con el importe');

  // El puente no usa el informe de texto del custodio.
  assert.ok(!texto.includes('INFORME DE TEXTO YA GENERADO'));

  // Constancia de canales: en la salida y en el evento.
  assert.deepStrictEqual(salida.canales, ['telegram']);
  assert.strictEqual(salida.ok, true);
  assert.strictEqual(salida.duplicado, false);

  const enviado = bus.de('cierre.reporte_enviado');
  assert.strictEqual(enviado.length, 1);
  assert.deepStrictEqual(enviado[0].payload.canales, ['telegram']);
  assert.strictEqual(enviado[0].payload.ok, true);
  assert.strictEqual(enviado[0].payload.fecha, '2026-10-30');
  assert.strictEqual(enviado[0].payload.project_id, 'p-nonina');

  // No se publica email sin email_destino.
  assert.strictEqual(bus.de('local.gmail.send.request').length, 0);
  assert.ok(salida.abierto.some(a => a.startsWith('email:')), 'declara que el email no se envió');

  // Un solo mensaje: no se parte en trozos (el reporte es corto).
  assert.ok(texto.length < 4000);
});

// ------------------------------------------
// (b) sin chat_id → no manda telegram y lo declara
// ------------------------------------------
test('(b) sin chat_id → NO publica telegram y lo declara en abierto', async () => {
  const { mod, bus, logger } = await cargar({ bot_name: 'Pro_nonina_bot', telegram_activo: true });

  const salida = await mod.onCajaCerrada(eventoCierre());

  assert.strictEqual(bus.de('telegram.send_message.request').length, 0, 'no debe publicar telegram');
  assert.deepStrictEqual(salida.canales, []);
  assert.strictEqual(salida.ok, false);
  assert.ok(salida.abierto.some(a => a.includes('chat_id')), 'declara la falta de chat_id');

  // Se avisa en el log, no se silencia.
  assert.ok(logger.logs.some(l => l.evento === 'reporte-cierre.telegram.sin_chat_id'));

  // Aun sin canales, queda constancia en el evento de lo que pasó.
  const enviado = bus.de('cierre.reporte_enviado');
  assert.strictEqual(enviado.length, 1);
  assert.deepStrictEqual(enviado[0].payload.canales, []);
  assert.strictEqual(enviado[0].payload.ok, false);
});

// ------------------------------------------
// (c) email_destino → publica también el email en HTML
// ------------------------------------------
test('(c) con email_destino → publica también local.gmail.send.request con html', async () => {
  const { mod, bus } = await cargar({
    bot_name: 'Pro_nonina_bot',
    chat_id: '-1001234567890',
    telegram_activo: true,
    email_destino: 'dueno@ejemplo.es'
  });

  const salida = await mod.onCajaCerrada(eventoCierre());

  const emails = bus.de('local.gmail.send.request');
  assert.strictEqual(emails.length, 1, 'un email por cierre');

  const p = emails[0].payload;
  assert.strictEqual(p.account, 'default');
  assert.strictEqual(p.to, 'dueno@ejemplo.es');
  assert.strictEqual(p.html, true);
  assert.strictEqual(p.subject, 'Cierre de caja 2026-10-30 — faltante');
  assert.ok(typeof p.body === 'string' && p.body.includes('<table'), 'el cuerpo es HTML con tabla');
  assert.ok(p.body.includes('1.234,56 €'), 'mismos importes que el mensaje de Telegram');
  assert.ok(p.body.includes('30/10/2026'), 'misma fecha');

  assert.deepStrictEqual(salida.canales, ['telegram', 'email']);
  assert.strictEqual(bus.de('cierre.reporte_enviado')[0].payload.canales.length, 2);
});

// ------------------------------------------
// (d) idempotencia → el mismo cierre no se reenvía
// ------------------------------------------
test('(d) el mismo cierre dos veces → la segunda no reenvía (duplicado)', async () => {
  const { mod, bus } = await cargar({ bot_name: 'Pro_nonina_bot', chat_id: '123456789', telegram_activo: true });

  const primera = await mod.onCajaCerrada(eventoCierre());
  const segunda = await mod.onCajaCerrada(eventoCierre());

  assert.strictEqual(primera.duplicado, false);
  assert.strictEqual(segunda.duplicado, true);
  assert.deepStrictEqual(segunda.canales, []);
  assert.ok(segunda.abierto.some(a => a.startsWith('duplicado:')));

  assert.strictEqual(bus.de('telegram.send_message.request').length, 1, 'solo un mensaje pese a dos cierres');
  assert.strictEqual(bus.de('cierre.reporte_enviado').length, 1, 'tampoco se duplica la constancia');

  // Otro project_id con la misma fecha SÍ es otro cierre → se envía.
  const otroProyecto = await mod.onCajaCerrada(eventoCierre({ project_id: 'p-the-pirate' }));
  assert.strictEqual(otroProyecto.duplicado, false);
  assert.strictEqual(bus.de('telegram.send_message.request').length, 2);
});

// ------------------------------------------
// (e) importes en formato español
// ------------------------------------------
test('(e) importes en formato ES (1.234,56 €)', async () => {
  const { mod, bus } = await cargar({ chat_id: '123456789' });

  await mod.onCajaCerrada(eventoCierre());
  const texto = bus.de('telegram.send_message.request')[0].payload.text;

  assert.ok(texto.includes('1.234,56 €'), 'miles con punto y decimales con coma');
  assert.ok(!texto.includes('1234.56'), 'no se cuela el formato inglés');

  // Formateador directo, con negativos y millones.
  assert.strictEqual(mod._importe(1234.56), '1.234,56 €');
  assert.strictEqual(mod._importe(1234567.8), '1.234.567,80 €');
  assert.strictEqual(mod._importe(-5), '-5,00 €');
  assert.strictEqual(mod._importe(0), '0,00 €');
});

// ------------------------------------------
// (f) el Set de idempotencia está acotado
// ------------------------------------------
test('(f) la idempotencia en memoria está acotada a 100 claves', async () => {
  const { mod } = await cargar({ chat_id: '123456789' });

  for (let i = 0; i < 130; i++) {
    await mod.onCajaCerrada(eventoCierre({ project_id: `p-${i}` }));
  }

  assert.ok(mod._enviados.size <= 100, `el Set debe quedar acotado (quedó en ${mod._enviados.size})`);
  assert.ok(mod._enviados.has('2026-10-30::p-129'), 'las claves recientes sí se recuerdan');
  assert.ok(!mod._enviados.has('2026-10-30::p-0'), 'las más antiguas se descartan');
});

// ------------------------------------------
// (g) sin fecha no hay reporte (nunca se inventa)
// ------------------------------------------
test('(g) evento sin fecha → no envía nada y lo declara', async () => {
  const { mod, bus } = await cargar({ chat_id: '123456789' });

  const salida = await mod.onCajaCerrada({ data: { project_id: 'p-nonina', totales: { total_ingresos: 10 } } });

  assert.strictEqual(bus.de('telegram.send_message.request').length, 0);
  assert.strictEqual(bus.de('cierre.reporte_enviado').length, 0);
  assert.ok(salida.abierto.some(a => a.startsWith('fecha:')));
});

// ------------------------------------------
// (h) rama hermana: cierre.esperado/contado/diferencias si vienen, mandan
// ------------------------------------------
test('(h) si el cierre trae esperado/contado/diferencias por método, se usan esos', async () => {
  const { mod, bus } = await cargar({ chat_id: '123456789' });

  const ev = eventoCierre();
  ev.data.cierre.esperado = { efectivo: 850, tarjeta: 300 };
  ev.data.cierre.contado = { efectivo: 845, tarjeta: 300 };
  ev.data.cierre.diferencias = {
    efectivo: { esperado: 850, contado: 845, diferencia: -5 },
    tarjeta: { esperado: 300, contado: 300, diferencia: 0 }
  };

  await mod.onCajaCerrada(ev);
  const texto = bus.de('telegram.send_message.request')[0].payload.text;

  assert.ok(texto.includes('<b>Efectivo</b>: esperado 850,00 € · contado 845,00 € · dif. -5,00 €'));
  assert.ok(texto.includes('<b>Tarjeta</b>: esperado 300,00 € · contado 300,00 € · dif. 0,00 €'));
  // Bizum no trae desglose: cae al importe cobrado, sin inventar contado.
  assert.ok(texto.includes('<b>Bizum</b>: 84,56 €'));
  assert.ok(!texto.includes('Bizum</b>: esperado'), 'no inventa esperado donde no lo hay');
});

// ------------------------------------------
// (i) sin arqueo: el efectivo no inventa "contado"
// ------------------------------------------
test('(i) sin arqueo ni desglose → el efectivo solo muestra el importe cobrado', async () => {
  const { mod, bus } = await cargar({ chat_id: '123456789' });

  const ev = eventoCierre();
  delete ev.data.arqueo;
  delete ev.data.cierre.arqueo;
  // `cierre.arqueo` eliminado: el módulo no debe inventar el contado.
  ev.data.cierre.arqueo = {};
  ev.data.diferencia = null;
  ev.data.cierre.diferencia = null;
  ev.data.cierre.estado = null;

  await mod.onCajaCerrada(ev);
  const texto = bus.de('telegram.send_message.request')[0].payload.text;

  assert.ok(texto.includes('<b>Efectivo</b>: esperado 850,00 €'), 'esperado desde totales.por_metodo_pago');
  assert.ok(!texto.includes('contado'), 'sin arqueo no hay contado que mostrar');
  assert.ok(texto.includes('Estado: <b>Estado no declarado</b>'), 'sin estado ni diferencia no se inventa uno');
});

// ==========================================
// Ejecución
// ==========================================

(async () => {
  console.log('pizzepos__reporte-cierre — puente de reporte al dueño\n');
  let fallos = 0;

  for (const { nombre, fn } of pruebas) {
    try {
      await fn();
      console.log(`✓ ${nombre}`);
    } catch (err) {
      fallos++;
      console.error(`✗ ${nombre}`);
      console.error(`  ${err && err.message ? err.message : err}`);
      if (process.env.STACK && err && err.stack) console.error(err.stack);
    }
  }

  console.log('');
  if (fallos > 0) {
    console.error(`${fallos} prueba(s) fallida(s)`);
    process.exit(1);
  }
  console.log(`${pruebas.length} pruebas en verde`);
})();
