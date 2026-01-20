/**
 * Handler de Ejemplo
 *
 * Este archivo muestra la estructura de un handler.
 * Renombrar y modificar según necesidad.
 *
 * Ubicación determina credenciales:
 * - handlers/*.js → Usa credenciales GLOBAL
 * - data/projects/X/handlers/*.js → Usa credenciales PROJECT_X (fallback GLOBAL)
 */

module.exports = {
  // Nombre único del handler
  name: 'ejemplo-handler',

  // Descripción (opcional, para documentación)
  description: 'Handler de ejemplo - no hace nada real',

  // Evento que dispara este handler
  trigger: 'ejemplo.evento',

  // Habilitado (opcional, default: true)
  enabled: false,  // ← Deshabilitado por ser ejemplo

  // Filtro opcional - solo ejecuta si retorna true
  filter: (event) => {
    // Ejemplo: solo procesar si tiene cierto campo
    return event.tipo === 'importante';
  },

  /**
   * Lógica del handler
   *
   * @param {Object} event - Datos del evento
   * @param {Object} context - Contexto de ejecución
   * @param {Object} context.services - Executor de servicios
   * @param {Object} context.logger - Logger
   * @param {string|null} context.projectId - ID del proyecto (null si global)
   */
  async handle(event, { services, logger, projectId }) {
    logger.info('Procesando evento', { event, projectId });

    // Llamar a un servicio
    // services.call inyecta project_id automáticamente
    const resultado = await services.call('local.google-vision', 'extract', {
      image: event.imagePath
    });

    // Llamar a otro servicio
    await services.call('fs', 'write', {
      path: `./data/resultado-${Date.now()}.json`,
      content: JSON.stringify(resultado.data, null, 2)
    });

    // Retornar resultado (opcional)
    return { procesado: true, texto: resultado.data.text };
  }
};
