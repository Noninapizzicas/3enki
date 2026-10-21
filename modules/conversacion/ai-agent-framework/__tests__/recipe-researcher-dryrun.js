/**
 * Dry-run de recipe-researcher
 *
 * Sin credencial DeepSeek real. Mockeamos el LLM y enseñamos:
 *  - Que el agente esta cargado
 *  - El system prompt que el framework envia al LLM (verifica que se lee
 *    el .md, se inyecta task/context, y aparecen las tools)
 *  - Que el flujo agent.execute.request -> agent.execute.response funciona
 *  - Que el agente devuelve lo que devolveria DeepSeek si funcionase OK
 */

const Mod = require('/home/user/2enki/modules/conversacion/ai-agent-framework/index.js');
const moduleJson = require('/home/user/2enki/modules/conversacion/ai-agent-framework/module.json');

const subs = new Map();
const published = [];

const FAKE_LLM_RESPONSE = JSON.stringify({
  existe_en_proyecto: false,
  nombre_receta: 'magra con tomate',
  candidatas: [
    {
      candidato_id: 'c1',
      nombre: 'Magra con tomate clasica',
      estilo: 'tradicional espanola',
      porciones: 4,
      tiempo_total_min: 35,
      ingredientes: [
        { nombre: 'magra de cerdo', cantidad: 500, unidad: 'g' },
        { nombre: 'tomate triturado', cantidad: 400, unidad: 'g' },
        { nombre: 'aceite de oliva', cantidad: 30, unidad: 'ml' },
        { nombre: 'ajo', cantidad: 3, unidad: 'dientes' },
        { nombre: 'sal', cantidad: 1, unidad: 'cucharadita' }
      ],
      instrucciones: [
        'Cortar la magra en filetes finos',
        'Sellar a fuego fuerte con ajos laminados',
        'Anadir tomate y cocinar 20 min a fuego medio'
      ],
      notas_de_confianza: 'alta — receta muy comun'
    },
    {
      candidato_id: 'c2',
      nombre: 'Magra con tomate al horno',
      estilo: 'cocido lento',
      porciones: 4,
      tiempo_total_min: 75,
      ingredientes: [
        { nombre: 'magra de cerdo', cantidad: 600, unidad: 'g' },
        { nombre: 'tomate maduro', cantidad: 500, unidad: 'g' }
      ],
      instrucciones: [
        'Marinar la magra 30 min',
        'Hornear 1h a 180C en cama de tomate'
      ],
      notas_de_confianza: 'media — variante regional'
    },
    {
      candidato_id: 'c3',
      nombre: 'Magra con tomate picante',
      estilo: 'andaluza',
      porciones: 4,
      tiempo_total_min: 40,
      ingredientes: [
        { nombre: 'magra de cerdo', cantidad: 500, unidad: 'g' },
        { nombre: 'tomate frito', cantidad: 400, unidad: 'g' },
        { nombre: 'guindilla', cantidad: 2, unidad: 'unidades' }
      ],
      instrucciones: [
        'Sofreir guindilla en aceite',
        'Anadir magra y dorar',
        'Incorporar tomate frito y reducir 15 min'
      ],
      notas_de_confianza: 'media'
    }
  ],
  accion_sugerida: 'presentar_al_usuario_para_elegir'
});

const eventBus = {
  subscribe(event, handler) {
    if (!subs.has(event)) subs.set(event, []);
    subs.get(event).push(handler);
  },
  async publish(event, data) {
    published.push({ event, data, ts: Date.now() });
    if (event === 'llm.complete.request') {
      // Mockear respuesta del LLM (lo que devolveria DeepSeek si funcionase)
      setImmediate(() => dispatch('llm.complete.response', {
        request_id: data.request_id,
        success: true,
        content: FAKE_LLM_RESPONSE,
        tool_calls_executed: []
      }));
    }
    dispatch(event, data);
  }
};

function dispatch(event, data) {
  for (const h of (subs.get(event) || [])) {
    try { h({ data }); } catch (e) { console.error('handler error', event, e); }
  }
}

const logger = {
  info: () => {}, warn: () => {}, error: (...a) => console.log('ERR', ...a), debug: () => {}
};

const moduleLoader = { toolsRegistry: new Map(), getToolsForAI: () => [] };

