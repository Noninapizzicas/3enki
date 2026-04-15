/**
 * Message Sanitizer - Versión Mejorada
 *
 * Intercepta y corrige respuestas del chat que tengan [object Object]
 * IMPORTANTE: Solución temporal que trata el SÍNTOMA, no la CAUSA
 *
 * La causa real está en escandallo y viabilidad que retornan objetos
 * sin formatearlos antes de pasarlos al AI.
 */

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

    // Reemplazar [object Object] con descripción útil
    content = content.replace(/\[object Object\]/g, '[datos no formateados]');

    return content;
  }

  /**
   * Detecta problemas de serialización en el contenido
   * @param {string} content - Contenido a analizar
   * @returns {Object} { hasIssues: boolean, type: string, count: number }
   */
  static diagnoseSerializationIssues(content) {
    if (!content || typeof content !== 'string') {
      return { hasIssues: false, type: null, count: 0 };
    }

    const count = (content.match(/\[object Object\]/g) || []).length;

    return {
      hasIssues: count > 0,
      type: count > 0 ? 'object_object_detected' : null,
      count
    };
  }

  /**
   * Sanifica un mensaje completo de chat
   * @param {Object} message - { content: string, role: string, ... }
   * @returns {Object} Mensaje sanificado
   */
  static sanitizeCompleteMessage(message) {
    if (!message || typeof message !== 'object') {
      return message;
    }

    const sanitized = { ...message };

    if (sanitized.content && typeof sanitized.content === 'string') {
      const original = sanitized.content;
      sanitized.content = this.sanitizeMessage(sanitized.content);

      // Marcar si fue modificado
      if (sanitized.content !== original) {
        sanitized._was_sanitized = true;
        sanitized._sanitization_timestamp = new Date().toISOString();
      }
    }

    return sanitized;
  }

  /**
   * Reporta problemas encontrados (para logging)
   * @param {string} content - Contenido a analizar
   * @returns {Object} Información de diagnóstico
   */
  static reportProblems(content) {
    const issues = this.diagnoseSerializationIssues(content);

    if (!issues.hasIssues) {
      return null;
    }

    return {
      severity: issues.count > 3 ? 'high' : 'medium',
      type: 'serialization_issue',
      objectCount: issues.count,
      message: `Detectados ${issues.count} objeto(s) serializados incorrectamente en el contenido`,
      recommendation: 'Ver logs de escandallo y viabilidad para identificar la fuente'
    };
  }
}

module.exports = MessageSanitizer;
