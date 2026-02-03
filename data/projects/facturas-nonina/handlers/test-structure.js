/**
 * Handler Proyecto: /gostructure
 *
 * Estructurar texto OCR con DeepSeek.
 * Toma el texto del ultimo OCR exitoso y lo convierte en JSON estructurado.
 *
 * @version 1.0.0
 */

const path = require('path');
const fs = require('fs');

module.exports = {
  name: 'test-structure',
  trigger: 'bot.command.received',

  filter: (event) => {
    const data = event.data || event;
    return data.command === 'gostructure';
  },

  async handle(event, { logger, emit, services, config, projectId }) {
    const data = event.data || event;
    const chatId = data.chatId;
    const cfg = config.config || {};
    const botName = cfg.telegram?.botName || data.botName;

    // 1. Buscar ultimo resultado OCR guardado
    const storageDir = path.join(process.cwd(), 'data/projects', projectId, 'storage');
    const ocrDir = path.join(storageDir, 'ocr');
    const structDir = path.join(storageDir, 'estructuradas');

    // Buscar archivo de texto OCR mas reciente
    let textoOCR = null;

    if (fs.existsSync(ocrDir)) {
      const archivos = fs.readdirSync(ocrDir)
        .filter(f => f.endsWith('.txt'))
        .map(f => ({ name: f, path: path.join(ocrDir, f), mtime: fs.statSync(path.join(ocrDir, f)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime);

      if (archivos.length > 0) {
        textoOCR = fs.readFileSync(archivos[0].path, 'utf-8');
      }
    }

    if (!textoOCR) {
      emit('telegram.send_message.request', {
        botName, chatId,
        text: 'No hay texto OCR guardado. Usa /gocr primero.'
      });
      return;
    }

    emit('telegram.send_message.request', {
      botName, chatId,
      text: `Estructurando texto OCR (${textoOCR.length} chars) con DeepSeek...`
    });

    // 2. Llamar a DeepSeek via ai-gateway (solo texto)
    try {
      const result = await services.call('ai', 'chat', {
        messages: [
          {
            role: 'system',
            content: `Eres un experto en extracción de datos de facturas. A partir del texto OCR que te proporciono, extrae los datos estructurados en JSON con este formato exacto:

{
  "emisor": {
    "nombre": "",
    "cif": "",
    "direccion": "",
    "telefono": "",
    "web": ""
  },
  "receptor": {
    "nombre": "",
    "cif": "",
    "direccion": "",
    "codigo_cliente": ""
  },
  "factura": {
    "numero": "",
    "fecha": "",
    "forma_pago": ""
  },
  "lineas": [
    {
      "descripcion": "",
      "unidades": 0,
      "precio": 0,
      "descuento": "",
      "importe": 0
    }
  ],
  "totales": {
    "base_imponible": 0,
    "iva_porcentaje": 0,
    "iva_importe": 0,
    "total_factura": 0,
    "resto_cobrar": 0
  }
}

Devuelve SOLO el JSON, sin explicaciones ni markdown.`
          },
          {
            role: 'user',
            content: textoOCR
          }
        ],
        provider: 'deepseek',
        temperature: 0.1,
        max_tokens: 2000
      }, { timeout: 60000 });

      const d = result.data || result;
      const respuesta = d.content || d.message || 'Sin respuesta';

      // Guardar resultado
      if (!fs.existsSync(structDir)) fs.mkdirSync(structDir, { recursive: true });
      const outputPath = path.join(structDir, `factura_${Date.now()}.json`);
      fs.writeFileSync(outputPath, respuesta, 'utf-8');

      // Truncar para Telegram
      const textoTelegram = respuesta.length > 3500
        ? respuesta.substring(0, 3500) + '\n\n... (truncado)'
        : respuesta;

      const mensaje = [
        'Estructurado OK',
        `Tokens: ${d.tokens || '?'}`,
        `Coste: $${(d.cost || 0).toFixed(4)}`,
        `Guardado: ${path.basename(outputPath)}`,
        '',
        textoTelegram
      ].join('\n');

      emit('telegram.send_message.request', { botName, chatId, text: mensaje });

      logger.info('test-structure.ok', {
        tokens: d.tokens,
        cost: d.cost,
        outputPath: path.basename(outputPath)
      });

    } catch (error) {
      emit('telegram.send_message.request', {
        botName, chatId,
        text: `Error estructurando: ${error.message}`
      });
      logger.error('test-structure.error', { error: error.message });
    }
  }
};