(async () => {
  const mod = new Mod();
  await mod.onLoad({ logger, eventBus, moduleLoader });

  // ============================================================
  // [1] Wiring: el agente esta cargado
  // ============================================================
  console.log('=== [1] Carga del agente ===');
  console.log(`Total agentes cargados: ${mod.agents.size}`);
  const agente = mod.agents.get('recipe-researcher');
  if (!agente) {
    console.log('✗ recipe-researcher NO esta en el registry');
    console.log('Agentes cargados:', [...mod.agents.keys()].sort().join(', '));
    process.exit(1);
  }
  console.log('✓ recipe-researcher cargado');
  console.log(`  description: ${agente.description.slice(0, 80)}...`);
  console.log(`  provider:    ${agente.provider}`);
  console.log(`  tools:       ${(agente.tools || []).join(', ')}`);
  console.log(`  prompt size: ${(agente.prompt_text || '').length} chars`);
  console.log(`  prompt h1:   ${(agente.prompt_text || '').split('\n')[0]}`);

  // Suscribir handlers como hace el sistema real (subscribes vive en events.subscribes)
  const subscribesArr = (moduleJson.events && moduleJson.events.subscribes) || [];
  for (const sub of subscribesArr) {
    if (typeof mod[sub.handler] === 'function') {
      eventBus.subscribe(sub.event, (e) => mod[sub.handler](e));
    }
  }

  // ============================================================
  // [2] Disparar agent.execute.request canonico
  // ============================================================
  console.log('\n=== [2] agent.execute.request ===');
  published.length = 0;
  await mod.onAgentExecuteRequest({ data: {
    request_id: 'req-recipe-001',
    correlation_id: 'corr-test-001',
    agent_name: 'recipe-researcher',
    task: 'Investigar la receta "magra con tomate" para mi proyecto',
    context: {
      project_id: 'p-test',
      nombre_receta: 'magra con tomate',
      n_variantes: 3
    }
  }});
  await new Promise(r => setTimeout(r, 50));

  // ============================================================
  // [3] Que se envio al LLM
  // ============================================================
  const llmReqs = published.filter(p => p.event === 'llm.complete.request');
  console.log(`\n=== [3] llm.complete.request publicados: ${llmReqs.length} ===`);
  if (llmReqs.length > 0) {
    const sys = llmReqs[0].data.system || '';
    console.log(`system prompt size: ${sys.length} chars`);
    console.log(`system prompt empieza con: ${sys.slice(0, 80).replace(/\n/g, ' ')}...`);
    console.log(`system prompt incluye "Recipe Researcher": ${sys.includes('Recipe Researcher')}`);
    console.log(`system prompt incluye task: ${sys.includes('magra con tomate')}`);
    console.log(`provider solicitado: ${llmReqs[0].data.provider || '(default)'}`);
    console.log(`tools en el payload (catalog del provider): ${(llmReqs[0].data.tools || []).length}`);
  }

  // ============================================================
  // [4] Respuesta final
  // ============================================================
  const responses = published.filter(p => p.event === 'agent.execute.response');
  console.log(`\n=== [4] agent.execute.response: ${responses.length} ===`);
  if (responses.length > 0) {
    const r = responses[0].data;
    console.log(`request_id: ${r.request_id}`);
    console.log(`agent: ${r.result?.agent}`);
    console.log(`success: ${!r.error}`);
    const llmContent = r.result?.content || r.result?.response;
    if (llmContent) {
      try {
        const parsed = JSON.parse(llmContent);
        console.log(`\nRespuesta del agente (parseada):`);
        console.log(`  existe_en_proyecto: ${parsed.existe_en_proyecto}`);
        console.log(`  candidatas: ${parsed.candidatas?.length}`);
        console.log(`  nombres: ${parsed.candidatas?.map(c => c.nombre).join(' | ')}`);
        console.log(`  accion_sugerida: ${parsed.accion_sugerida}`);
      } catch (e) {
        console.log(`(content no es JSON: "${llmContent.slice(0, 100)}...")`);
      }
    } else {
      console.log('(result sin content/response — keys:', Object.keys(r.result || {}).join(','), ')');
    }
  }

  // ============================================================
  // [5] Resumen pass/fail
  // ============================================================
  console.log('\n=== [5] Resultado ===');
  const checks = [
    ['agente cargado', !!agente],
    ['provider=deepseek', agente?.provider === 'deepseek'],
    ['3 tools declaradas', (agente?.tools || []).length === 3],
    ['prompt comienza con h1 "# Recipe Researcher"', (agente?.prompt_text || '').startsWith('# Recipe Researcher')],
    ['llm.complete.request emitido 1 vez', llmReqs.length === 1],
    ['system prompt menciona Recipe Researcher', llmReqs[0]?.data?.system?.includes('Recipe Researcher')],
    ['system prompt incluye la task', llmReqs[0]?.data?.system?.includes('magra con tomate')],
    ['agent.execute.response emitido 1 vez', responses.length === 1],
    ['response sin error', responses[0] && !responses[0].data.error],
    ['response.result.agent = recipe-researcher', responses[0]?.data?.result?.agent === 'recipe-researcher']
  ];
  let pass = 0, fail = 0;
  for (const [label, ok] of checks) {
    console.log(`  ${ok ? '✓' : '✗'} ${label}`);
    if (ok) pass++; else fail++;
  }
  console.log(`\n${pass}/${checks.length} OK${fail > 0 ? ` — ${fail} FALLOS` : ''}`);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
