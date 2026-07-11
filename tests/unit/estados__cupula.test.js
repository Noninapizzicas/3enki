'use strict';

/**
 * estados__cupula — la cúpula de estados (reflejo custodio de listas ordenadas).
 * Un primitivo, muchas caras. Freno entre pasos en orden estricto. Instanciar
 * desde plantilla de proceso (PRISMA hereda). fs en memoria (stub de _rpc).
 *
 * Ejecutar: node tests/unit/estados__cupula.test.js
 */

const assert = require('assert');
const EstadosReflejo = require('../../modules/estados');

// ── arnés: instancia con fs en memoria ──
function nuevo() {
  const r = new EstadosReflejo();
  const fs = new Map(); // `${project_id}::${path}` → content string
  r.logger = { info() {}, warn() {}, error() {}, debug() {} };
  r.metrics = { increment() {} };
  r.eventBus = { publish() {} };
  r._rpc = async (evento, payload) => {
    const key = `${payload.project_id}::${payload.path}`;
    if (evento === 'fs.read.request') {
      return fs.has(key) ? { status: 200, content: fs.get(key) } : { status: 404 };
    }
    if (evento === 'fs.write.request') { fs.set(key, payload.content); return { status: 200 }; }
    return null;
  };
  return r;
}

const PID = 'proj-test';
const tests = [];
const test = (n, f) => tests.push({ n, f });

test('crear lista libre → 201 y estado la muestra con pasos pendientes', async () => {
  const r = nuevo();
  const c = await r._crear({ project_id: PID, nombre: 'Compras', tipo: 'compras', pasos: ['leche', 'pan', 'huevos'] });
  assert.strictEqual(c.status, 201);
  assert.strictEqual(c.data.orden, 'libre');
  assert.strictEqual(c.data.total_pasos, 3);
  const e = await r._estado({ project_id: PID, lista_id: 'compras' });
  assert.strictEqual(e.status, 200);
  assert.strictEqual(e.data.lista.pasos.length, 3);
  assert.ok(e.data.lista.pasos.every(p => p.estado === 'pendiente'));
});

test('crear duplicado → 409', async () => {
  const r = nuevo();
  await r._crear({ project_id: PID, nombre: 'Tareas' });
  const dup = await r._crear({ project_id: PID, nombre: 'Tareas' });
  assert.strictEqual(dup.status, 409);
});

test('orden estricto: avanzar sin el campo del freno → atascado + faltan; con el campo → avanza', async () => {
  const r = nuevo();
  await r._crear({ project_id: PID, nombre: 'Envio', orden: 'estricto', pasos: [
    { clave: 'recoge', texto: 'Recoge' },
    { clave: 'realiza', texto: 'Realiza', freno: { requiere: ['hecho'] } },
    { clave: 'entrega', texto: 'Entrega' }
  ] });
  // paso 0 (recoge) sin freno → avanza directo
  const a0 = await r._avanzar({ project_id: PID, lista_id: 'envio' });
  assert.strictEqual(a0.data.avanzado, true);
  // paso 1 (realiza) con freno requiere:['hecho'] → sin entrega → atascado
  const a1 = await r._avanzar({ project_id: PID, lista_id: 'envio' });
  assert.strictEqual(a1.data.avanzado, false);
  assert.strictEqual(a1.data.atascado, true);
  assert.deepStrictEqual(a1.data.faltan, ['hecho']);
  // ahora con la entrega válida → avanza, siguiente recoge
  const a1b = await r._avanzar({ project_id: PID, lista_id: 'envio', entrega: { hecho: true } });
  assert.strictEqual(a1b.data.avanzado, true);
  assert.ok(a1b.data.siguiente);
  // paso 2 (entrega) sin freno → avanza y completa
  const a2 = await r._avanzar({ project_id: PID, lista_id: 'envio' });
  assert.strictEqual(a2.data.completa, true);
});

test('avanzar en lista LIBRE → 409 (avanzar es de orden estricto)', async () => {
  const r = nuevo();
  await r._crear({ project_id: PID, nombre: 'Notas', pasos: ['idea'] });
  const a = await r._avanzar({ project_id: PID, lista_id: 'notas' });
  assert.strictEqual(a.status, 409);
});

