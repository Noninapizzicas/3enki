#!/usr/bin/env node
/**
 * audit-module — auditoría operativa de un módulo, como usuario real.
 *
 * Flujo simple:
 *   1. analyze   módulo (module.json + prompt + context)
 *   2. script    genera guión heurístico (1 mensaje por tool, orden lógico)
 *   3. execute   crea conversación, envía mensajes como si fueras tú escribiendo
 *                en el chat. Espera chat.assistant.saved entre cada uno.
 *   4. export    descarga la conversación via conversation-export API
 *   5. report    analiza el export (mensajes + metadata.tool_calls) y produce
 *                reporte markdown con cobertura, hit_rate, comparativa con
 *                audit anterior si existe.
 *
 * El sistema ya guarda todo (mensajes, tool_calls en metadata, errores). Este
 * script NO replica trazas paralelas: solo dispara mensajes como usuario y
 * lee el export al final.
 *
 * Uso:
 *   node scripts/audit-module.js <slug> [--project=<id|name>] [--wait=<ms>] [--dry-run]
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const mqtt = require('mqtt');

const args = process.argv.slice(2);
const slug = args.find(a => !a.startsWith('--'));
if (!slug) { console.error('Uso: node scripts/audit-module.js <slug> [opciones]'); process.exit(2); }
const opt = (n, d) => { const a = args.find(x => x.startsWith('--'+n+'=')); return a ? a.split('=').slice(1).join('=') : d; };
const hasFlag = (n) => args.includes('--'+n);

const PROJECT_ARG = opt('project', 'Paco');
const BROKER      = opt('broker',  'wss://enki-ai.online/mqtt');
const TOKEN       = opt('token',   'nonina');
const WAIT_MS     = parseInt(opt('wait', '90000'), 10);
const DRY_RUN     = hasFlag('dry-run');

const TS = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUTDIR = path.join('audit', `${slug}-${TS}`);
fs.mkdirSync(OUTDIR, { recursive: true });
const log = (m) => console.log(m);
const elapsed = (() => { const t0 = Date.now(); return () => ((Date.now()-t0)/1000).toFixed(1)+'s'; })();

// ────────────────────────────────────────────────────────────────────
// 1. analyze
// ────────────────────────────────────────────────────────────────────

function analyze(slug) {
  const candidates = ['modules/'+slug, 'modules/conversacion/'+slug, 'modules/pizzepos/'+slug, 'modules/facturacion/'+slug];
  const dir = candidates.find(d => fs.existsSync(path.join(d, 'module.json')));
  if (!dir) throw new Error(`módulo ${slug} no encontrado`);
  const mj = JSON.parse(fs.readFileSync(path.join(dir, 'module.json'), 'utf8'));
  const pj = fs.existsSync(path.join(dir, 'prompt.json'))  ? JSON.parse(fs.readFileSync(path.join(dir, 'prompt.json'), 'utf8'))  : null;
  const cj = fs.existsSync(path.join(dir, 'context.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'context.json'), 'utf8')) : null;
  return {
    slug,
    version: mj.version,
    description: mj.description,
    tools: (mj.tools || []).map(t => ({ name: t.name, description: t.description })),
    role: pj?.role || null,
    intent: pj?.intent || null,
    rules: cj?.rules || []
  };
}

// ────────────────────────────────────────────────────────────────────
// 2. script (heurístico)
// ────────────────────────────────────────────────────────────────────

const MSG_BY_SUFFIX = {
  listar:               (e,s) => `lista las ${e} que tengo.`,
  obtener:              (e,s) => `muestrame la primera ${s} de la lista.`,
  buscar:               (e)   => `busca ${e} relacionadas con tomate.`,
  crear:                (e,s) => `crea una ${s} nueva llamada "audit-test" con datos minimos.`,
  actualizar:           (e,s) => `actualiza la ${s} llamada audit-test anadiendo una nota.`,
  eliminar:             (e,s) => `elimina (archiva) la ${s} llamada audit-test.`,
  historial:            (e,s) => `muestrame el historial de cambios de la ${s} audit-test.`,
  revertir:             (e,s) => `revierte la ${s} audit-test a su version anterior.`,
  estadisticas:         (e)   => `dame estadisticas generales de ${e}.`,
  investigar_receta:    ()    => `comprueba si existe una receta llamada "Pizza Margarita".`,
  ingredientes:         ()    => `lista el catalogo de ingredientes.`,
  actualizar_precio:    ()    => `el huevo cuesta 0.20€ la unidad, actualizalo en el catalogo.`,
  analizar:             ()    => `analiza el coste de la primera receta.`,
  receta:               ()    => `dame el escandallo completo de la primera receta.`,
  global:               ()    => `dame el escandallo global de todas las recetas.`,
  comparar_precios:     ()    => `compara precio_mercado vs precio_compra real del catalogo.`,
  simular_precio:       ()    => `simula precios de venta de 8, 10 y 12€ para la primera receta.`,
  ingrediente_impacto:  ()    => `analiza el impacto del ingrediente "tomate" en mis recetas.`,
  optimizar:            ()    => `proponme optimizaciones de coste.`,
  ficha_tecnica:        ()    => `genera una ficha tecnica de la primera receta.`,
  estudio:              ()    => `hazme un estudio de viabilidad del negocio.`,
  punto_equilibrio:     ()    => `calcula el punto de equilibrio del negocio.`,
  escenario:            ()    => `calcula un escenario con 30 comensales por dia.`,
  comparar_escenarios:  ()    => `compara los escenarios que tengo guardados.`,
  proyeccion:           ()    => `hazme una proyeccion financiera a 6 meses.`,
  guardar_config:       ()    => `guarda la configuracion del negocio: gastos fijos 2000€, tipo restaurante, nombre TestBar.`
};
const ORDER = ['guardar_config','listar','ingredientes','estadisticas','obtener','buscar','investigar_receta','global','comparar_precios','comparar_escenarios','crear','actualizar_precio','actualizar','escenario','historial','analizar','receta','simular_precio','ingrediente_impacto','optimizar','ficha_tecnica','estudio','punto_equilibrio','proyeccion','revertir','eliminar'];

function generateScript(ficha) {
  const entity = ficha.slug;
  const singular = entity.replace(/s$/, '');
  const steps = [];
  const used = new Set();
  for (const suffix of ORDER) {
    for (const t of ficha.tools) {
      if (used.has(t.name)) continue;
      const tSuffix = t.name.split('.').slice(1).join('.').toLowerCase();
      if (tSuffix !== suffix) continue;
      const builder = MSG_BY_SUFFIX[suffix];
      const message = builder ? builder(entity, singular) : `${suffix} ${entity}.`;
      steps.push({ step: steps.length+1, message, expected_tool: t.name });
      used.add(t.name);
    }
  }
  // Tools sin mapping: al final con plantilla mínima
  for (const t of ficha.tools) {
    if (used.has(t.name)) continue;
    steps.push({ step: steps.length+1, message: `usa ${t.name}.`, expected_tool: t.name });
  }
  return { module: ficha.slug, generated_at: new Date().toISOString(), steps };
}

// ────────────────────────────────────────────────────────────────────
// helpers MQTT
// ────────────────────────────────────────────────────────────────────

const buildTopic = (et) => { const p=et.split('.'); return 'core/*/events/'+p[0]+(p.length>1?'/'+p.slice(1).join('/'):''); };
const subTopic   = (et) => { const p=et.split('.'); return 'core/+/events/'+p[0]+(p.length>1?'/'+p.slice(1).join('/'):''); };
const env        = (et,d) => ({ event_id: crypto.randomUUID(), event_type: et, timestamp: new Date().toISOString(), source: { core_id: 'audit-module', module_id: 'audit-module' }, data: d, metadata: {} });

