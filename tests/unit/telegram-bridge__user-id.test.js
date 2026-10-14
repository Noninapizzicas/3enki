'use strict';
const assert = require('assert');
const TelegramBridge = require('../../modules/telegram-bridge');

// REGRESIÓN — telegram-client.extractFrom() entrega un OBJETO
// { id, username, firstName, lastName }. El puente lo interpolaba tal cual en
// user_id: `telegram:${from}` → el literal 'telegram:[object Object]'. Así
// quedaron escritas 220 filas de memoria RAG del proyecto the-pirate.

function nuevo(conversacion = 'conv-1') {
  const m = new TelegramBridge();
  m.logger = { info(){}, warn(){}, error(){} };
  m.metrics = { increment(){} };
  m.eventBus = { publish: () => {} };
  m.registro = {
    vinculos: { 'TestBot': { project_id: 'proj-1', conversaciones: { '123': conversacion } } }
  };
  m._rpc = async () => ({ status: 200, data: {} });
  return m;
}

// Intercepta conversation/send sin tocar el bus; devuelve el buzo donde caen.
function capturar(m) {
  const visto = [];
  m.mqttRequest = async (dom, act, data) => {
    if (dom === 'conversation' && act === 'send') visto.push(data);
    return { status: 200, data: {} };
  };
  return visto;
}

const enviar = (m, from) =>
  m.onTelegramTextReceived({ data: { botName: 'TestBot', chatId: '123', from, text: 'hola' } });

(async () => {
  const todos = [];

  // 1. objeto con id (caso real de Telegram) → el id, y el hilo se resuelve igual
  let m = nuevo(); let visto = capturar(m);
  await enviar(m, { id: 1934798567, username: 'Noninapizzicas', firstName: 'X', lastName: 'Y' });
  assert.strictEqual(visto[0].user_id, 'telegram:1934798567', 'objeto → id');
  assert.strictEqual(visto[0].conversation_id, 'conv-1', 'la conversación sigue resolviéndose');
  todos.push(visto);

  // 2. objeto sin id → cae a username
  m = nuevo(); visto = capturar(m);
  await enviar(m, { username: 'jp' });
  assert.strictEqual(visto[0].user_id, 'telegram:jp', 'sin id → username');
  todos.push(visto);

  // 3. sin emisor → cae al chatId
  m = nuevo(); visto = capturar(m);
  await enviar(m, null);
  assert.strictEqual(visto[0].user_id, 'telegram:123', 'sin emisor → chatId');
  todos.push(visto);

  // 4. string (otros publicadores del evento) → intacto
  m = nuevo(); visto = capturar(m);
  await enviar(m, 'bob');
  assert.strictEqual(visto[0].user_id, 'telegram:bob', 'string → tal cual');
  todos.push(visto);

  // 5. el literal que rompió la memoria no vuelve a aparecer en ningún caso
  const malos = todos.flat().filter(v => String(v.user_id).includes('[object Object]'));
  assert.strictEqual(malos.length, 0, 'ningún user_id con [object Object]');
  // y el título de la conversación creada tampoco lo llevaría
  assert.strictEqual(m._etiquetaFrom({ id: 7 }, '9'), '7', 'etiqueta del título');

  console.log('[telegram-bridge-user-id] OK — el emisor se normaliza a id (nunca [object Object])');
})();
