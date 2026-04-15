/**
 * Message Sanitizer
 *
 * Intercepta y corrige respuestas del chat que tengan [object Object]
 * Convierte objetos serializados incorrectamente a texto legible
 */

const IngredientesFormatter = require('../modules/recetas/core/ingredientes-formatter');

class MessageSanitizer {
  /**
   * Limpia un mensaje de respuesta del chat
   * @param {string} content - Contenido del mensaje
   * @returns {string} Contenido limpiado
   */
  static sanitizeMessage(content) {
    if (!content || typeof content !== 'string') {
      return content;
    }

    // Detectar si hay [object Object]
    if (!content.includes('[object Object]')) {
      return content;
    }

    // PATRÓN 1: "[object Object],[object Object],..." en lista
    // Ejemplo: "Ingredientes: [object Object],[object Object],[object Object]"
    const patternList = /(\w+:\s*)\[object Object\](,\[object Object\])*/gi;

    if (patternList.test(content)) {
      // Reemplazar con placeholder que luego procesaremos
      content = content.replace(patternList, '$1[INGREDIENTES_NO_FORMATEADOS]');
    }

    // PATRÓN 2: "[object Object]" aislado
    content = content.replace(/\[object Object\]/g, '[Datos no formateados correctamente]');

    return content;
  }

  /**
   * Detecta si un mensaje probablemente debería contener ingredientes formateados
   * @param {string} content - Contenido del mensaje
   * @returns {boolean}
   */
  static shouldContainFormattedIngredients(content) {
    if (!content) return false;

    const keywords = [
      'ingredientes',
      'receta',
      'salsa',
      'pan',
      'postre',
      'preparación',
      'coste',
      'precio',
      'escandallo'
    ];

    const lowerContent = content.toLowerCase();
    return keywords.some(keyword => lowerContent.includes(keyword));
  }

  /**
   * Intenta reparar mensajes que mencionan ingredientes pero tienen [object Object]
   * @param {string} content - Contenido del mensaje
   * @returns {string} Contenido reparado
   */
  static attemptRepair(content) {
    if (!content || !content.includes('[object Object]')) {
      return content;
    }

    // Si el mensaje menciona recetas o ingredientes pero tiene [object Object],
    // es probable que haya un problema de serialización
    if (this.shouldContainFormattedIngredients(content)) {
      // Indicar al usuario que hay un problema
      const warning = '\n\n⚠️ **Nota**: Parece que hubo un problema al formatear los ingredientes. ';
      const suggestion = 'Por favor, intenta reformular tu pregunta o contacta con soporte.';

      // Reemplazar [object Object] con el mensaje informativo
      content = content.replace(
        /\[object Object\](,\[object Object\])*/g,
        '[datos de ingredientes no disponibles]'
      );

      if (!content.includes('⚠️')) {
        content += warning + suggestion;
      }
    }

    return content;
  }

  /**
   * Sanifica el contenido completo de un mensaje de chat
   * @param {Object} message - Objeto mensaje { content, role, ... }
   * @returns {Object} Mensaje sanificado
   */
  static sanitizeMessage Complete(message) {
    if (!message || typeof message !== 'object') {
      return message;
    }

    // Crear copia para no mutar original
    const sanitized = { ...message };

    if (sanitized.content && typeof sanitized.content === 'string') {
      // Primer paso: limpiar [object Object]
      sanitized.content = this.sanitizeMessage(sanitized.content);

      // Segundo paso: intentar reparar
      sanitized.content = this.attemptRepair(sanitized.content);

      // Marcar que fue sanificado si había problemas
      if (sanitized.content.includes('[Datos no formateados')) {
        sanitized._sanitized = true;
        sanitized._sanitized_at = new Date().toISOString();
      }
    }

    return sanitized;
  }

  /**
   * Sanifica un array de mensajes
   * @param {Array} messages - Array de mensajes
   * @returns {Array} Mensajes sanificados
   */
  static sanitizeMessages(messages) {
    if (!Array.isArray(messages)) {
      return messages;
    }

    return messages.map(msg => this.sanitizeMessageComplete(msg));
  }

  /**
   * Detecta problemas de serialización en la estructura del mensaje
   * @param {Object} message - Objeto mensaje
   * @returns {Array} Array de problemas encontrados
   */
  static diagnoseSerializationIssues(message) {
    const issues = [];

    if (!message || !message.content) {
      return issues;
    }

    // Detectar [object Object]
    if (message.content.includes('[object Object]')) {
      issues.push({
        type: 'OBJECT_SERIALIZATION',
        severity: 'high',
        message: 'Objetos serializados incorrectamente a "[object Object]"',
        location: 'message.content'
      });
    }

    // Detectar JSON inválido que empiece con [object
    if (message.content.includes('[object ')) {
      issues.push({
        type: 'INVALID_SERIALIZATION',
        severity: 'medium',
        message: 'Posible serialización inválida detectada',
        location: 'message.content'
      });
    }

    return issues;
  }

  /**
   * Reporta problemas encontrados en un mensaje
   * @param {Object} logger - Logger del sistema
   * @param {Object} message - Objeto mensaje
   */
  static reportIssues(logger, message) {
    if (!logger) return;

    const issues = this.diagnoseSerializationIssues(message);
    if (issues.length === 0) return;

    logger.warn('message-sanitizer.serialization-issues', {
      issues,
      content_preview: message.content?.substring(0, 100) || ''
    });
  }
}

module.exports = MessageSanitizer;
