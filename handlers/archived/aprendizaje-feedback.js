/**
 * Handler: Sistema de Aprendizaje - Feedback
 *
 * Handler genérico que captura feedback de cualquier proceso del sistema.
 * Almacena experiencias en el provider local.learning para consulta posterior.
 *
 * FILOSOFÍA: Reutilizable para cualquier dominio.
 *
 * EVENTOS DE ENTRADA:
 *   aprendizaje.feedback - Guardar feedback de cualquier proceso
 *   aprendizaje.exito    - Shortcut para marcar algo como exitoso
 *   aprendizaje.fallo    - Shortcut para marcar algo como fallido
 *
 * EVENTOS DE SALIDA:
 *   aprendizaje.guardado - Confirma que se guardó
 *
 * EJEMPLO DE USO (desde cualquier handler):
 *   emit('aprendizaje.feedback', {
 *     dominio: 'ocr-imagenes',
 *     contexto: { formato: 'pdf', tamano: 1500, tipoDocumento: 'factura' },
 *     accion: { threshold: 140, grayscale: true },
 *     resultado: { confianza: 85, texto: '...' },
 *     feedback: { exito: true, score: 0.85 },
 *     tags: ['factura', 'pdf']
 *   });
 *
 * @version 1.0.0
 */

module.exports = [
  // =========================================================================
  // Feedback genérico - entrada principal
  // =========================================================================
  {
    name: 'aprendizaje-feedback',
    description: 'Guarda feedback de cualquier proceso para aprendizaje',
    trigger: 'aprendizaje.feedback',

    async handle(event, { logger, emit, services }) {
      const data = event.data || event;
      const {
        dominio,
        contexto,
        accion,
        resultado,
        feedback,
        tags = []
      } = data;

      if (!dominio) {
        logger.warn('aprendizaje-feedback.sin-dominio', { data });
        return { success: false, error: 'Dominio requerido' };
      }

      logger.info('aprendizaje-feedback.guardando', {
        dominio,
        tags,
        tieneContexto: !!contexto,
        tieneAccion: !!accion
      });

      try {
        const result = await services.call('local.learning', 'save', {
          dominio,
          contexto,
          accion,
          resultado,
          feedback,
          tags
        });

        if (result.data?.success) {
          emit('aprendizaje.guardado', {
            dominio,
            id: result.data.id,
            tags
          });

          logger.info('aprendizaje-feedback.guardado', {
            dominio,
            id: result.data.id
          });

          return { success: true, id: result.data.id };
        }

        throw new Error(result.data?.error || 'Error guardando feedback');

      } catch (error) {
        logger.error('aprendizaje-feedback.error', {
          error: error.message,
          dominio
        });
        return { success: false, error: error.message };
      }
    }
  },

  // =========================================================================
  // Shortcut: Marcar éxito
  // =========================================================================
  {
    name: 'aprendizaje-exito',
    description: 'Shortcut para registrar un resultado exitoso',
    trigger: 'aprendizaje.exito',

    async handle(event, { logger, emit }) {
      const data = event.data || event;
      const { dominio, contexto, accion, resultado, score = 1, tags = [] } = data;

      logger.info('aprendizaje-exito.recibido', { dominio });

      // Re-emitir como feedback completo
      emit('aprendizaje.feedback', {
        dominio,
        contexto,
        accion,
        resultado,
        feedback: {
          exito: true,
          score: Math.min(1, Math.max(0, score))
        },
        tags: [...tags, 'exito']
      });

      return { success: true, tipo: 'exito' };
    }
  },

  // =========================================================================
  // Shortcut: Marcar fallo
  // =========================================================================
  {
    name: 'aprendizaje-fallo',
    description: 'Shortcut para registrar un fallo',
    trigger: 'aprendizaje.fallo',

    async handle(event, { logger, emit }) {
      const data = event.data || event;
      const { dominio, contexto, accion, resultado, motivo, tags = [] } = data;

      logger.info('aprendizaje-fallo.recibido', { dominio, motivo });

      // Re-emitir como feedback completo
      emit('aprendizaje.feedback', {
        dominio,
        contexto,
        accion,
        resultado,
        feedback: {
          exito: false,
          score: 0,
          motivo
        },
        tags: [...tags, 'fallo']
      });

      return { success: true, tipo: 'fallo' };
    }
  }
];