test('marcar en libre: tachar un paso; todos cerrados → lista completa', async () => {
  const r = nuevo();
  await r._crear({ project_id: PID, nombre: 'Compra', pasos: ['leche', 'pan'] });
  let e = await r._estado({ project_id: PID, lista_id: 'compra' });
  const [p0, p1] = e.data.lista.pasos;
  await r._marcar({ project_id: PID, lista_id: 'compra', paso_id: p0.id, estado: 'hecho' });
  const m = await r._marcar({ project_id: PID, lista_id: 'compra', paso_id: p1.id, estado: 'hecho' });
  assert.strictEqual(m.status, 200);
  e = await r._estado({ project_id: PID, lista_id: 'compra' });
  assert.strictEqual(e.data.lista.estado, 'completa');
});

test('instanciar servicio → proceso de 4 pasos, orden estricto, frenos en realiza y cobra', async () => {
  const r = nuevo();
  const i = await r._instanciar({ project_id: PID, arquetipo: 'servicio', nombre: 'Corte de pelo' });
  assert.strictEqual(i.status, 201);
  assert.strictEqual(i.data.arquetipo, 'servicio');
  assert.strictEqual(i.data.orden, 'estricto');
  assert.strictEqual(i.data.total_pasos, 4);
  const e = await r._estado({ project_id: PID, lista_id: 'corte_de_pelo' });
  const frenados = e.data.lista.pasos.filter(p => p.freno).map(p => p.freno.requiere.join(','));
  assert.deepStrictEqual(frenados, ['hecho', 'pagado']);
});

test('instanciar arquetipo desconocido → 404', async () => {
  const r = nuevo();
  const i = await r._instanciar({ project_id: PID, arquetipo: 'no_existe' });
  assert.strictEqual(i.status, 404);
});

test('instanciar uso_temporal → proceso alquiler con freno en devuelve (estado_ok)', async () => {
  const r = nuevo();
  await r._instanciar({ project_id: PID, arquetipo: 'uso_temporal', nombre: 'Alquiler bici' });
  const e = await r._estado({ project_id: PID, lista_id: 'alquiler_bici' });
  const devuelve = e.data.lista.pasos.find(p => p.id.includes('devuelve'));
  assert.ok(devuelve && devuelve.freno);
  assert.deepStrictEqual(devuelve.freno.requiere, ['estado_ok']);
});

test('añadir un paso a una lista existente → total crece', async () => {
  const r = nuevo();
  await r._crear({ project_id: PID, nombre: 'Pendientes', pasos: ['a'] });
  const add = await r._anadir({ project_id: PID, lista_id: 'pendientes', texto: 'b' });
  assert.strictEqual(add.status, 200);
  assert.strictEqual(add.data.total_pasos, 2);
});

test('activar + estado sin lista_id devuelve la ACTIVA (lo que lee el nervio)', async () => {
  const r = nuevo();
  await r._crear({ project_id: PID, nombre: 'Uno', pasos: ['x'] });
  await r._crear({ project_id: PID, nombre: 'Dos', pasos: ['y'] });
  await r._activar({ project_id: PID, lista_id: 'dos' });
  const e = await r._estado({ project_id: PID }); // sin lista_id → activa
  assert.strictEqual(e.data.lista.id, 'dos');
  assert.strictEqual(e.data.activa, true);
});

test('estado sin activa ni lista_id → { activa:null, lista:null } (el nervio no inyecta nada)', async () => {
  const r = nuevo();
  const e = await r._estado({ project_id: PID });
  assert.strictEqual(e.status, 200);
  assert.strictEqual(e.data.lista, null);
});

test('borrar una lista → desaparece y limpia la activa', async () => {
  const r = nuevo();
  await r._crear({ project_id: PID, nombre: 'Temp', pasos: ['z'], activar: true });
  const b = await r._borrar({ project_id: PID, lista_id: 'temp' });
  assert.strictEqual(b.status, 200);
  const l = await r._listar({ project_id: PID });
  assert.strictEqual(l.data.total, 0);
  assert.strictEqual(l.data.activa, null);
});

// ── TOOLS del chat (el LLM PROPONE; args ya enriquecidos con project_id) ──
test('tool crear_lista crea y ACTIVA; ver_listas la ve como activa', async () => {
  const r = nuevo();
  const c = await r.handleCrearListaTool({ project_id: PID, nombre: 'Lanzamiento', pasos: ['a', 'b'] });
  assert.strictEqual(c.status, 201);
  const v = await r.handleVerListasTool({ project_id: PID });
  assert.strictEqual(v.data.activa, 'lanzamiento');
  assert.strictEqual(v.data.total, 1);
});

