/**
 * Notificaciones de resultados para comandos paso a paso.
 *
 * Escucha eventos de completado y manda resultado a Telegram
 * cuando el evento incluye notificar.telegram = true.
 * Guarda imagen del agente en preprocesadas/ para que /ocr la use.
 */

const fs = require('fs');
const path = require('path');

function findProjectByBot(botName) {
  const projectsDir = path.join(process.cwd(), 'data/projects');
  try {
    const entries = fs.readdirSync(projectsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('_')) continue;
      const cfgPath = path.join(projectsDir, entry.name, 'config/config.json');
      if (fs.existsSync(cfgPath)) {
        const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
        if (cfg.telegram?.botName === botName) return cfg.id || entry.name;
      }
    }
  } catch (e) { /* ignore */ }
  return null;
}

module.exports = [
  // OCR completado → notificar resultado
  {
    name: 'resultado-ocr',
    trigger: 'documento.ocr.completado',

    filter: (event) => {
      const data = event.data || event;
      return data.notificar?.telegram === true;
    },

    async handle(event, { emit }) {
      const data = event.data || event;
      const { texto, confianza, notificar, _meta } = data;
      const { botName, chatId } = notificar;

      const preview = texto.length > 500 ? texto.slice(0, 500) + '...' : texto;
      const tiempoMs = _meta?.tiempoMs || '?';

      emit('telegram.send_message.request', {
        botName, chatId,
        text: `✅ OCR completado!\n⏱ ${tiempoMs}ms | 🎯 Confianza: ${confianza?.toFixed(1)}%\n📝 ${texto.length} caracteres\n\n--- Texto ---\n${preview}\n\nUsa /estructurar para el siguiente paso.`
      });
    }
  },

  // Imagen optimizada por agente → guardar en preprocesadas/ y notificar
  {
    name: 'resultado-optimizar',
    trigger: 'imagen.optimizada',

    filter: (event) => {
      const data = event.data || event;
      return data.notificar?.telegram === true;
    },

    async handle(event, { emit, logger }) {
      const data = event.data || event;
      const { operaciones, imagenProcesada, filePath, notificar } = data;
      const { botName, chatId } = notificar;

      const ops = Array.isArray(operaciones) ? operaciones.join(', ') : (operaciones || 'desconocidas');

      // Guardar imagen del agente en preprocesadas/ para /ocr
      let savedPath = null;
      if (imagenProcesada) {
        try {
          const projectId = findProjectByBot(botName);
          const outputDir = projectId
            ? path.join(process.cwd(), 'data/projects', projectId, 'storage/preprocesadas')
            : path.join(process.cwd(), 'data/bots', botName, 'preprocesadas');

          if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
          }

          const timestamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '_');
          const base = filePath ? path.basename(filePath, path.extname(filePath)) : 'agente';
          savedPath = path.join(outputDir, `${timestamp}_${base}_agente.png`);

          const buffer = Buffer.from(imagenProcesada, 'base64');
          fs.writeFileSync(savedPath, buffer);

          logger.info('resultado-optimizar.guardado', { savedPath, size: buffer.length });
        } catch (e) {
          logger.error('resultado-optimizar.guardar-error', { error: e.message });
        }
      }

      emit('telegram.send_message.request', {
        botName, chatId,
        text: `🤖 Agente optimizó imagen!\n🔧 Operaciones: ${ops}${savedPath ? `\n📂 ${savedPath}` : ''}\n${imagenProcesada ? '✅ Imagen guardada en preprocesadas/' : '⚠️ Sin imagen procesada'}\n\nUsa /ocr para el siguiente paso.`
      });
    }
  },

  // OCR con DeepSeek visión → notificar resultado
  {
    name: 'resultado-ocr-vision',
    trigger: 'ai.chat.response',

    filter: (event) => {
      const data = event.data || event;
      return data.request_id?.startsWith('ocr-vision|');
    },

    async handle(event, { emit, logger }) {
      const data = event.data || event;
      const { request_id, success, content, error, tokens, cost, provider, model } = data;

      // Decodificar contexto del request_id: ocr-vision|botName|chatId|timestamp
      const parts = request_id.split('|');
      const botName = parts[1];
      const chatId = parts[2];

      if (!success || !content) {
        emit('telegram.send_message.request', {
          botName, chatId,
          text: `❌ OCR DeepSeek falló: ${error || 'sin respuesta'}`
        });
        return;
      }

      const texto = content.trim();
      const preview = texto.length > 1500 ? texto.slice(0, 1500) + '...' : texto;

      logger.info('resultado-ocr-vision.ok', {
        chars: texto.length, tokens, cost, provider, model
      });

      emit('telegram.send_message.request', {
        botName, chatId,
        text: `✅ OCR DeepSeek visión!\n🤖 ${model || 'deepseek'} | 🔤 ${texto.length} chars | 💰 $${(cost || 0).toFixed(4)}\n\n--- Texto ---\n${preview}\n\nUsa /estructurar para el siguiente paso.`
      });
    }
  },

  // Texto estructurado → notificar resultado
  {
    name: 'resultado-estructurar',
    trigger: 'texto.estructurado',

    filter: (event) => {
      const data = event.data || event;
      return data.notificar?.telegram === true;
    },

    async handle(event, { emit }) {
      const data = event.data || event;
      const { datos, notificar } = data;
      const { botName, chatId } = notificar;

      let resumen = '(sin datos)';
      try {
        const d = datos || {};
        const lines = [];
        if (d.emisor?.nombre) lines.push(`📤 Emisor: ${d.emisor.nombre}`);
        if (d.factura?.numero) lines.push(`🔢 Nº: ${d.factura.numero}`);
        if (d.factura?.fecha) lines.push(`📅 Fecha: ${d.factura.fecha}`);
        if (d.totales?.total) lines.push(`💰 Total: ${d.totales.total}€`);
        if (d.totales?.iva) lines.push(`📊 IVA: ${d.totales.iva}€`);
        resumen = lines.length > 0 ? lines.join('\n') : JSON.stringify(d, null, 2).slice(0, 500);
      } catch (e) {
        resumen = JSON.stringify(datos, null, 2).slice(0, 500);
      }

      emit('telegram.send_message.request', {
        botName, chatId,
        text: `✅ Factura estructurada!\n\n${resumen}`
      });
    }
  }
];
