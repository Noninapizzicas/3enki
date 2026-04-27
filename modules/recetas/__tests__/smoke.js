/**
 * Smoke test local de modules/recetas v2.
 *
 * Carga el módulo con un eventBus mockeado que:
 *   - simula filesystem (mantiene un Map<path,string> en memoria)
 *   - simula project-manager (devuelve slug "test")
 *
 * Ejecuta secuencialmente las 13 tools y verifica que el resultado es coherente.
 */

const path = require('path');
const RecetasModule = require('/home/user/2enki/modules/recetas/index.js');

// ---------- Mock EventBus ----------
const fakeFs = new Map();
const subscribers = new Map();

const eventBus = {
  subscribe(event, handler) {
    if (!subscribers.has(event)) subscribers.set(event, []);
    subscribers.get(event).push(handler);
  },
  async publish(event, data) {
    // Simulate fs.read.request
    if (event === 'fs.read.request') {
      const { request_id, path: p } = data;
      setImmediate(() => {
        const content = fakeFs.get(p);
        if (content === undefined) {
          dispatch('fs.read.response', { request_id, status: 404, error: 'File not found' });
        } else {
          dispatch('fs.read.response', { request_id, success: true, content, status: 200 });
        }
      });
      return;
    }
    if (event === 'fs.write.request') {
      const { request_id, path: p, content } = data;
      setImmediate(() => {
        fakeFs.set(p, content);
        dispatch('fs.write.response', { request_id, success: true, status: 200 });
      });
      return;
    }
    if (event === 'project.get.request') {
      const { request_id, project_id } = data;
      setImmediate(() => {
        dispatch('project.get.response', {
          request_id, success: true,
          project: { id: project_id, name: 'Test', slug: 'test', base_path: '/tmp/test' }
        });
      });
      return;
    }
    // Capturar tool responses (las usamos para verificar)
    if (event.endsWith('.response') && !['fs.read.response','fs.write.response','project.get.response'].includes(event)) {
      // ignora — los toolResponses los esperamos vía dispatch del propio módulo
    }
    dispatch(event, data);
  }
};

function dispatch(event, data) {
  const handlers = subscribers.get(event) || [];
  for (const h of handlers) {
    try { h({ data }); } catch (e) { console.error('handler error', event, e); }
  }
}

// ---------- Mock logger ----------
const logger = {
  info:  (msg, ctx) => {},
  warn:  (msg, ctx) => console.log('WARN', msg, ctx || ''),
  error: (msg, ctx) => console.log('ERR ', msg, ctx || ''),
  debug: () => {}
};

