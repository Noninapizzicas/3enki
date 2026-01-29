/**
 * Handler: Sistema de Aprendizaje - Consulta
 *
 * Handler genérico para consultar el sistema de aprendizaje.
 * Cualquier proceso puede pedir recomendaciones basadas en experiencias pasadas.
 *
 * FILOSOFÍA: Reutilizable para cualquier dominio.
 *
 * EVENTOS DE ENTRADA:
 *   aprendizaje.consulta       - Buscar experiencias similares
 *   aprendizaje.recomendar     - Obtener mejor acción recomendada
 *   aprendizaje.estadisticas   - Obtener stats de un dominio
 *
 * EVENTOS DE SALIDA:
 *   aprendizaje.resultados     - Resultados de consulta
 *   aprendizaje.recomendacion  - Acción recomendada
 *   aprendizaje.stats          - Estadísticas
 *
 * EJEMPLO DE USO (desde cualquier handler):
 *   emit('aprendizaje.recomendar', {
 *     dominio: 'ocr-imagenes',
 *     contexto: { formato: 'jpg', tamano: 2000, fondo: 'granito' },
 *     requestId: 'xxx'  // para correlación
 *   });
 *
 *   // Escuchar respuesta en: aprendizaje.recomendacion
 *
 * @version 1.0.0
 */

module.exports = [
  // =========================================================================
  // Consulta genérica - buscar experiencias similares
  // =========================================================================
  {
    name: 'aprendizaje-consulta',
    description: 'Busca experiencias similares en el historial',
    trigger: 'aprendizaje.consulta',

    async handle(event, { logger, emit, services }) {
      const data = event.data || event;
      const {
        dominio,
        contexto,
        camposSimilitud = [],
        limite = 5,
        minSimilitud = 0.3,
        tags = [],
        soloExitosos = false,
        requestId
      } = data;

      if (!dominio) {
        logger.warn('aprendizaje-consulta.sin-dominio');
        return { success: false, error: 'Dominio requerido' };
      }

      logger.info('aprendizaje-consulta.buscando', {
        dominio,
        tieneContexto: !!contexto,
        limite,
        requestId
      });

      try {
        const result = await services.call('local.learning', 'query', {
          dominio,
          contexto,
          camposSimilitud,
          limite,
          minSimilitud,
          tags,
          soloExitosos
        });

        if (result.data?.success) {
          emit('aprendizaje.resultados', {
            dominio,
            total: result.data.total,
            resultados: result.data.resultados,
            requestId
          });

          logger.info('aprendizaje-consulta.completado', {
            dominio,
            encontrados: result.data.total,
            requestId
          });

          return {
            success: true,
            total: result.data.total,
            resultados: result.data.resultados
          };
        }

        throw new Error(result.data?.error || 'Error en consulta');

      } catch (error) {
        logger.error('aprendizaje-consulta.error', {
          error: error.message,
          dominio
        });
        return { success: false, error: error.message };
      }
    }
  },

  // =========================================================================
  // Recomendación - obtener mejor acción para un contexto
  // =========================================================================
  {
    name: 'aprendizaje-recomendar',
    description: 'Recomienda la mejor acción basada en experiencias exitosas',
    trigger: 'aprendizaje.recomendar',

    async handle(event, { logger, emit, services }) {
      const data = event.data || event;
      const {
        dominio,
        contexto,
        camposSimilitud = [],
        requestId
      } = data;

      if (!dominio || !contexto) {
        logger.warn('aprendizaje-recomendar.params-incompletos');
        return { success: false, error: 'Dominio y contexto requeridos' };
      }

      logger.info('aprendizaje-recomendar.buscando', {
        dominio,
        requestId
      });

      try {
        const result = await services.call('local.learning', 'best-action', {
          dominio,
          contexto,
          camposSimilitud
        });

        const respuesta = {
          dominio,
          encontrado: result.data?.encontrado || false,
          requestId
        };

        if (result.data?.encontrado) {
          respuesta.similitud = result.data.similitud;
          respuesta.accionRecomendada = result.data.accionRecomendada;
          respuesta.contextoSimilar = result.data.contextoOriginal;
          respuesta.resultadoPrevio = result.data.resultadoObtenido;
          respuesta.experienciaId = result.data.experienciaId;

          logger.info('aprendizaje-recomendar.encontrado', {
            dominio,
            similitud: result.data.similitud,
            requestId
          });
        } else {
          respuesta.mensaje = result.data?.mensaje || 'Sin recomendaciones disponibles';

          logger.info('aprendizaje-recomendar.no-encontrado', {
            dominio,
            mensaje: respuesta.mensaje,
            requestId
          });
        }

        emit('aprendizaje.recomendacion', respuesta);

        return { success: true, ...respuesta };

      } catch (error) {
        logger.error('aprendizaje-recomendar.error', {
          error: error.message,
          dominio
        });

        emit('aprendizaje.recomendacion', {
          dominio,
          encontrado: false,
          error: error.message,
          requestId
        });

        return { success: false, error: error.message };
      }
    }
  },

  // =========================================================================
  // Estadísticas - obtener métricas de un dominio
  // =========================================================================
  {
    name: 'aprendizaje-estadisticas',
    description: 'Obtiene estadísticas de aprendizaje de un dominio',
    trigger: 'aprendizaje.estadisticas',

    async handle(event, { logger, emit, services }) {
      const data = event.data || event;
      const { dominio, regenerar = false, requestId } = data;

      if (!dominio) {
        // Si no hay dominio, listar todos
        const result = await services.call('local.learning', 'domains', {});

        emit('aprendizaje.stats', {
          tipo: 'dominios',
          dominios: result.data?.dominios || [],
          total: result.data?.total || 0,
          requestId
        });

        return { success: true, dominios: result.data?.dominios };
      }

      logger.info('aprendizaje-estadisticas.consultando', { dominio });

      try {
        const result = await services.call('local.learning', 'stats', {
          dominio,
          regenerar
        });

        if (result.data?.success) {
          const stats = {
            tipo: 'dominio',
            dominio,
            total: result.data.total,
            exitosos: result.data.exitosos,
            tasaExito: result.data.tasaExito,
            promedioScore: result.data.promedioScore,
            tags: result.data.tags,
            primeraExperiencia: result.data.primeraExperiencia,
            ultimaExperiencia: result.data.ultimaExperiencia,
            requestId
          };

          emit('aprendizaje.stats', stats);

          logger.info('aprendizaje-estadisticas.completado', {
            dominio,
            total: result.data.total,
            tasaExito: result.data.tasaExito
          });

          return { success: true, ...stats };
        }

        throw new Error(result.data?.error || 'Error obteniendo stats');

      } catch (error) {
        logger.error('aprendizaje-estadisticas.error', {
          error: error.message,
          dominio
        });
        return { success: false, error: error.message };
      }
    }
  }
];