async function resolveProjectId(arg) {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(arg)) return arg;
  return new Promise((resolve, reject) => {
    const c = mqtt.connect(BROKER, { clientId: 'audit-resolve-'+Date.now(), connectTimeout: 8000, reconnectPeriod: 0 });
    const reqId = crypto.randomUUID();
    const tout = setTimeout(() => { c.end(true); reject(new Error('timeout resolving project')); }, 8000);
    c.on('connect', () => c.subscribe(subTopic('project.list.response'), () => c.publish(buildTopic('project.list.request'), JSON.stringify(env('project.list.request', { request_id: reqId })))));
    c.on('message', (t, m) => {
      try {
        const e = JSON.parse(m.toString());
        const d = e.data || e;
        if (d.request_id !== reqId) return;
        clearTimeout(tout); c.end(true);
        const found = (d.projects || []).find(p => (p.name||'').toLowerCase() === arg.toLowerCase());
        found ? resolve(found.id) : reject(new Error(`proyecto "${arg}" no encontrado`));
      } catch {}
    });
  });
}

// ────────────────────────────────────────────────────────────────────
// 3. execute: enviar mensajes como usuario, esperar chat.assistant.saved
// ────────────────────────────────────────────────────────────────────

async function execute(scriptObj, projectId, page_id) {
  return new Promise((resolve, reject) => {
    const c = mqtt.connect(BROKER, { clientId: 'audit-'+Date.now(), connectTimeout: 8000, reconnectPeriod: 0 });
    let convId = null;
    const stepDurations = [];

    c.on('error', reject);
    c.on('connect', async () => {
      log(`[${elapsed()}] conectado`);
      await new Promise(r => c.subscribe(['ui/response/#', 'core/+/events/chat/assistant/saved'], r));
      const createReq = crypto.randomUUID();
      c.publish('ui/request/conversation/create', JSON.stringify({
        request_id: createReq,
        data: { project_id: projectId, title: `audit-${scriptObj.module}-${TS}`, user_id: 'default' }
      }));

      // Promise por paso: se resuelve cuando llega un chat.assistant.saved
      // con nuestro conversation_id Y source.module_id !== 'audit-module'.
      let awaiter = null;

      c.on('message', (topic, msg) => {
        let payload; try { payload = JSON.parse(msg.toString()); } catch { return; }
        if (topic === 'ui/response/'+createReq) {
          convId = payload.data?.conversation_id;
          log(`[${elapsed()}] conv: ${convId}`);
          runSteps();
          return;
        }
        const data = payload.data || payload;
        const eventType = payload.event_type || topic.split('events/').pop().replace(/\//g, '.');
        if (eventType !== 'chat.assistant.saved') return;
        if (data.conversation_id !== convId) return;
        if (payload.source?.module_id === 'audit-module') return;
        if (awaiter) { awaiter.resolve(); awaiter = null; }
      });

      async function runSteps() {
        for (const stp of scriptObj.steps) {
          log(`[${elapsed()}] STEP ${stp.step}/${scriptObj.steps.length} — ${stp.expected_tool}`);
          log(`   > ${stp.message}`);
          const t0 = Date.now();
          c.publish('ui/request/conversation/send', JSON.stringify({
            request_id: crypto.randomUUID(),
            data: { project_id: projectId, conversation_id: convId, message: stp.message, user_id: 'default', channel: 'web', page_id }
          }));
          // Esperar a chat.assistant.saved o timeout
          const completed = await new Promise(r => {
            awaiter = { resolve: () => r(true) };
            setTimeout(() => r(false), WAIT_MS);
          });
          const dur = Date.now() - t0;
          stepDurations.push({ step: stp.step, completed, duration_ms: dur });
          log(`   ${completed ? '✓' : '⏱ timeout'}  ${dur}ms`);
        }
        c.end(true);
        resolve({ conversation_id: convId, step_durations: stepDurations });
      }
    });
  });
}

// ────────────────────────────────────────────────────────────────────
// 4. export
// ────────────────────────────────────────────────────────────────────

function fetchExport(convId, projectId) {
  return new Promise((resolve, reject) => {
    const url = `https://enki-ai.online/modules/conversation-export/session/${convId}?token=${TOKEN}&project_id=${projectId}&verbose=true`;
    https.get(url, (res) => {
      let chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString())); } catch (e) { reject(e); } });
      res.on('error', reject);
    }).on('error', reject);
  });
}

