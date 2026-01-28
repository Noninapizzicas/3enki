/**
 * Handler: Extraer datos de factura con DeepSeek
 *
 * Flujo simple: Imagen → Base64 → DeepSeek → JSON estructurado
 *
 * Uso via evento:
 *   eventBus.emit('factura.extraer.request', {
 *     filePath: '/path/to/factura.png'
 *   });
 *
 * Uso via HTTP:
 *   POST /api/handlers/extraer-factura-deepseek
 *   { "filePath": "/path/to/factura.png" }
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');

// Prompt optimizado para extracción de facturas
const PROMPT_FACTURA = `Analiza esta imagen de factura y extrae los datos en formato JSON.

Extrae estos campos (usa null si no encuentras el dato):

{
  "emisor": {
    "nombre": "nombre de la empresa que emite",
    "nif": "NIF/CIF del emisor",
    "direccion": "dirección completa"
  },
  "receptor": {
    "nombre": "nombre del cliente",
    "nif": "NIF/CIF del cliente"
  },
  "factura": {
    "numero": "número de factura",
    "fecha": "fecha emisión (YYYY-MM-DD)",
    "fecha_vencimiento": "fecha vencimiento (YYYY-MM-DD)"
  },
  "lineas": [
    {
      "descripcion": "descripción del producto/servicio",
      "cantidad": 1,
      "precio_unitario": 0.00,
      "importe": 0.00
    }
  ],
  "totales": {
    "base_imponible": 0.00,
    "iva_porcentaje": 21,
    "iva_importe": 0.00,
    "total": 0.00
  },
  "forma_pago": "transferencia/efectivo/tarjeta/etc",
  "observaciones": "notas adicionales"
}

IMPORTANTE: Responde SOLO con el JSON, sin explicaciones ni markdown.`;

module.exports = {
  name: 'extraer-factura-deepseek',
  description: 'Extrae datos estructurados de una factura usando DeepSeek Vision',

  // Evento que dispara este handler
  trigger: 'factura.extraer.request',

  // También exponer como API HTTP
  http: {
    method: 'POST',
    path: '/extraer-factura'
  },

  /**
   * Procesa la factura
   */
  async handle(event, { logger, emit, config }) {
    const data = event.data || event;
    const { filePath, base64, mimeType } = data;

    logger.info('extraer-factura.inicio', { filePath });

    try {
      // 1. Obtener imagen en base64
      let imageBase64 = base64;
      let imageType = mimeType || 'image/png';

      if (!imageBase64 && filePath) {
        // Leer archivo y convertir a base64
        const absolutePath = path.isAbsolute(filePath)
          ? filePath
          : path.join(process.cwd(), filePath);

        if (!fs.existsSync(absolutePath)) {
          throw new Error(`Archivo no encontrado: ${absolutePath}`);
        }

        const fileBuffer = fs.readFileSync(absolutePath);
        imageBase64 = fileBuffer.toString('base64');

        // Detectar tipo por extensión
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes = {
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.gif': 'image/gif',
          '.webp': 'image/webp'
        };
        imageType = mimeTypes[ext] || 'image/png';
      }

      if (!imageBase64) {
        throw new Error('Se requiere filePath o base64');
      }

      logger.info('extraer-factura.imagen-lista', {
        tipo: imageType,
        tamaño: Math.round(imageBase64.length / 1024) + 'KB'
      });

      // 2. Enviar a DeepSeek via ai-gateway
      const response = await new Promise((resolve, reject) => {
        const requestId = `factura-${Date.now()}`;

        // Listener para la respuesta
        const responseHandler = (res) => {
          if (res.request_id === requestId) {
            emit.off('ai-gateway.chat.response', responseHandler);
            if (res.success) {
              resolve(res.data);
            } else {
              reject(new Error(res.error || 'Error en ai-gateway'));
            }
          }
        };

        emit.on('ai-gateway.chat.response', responseHandler);

        // Timeout
        setTimeout(() => {
          emit.off('ai-gateway.chat.response', responseHandler);
          reject(new Error('Timeout esperando respuesta de DeepSeek'));
        }, 60000);

        // Enviar request
        emit('ai-gateway.chat.request', {
          request_id: requestId,
          provider: 'deepseek',
          messages: [
            {
              role: 'user',
              content: PROMPT_FACTURA,
              image_base64: imageBase64,
              image_type: imageType
            }
          ],
          options: {
            temperature: 0.1,  // Bajo para respuestas consistentes
            max_tokens: 4000
          }
        });
      });

      // 3. Parsear respuesta JSON
      let facturaData = null;
      const content = response.content || '';

      try {
        // Intentar extraer JSON de la respuesta
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          facturaData = JSON.parse(jsonMatch[0]);
        }
      } catch (parseError) {
        logger.warn('extraer-factura.parse-error', {
          error: parseError.message,
          content: content.substring(0, 200)
        });
      }

      // 4. Emitir resultado
      const resultado = {
        success: true,
        data: facturaData,
        raw: content,
        provider: 'deepseek',
        usage: response.usage,
        cost: response.cost
      };

      emit('factura.extraer.response', resultado);

      logger.info('extraer-factura.completado', {
        success: true,
        tieneData: !!facturaData,
        costo: response.cost
      });

      return resultado;

    } catch (error) {
      logger.error('extraer-factura.error', { error: error.message });

      const resultado = {
        success: false,
        error: error.message
      };

      emit('factura.extraer.response', resultado);
      return resultado;
    }
  }
};
