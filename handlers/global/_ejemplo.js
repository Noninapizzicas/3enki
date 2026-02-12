/**
 * Handler de Ejemplo (Acción)
 *
 * Un handler es una ACCIÓN independiente: cuando pase X, haz Y.
 * No pertenece a ningún módulo. El módulo dice, el handler hace.
 *
 * Estructura centralizada:
 * - handlers/global/*.js          → Acciones del sistema (credenciales GLOBAL)
 * - handlers/projects/X/*.js      → Acciones del proyecto X (credenciales PROJECT_X)
 *
 * El HandlerLoader descubre, inyecta contexto y suscribe automáticamente.
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