// ────────────────────────────────────────────────────────────────────
// 5. analyze export + report
// ────────────────────────────────────────────────────────────────────

function findPrevious(slug) {
  if (!fs.existsSync('audit')) return null;
  const cands = fs.readdirSync('audit').filter(d => d.startsWith(slug+'-') && d !== path.basename(OUTDIR));
  if (!cands.length) return null;
  cands.sort();
  const p = path.join('audit', cands[cands.length-1], 'reporte.json');
  if (!fs.existsSync(p)) return null;
  try { return { dir: cands[cands.length-1], data: JSON.parse(fs.readFileSync(p, 'utf8')) }; } catch { return null; }
}

function buildAnalysis(ficha, scriptObj, exportData, stepDurations) {
  // Para cada paso del guion, encontrar el assistant message correspondiente en el export
  // y extraer sus tool_calls (de metadata).
  const msgs = exportData?.messages_raw || [];
  const assistantMsgs = msgs.filter(m => m.role === 'assistant');

  const stepResults = scriptObj.steps.map((stp, i) => {
    const am = assistantMsgs[i] || null;
    let tools = [];
    if (am?.metadata) {
      try {
        const md = typeof am.metadata === 'string' ? JSON.parse(am.metadata) : am.metadata;
        tools = (md?.tool_calls || []).map(t => ({ name: t.name || t.tool, status: t.status || t.result_status }));
      } catch {}
    }
    const hit = tools.some(t => t.name === stp.expected_tool);
    const dur = stepDurations.find(d => d.step === stp.step);
    return {
      step: stp.step,
      message: stp.message,
      expected_tool: stp.expected_tool,
      assistant_response: am?.content || null,
      response_length: am?.content?.length || 0,
      tools_called: tools,
      hit,
      timeout: dur ? !dur.completed : true,
      duration_ms: dur?.duration_ms ?? null
    };
  });

  const totalSteps = scriptObj.steps.length;
  const hits = stepResults.filter(s => s.hit).length;
  const timeouts = stepResults.filter(s => s.timeout).length;
  const persisted = msgs.length;
  const responseless = stepResults.filter(s => !s.assistant_response).length;
  const toolsEjercitadas = new Set();
  for (const s of stepResults) for (const t of s.tools_called) toolsEjercitadas.add(t.name);

  return {
    coverage: { ejercitadas: toolsEjercitadas.size, total: ficha.tools.length, no_ejercitadas: ficha.tools.map(t=>t.name).filter(n=>!toolsEjercitadas.has(n)) },
    routing:  { hits, total: totalSteps, hit_rate: hits/totalSteps },
    timeouts,
    responseless,
    persisted_messages: persisted,
    step_results: stepResults
  };
}

