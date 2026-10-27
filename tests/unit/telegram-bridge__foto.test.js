'use strict';
const assert = require('assert');
const TelegramBridge = require('../../modules/telegram-bridge');

// La FOTO que entraba por Telegram no llegaba al chat: se descargaba a
// data/bots/<bot>/received/ y el chat NO se enteraba. El PIE DE FOTO
// («esta foto es la Carbonara») se perdía en silencio.
// 1.0.2 escucha telegram.photo.received, materializa la foto y reenvía al chat
// UNA línea con el pie + la ruta local.

function nuevo(vinculado = true) {
  const m = new TelegramBridge();
  m.logger = { info(){}, warn(){}, error(){}, debug(){} };
  m.metrics = { increment(){} };
  m.eventBus = { publish: () => {}, subscribe: () => {} };
  m.registro = {
    vinculos: vinculado
      ? { TestBot: { project_id: 'proj-1', conversaciones: { '123': 'conv-1' } } }
      : {}
  };
  return m;
}

// Captura lo que va al chat y lo que se pide a telegram-service.
function capturar(m, { descargaOk = true } = {}) {
  const chat = []; const files = [];
  m._rpc = async (evento, payload) => {
    if (evento === 'telegram.get_file.request') {
      files.push(payload);
      return descargaOk
        ? { status: 200, data: { localPath: payload.destPath, filePath: 'photos/x.jpg' } }
        : { status: 502, error: { message: 'UPSTREAM_INVALID_RESPONSE' } };
    }
    return { status: 200, data: {} };
  };
  m.mqttRequest = async (dom, act, data) => {
    if (dom === 'conversation' && act === 'send') chat.push(data);
    return { status: 200, data: {} };
  };
  return { chat, files };
}

const foto = (m, extra) =>
  m.onTelegramPhotoReceived({ data: {
    botName: 'TestBot', chatId: '123', fileId: 'AgACAgQAAxkBAAIB-10889465',
    from: { id: 1934798567, username: 'social' }, caption: null, ...extra
  }});

(async () => {
  // 1. foto CON pie de foto → el chat recibe pie + ruta, y se pide la descarga
  let m = nuevo(); let c = capturar(m);
  await foto(m, { caption: 'esta foto es la Carbonara' });
  assert.strictEqual(c.chat.length, 1, 'una foto = una inyección');
  assert.strictEqual(c.files.length, 1, 'una foto = una descarga');
  assert.strictEqual(c.files[0].download, true, 'hay que materializar la foto');
  assert.ok(/data\/bots\/TestBot\/received\/foto_\d{8}T\d{6}_10889465\.jpg$/.test(c.files[0].destPath),
    'destino en el almacén del bot: ' + c.files[0].destPath);
  assert.strictEqual(c.chat[0].conversation_id, 'conv-1');
  assert.strictEqual(c.chat[0].channel, 'telegram');
  assert.strictEqual(c.chat[0].channel_context.botName, 'TestBot');
  assert.strictEqual(c.chat[0].user_id, 'telegram:1934798567');
  assert.ok(c.chat[0].message.includes('esta foto es la Carbonara'), 'falta el pie de foto');
  assert.ok(c.chat[0].message.includes(c.files[0].destPath), 'falta la ruta local');

  // 2. foto SIN pie → se dice explícitamente (no se inventa el producto)
  m = nuevo(); c = capturar(m);
  await foto(m, { caption: null });
  assert.strictEqual(c.chat.length, 1);
  assert.ok(c.chat[0].message.includes('sin pie de foto'));
  assert.ok(c.chat[0].message.includes(c.files[0].destPath));

  // 3. descarga que falla → el chat SE ENTERA igual (nunca silencio)
  m = nuevo(); c = capturar(m, { descargaOk: false });
  await foto(m, { caption: 'la Carbonara' });
  assert.strictEqual(c.chat.length, 1, 'aunque falle la descarga, el aviso llega');
  assert.ok(c.chat[0].message.includes('no se pudo descargar'));
  assert.ok(c.chat[0].message.includes('la Carbonara'), 'el pie no se pierde');

  // 4. bot NO vinculado → ni descarga ni inyección (misma regla que el texto)
  m = nuevo(false); c = capturar(m);
  await foto(m, { caption: 'x' });
  assert.strictEqual(c.chat.length, 0, 'bot no vinculado no inyecta');
  assert.strictEqual(c.files.length, 0, 'bot no vinculado no descarga');

  console.log('✅ telegram-bridge__foto OK — pie + ruta llegan al chat; si la descarga falla, avisa; bot no vinculado se ignora');
})().catch(e => { console.error('❌ FALLO:', e.message); process.exit(1); });
