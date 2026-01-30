/**
 * Notificaciones de resultados para comandos paso a paso.
 *
 * Escucha eventos de completado y manda resultado a Telegram
 * cuando el evento incluye notificar.telegram = true.
 */

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

  // Imagen optimizada por agente → notificar y reintentar OCR
  {
    name: 'resultado-optimizar',
    trigger: 'imagen.optimizada',

    filter: (event) => {
      const data = event.data || event;
      return data.notificar?.telegram === true;
    },

    async handle(event, { emit }) {
      const data = event.data || event;
      const { operaciones, imagenProcesada, notificar } = data;
      const { botName, chatId } = notificar;

      const ops = Array.isArray(operaciones) ? operaciones.join(', ') : (operaciones || 'desconocidas');

      emit('telegram.send_message.request', {
        botName, chatId,
        text: `🤖 Agente optimizó imagen!\n🔧 Operaciones: ${ops}\n${imagenProcesada ? '✅ Imagen procesada lista' : '⚠️ Sin imagen procesada'}\n\nReintentando OCR automáticamente...`
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