function generateReport(ficha, scriptObj, exportData, analysis, previous) {
  const L = [];
  L.push(`# Audit Report — \`${ficha.slug}\` v${ficha.version}`);
  L.push('');
  L.push(`**Fecha**: ${new Date().toISOString()}`);
  L.push(`**Role**: ${ficha.role || '—'}  ·  **Intent**: ${ficha.intent || '—'}`);
  L.push('');
  L.push('## Métricas');
  L.push('');
  L.push('| Métrica | Valor |');
  L.push('|---|---|');
  L.push(`| Cobertura tools | ${analysis.coverage.ejercitadas}/${analysis.coverage.total} (${Math.round(100*analysis.coverage.ejercitadas/analysis.coverage.total)}%) |`);
  L.push(`| Hit rate routing | ${analysis.routing.hits}/${analysis.routing.total} (${Math.round(100*analysis.routing.hit_rate)}%) |`);
  L.push(`| Pasos con timeout | ${analysis.timeouts}/${analysis.routing.total} |`);
  L.push(`| Pasos sin respuesta | ${analysis.responseless}/${analysis.routing.total} |`);
  L.push(`| Mensajes en BD | ${analysis.persisted_messages} |`);
  L.push('');
  if (analysis.coverage.no_ejercitadas.length > 0) {
    L.push('**Tools no ejercitadas**: ' + analysis.coverage.no_ejercitadas.map(n=>'`'+n+'`').join(', '));
    L.push('');
  }
  L.push('## Detalle por paso');
  L.push('');
  for (const s of analysis.step_results) {
    const icon = s.timeout ? '⏱' : (s.hit ? '✓' : '✗');
    const toolsList = s.tools_called.length ? s.tools_called.map(t=>'`'+t.name+'`'+(t.status?':'+t.status:'')).join(' · ') : '_(ninguna)_';
    L.push(`### ${icon} Paso ${s.step} — esperado: \`${s.expected_tool}\``);
    L.push('');
    L.push(`> ${s.message}`);
    L.push('');
    L.push(`- Tools: ${toolsList}`);
    L.push(`- Duración: ${s.duration_ms ?? '—'}ms`);
    if (s.assistant_response) {
      const preview = s.assistant_response.slice(0, 350).replace(/\n/g,' ');
      L.push(`- Respuesta (${s.response_length}ch): ${preview}${s.response_length > 350 ? '…' : ''}`);
    } else {
      L.push('- Respuesta: _no recibida_');
    }
    L.push('');
  }
  L.push('## Comparativa con audit anterior');
  L.push('');
  if (previous) {
    L.push(`Anterior: \`audit/${previous.dir}/\``);
    L.push('');
    const p = previous.data.analysis;
    L.push('| Métrica | Anterior | Actual | Δ |');
    L.push('|---|---|---|---|');
    const delta = (a,b) => { const d=a-b; return d===0?'=':(d>0?'+'+d:String(d)); };
    L.push(`| Cobertura | ${p.coverage.ejercitadas}/${p.coverage.total} | ${analysis.coverage.ejercitadas}/${analysis.coverage.total} | ${delta(analysis.coverage.ejercitadas, p.coverage.ejercitadas)} |`);
    L.push(`| Hit rate | ${p.routing.hits}/${p.routing.total} | ${analysis.routing.hits}/${analysis.routing.total} | ${delta(analysis.routing.hits, p.routing.hits)} |`);
    L.push(`| Timeouts | ${p.timeouts||0} | ${analysis.timeouts} | ${delta(analysis.timeouts, p.timeouts||0)} |`);
    L.push('');
  } else {
    L.push('_No hay audit previo de este módulo._');
    L.push('');
  }
  return L.join('\n');
}