// ---------- Cargar módulo ----------
async function main() {
  const mod = new RecetasModule();
  await mod.onLoad({ logger, eventBus });

  // Suscribir todos los handlers que el module.json declara
  const moduleJson = require('/home/user/2enki/modules/recetas/module.json');
  for (const sub of moduleJson.events.subscribes) {
    const handlerName = sub.handler;
    if (typeof mod[handlerName] === 'function') {
      eventBus.subscribe(sub.event, (e) => mod[handlerName](e));
    }
  }

  const PROJECT = '00000000-0000-0000-0000-000000000001';

  // ---------- Helper: invocar tool y esperar response ----------
  async function callTool(toolName, params) {
    const crypto = require('crypto');
    const request_id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const respEvent = `${toolName}.response`;
      const handler = ({ data }) => {
        if (data.request_id !== request_id) return;
        // unsub one-shot
        const arr = subscribers.get(respEvent) || [];
        const idx = arr.indexOf(handler);
        if (idx >= 0) arr.splice(idx, 1);
        if (data.error) return reject(new Error(data.error));
        resolve(data.result);
      };
      if (!subscribers.has(respEvent)) subscribers.set(respEvent, []);
      subscribers.get(respEvent).push(handler);
      eventBus.publish(toolName, { request_id, project_id: PROJECT, ...params });
      setTimeout(() => reject(new Error(`Timeout ${toolName}`)), 3000);
    });
  }

  function assert(cond, msg) {
    if (!cond) { console.log(`  ✗ ${msg}`); failed++; }
    else { console.log(`  ✓ ${msg}`); passed++; }
  }

  let passed = 0, failed = 0;
  let recetaId = null;

  // -------- TEST 1: estadisticas en proyecto vacío --------
  console.log('\n[1] estadisticas (vacío)');
  let s = await callTool('recetas.estadisticas', {});
  assert(s.total_recetas === 0, 'total_recetas=0');
  assert(s.ingredientes_catalogo === 0, 'ingredientes_catalogo=0');

  // -------- TEST 2: crear con datos completos --------
  console.log('\n[2] crear (datos completos)');
  let r = await callTool('recetas.crear', {
    nombre: 'Tomate Frito',
    ingredientes: [
      { nombre: 'tomate', cantidad: 1, unidad: 'kg' },
      { nombre: 'aceite oliva', cantidad: 50, unidad: 'ml' },
      { nombre: 'sal', cantidad: 1, unidad: 'pizca' }
    ],
    instrucciones: ['Triturar el tomate', 'Sofreir con aceite', 'Salar'],
    porciones: 4,
    tiempo_min: 30,
    dificultad: 2
  });
  assert(r.id, `id devuelto: ${r.id}`);
  assert(r.incompleta === false, 'incompleta=false (todos los campos)');
  assert(r.campos_pendientes.length === 0, 'sin campos pendientes');
  assert(r.ingredientes_formateados?.includes('tomate'), 'ingredientes_formateados contiene tomate');
  recetaId = r.id;

  // -------- TEST 3: crear con datos parciales (sólo nombre + ingredientes) --------
  console.log('\n[3] crear (parcial — solo nombre + ingredientes)');
  let r2 = await callTool('recetas.crear', {
    nombre: 'Alioli',
    ingredientes: 'ajo, aceite, sal'
  });
  assert(r2.id, 'id devuelto');
  assert(r2.incompleta === true, 'incompleta=true (faltan porciones e instrucciones)');
  assert(r2.campos_pendientes.includes('porciones'), 'porciones en pendientes');
  assert(r2.campos_pendientes.includes('instrucciones'), 'instrucciones en pendientes');

  // -------- TEST 4: crear duplicado (mismo nombre activo) --------
  console.log('\n[4] crear duplicado');
  try {
    let dup = await callTool('recetas.crear', { nombre: 'Tomate Frito' });
    assert(dup.error, 'devuelve error de duplicado');
  } catch (e) {
    assert(false, 'no lanzó: ' + e.message);
  }

  // -------- TEST 5: listar --------
  console.log('\n[5] listar');
  let l = await callTool('recetas.listar', {});
  assert(l.total === 2, `total=2 (es ${l.total})`);
  assert(l.recetas.some(x => x.nombre === 'Tomate Frito'), 'incluye Tomate Frito');
  assert(l.recetas.some(x => x.incompleta), 'incluye al menos una incompleta');

  // -------- TEST 6: listar solo incompletas --------
  console.log('\n[6] listar solo_incompletas');
  let li = await callTool('recetas.listar', { solo_incompletas: true });
  assert(li.total === 1, `solo_incompletas=1 (es ${li.total})`);
  assert(li.recetas[0].nombre === 'Alioli', 'es el Alioli');

  // -------- TEST 7: obtener por nombre --------
  console.log('\n[7] obtener (por nombre)');
  let o = await callTool('recetas.obtener', { nombre: 'Tomate Frito' });
  assert(o.id === recetaId, 'mismo id');
  assert(Array.isArray(o.ingredientes) && o.ingredientes.length === 3, '3 ingredientes');
  assert(o.versiones_anteriores === 0, 'sin versiones anteriores');

  // -------- TEST 8: buscar por ingrediente --------
  console.log('\n[8] buscar (ingrediente=tomate)');
  let b = await callTool('recetas.buscar', { ingrediente: 'tomate' });
  assert(b.total === 1, `total=1 (es ${b.total})`);
  assert(b.recetas[0].nombre === 'Tomate Frito', 'devuelve Tomate Frito');

  // -------- TEST 9: actualizar --------
  console.log('\n[9] actualizar (cambiar dificultad)');
  let u = await callTool('recetas.actualizar', {
    receta_id: recetaId,
    cambios: { dificultad: 3, porciones: 6 }
  });
  assert(u.version === 2, `version=2 (es ${u.version})`);
  assert(u.cambios_aplicados.dificultad?.antes === 2, 'cambio.dificultad.antes=2');
  assert(u.cambios_aplicados.dificultad?.despues === 3, 'cambio.dificultad.despues=3');

  // -------- TEST 10: historial --------
  console.log('\n[10] historial');
  let h = await callTool('recetas.historial', { receta_id: recetaId });
  assert(h.version_actual === 2, 'version_actual=2');
  assert(h.versiones_anteriores === 1, '1 version anterior');
  assert(h.historial[0].version === 1, 'history[0].version=1');

  // -------- TEST 11: revertir --------
  console.log('\n[11] revertir a v1');
  let rev = await callTool('recetas.revertir', { receta_id: recetaId, target_version: 1 });
  assert(rev.revertida_a_version === 1, 'revertida_a_version=1');
  assert(rev.version_actual === 3, `version_actual=3 (era 2 + 1 nueva por revert) — es ${rev.version_actual}`);

  // verificar que dificultad volvió a 2
  let after = await callTool('recetas.obtener', { receta_id: recetaId });
  assert(after.dificultad === 2, `dificultad de vuelta a 2 (es ${after.dificultad})`);

  // -------- TEST 12: actualizar_precio --------
  console.log('\n[12] actualizar_precio (crear ingrediente nuevo)');
  let p = await callTool('recetas.actualizar_precio', {
    nombre: 'aceite oliva', precio_mercado: 9, unidad: 'litro'
  });
  assert(p.status === 'actualizado', 'status=actualizado');
  let ing = await callTool('recetas.ingredientes', {});
  assert(ing.total === 1, `catálogo tiene 1 (es ${ing.total})`);
  assert(ing.ingredientes[0].precio_mercado === 9, 'precio=9');

  // -------- TEST 13: analizar (con catálogo parcial) --------
  console.log('\n[13] analizar (cataloog parcial → coste_es_real=false)');
  let a = await callTool('recetas.analizar', { receta_id: recetaId });
  assert(a.coste_es_real === false, 'coste_es_real=false (faltan tomate y sal)');
  assert(a.ingredientes.some(i => i.nombre === 'aceite oliva' && i.en_catalogo), 'aceite oliva en catálogo');
  assert(a.ingredientes.some(i => i.nombre === 'tomate' && !i.en_catalogo), 'tomate NO en catálogo');

  // -------- TEST 14: investigar_receta (existente) --------
  console.log('\n[14] investigar_receta (existente)');
  let i1 = await callTool('recetas.investigar_receta', { nombre_receta: 'Tomate Frito' });
  assert(i1.existe_en_proyecto === true, 'existe=true');

  // -------- TEST 15: investigar_receta (no existente) --------
  console.log('\n[15] investigar_receta (no existente)');
  let i2 = await callTool('recetas.investigar_receta', { nombre_receta: 'Paella Valenciana' });
  assert(i2.existe_en_proyecto === false, 'existe=false');
  assert(i2.instruccion_para_llm, 'incluye instruccion_para_llm');

  // -------- TEST 16: eliminar --------
  console.log('\n[16] eliminar');
  let e = await callTool('recetas.eliminar', { receta_id: recetaId });
  assert(e.status === 'archivada', 'archivada');
  let l2 = await callTool('recetas.listar', {});
  assert(!l2.recetas.some(x => x.id === recetaId), 'no aparece en listar (default solo activas)');

  // -------- TEST 17: verificar que el archivo JSON tiene la estructura esperada --------
  console.log('\n[17] estructura del archivo final');
  const fileContent = fakeFs.get('@/projects/test/recetas.json');
  assert(fileContent, 'archivo existe');
  const parsed = JSON.parse(fileContent);
  assert(parsed._version === '1.0', '_version=1.0');
  assert(Array.isArray(parsed.recetas), 'recetas es array');
  assert(Array.isArray(parsed.ingredientes_catalogo), 'ingredientes_catalogo es array');
  assert(parsed.recetas.length === 2, '2 recetas (Tomate Frito archivada, Alioli activa)');
  const tf = parsed.recetas.find(r => r.nombre === 'Tomate Frito');
  assert(tf.estado === 'archivada', 'Tomate Frito archivada');
  assert(tf.history.length === 2, `Tomate Frito history tiene 2 versiones (es ${tf.history.length})`);

  // ---------- Resumen ----------
  console.log(`\n══════════════════════════════════════════`);
  console.log(`Resultado: ${passed} pasaron, ${failed} fallaron`);
  console.log(`══════════════════════════════════════════`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
