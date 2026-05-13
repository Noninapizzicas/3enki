#!/usr/bin/env node
/**
 * audit-module — auditoría operativa de un módulo del sistema event-core.
 *
 * Uso:
 *   node scripts/audit-module.js <module-slug> [opciones]
 *
 * Opciones:
 *   --project=<uuid|name>  project_id donde correr (default: Paco). Acepta nombre o UUID.
 *   --broker=<url>         broker MQTT (default: wss://enki-ai.online/mqtt)
 *   --token=<token>        conversation-export token (default: nonina)
 *   --wait=<ms>            espera entre mensajes (default: 60000ms)
 *   --dry-run              solo fases 1-2 (ficha + guion), no ejecuta contra VPS
 *
 * Fases:
 *   1. analyze         module.json + prompt.json + context.json + dependencias
 *   2. script          guión heurístico (1 mensaje por tool, orden lógico)
 *   3. execute         conv nueva → envía mensajes → captura tools + latencias
 *   4. export          descarga conversación via conversation-export API
 *   5. report          markdown + json estructurados:
 *                        - cobertura, routing TP/FP/FN, latencias
 *                        - checks de rules del prompt sobre cada respuesta
 *                        - detección de patología (object Object, fallos, timeouts)
 *                        - sanity check: lo capturado en vivo vs lo persistido en BD
 *                        - sugerencias accionables clasificadas por severidad
 *                        - comparación con último audit previo si existe
 *
 * Output:
 *   audit/<slug>-<timestamp>/
 *     ficha.json       ficha del módulo
 *     guion.json       guión generado
 *     trace.json       eventos del bus en vivo + latencias por tool
 *     export.json      export completo via API (mensajes + actividad bus)
 *     reporte.md       reporte humano-leíble (índice + secciones)
 *     reporte.json     reporte estructurado para procesamiento posterior
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const mqtt = require('mqtt');

// ====================================================================
// Args
// ====================================================================

const args = process.argv.slice(2);
const slug = args.find(a => !a.startsWith('--'));
if (!slug) {
  console.error('Uso: node scripts/audit-module.js <module-slug> [--project=<id|name>] [--wait=<ms>] [--dry-run]');
  process.exit(2);
}
const opt = (name, def) => {
  const a = args.find(x => x.startsWith('--' + name + '='));
  return a ? a.split('=').slice(1).join('=') : def;
};
const hasFlag = (name) => args.includes('--' + name);

const PROJECT_ARG = opt('project', 'Paco');
const BROKER      = opt('broker',  'wss://enki-ai.online/mqtt');
const TOKEN       = opt('token',   'nonina');
const WAIT_MS     = parseInt(opt('wait', '60000'), 10);
const DRY_RUN     = hasFlag('dry-run');

const TS = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUTDIR = path.join('audit', `${slug}-${TS}`);
fs.mkdirSync(OUTDIR, { recursive: true });

const log = (msg) => console.log(msg);
const elapsed = (() => { const t0 = Date.now(); return () => ((Date.now()-t0)/1000).toFixed(1)+'s'; })();

// ====================================================================
// Fase 1 — analyze
// ====================================================================

function findModuleDir(slug) {
  const candidates = [
    `modules/${slug}`,
    `modules/conversacion/${slug}`,
    `modules/pizzepos/${slug}`,
    `modules/facturacion/${slug}`
  ];
  return candidates.find(d => fs.existsSync(path.join(d, 'module.json')));
}

function analyze(slug) {
  const dir = findModuleDir(slug);
  if (!dir) throw new Error(`módulo ${slug} no encontrado`);

  const mj = JSON.parse(fs.readFileSync(path.join(dir, 'module.json'), 'utf8'));
  const pj = fs.existsSync(path.join(dir, 'prompt.json'))  ? JSON.parse(fs.readFileSync(path.join(dir, 'prompt.json'), 'utf8'))  : null;
  const cj = fs.existsSync(path.join(dir, 'context.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'context.json'), 'utf8')) : null;

  const subs = (mj.subscribes || mj.events?.subscribes || []).map(s => s.event || s);
  const upstreamModules = new Set();
  const systemPrefixes = new Set(['db','fs','project','credential','chat','ai','llm','agent','embedding','tools']);
  for (const e of subs) {
    const prefix = e.split('.')[0];
    if (prefix && prefix !== slug && !systemPrefixes.has(prefix)) upstreamModules.add(prefix);
  }

  return {
    slug,
    dir,
    version: mj.version,
    description: mj.description,
    tools: (mj.tools || []).map(t => ({
      name: t.name,
      description: t.description,
      parameters_required: (t.parameters?.required || []),
      errors_known: t.errores_conocidos || []
    })),
    publishes:  (mj.publishes  || mj.events?.publishes  || []).map(p => p.event || p),
    subscribes: subs,
    upstream_modules: [...upstreamModules],
    role:   pj?.role  || null,
    intent: pj?.intent || null,
    capabilities: cj?.capabilities || [],
    rules: cj?.rules || [],
    tools_descritos_en_context: cj?.tools_disponibles || {}
  };
}

// ====================================================================
// Fase 2 — script generator
// ====================================================================

function toolToMessage(t, ficha) {
  const suffix = t.name.split('.').slice(1).join('.').toLowerCase();
  const entity = ficha.slug;
  const singular = entity.replace(/s$/, '');

  if (/^listar$/.test(suffix))               return `lista las ${entity} que tengo.`;
  if (/^obtener$/.test(suffix))              return `muestrame la primera ${singular} de la lista.`;
  if (/^buscar$/.test(suffix))               return `busca ${entity} relacionadas con tomate.`;
  if (/^crear$/.test(suffix))                return `crea una ${singular} nueva llamada "audit-test" con datos minimos.`;
  if (/^actualizar$/.test(suffix))           return `actualiza la ${singular} llamada audit-test anadiendo una nota.`;
  if (/^eliminar$/.test(suffix))             return `elimina (archiva) la ${singular} llamada audit-test.`;
  if (/^historial$/.test(suffix))            return `muestrame el historial de cambios de la ${singular} audit-test.`;
  if (/^revertir$/.test(suffix))             return `revierte la ${singular} audit-test a su version anterior.`;
  if (/^estadisticas$/.test(suffix))         return `dame estadisticas generales de ${entity}.`;
  if (/^investigar/.test(suffix))            return `comprueba si existe una receta llamada "Pizza Margarita".`;
  if (/^ingredientes$/.test(suffix))         return `lista el catalogo de ingredientes.`;
  if (/^actualizar_precio$/.test(suffix))    return `el huevo cuesta 0.20€ la unidad, actualizalo en el catalogo.`;
  if (/^analizar$/.test(suffix))             return `analiza el coste de la primera receta.`;
  if (/^receta$/.test(suffix))               return `dame el escandallo completo de la primera receta.`;
  if (/^global$/.test(suffix))               return `dame el escandallo global de todas las recetas.`;
  if (/^comparar_precios$/.test(suffix))     return `compara precio_mercado vs precio_compra real del catalogo.`;
  if (/^simular_precio$/.test(suffix))       return `simula precios de venta de 8, 10 y 12€ para la primera receta.`;
  if (/^ingrediente_impacto$/.test(suffix))  return `analiza el impacto del ingrediente "tomate" en mis recetas.`;
  if (/^optimizar$/.test(suffix))            return `proponme optimizaciones de coste.`;
  if (/^ficha_tecnica$/.test(suffix))        return `genera una ficha tecnica de la primera receta.`;
  if (/^estudio$/.test(suffix))              return `hazme un estudio de viabilidad del negocio.`;
  if (/^punto_equilibrio$/.test(suffix))     return `calcula el punto de equilibrio del negocio.`;
  if (/^escenario$/.test(suffix))            return `calcula un escenario con 30 comensales por dia.`;
  if (/^comparar_escenarios$/.test(suffix))  return `compara los escenarios que tengo guardados.`;
  if (/^proyeccion$/.test(suffix))           return `hazme una proyeccion financiera a 6 meses.`;
  if (/^guardar_config$/.test(suffix))       return `guarda la configuracion del negocio: gastos fijos 2000€, tipo restaurante, nombre TestBar.`;

  const verb = suffix.split(/[._]/).filter(x=>x.length>2)[0] || 'usa';
  return `${verb} ${entity}.`;
}

function generateScript(ficha) {
  const orderByGroup = [
    ['guardar_config'],
    ['listar','ingredientes','estadisticas','obtener','buscar','investigar_receta','global','comparar_precios','comparar_escenarios'],
    ['crear','actualizar_precio','actualizar','escenario'],
    ['historial','analizar','receta','simular_precio','ingrediente_impacto','optimizar','ficha_tecnica','estudio','punto_equilibrio','proyeccion'],
    ['revertir','eliminar']
  ];
  const flat = orderByGroup.flat();
  const ordered = [];
  for (const cat of flat) {
    for (const t of ficha.tools) {
      const suffix = t.name.split('.').slice(1).join('.').toLowerCase();
      if (suffix === cat) ordered.push(t);
    }
  }
  for (const t of ficha.tools) if (!ordered.includes(t)) ordered.push(t);

  return {
    module: ficha.slug,
    generated_at: new Date().toISOString(),
    steps: ordered.map((t, i) => ({
      step: i + 1,
      message: toolToMessage(t, ficha),
      expected_tool: t.name,
      tool_description: t.description?.slice(0, 120)
    }))
  };
}

// ====================================================================
// Helpers MQTT
// ====================================================================

function buildTopic(et) { const p=et.split('.'); return 'core/*/events/'+p[0]+(p.length>1?'/'+p.slice(1).join('/'):''); }
function subTopic(et)   { const p=et.split('.'); return 'core/+/events/'+p[0]+(p.length>1?'/'+p.slice(1).join('/'):''); }
function envelope(et, d) {
  return { event_id: crypto.randomUUID(), event_type: et, timestamp: new Date().toISOString(), source: { core_id: 'audit-module', module_id: 'audit-module' }, data: d, metadata: {} };
}