test('tool anadir_paso añade a la ACTIVA sin manejar lista_id', async () => {
  const r = nuevo();
  await r.handleCrearListaTool({ project_id: PID, nombre: 'Compra', pasos: ['leche'] });
  const add = await r.handleAnadirPasoTool({ project_id: PID, texto: 'pan' });
  assert.strictEqual(add.status, 200);
  assert.strictEqual(add.data.total_pasos, 2);
});

test('tool anadir_paso sin lista activa → 409 (crea una primero)', async () => {
  const r = nuevo();
  const add = await r.handleAnadirPasoTool({ project_id: PID, texto: 'x' });
  assert.strictEqual(add.status, 409);
});

test('tool completar_paso: en LIBRE tacha por numero; en ESTRICTO avanza', async () => {
  const r = nuevo();
  // libre: tachar el paso 2 por numero
  await r.handleCrearListaTool({ project_id: PID, nombre: 'Libre', pasos: ['uno', 'dos'] });
  const m = await r.handleCompletarPasoTool({ project_id: PID, numero: 2 });
  assert.strictEqual(m.status, 200);
  let e = await r._estado({ project_id: PID, lista_id: 'libre' });
  assert.strictEqual(e.data.lista.pasos[1].estado, 'hecho');
  // estricto: avanza el actual (con freno cumplido)
  await r.handleCrearListaTool({ project_id: PID, nombre: 'Estricta', orden: 'estricto', pasos: ['p1'] });
  const a = await r.handleCompletarPasoTool({ project_id: PID });
  assert.strictEqual(a.data.avanzado, true);
});

test('tool ver_listas con activar cambia la activa', async () => {
  const r = nuevo();
  await r.handleCrearListaTool({ project_id: PID, nombre: 'Primera', pasos: ['x'] });
  await r.handleCrearListaTool({ project_id: PID, nombre: 'Segunda', pasos: ['y'] });
  const v = await r.handleVerListasTool({ project_id: PID, activar: 'primera' });
  assert.strictEqual(v.data.activa, 'primera');
});

test('tool borrar_lista sin id borra la ACTIVA (el LLM cierra el ciclo)', async () => {
  const r = nuevo();
  await r.handleCrearListaTool({ project_id: PID, nombre: 'Terminada', pasos: ['a'] });
  const b = await r.handleBorrarListaTool({ project_id: PID });
  assert.strictEqual(b.status, 200);
  const l = await r.handleVerListasTool({ project_id: PID });
  assert.strictEqual(l.data.total, 0);
  assert.strictEqual(l.data.activa, null);
});

test('tool borrar_lista sin lista ni activa → 400', async () => {
  const r = nuevo();
  const b = await r.handleBorrarListaTool({ project_id: PID });
  assert.strictEqual(b.status, 400);
});

// ─── EL JUEZ DEL RAIL (objetivo + veredicto con blocker tipado) ──────────────

test('fijar_objetivo sobre la activa → queda en la lista y lo lee el estado', async () => {
  const r = nuevo();
  await r._crear({ project_id: PID, nombre: 'Lanzamiento', activar: true });
  const f = await r.handleFijarObjetivoTool({ project_id: PID, objetivo: 'carta publicada con todo costeado' });
  assert.strictEqual(f.status, 200);
  const e = await r._estado({ project_id: PID });
  assert.strictEqual(e.data.lista.objetivo, 'carta publicada con todo costeado');
});

test('crear acepta objetivo inline', async () => {
  const r = nuevo();
  const c = await r._crear({ project_id: PID, nombre: 'Obra', objetivo: 'terminada y entregada' });
  assert.strictEqual(c.status, 201);
  const e = await r._estado({ project_id: PID, lista_id: 'obra' });
  assert.strictEqual(e.data.lista.objetivo, 'terminada y entregada');
});