// ────────────────────────────────────────────────────────────────────
// main
// ────────────────────────────────────────────────────────────────────

(async () => {
  try {
    log(`auditando: ${slug}`);
    log(`output: ${OUTDIR}\n`);
    log(`[${elapsed()}] analyze`);
    const ficha = analyze(slug);
    fs.writeFileSync(path.join(OUTDIR, 'ficha.json'), JSON.stringify(ficha, null, 2));
    log(`   ${ficha.tools.length} tools, role: ${ficha.role}`);

    log(`[${elapsed()}] script`);
    const scriptObj = generateScript(ficha);
    fs.writeFileSync(path.join(OUTDIR, 'guion.json'), JSON.stringify(scriptObj, null, 2));
    log(`   ${scriptObj.steps.length} pasos`);

    if (DRY_RUN) { log('\n--dry-run: saltando 3-5'); return; }

    log(`[${elapsed()}] resolviendo proyecto (${PROJECT_ARG})`);
    const projectId = await resolveProjectId(PROJECT_ARG);
    log(`   ${projectId}`);

    log(`[${elapsed()}] execute (${scriptObj.steps.length} pasos × hasta ${WAIT_MS/1000}s/paso)`);
    const { conversation_id, step_durations } = await execute(scriptObj, projectId, slug);

    log(`\n[${elapsed()}] export`);
    const exportData = await fetchExport(conversation_id, projectId);
    fs.writeFileSync(path.join(OUTDIR, 'export.json'), JSON.stringify(exportData, null, 2));
    log(`   ${exportData?.summary?.counts?.messages || 0} mensajes en BD`);

    log(`[${elapsed()}] report`);
    const previous = findPrevious(slug);
    if (previous) log(`   comparando con: ${previous.dir}`);
    const analysis = buildAnalysis(ficha, scriptObj, exportData, step_durations);
    fs.writeFileSync(path.join(OUTDIR, 'reporte.json'), JSON.stringify({ ficha, scriptObj, analysis, conversation_id }, null, 2));
    const md = generateReport(ficha, scriptObj, exportData, analysis, previous);
    fs.writeFileSync(path.join(OUTDIR, 'reporte.md'), md);
    log(`   → ${path.join(OUTDIR, 'reporte.md')}`);
    log('');
    log('=== resumen ===');
    log(`Cobertura: ${analysis.coverage.ejercitadas}/${analysis.coverage.total}`);
    log(`Hit rate:  ${analysis.routing.hits}/${analysis.routing.total} (${Math.round(100*analysis.routing.hit_rate)}%)`);
    log(`Timeouts:  ${analysis.timeouts}`);
    log(`conv: ${conversation_id}`);
  } catch (err) {
    console.error('FATAL:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
})();
