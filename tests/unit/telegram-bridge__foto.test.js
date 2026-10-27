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

  // 5. update CRUDO de Telegram (sin normalizar): el id vive en photo[].file_id.
  //    Es el caso que rompió en vivo el 27-oct: llegaba el pie y «fileId desconocido».
  m = nuevo(); c = capturar(m);
  await m.onTelegramPhotoReceived({ data: {
    botName: 'TestBot', chatId: '123', fileId: undefined,
    from: { id: 1934798567 }, caption: 'esta foto es la Carbonara',
    photo: [
      { file_id: 'AgACAgQAAxkBAAIB-chica', width: 90, height: 67 },
      { file_id: 'AgACAgQAAxkBAAIB-grande', width: 1280, height: 960 }
    ]
  }});
  assert.strictEqual(c.files.length, 1, 'con el update crudo también se descarga');
  assert.strictEqual(c.files[0].fileId, 'AgACAgQAAxkBAAIB-grande',
    'se usa la resolución mayor (el último de la lista)');
  assert.ok(c.chat[0].message.includes(c.files[0].destPath), 'la ruta llega al chat');

  // 6. id en sizes[].file_id (misma forma snake_case)
  m = nuevo(); c = capturar(m);
  await m.onTelegramPhotoReceived({ data: {
    botName: 'TestBot', chatId: '123', from: { id: 1 }, caption: 'x',
    sizes: [{ fileId: 'viejo', width: 90 }, { file_id: 'nuevo', width: 800 }]
  }});
  assert.strictEqual(c.files.length, 1);
  assert.strictEqual(c.files[0].fileId, 'nuevo');

  // 7. foto SIN ningún id → el aviso DICE qué claves traía el evento (no adivina)
  m = nuevo(); c = capturar(m);
  await m.onTelegramPhotoReceived({ data: {
    botName: 'TestBot', chatId: '123', from: { id: 1 }, caption: 'la Carbonara'
  }});
  assert.strictEqual(c.files.length, 0, 'sin id no se pide una descarga imposible');
  assert.strictEqual(c.chat.length, 1, 'pero el chat se entera');
  assert.ok(c.chat[0].message.includes('sin fileId'), 'dice que falta el id');
  assert.ok(c.chat[0].message.includes('botName'), 'lista las claves del evento');
  assert.ok(c.chat[0].message.includes('la Carbonara'), 'el pie no se pierde');

  console.log('✅ telegram-bridge__foto OK — pie + ruta llegan al chat (payload normalizado o update crudo); si la descarga falla o falta el id, avisa con el dato; bot no vinculado se ignora');
})().catch(e => { console.error('❌ FALLO:', e.message); process.exit(1); });