test('evaluar_rail satisfecho → registra, marca la lista completa, emite goal.cumplido', async () => {
  const r = nuevo();
  const ev = [];
  r.eventBus = { publish: (e, d) => ev.push({ e, d }) };
  await r._crear({ project_id: PID, nombre: 'Meta', objetivo: 'todo hecho', activar: true });
  const res = await r.handleEvaluarRailTool({ project_id: PID, veredicto: { satisfecho: true, blocker: 'none', razon: 'listo', evidencia: 'la carta está publicada' } });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.data.satisfecho, true);
  const e = await r._estado({ project_id: PID });
  assert.strictEqual(e.data.lista.estado, 'completa');
  assert.strictEqual(e.data.lista.ultima_evaluacion.satisfecho, true);
  assert.ok(ev.some(x => x.e === 'estados.goal.cumplido'), 'emite goal.cumplido');
});

test('EL FRENO: veredicto no-satisfecho SIN blocker tipado → 422 con la lista de blockers', async () => {
  const r = nuevo();
  await r._crear({ project_id: PID, nombre: 'Meta', objetivo: 'x', activar: true });
  const bad = await r.handleEvaluarRailTool({ project_id: PID, veredicto: { satisfecho: false, blocker: 'none' } });
  assert.strictEqual(bad.status, 422);
  assert.ok(Array.isArray(bad.error.details.blockers) && bad.error.details.blockers.includes('missing_evidence'));
  const bad2 = await r.handleEvaluarRailTool({ project_id: PID, veredicto: { satisfecho: false, blocker: 'inventado' } });
  assert.strictEqual(bad2.status, 422);
});

test('evaluar_rail no-satisfecho con blocker tipado → registra el blocker, NO completa', async () => {
  const r = nuevo();
  await r._crear({ project_id: PID, nombre: 'Meta', objetivo: 'x', activar: true });
  const res = await r.handleEvaluarRailTool({ project_id: PID, veredicto: { satisfecho: false, blocker: 'needs_user_input', razon: 'falta que elija el precio' } });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.data.blocker, 'needs_user_input');
  const e = await r._estado({ project_id: PID });
  assert.notStrictEqual(e.data.lista.estado, 'completa');
  assert.strictEqual(e.data.lista.ultima_evaluacion.blocker, 'needs_user_input');
});

test('evaluar_rail sobre lista sin objetivo → 409 (fija uno primero)', async () => {
  const r = nuevo();
  await r._crear({ project_id: PID, nombre: 'SinMeta', activar: true });
  const res = await r.handleEvaluarRailTool({ project_id: PID, veredicto: { satisfecho: true, blocker: 'none' } });
  assert.strictEqual(res.status, 409);
});

test('PRISMA cuando procede: fijar_objetivo CON rasgos externos → círculo tipado adjunto', async () => {
  const r = nuevo();
  await r._crear({ project_id: PID, nombre: 'Imagenes', activar: true });
  const res = await r._fijarObjetivo({
    project_id: PID, lista_id: 'Imagenes', objetivo: 'imagen del producto',
    entidad: 'ponte mis gafas', dominio: 'contenido',
    rasgos: { afirma_sobre_el_mundo: true }
  });
  assert.strictEqual(res.status, 200);
  assert.ok(res.data.prisma, 'debe adjuntar el prisma');
  assert.strictEqual(res.data.prisma.identidad.naturaleza, 'AFIRMACION_EXTERNA');
  // exige evidencia → el contrato lleva el hueco de la dirección de vuelta
  assert.ok('evidencia' in res.data.prisma.contrato, 'el contrato debe exigir evidencia');
  assert.ok(res.data.prisma.preguntas_abiertas.some(q => /evidencia/i.test(q)), 'pregunta por la evidencia');
});

test('PRISMA no adivina: fijar_objetivo SIN rasgos → rail intacto (solo texto, sin prisma)', async () => {
  const r = nuevo();
  await r._crear({ project_id: PID, nombre: 'Libre', activar: true });
  const res = await r._fijarObjetivo({ project_id: PID, lista_id: 'Libre', objetivo: 'ordenar el menú' });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.data.prisma, null, 'sin rasgos declarados no se fuerza prisma');
});

