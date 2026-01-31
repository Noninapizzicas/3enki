/**
 * Handler: Estructurar texto con DeepSeek
 *
 * Recibe texto (de OCR u otra fuente) y lo estructura en JSON
 * usando DeepSeek como LLM.
 *
 * ENTRADA (evento): texto.estructurar.request
 * {
 *   texto: string,         // Texto a estructurar
 *   tipo: string,          // Tipo de documento: 'factura', 'ticket', 'documento'
 *   campos: object,        // Campos a extraer (opcional, usa defaults por tipo)
 *   filePath: string,      // Ruta original (para propagación)
 *   requestId: string      // ID para correlación
 * }
 *
 * SALIDA (evento): texto.estructurado
 * {
 *   datos: object,         // Datos estructurados extraídos
 *   tipo: string,          // Tipo de documento
 *   filePath: string,      // Ruta original
 *   requestId: string      // ID de correlación
 * }
 *
 * También escucha: documento.ocr.completado (para encadenamiento automático)
 *
 * ERROR (evento): texto.estructurar.error
 *
 * @version 1.0.0
 */

const https = require('https');

// Esquemas de campos por tipo de documento
const SCHEMAS = {
  factura: {
    emisor: {
      nombre: 'nombre de la empresa que emite',
      nif: 'NIF/CIF del emisor',
      direccion: 'dirección completa'
    },
    receptor: {
      nombre: 'nombre del cliente',
      nif: 'NIF/CIF del cliente'
    },
    factura: {
      numero: 'número de factura',
      fecha: 'fecha emisión (YYYY-MM-DD)',
      fecha_vencimiento: 'fecha vencimiento (YYYY-MM-DD)'
    },
    lineas: [{
      descripcion: 'descripción del producto/servicio',
      cantidad: 'número',
      precio_unitario: 'número',
      importe: 'número'
    }],
    totales: {
      base_imponible: 'número',
      iva_porcentaje: 'número',
      iva_importe: 'número',
      total: 'número'
    },
    forma_pago: 'transferencia/efectivo/tarjeta/etc',
    observaciones: 'notas adicionales'
  },
  ticket: {
    establecimiento: 'nombre del comercio',
    direccion: 'dirección',
    fecha: 'fecha (YYYY-MM-DD)',
    hora: 'hora (HH:MM)',
    lineas: [{
      descripcion: 'producto',
      cantidad: 'número',
      precio: 'número'
    }],
    total: 'número',
    forma_pago: 'efectivo/tarjeta'
  },
  documento: {
    titulo: 'título o asunto del documento',
    fecha: 'fecha si existe',
    contenido_resumido: 'resumen del contenido',
    entidades_mencionadas: ['lista de nombres, empresas, etc.'],
    datos_relevantes: {}
  }
};

/**
 * Genera prompt para extracción
 */
function generarPrompt(texto, tipo, camposCustom) {
  const campos = camposCustom || SCHEMAS[tipo] || SCHEMAS.documento;

  return `Analiza el siguiente texto extraído de un documento (${tipo}) mediante OCR y extrae los datos estructurados en formato JSON.

TEXTO DEL DOCUMENTO:
---
${texto}
---

Extrae estos campos (usa null si no encuentras el dato):

${JSON.stringify(campos, null, 2)}

IMPORTANTE:
- Responde SOLO con el JSON, sin explicaciones ni markdown
- Los números deben ser valores numéricos, no strings
- Las fechas en formato YYYY-MM-DD
- Si un campo no está presente, usa null`;
}

/**
 * Llama a DeepSeek API
 */
function callDeepSeek(prompt, apiKey) {
  return new Promise((resolve, reject) => {
    const requestBody = JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 4000
    });

    const options = {
      hostname: 'api.deepseek.com',
      port: 443,
      path: '/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(requestBody)
      },
      timeout: 120000
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(`API Error ${res.statusCode}: ${parsed.error?.message || data}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error(`Parse error: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.write(requestBody);
    req.end();
  });
}

/**
 * Parsea JSON de la respuesta
 */
function parseJSON(content) {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    // Ignorar errores de parseo
  }
  return null;
}

module.exports = {
  name: 'estructurar-deepseek',
  description: 'Estructura texto en JSON usando DeepSeek',
  trigger: 'texto.estructurar.request',

  async handle(event, { logger, emit, config }) {
    const data = event.data || event;
    const {
      texto,
      tipo = 'factura',
      campos,
      filePath,
      requestId,
      notificar
    } = data;

    logger.info('estructurar-deepseek.inicio', {
      tipo,
      caracteres: texto?.length,
      requestId
    });

    try {
      // Validar input
      if (!texto || texto.trim().length === 0) {
        throw new Error('texto es requerido y no puede estar vacío');
      }

      // Obtener API key
      const apiKey = process.env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY_GLOBAL;
      if (!apiKey) {
        throw new Error('DEEPSEEK_API_KEY no configurada');
      }

      // Generar prompt
      const prompt = generarPrompt(texto, tipo, campos);

      // Llamar a DeepSeek
      logger.info('estructurar-deepseek.llamando-api', { tipo });
      const startTime = Date.now();

      const response = await callDeepSeek(prompt, apiKey);

      const elapsed = Date.now() - startTime;
      const content = response.choices?.[0]?.message?.content || '';
      const usage = response.usage || {};

      // Parsear resultado
      const datos = parseJSON(content);

      if (!datos) {
        throw new Error('No se pudo parsear la respuesta como JSON');
      }

      // Calcular costo aproximado
      const costInput = (usage.prompt_tokens || 0) * 0.00000014;
      const costOutput = (usage.completion_tokens || 0) * 0.00000028;
      const costoTotal = costInput + costOutput;

      logger.info('estructurar-deepseek.completado', {
        tipo,
        tiempoMs: elapsed,
        tokens: usage.total_tokens,
        costo: costoTotal.toFixed(6),
        requestId
      });

      // Emitir resultado
      emit('texto.estructurado', {
        datos,
        tipo,
        filePath,
        requestId,
        notificar, // Propagar datos de notificación
        _meta: {
          tiempoMs: elapsed,
          tokens: usage.total_tokens,
          costo: costoTotal,
          backend: 'deepseek'
        }
      });

      return { success: true, datos };

    } catch (error) {
      logger.error('estructurar-deepseek.error', {
        error: error.message,
        tipo,
        requestId
      });

      emit('texto.estructurar.error', {
        error: error.message,
        tipo,
        filePath,
        requestId
      });

      return { success: false, error: error.message };
    }
  }
};
