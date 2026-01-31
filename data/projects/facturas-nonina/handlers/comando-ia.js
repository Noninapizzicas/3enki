/**
 * Handler Proyecto: /ia
 *
 * Paso manual 3: Estructura el ultimo resultado OCR usando IA (DeepSeek/OpenAI).
 * Lee de storage/ocr/, guarda en storage/ia/.
 *
 * Usa llamada HTTP directa al LLM para feedback inmediato.
 *
 * Flujo: /listar → /ocr → [/ia] → /validar → /guardar
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { EVENTS, resolveStoragePath } = require('../../../../lib/handler-utils');

// Proveedores LLM (misma config que estructurar-texto.js)
const LLM_PROVIDERS = {
  deepseek: {
    hostname: 'api.deepseek.com',
    path: '/chat/completions',
    model: 'deepseek-chat',
    envKey: 'DEEPSEEK_API_KEY'
  },
  openai: {
    hostname: 'api.openai.com',
    path: '/v1/chat/completions',
    model: 'gpt-4o-mini',
    envKey: 'OPENAI_API_KEY'
  }
};

const SCHEMA_FACTURA = {
  emisor: { nombre: 'empresa que emite', nif: 'NIF/CIF', direccion: 'direccion' },
  receptor: { nombre: 'cliente', nif: 'NIF/CIF' },
  factura: { numero: 'numero factura', fecha: 'YYYY-MM-DD', fecha_vencimiento: 'YYYY-MM-DD' },
  lineas: [{ descripcion: 'producto/servicio', cantidad: 'numero', precio_unitario: 'numero', importe: 'numero' }],
  totales: { base_imponible: 'numero', iva_porcentaje: 'numero', iva_importe: 'numero', total: 'numero' },
  forma_pago: 'transferencia/efectivo/tarjeta',
  observaciones: 'notas'
};

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
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          if (res.statusCode >= 400) {
            reject(new Error(`API ${res.statusCode}: ${parsed.error?.message || responseData.substring(0, 200)}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error(`Parse error: ${responseData.substring(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout LLM (120s)')); });
    req.write(body);
    req.end();
  });
}

module.exports = {
  name: 'comando-ia',
  description: 'Estructura texto OCR con IA (paso manual)',
  trigger: EVENTS.BOT_COMMAND,

  filter: (event) => {
    const data = event.data || event;
    return data.command === 'ia';
  },

  async handle(event, { logger, emit, config, projectId }) {
    const data = event.data || event;
    const chatId = data.chatId;
    const cfg = config.config || {};
    const botName = cfg.telegram?.botName || data.botName;

    logger.info('comando-ia.ejecutando', { chatId, projectId });

    // 1. Leer ultimo resultado OCR
    const ocrDir = resolveStoragePath({
      config: cfg, projectId, subdir: 'ocr'
    });

    let ocrFiles;
    try {
      ocrFiles = fs.readdirSync(ocrDir)
        .filter(f => f.endsWith('.json'))
        .sort()
        .reverse();
    } catch (e) {
      ocrFiles = [];
    }

    if (ocrFiles.length === 0) {
      emit(EVENTS.TELEGRAM_SEND_MESSAGE, {
        botName, chatId,
        text: 'No hay resultados OCR. Ejecuta /ocr primero.'
      });
      return { success: false, error: 'Sin OCR' };
    }

    const ocrData = JSON.parse(
      fs.readFileSync(path.join(ocrDir, ocrFiles[0]), 'utf-8')
    );

    if (!ocrData.texto || ocrData.texto.trim().length === 0) {
      emit(EVENTS.TELEGRAM_SEND_MESSAGE, {
        botName, chatId,
        text: `OCR de ${ocrData.fileName} no extrajo texto. Prueba con otra imagen.`
      });
      return { success: false, error: 'Texto vacio' };
    }

    // 2. Resolver proveedor LLM
    const provider = cfg.llm?.provider || 'deepseek';
    const providerConfig = LLM_PROVIDERS[provider];

    if (!providerConfig) {
      emit(EVENTS.TELEGRAM_SEND_MESSAGE, {
        botName, chatId,
        text: `Proveedor LLM no soportado: ${provider}`
      });
      return { success: false, error: 'Proveedor no soportado' };
    }

    const apiKey = cfg.llm?.apiKey
      || process.env[providerConfig.envKey]
      || process.env[`${providerConfig.envKey}_GLOBAL`];

    if (!apiKey) {
      emit(EVENTS.TELEGRAM_SEND_MESSAGE, {
        botName, chatId,
        text: `Falta ${providerConfig.envKey} en .env`
      });
      return { success: false, error: 'Sin API key' };
    }

    emit(EVENTS.TELEGRAM_SEND_MESSAGE, {
      botName, chatId,
      text: `Estructurando con IA (${provider}): ${ocrData.fileName}...`
    });

    // 3. Llamar al LLM
    try {
      const prompt = [
        'Analiza este texto extraido de una factura mediante OCR y extrae los datos en JSON.',
        '',
        'TEXTO:',
        '---',
        ocrData.texto,
        '---',
        '',
        'Extrae estos campos (usa null si no encuentras el dato):',
        JSON.stringify(SCHEMA_FACTURA, null, 2),
        '',
        'IMPORTANTE:',
        '- Responde SOLO con el JSON, sin explicaciones ni markdown',
        '- Los numeros deben ser valores numericos, no strings',
        '- Las fechas en formato YYYY-MM-DD',
        '- Si un campo no esta presente, usa null'
      ].join('\n');

      const startTime = Date.now();
      const response = await callLLM(prompt, apiKey, providerConfig);
      const elapsed = Date.now() - startTime;

      const content = response.choices?.[0]?.message?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const datos = jsonMatch ? JSON.parse(jsonMatch[0]) : null;

      if (!datos) {
        throw new Error('LLM no devolvio JSON valido');
      }

      const tokens = response.usage?.total_tokens || 0;

      // 4. Guardar resultado para /validar
      const iaDir = resolveStoragePath({
        config: cfg, projectId, subdir: 'ia'
      });
      const resultPath = path.join(iaDir, `${ocrData.requestId}.json`);
      const resultData = {
        requestId: ocrData.requestId,
        filePath: ocrData.filePath,
        fileName: ocrData.fileName,
        datos,
        tokens,
        tiempoMs: elapsed,
        provider,
        timestamp: new Date().toISOString()
      };
      fs.writeFileSync(resultPath, JSON.stringify(resultData, null, 2));

      // 5. Resumen para el usuario
      const resumen = [
        `IA completada: ${ocrData.fileName}`,
        `Tiempo: ${(elapsed / 1000).toFixed(1)}s | Tokens: ${tokens}`,
        '',
        `Emisor: ${datos.emisor?.nombre || '?'}`,
        `NIF: ${datos.emisor?.nif || '?'}`,
        `N. factura: ${datos.factura?.numero || '?'}`,
        `Fecha: ${datos.factura?.fecha || '?'}`,
        `Base: ${datos.totales?.base_imponible ?? '?'}`,
        `IVA: ${datos.totales?.iva_porcentaje ?? '?'}% (${datos.totales?.iva_importe ?? '?'})`,
        `Total: ${datos.totales?.total ?? '?'}`,
        '',
        `Guardado: ${path.basename(resultPath)}`,
        'Siguiente paso: /validar'
      ];

      emit(EVENTS.TELEGRAM_SEND_MESSAGE, {
        botName, chatId,
        text: resumen.join('\n')
      });

      logger.info('comando-ia.completado', {
        fileName: ocrData.fileName, tokens, elapsed, requestId: ocrData.requestId
      });

      return { success: true, datos, tokens };

    } catch (error) {
      logger.error('comando-ia.error', { error: error.message });
      emit(EVENTS.TELEGRAM_SEND_MESSAGE, {
        botName, chatId,
        text: `Error IA: ${error.message}`
      });
      return { success: false, error: error.message };
    }
  }
};
