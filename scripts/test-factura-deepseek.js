#!/usr/bin/env node
/**
 * Script de prueba: Extraer factura con DeepSeek
 *
 * Uso:
 *   node scripts/test-factura-deepseek.js /path/to/factura.png
 *   node scripts/test-factura-deepseek.js data/bots/facturas_noninapizzicas_bot/received/factura.jpg
 *
 * Requiere:
 *   - DEEPSEEK_API_KEY en .env o como variable de entorno
 */

const fs = require('fs');
const path = require('path');

// Cargar .env desde la raíz del proyecto (no desde donde se ejecuta)
const projectRoot = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(projectRoot, '.env') });
const https = require('https');

// ============================================================================
// CONFIGURACIÓN
// ============================================================================

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY_GLOBAL;

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

// ============================================================================
// FUNCIONES
// ============================================================================

/**
 * Convierte imagen a base64
 */
function imageToBase64(filePath) {
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.join(process.cwd(), filePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Archivo no encontrado: ${absolutePath}`);
  }

  const buffer = fs.readFileSync(absolutePath);
  const base64 = buffer.toString('base64');

  // Detectar tipo MIME
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp'
  };

  return {
    base64,
    mimeType: mimeTypes[ext] || 'image/png',
    size: Math.round(buffer.length / 1024)
  };
}

/**
 * Llama a DeepSeek API
 */
function callDeepSeek(imageBase64, mimeType) {
  return new Promise((resolve, reject) => {
    const requestBody = JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${imageBase64}`
              }
            },
            {
              type: 'text',
              text: PROMPT_FACTURA
            }
          ]
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

  console.log('🔍 Extrayendo datos de factura con DeepSeek');
  console.log('─'.repeat(50));

  try {
    // 1. Leer imagen
    console.log(`📄 Archivo: ${filePath}`);
    const { base64, mimeType, size } = imageToBase64(filePath);
    console.log(`   Tipo: ${mimeType}`);
    console.log(`   Tamaño: ${size} KB`);

    // 2. Enviar a DeepSeek
    console.log('');
    console.log('🚀 Enviando a DeepSeek...');
    const startTime = Date.now();

    const response = await callDeepSeek(base64, mimeType);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`   Tiempo: ${elapsed}s`);

    // 3. Extraer contenido
    const content = response.choices?.[0]?.message?.content || '';
    const usage = response.usage || {};

    console.log(`   Tokens: ${usage.prompt_tokens || '?'} entrada, ${usage.completion_tokens || '?'} salida`);

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

    console.log('');
    console.log('✅ Completado');

  } catch (error) {
    console.error('');
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
