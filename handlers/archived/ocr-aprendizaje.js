/**
 * Handler: OCR + Sistema de Aprendizaje
 *
 * Conecta el pipeline de OCR con el sistema de aprendizaje genérico.
 * Demuestra cómo cualquier módulo puede usar local.learning.
 *
 * FUNCIONALIDAD:
 * 1. Cuando OCR tiene éxito (confianza alta) → registra experiencia exitosa
 * 2. Cuando OCR falla o tiene baja confianza → registra para aprender
 * 3. Antes de procesar imagen → consulta recomendaciones
 *
 * DOMINIO: 'ocr-imagenes'
 *
 * @version 1.0.0
 */

// Umbral de confianza para considerar exitoso
const UMBRAL_EXITO = 70;
const UMBRAL_BAJO = 50;

module.exports = [
  // =========================================================================
  // OCR completado → Registrar experiencia
  // =========================================================================
  {
    name: 'ocr-aprendizaje-registrar',
    description: 'Registra resultado de OCR en sistema de aprendizaje',
    trigger: 'documento.ocr.completado',

    async handle(event, { logger, emit }) {
      const data = event.data || event;
      const {
        filePath,
        confianza,
        texto,
        requestId,
        _preprocesado,
        _optimizado,
        _optimizacionIntento
      } = data;

      // Construir contexto de la imagen
      const contexto = {
        extension: filePath?.split('.').pop()?.toLowerCase(),
        preprocesado: !!_preprocesado,
        optimizado: !!_optimizado,
        intento: _optimizacionIntento || 1
      };

      // Agregar info del preprocesado si existe
      if (_preprocesado?.opciones) {
        contexto.threshold = _preprocesado.opciones.threshold;
        contexto.grayscale = _preprocesado.opciones.grayscale;
        contexto.normalize = _preprocesado.opciones.normalize;
        contexto.sharpen = _preprocesado.opciones.sharpen;
      }

      // Determinar acción que se tomó
      const accion = _preprocesado?.opciones || { original: true };

      // Determinar resultado
      const resultado = {
        confianza,
        caracteresExtraidos: texto?.length || 0,
        tieneTexto: !!(texto && texto.trim().length > 10)
      };

      // Determinar si fue éxito o fallo
      const esExito = confianza >= UMBRAL_EXITO && resultado.tieneTexto;
      const esBajo = confianza < UMBRAL_BAJO;

      // Tags para categorización
      const tags = [
        contexto.extension,
        esExito ? 'exito' : (esBajo ? 'fallo' : 'regular'),
        _optimizado ? 'optimizado' : 'primer-intento'
      ].filter(Boolean);

      logger.info('ocr-aprendizaje.registrando', {
        requestId,
        confianza,
        esExito,
        tags
      });

      // Emitir al sistema de aprendizaje genérico
      emit('aprendizaje.feedback', {
        dominio: 'ocr-imagenes',
        contexto,
        accion,
        resultado,
        feedback: {
          exito: esExito,
          score: confianza / 100
        },
        tags
      });

      return { success: true, registrado: true, esExito };
    }
  },

  // =========================================================================
  // Antes de preprocesar → Consultar recomendaciones
  // =========================================================================
  {
    name: 'ocr-aprendizaje-consultar',
    description: 'Consulta recomendaciones antes de procesar imagen',
    trigger: 'imagen.preparar.consultar',

    async handle(event, { logger, emit, services }) {
      const data = event.data || event;
      const { filePath, requestId, imageInfo } = data;

      // Construir contexto para búsqueda
      const contexto = {
        extension: filePath?.split('.').pop()?.toLowerCase()
      };

      if (imageInfo) {
        contexto.width = imageInfo.width;
        contexto.height = imageInfo.height;
        contexto.format = imageInfo.format;
      }

      logger.info('ocr-aprendizaje.consultando', {
        requestId,
        contexto
      });

      // Consultar sistema de aprendizaje
      const result = await services.call('local.learning', 'best-action', {
        dominio: 'ocr-imagenes',
        contexto,
        camposSimilitud: ['extension', 'format']
      });

      if (result.data?.encontrado) {
        logger.info('ocr-aprendizaje.recomendacion-encontrada', {
          requestId,
          similitud: result.data.similitud,
          accion: result.data.accionRecomendada
        });

        // Emitir recomendación
        emit('imagen.preparar.recomendacion', {
          filePath,
          requestId,
          recomendacion: result.data.accionRecomendada,
          similitud: result.data.similitud,
          basadoEn: result.data.experienciaId
        });

        return {
          success: true,
          encontrado: true,
          recomendacion: result.data.accionRecomendada
        };
      }

      logger.info('ocr-aprendizaje.sin-recomendacion', {
        requestId,
        mensaje: result.data?.mensaje
      });

      // Emitir que no hay recomendación (usar defaults)
      emit('imagen.preparar.recomendacion', {
        filePath,
        requestId,
        recomendacion: null,
        usarDefaults: true
      });

      return { success: true, encontrado: false };
    }
  },

  // =========================================================================
  // Comando: Ver estadísticas de OCR
  // =========================================================================
  {
    name: 'ocr-aprendizaje-stats',
    description: 'Muestra estadísticas de aprendizaje OCR',
    trigger: 'comando.ocr.estadisticas',

    async handle(event, { logger, emit, services }) {
      const data = event.data || event;
      const { chatId, botName, notificar } = data;

      const result = await services.call('local.learning', 'stats', {
        dominio: 'ocr-imagenes'
      });

      if (!result.data?.success) {
        if (notificar?.chatId) {
          emit('telegram.send', {
            botName: notificar.botName || botName,
            chatId: notificar.chatId || chatId,
            text: 'No hay estadísticas de aprendizaje OCR aún.'
          });
        }
        return { success: false };
      }

      const stats = result.data;

      // Construir mensaje
      let mensaje = `📊 *Estadísticas OCR*\n\n`;
      mensaje += `Total experiencias: ${stats.total}\n`;
      mensaje += `Exitosos: ${stats.exitosos}\n`;
      mensaje += `Tasa éxito: ${stats.tasaExito}\n`;

      if (stats.promedioScore !== null) {
        mensaje += `Score promedio: ${(stats.promedioScore * 100).toFixed(1)}%\n`;
      }

      if (stats.tags && Object.keys(stats.tags).length > 0) {
        mensaje += `\n*Por tipo:*\n`;
        Object.entries(stats.tags).forEach(([tag, count]) => {
          if (!['exito', 'fallo', 'regular'].includes(tag)) {
            mensaje += `  ${tag}: ${count}\n`;
          }
        });
      }

      if (notificar?.chatId || chatId) {
        emit('telegram.send', {
          botName: notificar?.botName || botName,
          chatId: notificar?.chatId || chatId,
          text: mensaje,
          parseMode: 'Markdown'
        });
      }

      logger.info('ocr-aprendizaje.stats-enviadas', { stats: stats.total });

      return { success: true, stats };
    }
  }
];
