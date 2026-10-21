#!/usr/bin/env node
// ── SMOKE LOCAL de un pipeline del motor v3 SIN tocar prod ni ensuciar el repo ──
// Uso: node scripts/smoke-pipeline-local.js <pipeline> '<task>' [<respuesta-fuzzy>]
//   <pipeline>        nombre del pipeline en modules/agentes/registro/store/ (ej. adaptar-a-enki)
//   <task>            el texto que se le pasa (diseño OOP, idea externa, contrato de hoja…)
//   [respuesta-fuzzy] opcional: contenido con el que responderá el stub del gateway.
//                     Si se omite, se genera un plano mínimo de ejemplo.
//
// QUÉ PRUEBA (las 3 cosas que importan):
//   1. LA INYECCIÓN — captura llm.complete.request y muestra la task EFECTIVA que
//      recibe el LLM (rebanadas inyectadas, inventario, mandato). Es la prueba
//      clave de usa_rebanadas/usa_inventario: ver QUÉ contexto llega al fuzzy.
//   2. EL FLUJO — pipeline obtenido del registro → bitácora → fuzzy → reflejo
//      escribir → entregable escrito en /tmp/smoke-<pipeline>/.
//   3. Sin efectos secundarios: _commitar NO se toca (no se ensucia la rama),
//      el entregable va a /tmp, nada entra en el repo ni en prod.
//
// CÓMO FUNCIONA (el contrato real del motor):
//   - El motor publica llm.complete.request por _publicar (no por _pedir).
//   - El gateway real respondería con llm.complete.response → onLlmCompleteResponse.
//   - Aquí el stub de _publicar captura la petición y responde con setTimeout
//     llamando a motor.onLlmCompleteResponse({data:{request_id, content,
//     finish_reason:'end_turn', tokens:{...}}}).
//   - _pedir se sobreescribe para las RPC del pipeline (pipeline.obtener,
//     bitacora.abrir/paso, project.get → base_path /tmp).
//
// PITFALLS aprendidos:
//   - NO sobreescribir _generar directamente para el smoke: saltarse el paso por
//     _publicar pierde la inyección (rebanadas/inventario) que quieres VER.
//   - El require del motor debe ser ABSOLUTO (el script vive en scripts/ y el
//     __dirname no es el repo).
//   - La verificación del mandato es case-sensitive: el código escribe "No
//     inventes" (mayúscula) — buscar /No inventes/, no /no inventes/.
//   - project.get devuelve {project:{base_path}} (no {data:{base_path}}) para
//     que _resolverBasePath cachee el slug y el entregable vaya a /tmp/<slug>.
const path = require('path');
const fs = require('fs');

const REPO = '/home/admin/3enki';
const MOTOR = path.join(REPO, 'modules/conversacion/ai-agent-framework-v3/index.js');
const STORE = path.join(REPO, 'modules/agentes/registro/store');

const [,, pipelineName, task, respuestaFuzzy] = process.argv;
if (!pipelineName || !task) {
  console.error('Uso: node scripts/smoke-pipeline-local.js <pipeline> "<task>" ["<respuesta-fuzzy>"]');
  process.exit(1);
}

const EjecutorMotorModule = require(MOTOR);
const motor = new EjecutorMotorModule();
motor.modulesDir = path.join(REPO, 'modules');

const peticionesVistas = [];
const publicarOriginal = motor._publicar.bind(motor);
motor._publicar = (eventType, data) => {
  if (eventType === 'llm.complete.request') {
    peticionesVistas.push(data);
    const contenido = respuestaFuzzy || `# PLANO DE ACOPLAMIENTO (smoke de ${pipelineName})
## Entidades · ${task.slice(0, 60)}…
## Decisión · REUTILIZA/ADAPTA/CONSTRUYE contra el inventario
## Hojas · 1. H-01 <slug> — FORMA — contrato`;
    setTimeout(() => {
      motor.onLlmCompleteResponse({ data: {
        request_id: data.request_id,
        content: contenido,
        finish_reason: 'end_turn',
        tokens: { total: 100, input: 1000, output: 100 }
      }});
    }, 10);
  }
  return publicarOriginal(eventType, data);
};

motor._pedir = async (eventType, payload) => {
  if (eventType === 'pipeline.obtener.request') {
    const p = JSON.parse(fs.readFileSync(path.join(STORE, `${pipelineName}.json`), 'utf8'));
    return { pipeline: p };
  }
  if (eventType === 'bitacora.abrir.request') return {};
  if (eventType === 'bitacora.paso.request') {
    console.log('  📝 bitácora:', (payload.message || '').slice(0, 110));
    return {};
  }
  if (eventType === 'project.get.request') return { project: { base_path: `/tmp/smoke-${pipelineName}` } };
  return {};
};

(async () => {
  console.log('═'.repeat(64));
  console.log(`SMOKE LOCAL del pipeline: ${pipelineName}`);
  console.log('═'.repeat(64));
  console.log('\n1 · Ejecutando el pipeline…');
  await motor._ejecutarPipeline({
    request_id: `smoke-${Date.now()}`,
    agent_name: pipelineName,
    project_id: 'smoke',
    task,
    conversation_id: null,
    session_id: null,
    shape: 'canonical'
  });

  console.log('\n2 · LO QUE RECIBIÓ EL LLM (la inyección — la prueba clave):');
  const llmReq = peticionesVistas[0];
  if (!llmReq) { console.log('   ❌ el motor NO publicó llm.complete.request'); process.exit(1); }
  const t = llmReq.messages[0].content;
  console.log('   Rebanadas base (patrón):', /### REBANADA: patron\/modulo-real\.md/.test(t) ? '✅' : '—');
  const rebanadas = [...t.matchAll(/### REBANADA: ([^\n]+)/g)].map(m => m[1]);
  if (rebanadas.length) {
    console.log(`   Rebanadas inyectadas (${rebanadas.length}):`);
    rebanadas.forEach(r => console.log('     - ' + r));
  }
  console.log('   Inventario de módulos:', /INVENTARIO DE MÓDULOS/.test(t) ? '✅' : '—');
  console.log('   Mandato "No inventes":', /No inventes/.test(t) ? '✅' : '—');
  console.log('   Tamaño de la task inyectada:', t.length, 'chars');

  console.log('\n3 · Entregable escrito en /tmp/smoke-' + pipelineName + '/');
  const base = `/tmp/smoke-${pipelineName}`;
  if (fs.existsSync(base)) {
    const archivos = [];
    const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f); else archivos.push(f);
    });
    walk(base);
    archivos.forEach(f => console.log('   ✅', f.replace(base, ''), `(${fs.statSync(f).size} B)`));
  } else {
    console.log('   ❌ no se escribió nada en', base);
  }
  process.exit(0);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
