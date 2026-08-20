'use strict';
const assert = require('assert');
const TelegramBridge = require('../../modules/telegram-bridge');

function nuevo() {
  const m = new TelegramBridge();
  m.logger = { info(){}, warn(){}, error(){} };
  m.metrics = { increment(){} };
  m.eventBus = { publish: () => {} };
  m.mqttRequest = async () => ({ status: 200, data: {} });
  m.registro = {
    vinculos: {
      'TestBot': { project_id: 'proj-1', conversaciones: { '123': 'conv-1' } }
    }
  };
  m._rpc = async () => ({ status: 200, data: {} });
  return m;
}

(async () => {
  const m = nuevo();

  // 1. portal.confirmation.pendiente → manda mensaje con botones (se guarda en pending)
  await m.onPortalConfirmationPendiente({
    data: { tool: 'escandallo.escalar', project_id: 'proj-1', description: 'Escalar receta' }
  });
  assert.strictEqual(m._pendingConfirms.size, 1, 'guarda la petición pendiente');

  const [token, pend] = m._pendingConfirms.entries().next().value;
  assert.strictEqual(pend.tool, 'escandallo.escalar');
  assert.ok(pend.args !== undefined);

  // 2. callback confirm → ejecuta (mqttRequest portal.call) y limpia
  let llamado = null;
  m.mqttRequest = async (dom, act, data) => { llamado = { dom, act, data }; return { status: 200, data: {} }; };
  await m.onTelegramCallbackReceived({ data: { botName: 'TestBot', chatId: '123', callbackId: 'cb', data: `confirm:${token}` } });
  assert.ok(llamado, 'llama portal.call');
  assert.strictEqual(llamado.dom, 'portal');
  assert.strictEqual(llamado.act, 'call');
  assert.strictEqual(llamado.data.confirmado, true, 'confirmado:true');
  assert.strictEqual(m._pendingConfirms.has(token), false, 'limpia la petición');

  // 3. proyecto sin bot vinculado → no manda
  m._pendingConfirms.clear();
  let enviado = 0;
  m._enviarTelegram = async () => { enviado++; };
  await m.onPortalConfirmationPendiente({ data: { tool: 'x', project_id: 'sin-bot' } });
  assert.strictEqual(enviado, 0, 'sin bot no manda');

  console.log('[telegram-bridge-confirm] OK — confirmación por Telegram funcionando');
})();
