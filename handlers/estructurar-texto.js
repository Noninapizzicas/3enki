/**
 * Handler Base: Estructurar texto con LLM
 *
 * Recibe texto (de OCR u otra fuente) y lo estructura en JSON
 * usando un proveedor LLM configurable.
 *
 * Soporta múltiples tipos de documento con esquemas predefinidos.
 * El proveedor LLM se configura via config del proyecto o env vars.
 *
 * ENTRADA (evento): texto.estructurar.request
 * {
 *   texto: string,         // Texto a estructurar
 *   tipo: string,          // Tipo: 'factura', 'ticket', 'documento'
 *   campos: object,        // Campos custom (opcional, usa schema por tipo)
 *   filePath: string,      // Ruta original (propagación)
 *   requestId: string,
 *   notificar: object,
 *   _pipeline: string
 * }
 *
 * SALIDA (evento): texto.estructurado
 * {
 *   datos: object,         // Datos estructurados extraídos
 *   tipo: string,
 *   filePath: string,
 *   requestId: string,
 *   notificar: object,
 *   _pipeline: string,
 *   _meta: object
 * }
 *
 * ERROR (evento): texto.estructurar.error
 *
 * Nota: Usa HTTP directo al LLM. Futuro: migrar a services.call via ai-gateway.
 *
 * @version 3.0.0
 */

const https = require('https');
const { EVENTS } = require('../lib/handler-utils');

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

// Configuración de proveedores LLM soportados
const LLM_PROVIDERS = {
  deepseek: {
    hostname: 'api.deepseek.com',
    path: '/chat/completions',
    model: 'deepseek-chat',
    envKey: 'DEEPSEEK_API_KEY',
    costPerInputToken: 0.00000014,
    costPerOutputToken: 0.00000028
  },
  openai: {
    hostname: 'api.openai.com',
    path: '/v1/chat/completions',
    model: 'gpt-4o-mini',
    envKey: 'OPENAI_API_KEY',
    costPerInputToken: 0.00000015,
    costPerOutputToken: 0.0000006
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
 * Llama a un proveedor LLM compatible con OpenAI API
 */
function callLLM(prompt, apiKey, providerConfig) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: providerConfig.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 4000
    });

    const options = {
      hostname: providerConfig.hostname,
      port: 443,
      path: providerConfig.path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body)
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
          reject(new Error(`Parse error: ${data.substring(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.write(body);
    req.end();
  });
}

/**
 * Intenta extraer JSON de una respuesta LLM
 */
function parseJSON(content) {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) { /* ignorar */ }
  return null;
}

module.exports = {
  name: 'estructurar-texto',
  description: 'Estructura texto en JSON usando LLM configurable',
  trigger: EVENTS.TEXTO_ESTRUCTURAR,

  async handle(event, { logger, emit, config }) {
    const data = event.data || event;
    const {
      texto, tipo = 'factura', campos,
      filePath, requestId, notificar, _pipeline
    } = data;

    logger.info('estructurar-texto.inicio', {
      tipo, caracteres: texto?.length, requestId
    });

    try {
      if (!texto || texto.trim().length === 0) {
        throw new Error('texto es requerido y no puede estar vacío');
      }

      // Resolver proveedor LLM (configurable por proyecto)
      const llmProvider = config?.llm?.provider || 'deepseek';
      const providerConfig = LLM_PROVIDERS[llmProvider];

      if (!providerConfig) {
        throw new Error(`Proveedor LLM no soportado: ${llmProvider}`);
      }

      // Resolver API key (config > env)
      const apiKey = config?.llm?.apiKey
        || process.env[providerConfig.envKey]
        || process.env[`${providerConfig.envKey}_GLOBAL`];

      if (!apiKey) {
        throw new Error(`${providerConfig.envKey} no configurada`);
      }

      // Generar prompt y llamar al LLM
      const prompt = generarPrompt(texto, tipo, campos);
      const startTime = Date.now();

      logger.info('estructurar-texto.llamando-api', {
        tipo, provider: llmProvider
      });

      const response = await callLLM(prompt, apiKey, providerConfig);
      const elapsed = Date.now() - startTime;

      const content = response.choices?.[0]?.message?.content || '';
      const usage = response.usage || {};
      const datos = parseJSON(content);

      if (!datos) {
        throw new Error('No se pudo parsear la respuesta como JSON');
      }

      // Calcular costo
      const costInput = (usage.prompt_tokens || 0) * providerConfig.costPerInputToken;
      const costOutput = (usage.completion_tokens || 0) * providerConfig.costPerOutputToken;
      const costoTotal = costInput + costOutput;

      logger.info('estructurar-texto.completado', {
        tipo, tiempoMs: elapsed,
        tokens: usage.total_tokens,
        costo: costoTotal.toFixed(6),
        provider: llmProvider,
        requestId
      });

      emit(EVENTS.TEXTO_ESTRUCTURADO, {
        datos, tipo, filePath,
        requestId, notificar, _pipeline,
        _meta: {
          tiempoMs: elapsed,
          tokens: usage.total_tokens,
          costo: costoTotal,
          backend: llmProvider
        }
      });

      return { success: true, datos };

    } catch (error) {
      logger.error('estructurar-texto.error', {
        error: error.message, tipo, requestId
      });

      emit(EVENTS.TEXTO_ESTRUCTURAR_ERROR, {
        error: error.message, tipo,
        filePath, requestId
      });

      return { success: false, error: error.message };
    }
  }
};