// ====================================================================
// Resolución project_id por name o UUID
// ====================================================================

async function resolveProjectId(arg) {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(arg)) return arg;
  return new Promise((resolve, reject) => {
    const c = mqtt.connect(BROKER, { clientId: 'audit-resolveproj-'+Date.now(), connectTimeout: 8000, reconnectPeriod: 0 });
    const reqId = crypto.randomUUID();
    const tout = setTimeout(() => { c.end(true); reject(new Error('timeout resolving project name')); }, 8000);
    c.on('connect', () => {
      c.subscribe(subTopic('project.list.response'), () => {
        c.publish(buildTopic('project.list.request'), JSON.stringify(envelope('project.list.request', { request_id: reqId })));
      });
    });
    c.on('message', (t, m) => {
      try {
        const env = JSON.parse(m.toString());
        const d = env.data || env;
        if (d.request_id !== reqId) return;
        clearTimeout(tout);
        const match = (d.projects || []).find(p => (p.name||'').toLowerCase() === arg.toLowerCase());
        c.end(true);
        if (match) resolve(match.id); else reject(new Error(`proyecto "${arg}" no encontrado`));
      } catch {}
    });
  });
}

// ====================================================================
// Fase 3 — execute
// ====================================================================

async function execute(ficha, scriptObj, projectId) {
  return new Promise((resolve, reject) => {
    const c = mqtt.connect(BROKER, { clientId: 'audit-'+Date.now(), connectTimeout: 8000, reconnectPeriod: 0 });
    let convId = null;
    const trace = { conversation_id: null, project_id: projectId, steps: [], all_events: [] };
    const moduleEventPrefix = ficha.slug + '.';
    const pendingTools = new Map();
    let currentStep = -1;

    c.on('error', reject);

    c.on('connect', async () => {
      log(`[${elapsed()}] conectado a ${BROKER}`);
      await new Promise(r => c.subscribe([
        'ui/response/#',
        'core/+/events/chat/assistant/saved',
        'core/+/events/chat/message/saved',
        'core/+/events/ai/chat/failed',
        `core/+/events/${ficha.slug}/#`
      ], r));

      const createReq = crypto.randomUUID();
      c.publish('ui/request/conversation/create', JSON.stringify({
        request_id: createReq,
        data: { project_id: projectId, title: `audit-${ficha.slug}-${TS}`, user_id: 'default' }
      }));

      c.on('message', (topic, msg) => {
        let payload; try { payload = JSON.parse(msg.toString()); } catch { return; }

        if (topic === 'ui/response/'+createReq) {
          convId = payload.data?.conversation_id;
          trace.conversation_id = convId;
          log(`[${elapsed()}] conv: ${convId}`);
          runSteps();
          return;
        }

        const data = payload.data || payload;
        const eventType = payload.event_type || topic.split('events/').pop().replace(/\//g, '.');
        const sourceModule = payload.source?.module_id || null;
        const now = Date.now();

        if (data.conversation_id === convId || eventType.startsWith(moduleEventPrefix)) {
          trace.all_events.push({ t: elapsed(), event: eventType, source: sourceModule });

          if (eventType.startsWith(moduleEventPrefix) && !eventType.endsWith('.response')) {
            if (data.request_id) pendingTools.set(data.request_id, { tool: eventType, startedAt: now });
          }

          if (currentStep >= 0 && currentStep < trace.steps.length) {
            const stp = trace.steps[currentStep];
            if (eventType.startsWith(moduleEventPrefix) && eventType.endsWith('.response')) {
              const toolName = eventType.replace(/\.response$/, '');
              const pending = pendingTools.get(data.request_id);
              const latency_ms = pending ? (now - pending.startedAt) : null;
              if (pending) pendingTools.delete(data.request_id);

              stp.tools_observed.push({
                tool: toolName,
                success: !data.error,
                error_code: data.error?.code,
                error_msg: data.error?.message?.slice(0, 200),
                latency_ms,
                has_result: data.result !== undefined && data.result !== null
              });
            }
            if (eventType === 'chat.assistant.saved' && data.assistant_message && sourceModule !== 'audit-module') {
              if (!stp.assistant_response) stp.assistant_response = data.assistant_message;
              stp.assistant_source_module = sourceModule;
            }
            if (eventType === 'ai.chat.failed') {
              stp.chat_failed = { code: data.error?.code, message: data.error?.message?.slice(0, 300) };
            }
          }
        }
      });

      async function runSteps() {
        for (const stp of scriptObj.steps) {
          currentStep = stp.step - 1;
          trace.steps[currentStep] = {
            step: stp.step, message: stp.message, expected_tool: stp.expected_tool,
            tools_observed: [], started_at: elapsed(), started_ts: Date.now()
          };
          log(`\n[${elapsed()}] STEP ${stp.step}/${scriptObj.steps.length}: ${stp.expected_tool}`);
          log(`   > ${stp.message}`);

          c.publish('ui/request/conversation/send', JSON.stringify({
            request_id: crypto.randomUUID(),
            data: { project_id: projectId, conversation_id: convId, message: stp.message, user_id: 'default', channel: 'web', page_id: ficha.slug }
          }));

          await new Promise(r => setTimeout(r, WAIT_MS));
          trace.steps[currentStep].ended_at = elapsed();
          trace.steps[currentStep].duration_ms = Date.now() - trace.steps[currentStep].started_ts;
          const obs = trace.steps[currentStep].tools_observed.map(o => o.tool+':'+(o.success?'ok':o.error_code||'err')+(o.latency_ms?' ('+o.latency_ms+'ms)':'')).join(', ');
          log(`   ← tools: ${obs || '(ninguna)'}`);
          if (trace.steps[currentStep].chat_failed) log(`   ⚠ ai.chat.failed: ${trace.steps[currentStep].chat_failed.code}`);
        }
        c.end(true);
        resolve(trace);
      }
    });
  });
}

// ====================================================================
// Fase 4 — export
// ====================================================================

function fetchExport(convId, projectId) {
  return new Promise((resolve, reject) => {
    const url = `https://enki-ai.online/modules/conversation-export/session/${convId}?token=${TOKEN}&project_id=${projectId}&verbose=true`;
    https.get(url, (res) => {
      let chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch (err) { reject(err); }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

// ====================================================================
// Fase 5 — análisis y reporte
// ====================================================================

// Heurísticas de calidad sobre cada respuesta del LLM
function inspectResponse(response, rules) {
  const findings = [];
  if (!response) return findings;

  if (/\[object Object\]/.test(response)) {
    findings.push({ severity: 'high', kind: 'antipattern', detail: "texto '[object Object]' en la respuesta" });
  }
  if (/algo se rompi[oó]|motor del lenguaje tiene un fallo|inténtalo de nuevo o avisa/i.test(response)) {
    findings.push({ severity: 'high', kind: 'system_error_message', detail: 'respuesta es mensaje system de error genérico' });
  }
  // Degeneración: ratio de palabras de 1-2 caracteres en últimos 200 chars
  if (response.length > 400) {
    const tail = response.slice(-300);
    const words = tail.split(/\s+/).filter(Boolean);
    const shortWords = words.filter(w => w.length <= 2).length;
    if (words.length > 0 && shortWords / words.length > 0.45) {
      findings.push({ severity: 'medium', kind: 'token_degeneration', detail: 'alta proporción de tokens cortos al final (posible degeneración)' });
    }
  }
  // Si rules pide formato lista y la respuesta es larga sin listas
  const wantsMdLists = (rules || []).some(r => /markdown|lista|formatea/i.test(r));
  const hasMdList = /^\s*[-*]\s+/m.test(response);
  if (wantsMdLists && response.length > 200 && !hasMdList) {
    findings.push({ severity: 'low', kind: 'format', detail: 'rules sugieren listas markdown; respuesta no las usa' });
  }
  // Sin emojis ni encabezados en respuesta muy larga (puede indicar UX pobre)
  if (response.length > 800 && !/[#📋📊✅⚠️🍕🤖]/.test(response)) {
    findings.push({ severity: 'low', kind: 'format', detail: 'respuesta larga sin encabezados ni iconos' });
  }
  if (response.length < 20) {
    findings.push({ severity: 'medium', kind: 'too_short', detail: `respuesta muy corta (${response.length} chars)` });
  }
  return findings;
}

// Última audit del mismo módulo (para comparar)
function findPreviousAudit(slug) {
  if (!fs.existsSync('audit')) return null;
  const candidates = fs.readdirSync('audit').filter(d => d.startsWith(slug + '-') && d !== path.basename(OUTDIR));
  if (candidates.length === 0) return null;
  candidates.sort();
  const last = candidates[candidates.length - 1];
  const reportPath = path.join('audit', last, 'reporte.json');
  if (fs.existsSync(reportPath)) {
    try { return { dir: last, report: JSON.parse(fs.readFileSync(reportPath, 'utf8')) }; }
    catch { return null; }
  }
  return null;
}

function buildAnalysis(ficha, scriptObj, trace, exportData) {
  // Routing
  let TP = 0, FP = 0, FN = 0;
  const toolsEjercitadas = new Set();
  const latenciasPorTool = {};

  for (const s of trace.steps) {
    const obs = s.tools_observed.map(o => o.tool);
    const esperado = s.expected_tool;
    if (obs.includes(esperado)) TP++; else FN++;
    for (const o of s.tools_observed) {
      toolsEjercitadas.add(o.tool);
      if (o.tool !== esperado) FP++;
      if (o.latency_ms != null) {
        latenciasPorTool[o.tool] = latenciasPorTool[o.tool] || [];
        latenciasPorTool[o.tool].push(o.latency_ms);
      }
    }
  }
  const totalSteps = scriptObj.steps.length;
  const totalTools = ficha.tools.length;
  const toolsNoEjercitadas = ficha.tools.map(t => t.name).filter(n => !toolsEjercitadas.has(n));

  // Stats latencias
  const latStats = {};
  for (const [tn, arr] of Object.entries(latenciasPorTool)) {
    const sorted = [...arr].sort((a,b)=>a-b);
    latStats[tn] = {
      n: arr.length,
      p50: sorted[Math.floor(sorted.length*0.5)],
      p95: sorted[Math.min(sorted.length-1, Math.floor(sorted.length*0.95))],
      max: sorted[sorted.length-1]
    };
  }

  // Calidad de respuestas por paso
  const findingsByStep = trace.steps.map(s => ({
    step: s.step,
    findings: inspectResponse(s.assistant_response, ficha.rules)
  }));

  // Sanity: lo capturado en vivo vs persistido
  const persistedMessages = exportData?.messages_raw || [];
  const persistedCount = persistedMessages.length;
  const persistedAssistant = persistedMessages.filter(m => m.role === 'assistant').length;
  const persistedSystem    = persistedMessages.filter(m => m.role === 'system').length;
  const liveAssistant      = trace.steps.filter(s => s.assistant_response).length;

  // Sugerencias agregadas
  const suggestions = [];
  if (TP / totalSteps < 0.7) suggestions.push({ severity: 'high', text: `Routing del LLM bajo (${Math.round(100*TP/totalSteps)}%). Revisar prompt.json + tools_descritos_en_context para clarificar cuándo usar cada tool.` });
  if (toolsNoEjercitadas.length > 0) suggestions.push({ severity: 'low', text: `${toolsNoEjercitadas.length} tools sin ejercitar: ${toolsNoEjercitadas.join(', ')}. Ampliar guión o revisar si están documentadas en context.json.` });
  const stepsConFail = trace.steps.filter(s => s.chat_failed).length;
  if (stepsConFail > 0) suggestions.push({ severity: 'high', text: `${stepsConFail} pasos con ai.chat.failed. Investigar logs del ai-gateway.` });
  const totalAntiPatterns = findingsByStep.reduce((acc,fs)=>acc + fs.findings.filter(f=>f.kind==='antipattern' || f.kind==='system_error_message').length, 0);
  if (totalAntiPatterns > 0) suggestions.push({ severity: 'high', text: `${totalAntiPatterns} respuestas con anti-patrones ('[object Object]', mensaje system de error). Revisar shapes intermedios.` });
  if (persistedAssistant !== liveAssistant) suggestions.push({ severity: 'medium', text: `Discrepancia persistencia: ${liveAssistant} respuestas en vivo vs ${persistedAssistant} persistidas como assistant. Revisar chat-io.onChatAssistantSavedFromAgent.` });
  if (persistedSystem > 0) suggestions.push({ severity: 'medium', text: `${persistedSystem} mensajes role='system' persistidos (fallos chat-io). Suelen ser ai.chat.failed mapeados.` });

  return {
    routing: { TP, FP, FN, total: totalSteps, hit_rate: TP/totalSteps },
    coverage: { ejercitadas: toolsEjercitadas.size, total: totalTools, no_ejercitadas: toolsNoEjercitadas },
    latencias: latStats,
    findings_by_step: findingsByStep,
    sanity_export: { live_assistant: liveAssistant, persisted_assistant: persistedAssistant, persisted_system: persistedSystem, persisted_total: persistedCount },
    suggestions
  };
}

function generateReport(ficha, scriptObj, trace, exportData, analysis, previousAudit) {
  const lines = [];
  lines.push(`# Audit Report — \`${ficha.slug}\` v${ficha.version}`);
  lines.push('');
  lines.push(`**Fecha**: ${new Date().toISOString()}`);
  lines.push(`**Conversación**: \`${trace.conversation_id}\``);
  lines.push(`**Project**: \`${trace.project_id}\``);
  lines.push(`**Role**: ${ficha.role || '—'}`);
  lines.push(`**Intent**: ${ficha.intent || '—'}`);
  if (ficha.upstream_modules.length > 0) lines.push(`**Depende de**: ${ficha.upstream_modules.map(m => '`'+m+'`').join(', ')}`);
  lines.push('');
  lines.push('## Índice');
  lines.push('- [Métricas](#métricas)');
  lines.push('- [Latencias](#latencias-por-tool-ms)');
  lines.push('- [Detalle por paso](#detalle-por-paso)');
  lines.push('- [Errores](#errores)');
  lines.push('- [Sugerencias](#sugerencias)');
  lines.push('- [Comparativa con audit anterior](#comparativa-con-audit-anterior)');
  lines.push('');

  // Métricas
  const a = analysis;
  lines.push('## Métricas');
  lines.push('');
  lines.push('| Métrica | Valor |');
  lines.push('|---|---|');
  lines.push(`| Cobertura tools | ${a.coverage.ejercitadas}/${a.coverage.total} (${Math.round(100*a.coverage.ejercitadas/a.coverage.total)}%) |`);
  lines.push(`| Routing acierto (TP) | ${a.routing.TP}/${a.routing.total} (${Math.round(100*a.routing.hit_rate)}%) |`);
  lines.push(`| Routing fallo (FN) | ${a.routing.FN}/${a.routing.total} |`);
  lines.push(`| Tools extra (FP) | ${a.routing.FP} |`);
  lines.push(`| Mensajes persistidos en BD | ${a.sanity_export.persisted_total} (${a.sanity_export.persisted_assistant} assistant + ${a.sanity_export.persisted_system} system) |`);
  lines.push(`| Respuestas capturadas en vivo | ${a.sanity_export.live_assistant} |`);
  lines.push('');

  if (a.coverage.no_ejercitadas.length > 0) {
    lines.push('### Tools no ejercitadas');
    lines.push('');
    a.coverage.no_ejercitadas.forEach(n => lines.push(`- \`${n}\``));
    lines.push('');
  }

  // Latencias
  if (Object.keys(a.latencias).length > 0) {
    lines.push('## Latencias por tool (ms)');
    lines.push('');
    lines.push('| Tool | n | p50 | p95 | max |');
    lines.push('|---|---|---|---|---|');
    for (const [tn, st] of Object.entries(a.latencias)) {
      lines.push(`| \`${tn}\` | ${st.n} | ${st.p50} | ${st.p95} | ${st.max} |`);
    }
    lines.push('');
  }

  // Detalle por paso
  lines.push('## Detalle por paso');
  lines.push('');
  for (const s of trace.steps) {
    const toolsStr = s.tools_observed.length === 0 ? '_ninguna_' : s.tools_observed.map(o => `\`${o.tool}\` ${o.success?'✓':'✗ '+(o.error_code||'')}${o.latency_ms?` (${o.latency_ms}ms)`:''}`).join(' · ');
    const hit = s.tools_observed.some(o => o.tool === s.expected_tool);
    const stepFindings = a.findings_by_step.find(f => f.step === s.step)?.findings || [];

    lines.push(`### Paso ${s.step} — esperado: \`${s.expected_tool}\` — ${hit ? '✓' : (s.tools_observed.length > 0 ? '✗ wrong tool' : '✗ no-tool')}`);
    lines.push('');
    lines.push(`> ${s.message}`);
    lines.push('');
    lines.push(`- **Tools observadas**: ${toolsStr}`);
    lines.push(`- **Duración**: ${s.duration_ms}ms`);
    if (s.chat_failed) lines.push(`- **⚠ ai.chat.failed**: \`${s.chat_failed.code}\` — ${s.chat_failed.message}`);
    for (const f of stepFindings) lines.push(`- **${f.severity === 'high' ? '🔴' : f.severity === 'medium' ? '🟡' : '🔵'} ${f.kind}**: ${f.detail}`);
    if (s.assistant_response) {
      const preview = s.assistant_response.slice(0, 500) + (s.assistant_response.length > 500 ? '… [truncado]' : '');
      lines.push('- **Respuesta LLM**:');
      lines.push('');
      lines.push('```');
      lines.push(preview);
      lines.push('```');
    } else {
      lines.push('- **Respuesta LLM**: _no recibida_');
    }
    lines.push('');
  }

  // Errores agregados
  const errores = [];
  for (const s of trace.steps) {
    for (const o of s.tools_observed) if (!o.success) errores.push({ step: s.step, tool: o.tool, code: o.error_code, msg: o.error_msg });
    if (s.chat_failed) errores.push({ step: s.step, kind: 'ai.chat.failed', code: s.chat_failed.code, msg: s.chat_failed.message });
  }
  if (errores.length > 0) {
    lines.push('## Errores');
    lines.push('');
    for (const e of errores) lines.push(`- paso ${e.step}: \`${e.tool || e.kind}\` — ${e.code || ''} ${e.msg || ''}`);
    lines.push('');
  }

  // Sugerencias
  if (a.suggestions.length > 0) {
    lines.push('## Sugerencias');
    lines.push('');
    for (const s of a.suggestions.sort((x,y)=>{ const w={high:0,medium:1,low:2}; return w[x.severity]-w[y.severity]; })) {
      const icon = s.severity === 'high' ? '🔴' : s.severity === 'medium' ? '🟡' : '🔵';
      lines.push(`- ${icon} **[${s.severity}]** ${s.text}`);
    }
    lines.push('');
  }

  // Comparativa con audit anterior
  if (previousAudit) {
    lines.push('## Comparativa con audit anterior');
    lines.push('');
    lines.push(`Audit anterior: \`audit/${previousAudit.dir}/\``);
    lines.push('');
    const prev = previousAudit.report.analysis;
    lines.push('| Métrica | Anterior | Actual | Δ |');
    lines.push('|---|---|---|---|');
    const delta = (cur, old) => {
      const d = cur - old;
      return d === 0 ? '=' : (d > 0 ? '+' + d : String(d));
    };
    lines.push(`| Cobertura | ${prev.coverage.ejercitadas}/${prev.coverage.total} | ${a.coverage.ejercitadas}/${a.coverage.total} | ${delta(a.coverage.ejercitadas, prev.coverage.ejercitadas)} |`);
    lines.push(`| Routing TP | ${prev.routing.TP} | ${a.routing.TP} | ${delta(a.routing.TP, prev.routing.TP)} |`);
    lines.push(`| Routing FN | ${prev.routing.FN} | ${a.routing.FN} | ${delta(a.routing.FN, prev.routing.FN)} |`);
    lines.push('');
  } else {
    lines.push('## Comparativa con audit anterior');
    lines.push('');
    lines.push('_No hay audit previo de este módulo._');
    lines.push('');
  }

  // Export summary
  if (exportData?.summary) {
    lines.push('## Export summary');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(exportData.summary, null, 2));
    lines.push('```');
  }

  return lines.join('\n');
}

// ====================================================================
// Main
// ====================================================================

(async () => {
  try {
    log(`auditando módulo: ${slug}`);
    log(`output: ${OUTDIR}`);
    log('');

    log(`[${elapsed()}] FASE 1 — analyze`);
    const ficha = analyze(slug);
    fs.writeFileSync(path.join(OUTDIR, 'ficha.json'), JSON.stringify(ficha, null, 2));
    log(`   ${ficha.tools.length} tools, role: "${ficha.role}"`);
    if (ficha.upstream_modules.length > 0) log(`   depende de: ${ficha.upstream_modules.join(', ')}`);

    log(`[${elapsed()}] FASE 2 — script`);
    const scriptObj = generateScript(ficha);
    fs.writeFileSync(path.join(OUTDIR, 'guion.json'), JSON.stringify(scriptObj, null, 2));
    log(`   ${scriptObj.steps.length} pasos generados`);

    if (DRY_RUN) {
      log(`\n--dry-run: saltando fases 3-5.`);
      log(`Ficha y guión en: ${OUTDIR}`);
      return;
    }

    log(`[${elapsed()}] resolviendo project_id (${PROJECT_ARG})`);
    const projectId = await resolveProjectId(PROJECT_ARG);
    log(`   project_id = ${projectId}`);

    log(`[${elapsed()}] FASE 3 — execute (${scriptObj.steps.length} pasos × ${WAIT_MS/1000}s)`);
    const trace = await execute(ficha, scriptObj, projectId);
    fs.writeFileSync(path.join(OUTDIR, 'trace.json'), JSON.stringify(trace, null, 2));

    log(`\n[${elapsed()}] FASE 4 — export`);
    let exportData = null;
    try {
      exportData = await fetchExport(trace.conversation_id, projectId);
      fs.writeFileSync(path.join(OUTDIR, 'export.json'), JSON.stringify(exportData, null, 2));
      log(`   ${exportData?.summary?.counts?.messages || '?'} mensajes en BD`);
    } catch (err) { log(`   export falló: ${err.message}`); }

    log(`[${elapsed()}] FASE 5 — analyze + report`);
    const previousAudit = findPreviousAudit(slug);
    if (previousAudit) log(`   comparando con: audit/${previousAudit.dir}/`);
    const analysis = buildAnalysis(ficha, scriptObj, trace, exportData);
    const reporteJson = { ficha, scriptObj, trace_summary: { steps: trace.steps.length, conversation_id: trace.conversation_id }, analysis };
    fs.writeFileSync(path.join(OUTDIR, 'reporte.json'), JSON.stringify(reporteJson, null, 2));
    const reporteMd = generateReport(ficha, scriptObj, trace, exportData, analysis, previousAudit);
    fs.writeFileSync(path.join(OUTDIR, 'reporte.md'), reporteMd);
    log(`   → ${path.join(OUTDIR, 'reporte.md')}`);
    log(`   → ${path.join(OUTDIR, 'reporte.json')}`);

    log('');
    log('=== resumen ===');
    log(`Cobertura: ${analysis.coverage.ejercitadas}/${analysis.coverage.total} (${Math.round(100*analysis.coverage.ejercitadas/analysis.coverage.total)}%)`);
    log(`Routing TP/FN: ${analysis.routing.TP}/${analysis.routing.FN}`);
    log(`Sugerencias: ${analysis.suggestions.length}`);
    log(`Mensajes persistidos: ${analysis.sanity_export.persisted_total}`);
  } catch (err) {
    console.error('FATAL:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
})();
