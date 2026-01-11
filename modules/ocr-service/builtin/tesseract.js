/**
 * Tesseract Builtin Engine - Wrapper para servicio centralizado
 *
 * Este archivo actúa como adaptador entre el sistema de engines del módulo
 * ocr-service y el servicio centralizado en services/providers/local/tesseract
 */

const tesseractService = require('../../../../services/providers/local/tesseract');

module.exports = {
  name: 'tesseract',
  version: '2.0.0',
  description: 'Motor OCR local usando Tesseract.js (servicio centralizado)',

  // Capabilities del engine
  capabilities: ['image'],
  supportedFormats: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'],
  maxFileSize: 10 * 1024 * 1024, // 10MB

  // Es local (no requiere credenciales)
  local: true,
  priority: 10, // Baja prioridad (usar solo si no hay APIs mejores)

  // Idiomas soportados
  languages: ['eng', 'spa', 'fra', 'deu', 'ita', 'por', 'chi_sim', 'jpn', 'kor'],

  /**
   * Extrae texto de una imagen
   * @param {Object} options - Opciones de extracción
   * @param {string} options.image - Imagen en base64 o path
   * @param {string} options.language - Código de idioma (default: eng)
   * @returns {Promise<Object>} Resultado de la extracción
   */
  async extract({ image, language = 'eng' }) {
    const result = await tesseractService.extract({
      image,
      language
    });

    if (!result.success) {
      return {
        success: false,
        error: result.error,
        engine: 'tesseract'
      };
    }

    return {
      success: true,
      text: result.text,
      confidence: result.confidence,
      words: result.words,
      lines: result.lines,
      engine: 'tesseract',
      metadata: {
        language,
        local: true
      }
    };
  },

  /**
   * Verifica si el engine está disponible
   */
  async isAvailable() {
    try {
      // Verificar que tesseract.js esté instalado
      require('tesseract.js');
      return true;
    } catch (e) {
      return false;
    }
  },

  /**
   * Limpieza de recursos
   */
  async cleanup() {
    await tesseractService.cleanup();
  }
};
