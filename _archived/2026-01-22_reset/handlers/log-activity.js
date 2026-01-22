/**
 * Handler: Log Activity
 *
 * Ejemplo real que demuestra todas las funcionalidades del sistema de handlers:
 * - services: llamada a servicios
 * - logger: logging estructurado
 * - emit: encadenamiento con otros handlers
 * - config: acceso a configuración
 * - store: persistencia de estado
 *
 * Este handler registra actividad del sistema y puede encadenarse
 * con otros handlers para procesamiento adicional.
 */

module.exports = {
  name: 'log-activity',

  description: 'Registra actividad del sistema con métricas',

  // Escucha cualquier evento de documento procesado
  trigger: 'documento.procesado',

  // Filtro: solo documentos con confianza suficiente
  filter: (event) => {
    const minConfianza = 0.5;
    return (event.confianza ?? 1) >= minConfianza;
  },

  async handle(event, { services, logger, projectId, emit, config, store }) {
    // 1. Obtener configuración (con defaults)
    const logConfig = config.activity ?? {};
    const enableMetrics = logConfig.enableMetrics !== false;
    const retentionDays = logConfig.retentionDays ?? 30;

    // 2. Actualizar contadores en store
    const totalProcesados = await store.increment('total_procesados');
    const hoy = new Date().toISOString().split('T')[0];
    const procesadosHoy = await store.increment(`dia:${hoy}`);

    // 3. Guardar último procesamiento
    await store.set('ultimo_procesamiento', {
      timestamp: Date.now(),
      eventType: event._meta?.source ?? 'unknown',
      projectId
    });

    // 4. Log estructurado
    logger.info('activity.logged', {
      totalProcesados,
      procesadosHoy,
      projectId,
      correlationId: event._meta?.correlationId,
      enableMetrics,
      retentionDays
    });

    // 5. Emitir evento para posible encadenamiento
    // Otros handlers pueden escuchar 'activity.recorded'
    emit('activity.recorded', {
      ...event,
      metrics: {
        total: totalProcesados,
        today: procesadosHoy,
        timestamp: Date.now()
      }
    });

    // 6. Retornar resumen (opcional)
    return {
      recorded: true,
      total: totalProcesados,
      today: procesadosHoy
    };
  }
};
