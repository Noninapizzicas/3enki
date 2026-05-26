#!/usr/bin/env node
/**
 * Test conceptual del piloto blueprint contra el LLM real.
 *
 * Lanza un llm.complete.request al ai-gateway de produccion con:
 *   - system prompt = blueprint padre + hijo (subsistema-recetario + recetas)
 *   - user message = pedida realista de crear una receta
 *   - SIN tools (queremos ver que describe el LLM en texto natural, no que ejecute)
 *
 * Evalua: ¿el LLM entiende el blueprint? ¿describe los eventos correctos
 * a publicar? ¿identifica campos del contexto vs input del usuario?
 *
 * CERO efectos productivos: solo publish/listen de llm.complete.*.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mqtt = require('mqtt');

const BROKER = 'wss://enki-ai.online/mqtt';

// Cargar blueprints
const blueprintsDir = path.join(__dirname, '../../modules/_recetas-blueprint');
const padre = fs.readFileSync(path.join(blueprintsDir, 'subsistema-recetario.modulo-base.blueprint.json'), 'utf-8');
const hijo  = fs.readFileSync(path.join(blueprintsDir, 'recetas.blueprint.json'), 'utf-8');

const systemPrompt = `Eres el modulo 'recetas' del sistema event-driven enki. Tu identidad y comportamiento se definen por los DOS blueprints siguientes (padre abstracto + hijo concreto).

Operas asi: lees el user message, identificas que operacion del blueprint aplica (en este caso 'crear'), y SIGUES el pseudocodigo de esa operacion paso a paso. Tienes 2 tools universales para interactuar con el bus:
  - bus.publish(event, payload)
  - bus.publishAndWait(event, payload)

Donde el pseudocodigo dice publish(...) → llamas bus.publish.
Donde dice publishAndWait(...) → llamas bus.publishAndWait.
Donde dice normalizar/razonar/comparar → lo haces tu mismo mentalmente.

En este test NO TIENES tools disponibles. En su lugar, DESCRIBE en texto natural el plan que ejecutarias: que eventos publicarias, en que orden, con que payload (lo mas concreto posible). Si tienes dudas sobre algun paso, di que dudas. Si detectas algo ausente del blueprint, di que falta.

===== BLUEPRINT PADRE (subsistema-recetario.modulo-base) =====
${padre}

===== BLUEPRINT HIJO (recetas) =====
${hijo}
`;

const userMessage = `Quiero guardar la receta de mi madre: Tortilla de patatas. Lleva 4 huevos, 2 patatas medianas, media cebolla, sal y aceite. Para 2 personas, unos 30 min, dificultad facil. Categoria: español, tradicional.

(Contexto que te llega del orquestador del chat: project_id=2f7e37ce-e7c4-4686-b84a-295aee6d28c3, user_id=test-user, correlation_id=corr-test-001)

Describe el plan que ejecutarias. No me hables como usuario final, dame el plan de eventos.`;

(async () => {
  console.log('Conectando al broker...');
  const client = mqtt.connect(BROKER, {
    clientId: 'blueprint-conceptual-test-' + Date.now(),
    connectTimeout: 8000,
    reconnectPeriod: 0
  });

  const requestId = crypto.randomUUID();
  let responsePayload = null;
  const buildTopic = (et) => { const p=et.split('.'); return 'core/*/events/'+p[0]+(p.length>1?'/'+p.slice(1).join('/'):''); };
  const subTopic   = (et) => { const p=et.split('.'); return 'core/+/events/'+p[0]+(p.length>1?'/'+p.slice(1).join('/'):''); };

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('connect timeout')), 10000);
    client.on('connect', () => { clearTimeout(timeout); resolve(); });
    client.on('error', (err) => { clearTimeout(timeout); reject(err); });
  });
  console.log('Conectado.');

  // Subscribirse a la response
  await new Promise((res, rej) => {
    client.subscribe(subTopic('llm.complete.response'), (err) => err ? rej(err) : res());
  });

  client.on('message', (topic, payload) => {
    try {
      const evt = JSON.parse(payload.toString());
      if (evt.data?.request_id === requestId) {
        responsePayload = evt.data;
      }
    } catch (_) {}
  });

  // Publicar llm.complete.request
  const requestEvent = {
    event_id: crypto.randomUUID(),
    event_type: 'llm.complete.request',
    timestamp: new Date().toISOString(),
    source: { core_id: 'blueprint-test' },
    data: {
      request_id: requestId,
      messages: [
        { role: 'user', content: userMessage }
      ],
      system: systemPrompt,
      settings: {
        temperature: 0.3,
        max_tokens: 2500
      },
      project_id: '2f7e37ce-e7c4-4686-b84a-295aee6d28c3',
      correlation_id: 'blueprint-conceptual-test'
    },
    metadata: {}
  };

  console.log('Publicando llm.complete.request (request_id=' + requestId + ')...');
  console.log('  System prompt: ' + systemPrompt.length + ' chars (' + padre.length + ' padre + ' + hijo.length + ' hijo)');
  console.log('  User message: ' + userMessage.length + ' chars');
  client.publish(buildTopic('llm.complete.request'), JSON.stringify(requestEvent));

  // Esperar response hasta 90s
  const start = Date.now();
  while (responsePayload === null && Date.now() - start < 180000) {
    await new Promise(r => setTimeout(r, 500));
  }

  if (responsePayload === null) {
    console.error('TIMEOUT: no llego llm.complete.response en 180s.');
    client.end();
    process.exit(1);
  }

  console.log('\n========== RESPUESTA DEL LLM ==========');
  console.log('status:', responsePayload.status);
  console.log('provider:', responsePayload.data?.provider, '| model:', responsePayload.data?.model);
  console.log('tokens:', JSON.stringify(responsePayload.data?.usage || responsePayload.data?.tokens));
  console.log('duration_ms:', responsePayload.data?.duration_ms);
  console.log('---');
  console.log('CONTENT:');
  console.log(responsePayload.data?.content || responsePayload.data?.message || JSON.stringify(responsePayload));
  console.log('========================================');

  // Guardar export para analisis
  const auditDir = path.join(__dirname, '../../audit/blueprint-conceptual-' + new Date().toISOString().slice(0,19).replace(/[:T]/g,'-'));
  fs.mkdirSync(auditDir, { recursive: true });
  fs.writeFileSync(path.join(auditDir, 'request.json'), JSON.stringify(requestEvent, null, 2));
  fs.writeFileSync(path.join(auditDir, 'response.json'), JSON.stringify(responsePayload, null, 2));
  console.log('\nGuardado en:', auditDir);

  client.end();
})().catch(err => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
