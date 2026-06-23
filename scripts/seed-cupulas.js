/**
 * seed-cupulas.js — siembra cúpulas de ejemplo en la bóveda de un proyecto,
 * usando las PROYECCIONES REALES del reflejo `cupulas` contra disco. Los ficheros
 * (.md navegables + _index.json) quedan exactamente como el módulo los escribe,
 * así el sistema en marcha los lee y un humano los abre en Obsidian.
 *
 *   node scripts/seed-cupulas.js [project_id]    (default: _ejemplo)
 *
 * Las notas son patrones del PROPIO sistema (prosa mínima, cuerpo en pseudocódigo/
 * OOP) — semilla útil, no de juguete.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const CupulasReflejo = require('../modules/cupulas/index.js');

const PID = process.argv[2] || '_ejemplo';
const STORAGE = path.join(process.cwd(), 'data', 'projects', PID, 'storage');

// fs reflejo emulado: mapea el path lógico del módulo a storage/ del proyecto.
function fsStub(ev, p) {
  if (ev !== 'fs.write.request' && ev !== 'fs.read.request') return null;
  const abs = path.join(STORAGE, p.path.replace(/^\//, ''));
  if (ev === 'fs.write.request') {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, p.content, 'utf-8');
    return { status: 201 };
  }
  return fs.existsSync(abs) ? { status: 200, content: fs.readFileSync(abs, 'utf-8') } : { status: 404 };
}

const m = new CupulasReflejo();
m._rpc = async (ev, p) => fsStub(ev, p);
m._publicarEvento = async () => {};

async function add(payload) {
  const r = await m._addNota({ project_id: PID, ...payload });
  if (r.status >= 400) throw new Error(`add_nota ${payload.titulo}: ${JSON.stringify(r)}`);
  return r;
}
async function cupula(tema, tipo, descripcion) {
  const r = await m._crearCupula({ project_id: PID, tema, tipo, descripcion });
  if (r.status >= 400 && r.error?.code !== 'CONFLICT_STATE') throw new Error(`crear ${tema}: ${JSON.stringify(r)}`);
  return r.data?.cupula_id || m._slug(tema);
}

(async () => {
  // ── Cúpula 1: CLASES (OOP, patrones del sistema) ──
  const c1 = await cupula('Clases núcleo', 'clase', 'Patrones OOP base del event-core');

  await add({
    cupula: c1, titulo: 'EventBus', lenguaje: 'oop',
    resumen: 'productor→broker→consumidor; desacople total (Observer)',
    enlaces: ['atender-rpc'],
    contenido:
`CLASE EventBus HEREDA EventEmitter {
  publish(eventType, data, opts) { crea Envelope; super.emit(local); mqtt.publish }
  subscribe(eventType, handler) -> unsub
  emit(eventType, data) { hooks.beforeEventPublish; publish }
}`
  });

  await add({
    cupula: c1, titulo: 'ModuloHibridoReflejo', lenguaje: 'oop',
    resumen: 'base de la mitad determinista; _atender + store por fs',
    enlaces: ['eventbus', 'atender-rpc'],
    contenido:
`ABSTRACT CLASE ModuloHibridoReflejo HEREDA BaseModule {
  onLoad/onUnload
  _rpc(evento, payload) -> publishAndWait genérico al bus
  _atender(event, op, responseEvent, fn) -> guard + proyección + response
  _leerJson/_editarJson(project_id, path) -> store vía fs reflejo
  // el subclase solo escribe sus proyecciones _<op>(input): {status,data}
}`
  });

  await add({
    cupula: c1, titulo: 'Atender RPC', id: 'atender-rpc', lenguaje: 'pseudo',
    resumen: 'request/response correlada por request_id (un handler = 1 línea)',
    contenido:
`FUNCION _atender(event, op, responseEvent, proyeccion):
  d <- event.data
  result <- proyeccion(d)        // { status, data } | error canónico
  publish(responseEvent, { request_id: d.request_id, ...result })
  RETORNA result`
  });

  // ── Cúpula 2: SKILLS (recetas operativas, prosa mínima) ──
  const c2 = await cupula('Skills de módulo', 'skill', 'Recetas para autorar/migrar módulos');

  await add({
    cupula: c2, titulo: 'Blueprint coherente', lenguaje: 'pseudo',
    resumen: 'toda op de blueprint = 5 fases, sin agentes',
    enlaces: ['modulo-hibrido-receta'],
    contenido:
`ESPINAZO (5 fases SIEMPRE):
  CONTRATO : input tipado + precondiciones (guards)
  LEER     : publishAndWait('<mod>.<lectura>.request')   // REFLEJO
  PENSAR   : el LLM de PÁGINA redacta/decide/interpreta   // fuzzy
  GUARDAR  : publishAndWait('<mod>.<persist>.request')    // REFLEJO
  EMITIR   : publish('<dominio>.<algo>') + RETORNA salida tipada
INVARIANTE: el LLM NUNCA toca fs; entra por el reflejo.`
  });

  await add({
    cupula: c2, titulo: 'Volver híbrido un módulo', id: 'modulo-hibrido-receta', lenguaje: 'pseudo',
    resumen: 'reflejo determinista + blueprint fuzzy, en 5 pasos',
    enlaces: ['modulohibridoreflejo'],
    contenido:
`1. Extiende ModuloHibridoReflejo (la base te da la fontanería del bus).
2. Identifica las ops DETERMINISTAS (lecturas/CRUD + lo que otros piden por RPC).
3. index.js: un on<Op>Request de 1 línea por op (delega a _atender) + proyecciones _<op>.
4. module.json: subscribes mapeando <mod>.<op>.request -> on<Op>Request (+ sube version).
5. blueprint: quita responde:true de esas ops; deja los cajones fuzzy.
GATE: node scripts/validate-hibridos.js -> PASS (sin colisión, handlers existen).`
  });

  // ── Resumen ──
  const cs = await m._listarCupulas({ project_id: PID });
  const g = await m._grafo({ project_id: PID });
  console.log(`Bóveda sembrada en data/projects/${PID}/storage/cupulas/`);
  console.log('Cúpulas:', cs.data.cupulas.map(c => `${c.id}(${c.tipo}):${c.notas_count}`).join('  '));
  console.log(`Grafo: ${g.data.total_nodes} notas, ${g.data.total_edges} enlaces`);
})().catch(e => { console.error('SEED FAIL:', e.message); process.exit(1); });
