/**
 * Handler Pipeline: Orquestador de Factura
 *
 * Conecta los handlers base en un flujo completo:
 *
 *   factura.procesar.request
 *        ↓
 *   imagen.preparar.request (→ preparar-imagen + Sharp)
 *        ↓
 *   imagen.preparada
 *        ↓
 *   documento.ocr.request (→ ocr-tesseract)
 *        ↓
 *   documento.ocr.completado
 *        ↓
 *   texto.estructurar.request (→ estructurar-texto + LLM)
 *        ↓
 *   texto.estructurado
 *        ↓
 *   validar-factura → factura.procesada / factura.necesita_revision
 *        ↓
 *   guardar-factura → factura.guardada
 *
 * Este handler es OPCIONAL - permite encadenar automáticamente.
 * Los handlers base funcionan de forma independiente.
 *
 * Usa tag _pipeline:'factura' para filtrado.
 * Usa requestId con prefijo 'fac-' como identificador alternativo.
 *
 * @version 3.0.0
 */

const { EVENTS } = require('../lib/handler-utils');

module.exports = [
  // =========================================================================
  // PASO 1: Iniciar pipeline → Preparar imagen
  // =========================================================================
  {
    name: 'factura-pipeline-inicio',
    description: 'Inicia el pipeline con preprocesamiento de imagen',
    trigger: EVENTS.FACTURA_PROCESAR,

    async handle(event, { logger, emit }) {
      const data = event.data || event;
      const {
        filePath, language = 'spa',
        notificar, skipPreprocess = false
      } = data;
      const requestId = data.requestId || `fac-${Date.now()}`;

      logger.info('factura-pipeline.inicio', {
        filePath, requestId, skipPreprocess
      });

      if (skipPreprocess) {
        // Saltar preprocesamiento, ir directo a OCR
        emit(EVENTS.OCR_REQUEST, {
          filePath, language,
          requestId, notificar,
          _pipeline: 'factura'
        });
      } else {
        emit(EVENTS.IMAGEN_PREPARAR, {
          filePath, language,
          requestId, notificar,
          _pipeline: 'factura'
        });
      }

      return { success: true, requestId };
    }
  },

  // =========================================================================
  // PASO 1.5: Imagen preparada → OCR
  // =========================================================================
  {
    name: 'factura-pipeline-imagen-a-ocr',
    description: 'Conecta imagen preparada con OCR',
    trigger: EVENTS.IMAGEN_PREPARADA,

    filter: (event) => {
      const data = event.data || event;
      return data._pipeline === 'factura' ||
             data.requestId?.startsWith('fac-');
    },

    async handle(event, { logger, emit }) {
      const data = event.data || event;
      const {
        filePath, imagenProcesada,
        requestId, notificar, language = 'spa'
      } = data;

      logger.info('factura-pipeline.imagen-preparada', {
        filePath,
        tieneImagenProcesada: !!imagenProcesada,
        requestId
      });

      emit(EVENTS.OCR_REQUEST, {
        filePath,
        image: imagenProcesada,
        language,
        requestId, notificar,
        _pipeline: 'factura'
      });

      return { success: true };
    }
  },

  // =========================================================================
  // PASO 2: OCR completado → Estructurar texto
  // =========================================================================
  {
    name: 'factura-pipeline-ocr-a-estructura',
    description: 'Conecta OCR completado con estructuración',
    trigger: EVENTS.OCR_COMPLETADO,

    filter: (event) => {
      const data = event.data || event;
      return data._pipeline === 'factura' ||
             data.requestId?.startsWith('fac-');
    },

    async handle(event, { logger, emit }) {
      const data = event.data || event;
      const { texto, filePath, requestId, confianza, notificar } = data;

      logger.info('factura-pipeline.ocr-completado', {
        caracteres: texto?.length, confianza, requestId
      });

      emit(EVENTS.TEXTO_ESTRUCTURAR, {
        texto,
        tipo: 'factura',
        filePath,
        requestId, notificar,
        _pipeline: 'factura'
      });

      return { success: true };
    }
  },

  // NOTA: El paso 3 (texto.estructurado → factura.procesada) lo maneja
  // validar-factura.js que escucha texto.estructurado con filter _pipeline:'factura'
  // Ya no se necesita un paso aquí para eso.

  // =========================================================================
  // ERROR HANDLERS: Notificar al usuario si algo falla
  // =========================================================================
  {
    name: 'factura-pipeline-error-ocr',
    description: 'Notifica error de OCR en pipeline factura',
    trigger: EVENTS.OCR_ERROR,

    filter: (event) => {
      const data = event.data || event;
      return data._pipeline === 'factura' ||
             data.requestId?.startsWith('fac-');
    },

    async handle(event, { logger, emit }) {
      const data = event.data || event;
      const { error, filePath, requestId, notificar } = data;

      logger.error('factura-pipeline.error-ocr', { error, filePath, requestId });

      if (notificar?.botName && notificar?.chatId) {
        emit(EVENTS.TELEGRAM_SEND_MESSAGE, {
          botName: notificar.botName,
          chatId: notificar.chatId,
          text: `Error OCR: ${error}\nArchivo: ${filePath?.split('/').pop() || 'desconocido'}`
        });
      }

      emit(EVENTS.FACTURA_ERROR, {
        error: `OCR falló: ${error}`,
        fase: 'ocr', filePath, requestId
      });

      return { success: false, error };
    }
  },

  {
    name: 'factura-pipeline-error-estructura',
    description: 'Notifica error de estructuración LLM en pipeline factura',
    trigger: EVENTS.TEXTO_ESTRUCTURAR_ERROR,

    filter: (event) => {
      const data = event.data || event;
      return data._pipeline === 'factura' ||
             data.requestId?.startsWith('fac-');
    },

    async handle(event, { logger, emit }) {
      const data = event.data || event;
      const { error, filePath, requestId, notificar } = data;

      logger.error('factura-pipeline.error-estructura', { error, filePath, requestId });

      if (notificar?.botName && notificar?.chatId) {
        emit(EVENTS.TELEGRAM_SEND_MESSAGE, {
          botName: notificar.botName,
          chatId: notificar.chatId,
          text: `Error estructurando factura: ${error}\nArchivo: ${filePath?.split('/').pop() || 'desconocido'}`
        });
      }

      emit(EVENTS.FACTURA_ERROR, {
        error: `Estructuración falló: ${error}`,
        fase: 'estructura', filePath, requestId
      });

      return { success: false, error };
    }
  }
];
