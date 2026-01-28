#!/usr/bin/env node
/**
 * Script de prueba: Extraer factura con Tesseract OCR + DeepSeek
 *
 * Flujo: Imagen → Tesseract (OCR gratis) → Texto → DeepSeek → JSON
 *
 * Uso:
 *   node scripts/test-factura-deepseek.js /path/to/factura.png
 *   node scripts/test-factura-deepseek.js data/bots/facturas_noninapizzicas_bot/received/factura.jpg
 *
 * Requiere:
 *   - DEEPSEEK_API_KEY en .env
 *   - tesseract.js (npm install tesseract.js)
 */

const fs = require('fs');
const path = require('path');

// Cargar .env desde la raíz del proyecto
const projectRoot = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(projectRoot, '.env') });
const https = require('https');

// ============================================================================
// CONFIGURACIÓN
// ============================================================================

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY_GLOBAL;

const PROMPT_FACTURA = `Analiza el siguiente texto extraído de una factura mediante OCR y extrae los datos estructurados en formato JSON.

TEXTO DE LA FACTURA:
---
{{TEXTO_OCR}}
---

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

// ============================================================================
// FUNCIONES
// ============================================================================

/**
 * Extrae texto de imagen usando Tesseract OCR
 */
async function extractTextWithOCR(filePath) {
  let Tesseract;
  try {
    Tesseract = require('tesseract.js');
  } catch (e) {
    throw new Error('tesseract.js no instalado. Ejecuta: npm install tesseract.js');
  }

  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.join(process.cwd(), filePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Archivo no encontrado: ${absolutePath}`);
  }

  // Crear worker con idioma español
  const worker = await Tesseract.createWorker('spa', 1, {
    logger: () => {} // Silenciar logs
  });

  try {
    const { data } = await worker.recognize(absolutePath);
    return {
      text: data.text.trim(),
      confidence: data.confidence
    };
  } finally {
    await worker.terminate();
  }
}

/**
 * Llama a DeepSeek API con texto
 */
function callDeepSeek(textoOCR) {
  return new Promise((resolve, reject) => {
    const prompt = PROMPT_FACTURA.replace('{{TEXTO_OCR}}', textoOCR);

    const requestBody = JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
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
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
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
      reject(new Error('Request timeout (120s)'));
    });

    req.write(requestBody);
    req.end();
  });
}

/**
 * Parsea JSON de la respuesta
 */
function parseFacturaJSON(content) {
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

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const filePath = process.argv[2];

  if (!filePath) {
    console.log('❌ Uso: node scripts/test-factura-deepseek.js <imagen>');
    console.log('');
    console.log('Flujo: Imagen → Tesseract (OCR) → DeepSeek → JSON');
    console.log('');
    console.log('Ejemplo:');
    console.log('  node scripts/test-factura-deepseek.js factura.png');
    console.log('  node scripts/test-factura-deepseek.js data/facturas/factura001.jpg');
    process.exit(1);
  }

  if (!DEEPSEEK_API_KEY) {
    console.log('❌ Error: DEEPSEEK_API_KEY no configurada');
    console.log('');
    console.log('Configura la API key en .env:');
    console.log('  DEEPSEEK_API_KEY=tu-api-key');
    process.exit(1);
  }

  console.log('🔍 Extrayendo datos de factura');
  console.log('   Flujo: Imagen → Tesseract (OCR) → DeepSeek → JSON');
  console.log('─'.repeat(50));

  try {
    // 1. OCR con Tesseract
    console.log(`📄 Archivo: ${filePath}`);
    console.log('');
    console.log('📝 Paso 1: Extrayendo texto con Tesseract OCR...');
    const ocrStart = Date.now();

    const { text: textoOCR, confidence } = await extractTextWithOCR(filePath);

    const ocrTime = ((Date.now() - ocrStart) / 1000).toFixed(1);
    console.log(`   Tiempo OCR: ${ocrTime}s`);
    console.log(`   Confianza: ${confidence.toFixed(1)}%`);
    console.log(`   Caracteres extraídos: ${textoOCR.length}`);

    if (textoOCR.length < 50) {
      console.log('');
      console.log('⚠️  Poco texto extraído. El OCR puede haber fallado.');
      console.log('   Texto extraído:');
      console.log(textoOCR || '(vacío)');
    }

    // 2. Enviar texto a DeepSeek
    console.log('');
    console.log('🤖 Paso 2: Estructurando con DeepSeek...');
    const deepseekStart = Date.now();

    const response = await callDeepSeek(textoOCR);

    const deepseekTime = ((Date.now() - deepseekStart) / 1000).toFixed(1);
    console.log(`   Tiempo DeepSeek: ${deepseekTime}s`);

    // 3. Extraer contenido
    const content = response.choices?.[0]?.message?.content || '';
    const usage = response.usage || {};

    console.log(`   Tokens: ${usage.prompt_tokens || '?'} entrada, ${usage.completion_tokens || '?'} salida`);

    // Calcular costo aproximado (DeepSeek es muy barato)
    const costInput = (usage.prompt_tokens || 0) * 0.00000014;  // $0.14/1M tokens
    const costOutput = (usage.completion_tokens || 0) * 0.00000028; // $0.28/1M tokens
    const totalCost = (costInput + costOutput).toFixed(6);
    console.log(`   Costo aprox: $${totalCost}`);

    // 4. Parsear JSON
    console.log('');
    console.log('📊 Resultado:');
    console.log('─'.repeat(50));

    const facturaData = parseFacturaJSON(content);

    if (facturaData) {
      console.log(JSON.stringify(facturaData, null, 2));

      // Guardar resultado
      const outputPath = filePath.replace(/\.[^.]+$/, '_datos.json');
      fs.writeFileSync(outputPath, JSON.stringify(facturaData, null, 2));
      console.log('');
      console.log(`💾 Guardado en: ${outputPath}`);
    } else {
      console.log('⚠️  No se pudo parsear JSON. Respuesta raw:');
      console.log(content);
    }

    // Resumen
    console.log('');
    console.log('─'.repeat(50));
    console.log('✅ Completado');
    console.log(`   Tiempo total: ${(parseFloat(ocrTime) + parseFloat(deepseekTime)).toFixed(1)}s`);
    console.log(`   Costo: $${totalCost} (casi gratis)`);

  } catch (error) {
    console.error('');
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