test('ESPEJO: lista con prisma EXTERNA + hechos incompletos → NO satisfecho, faltan nombra evidencia+persistido', async () => {
  const r = nuevo();
  await r._crear({ project_id: PID, nombre: 'Img', activar: true });
  await r._fijarObjetivo({ project_id: PID, lista_id: 'Img', objetivo: 'imagen', dominio: 'contenido', rasgos: { afirma_sobre_el_mundo: true } });
  const res = await r._evaluar({ project_id: PID, lista_id: 'Img', estado: { valor: 'foto', freno_verde: true, persistido: false } });
  assert.strictEqual(res.data.satisfecho, false);
  assert.ok(res.data.faltan.some(f => /evidencia/i.test(f)), 'exige la dirección de vuelta');
  assert.ok(res.data.faltan.some(f => /persistido/i.test(f)), 'exige el evento de cierre');
  assert.strictEqual(res.data.blocker, 'missing_evidence');
});

test('ESPEJO anti-confabulación: sin hechos, el rail NO se cierra (el LLM no puede declararse hecho)', async () => {
  const r = nuevo();
  await r._crear({ project_id: PID, nombre: 'Img2', activar: true });
  await r._fijarObjetivo({ project_id: PID, lista_id: 'Img2', objetivo: 'imagen', dominio: 'contenido', rasgos: { afirma_sobre_el_mundo: true } });
  const res = await r._evaluar({ project_id: PID, lista_id: 'Img2', estado: {} });   // "ya está" sin nada
  assert.strictEqual(res.data.satisfecho, false, 'no hay done sin hechos');
});

test('ESPEJO: hechos completos (valor+evidencia+freno+persistido) → círculo cerrado', async () => {
  const r = nuevo();
  await r._crear({ project_id: PID, nombre: 'Img3', activar: true });
  await r._fijarObjetivo({ project_id: PID, lista_id: 'Img3', objetivo: 'imagen', dominio: 'contenido', rasgos: { afirma_sobre_el_mundo: true } });
  const res = await r._evaluar({ project_id: PID, lista_id: 'Img3', estado: { valor: 'foto', evidencia: { url: 'https://i0.wp.com/x.jpg' }, freno_verde: true, persistido: true } });
  assert.strictEqual(res.data.satisfecho, true);
  assert.strictEqual(res.data.blocker, 'none');
  assert.strictEqual(res.data.estado, 'completa');
});

test('LEY plegada en el círculo: fuente estimado_llm NO cuenta como evidencia (enemigo cazado en el rail)', async () => {
  const r = nuevo();
  await r._crear({ project_id: PID, nombre: 'Est', activar: true });
  await r._fijarObjetivo({ project_id: PID, lista_id: 'Est', objetivo: 'precio', dominio: 'escandallo', rasgos: { afirma_sobre_el_mundo: true } });
  // el LLM dice "hecho" con todo en verde, pero la fuente es una estimación
  const res = await r._evaluar({ project_id: PID, lista_id: 'Est', estado: { valor: 9, evidencia: '9€', fuente: 'estimado_llm', freno_verde: true, persistido: true } });
  assert.strictEqual(res.data.satisfecho, false, 'una estimación no cierra el círculo');
  assert.ok(res.data.faltan.some(f => /vuelta|evidencia/i.test(f)), 'nombra la falta de dirección de vuelta');
});

test('LEY plegada: fuente desconocida CON url → evidencia avalada → círculo cierra', async () => {
  const r = nuevo();
  await r._crear({ project_id: PID, nombre: 'Ok', activar: true });
  await r._fijarObjetivo({ project_id: PID, lista_id: 'Ok', objetivo: 'imagen', dominio: 'contenido', rasgos: { afirma_sobre_el_mundo: true } });
  const res = await r._evaluar({ project_id: PID, lista_id: 'Ok', estado: { valor: 'foto', fuente: 'esthervolta', url: 'https://i0.wp.com/x.jpg', freno_verde: true, persistido: true } });
  assert.strictEqual(res.data.satisfecho, true, 'con dirección de vuelta (url) la evidencia cuenta');
});

(async () => {
  let ok = 0; const fails = [];
  for (const { n, f } of tests) { try { await f(); ok++; } catch (e) { fails.push({ n, e }); } }
  if (fails.length === 0) { console.log(`\n[estados__cupula] OK ${ok}/${tests.length}`); process.exit(0); }
  console.error(`\n[estados__cupula] FAIL ${fails.length}/${tests.length}`);
  for (const { n, e } of fails) console.error(`  x ${n}\n    ${e.message}`);
  process.exit(1);
})();
