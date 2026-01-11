#!/usr/bin/env node

/**
 * Generate Architect Knowledge
 *
 * Genera el conocimiento del sistema desde los module.json
 * para ser usado por el Agente Arquitecto.
 *
 * Uso: node scripts/generate-architect-knowledge.js
 * Output: modules/ai-agent-framework/prompts/architect-knowledge.md
 */

const fs = require('fs');
const path = require('path');

const MODULES_PATH = path.join(__dirname, '..', 'modules');
const OUTPUT_DIR = path.join(__dirname, '..', 'modules', 'ai-agent-framework', 'prompts');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'architect-knowledge.md');

// Módulos relevantes para integración con agentes
const RELEVANT_MODULES = [
  'telegram-service',
  'ai-gateway',
  'prompt-manager',
  'database-manager',
  'credential-manager',
  'filesystem',
  'conversation-manager'
];

// Providers de OCR (no son módulos, son services)
// OCR local: services/providers/local/tesseract
// OCR remoto: google.vision, anthropic.vision

function generateKnowledge() {
  console.log('🔍 Scanning modules...\n');

  let content = `# Conocimiento del Sistema Event-Core

> Auto-generado: ${new Date().toISOString()}
> Módulos escaneados: ${RELEVANT_MODULES.length}

---

## Instrucciones para el Arquitecto

Eres el Agente Arquitecto. Tu función es crear otros agentes que integren
los módulos del sistema. Usa las tools \`create_prompt\` y \`create_agent\`
para crear agentes funcionales.

### Tools Disponibles

| Tool | Descripción |
|------|-------------|
| \`create_prompt\` | Crea un prompt en prompt-manager |
| \`create_agent\` | Crea un agente en ai-agent-framework |
| \`list_agents\` | Lista agentes existentes |
| \`http_request\` | Llama APIs de módulos |

---

## Módulos del Sistema

`;

  let modulesFound = 0;

  for (const moduleName of RELEVANT_MODULES) {
    const manifestPath = path.join(MODULES_PATH, moduleName, 'module.json');

    if (!fs.existsSync(manifestPath)) {
      console.log(`  ⚠️  ${moduleName}: module.json no encontrado`);
      continue;
    }

    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      modulesFound++;

      console.log(`  ✅ ${moduleName} v${manifest.version}`);

      content += `### ${manifest.name} (v${manifest.version})\n\n`;
      content += `${manifest.description || 'Sin descripción'}\n\n`;

      // APIs
      if (manifest.apis && manifest.apis.length > 0) {
        content += `**APIs HTTP:**\n`;
        content += `| Método | Path | Descripción |\n`;
        content += `|--------|------|-------------|\n`;

        for (const api of manifest.apis) {
          const fullPath = `/modules/${manifest.name}${api.path}`;
          const desc = api.description || api.handler || '-';
          content += `| ${api.method} | \`${fullPath}\` | ${desc} |\n`;
        }
        content += `\n`;
      }

      // Eventos publicados
      let publishes = manifest.provides?.events || manifest.events?.publishes || [];
      // Normalizar: puede ser array de strings o array de objetos {event: "..."}
      publishes = publishes.map(e => typeof e === 'string' ? e : e.event || e.topic).filter(Boolean);
      if (publishes.length > 0) {
        content += `**Eventos emitidos:** \`${publishes.join('`, `')}\`\n\n`;
      }

      // Eventos suscritos
      let subscribes = manifest.events?.subscribes || manifest.subscribes || [];
      // Normalizar: puede ser array de strings o array de objetos {event: "..."}
      subscribes = subscribes.map(e => typeof e === 'string' ? e : e.event || e.topic).filter(Boolean);
      if (subscribes.length > 0) {
        content += `**Eventos escuchados:** \`${subscribes.join('`, `')}\`\n\n`;
      }

      // Tools
      if (manifest.tools && manifest.tools.length > 0) {
        content += `**Tools para AI:**\n`;
        for (const tool of manifest.tools) {
          content += `- \`${tool.name}\`: ${tool.description || '-'}\n`;
        }
        content += `\n`;
      }

      content += `---\n\n`;

    } catch (error) {
      console.log(`  ❌ ${moduleName}: Error parseando - ${error.message}`);
    }
  }

  // Patrones de integración
  content += `## Patrones de Integración

### Patrón 1: Telegram → OCR → Respuesta

Procesar imagen recibida por Telegram con OCR y responder.

\`\`\`
subscribes: ["telegram.photo.received"]
tools: ["http_request"]

Flujo:
1. Recibir evento telegram.photo.received
   → { botName, chatId, fileId, caption }

2. Descargar archivo:
   GET /modules/telegram-service/file/{fileId}?download=true
   → { base64: "..." }

3. Procesar con OCR (local):
   tesseractService.extract({ image: base64, language: 'spa' })
   → { success, text, confidence }

4. Responder al usuario:
   POST /modules/telegram-service/send
   Body: { botName, chatId, text: "Texto extraído: ..." }
\`\`\`

### Patrón 2: Telegram → AI → Respuesta

Procesar mensaje de texto con AI y responder.

\`\`\`
subscribes: ["telegram.text.received"]
tools: ["http_request"]

Flujo:
1. Recibir evento telegram.text.received
   → { botName, chatId, text, from }

2. Procesar con AI Gateway:
   POST /modules/ai-gateway/chat
   Body: { messages: [{role: "user", content: text}], provider: "deepseek" }
   → { content: "respuesta..." }

3. Responder al usuario:
   POST /modules/telegram-service/send
   Body: { botName, chatId, text: respuesta }
\`\`\`

### Patrón 3: Comando → Acción

Responder a comandos específicos de Telegram.

\`\`\`
subscribes: ["telegram.command.received"]
tools: ["http_request", "publish_event"]

Flujo:
1. Recibir evento telegram.command.received
   → { botName, chatId, command, args }

2. Según comando:
   /status → Consultar estado del sistema
   /help → Enviar ayuda
   /ocr → Activar modo OCR

3. Responder o publicar evento
\`\`\`

---

## Configuración por Defecto

Cuando crees un agente, usa estos valores por defecto:

| Parámetro | Valor | Razón |
|-----------|-------|-------|
| provider | \`deepseek\` | Más económico |
| model | \`deepseek-chat\` | Buen balance |
| temperature | \`0.3\` | Determinista |
| tools | \`["http_request"]\` | Mínimo necesario |
| enabled | \`true\` | Activo inmediatamente |

---

## Ejemplo de Creación de Agente

Cuando el usuario pida: "Crea un agente que procese fotos de Telegram con OCR"

### Paso 1: Crear el Prompt

\`\`\`
[TOOL:create_prompt]({
  "name": "media-processor-system",
  "content": "Eres un agente de procesamiento de medios.\\n\\nCuando recibes una imagen de Telegram:\\n1. Descarga el archivo usando GET /modules/telegram-service/file/{fileId}?download=true\\n2. Usa OCR local: tesseractService.extract({ image: base64, language: 'spa' })\\n3. Responde al usuario con POST /modules/telegram-service/send\\n\\nDatos del evento:\\n- Bot: {{botName}}\\n- Chat: {{chatId}}\\n- File: {{fileId}}\\n- Caption: {{caption}}\\n\\nSé conciso y útil.",
  "slot_type": "system",
  "tags": ["agent", "media", "ocr", "telegram"]
})
\`\`\`

### Paso 2: Crear el Agente

\`\`\`
[TOOL:create_agent]({
  "name": "media-processor",
  "description": "Procesa imágenes de Telegram con OCR",
  "prompt_id": "<id-del-prompt-creado>",
  "subscribes": ["telegram.photo.received", "telegram.document.received"],
  "tools": ["http_request"],
  "provider": "deepseek"
})
\`\`\`

### Paso 3: Confirmar

Informar al usuario:
"He creado el agente 'media-processor' que escucha fotos y documentos de Telegram,
los procesa con OCR y responde con el texto extraído."

---

## Notas Importantes

1. **Siempre crear el prompt primero** antes de crear el agente
2. **Guardar el prompt_id** que retorna create_prompt para usarlo en create_agent
3. **Los eventos deben coincidir** con los que emite el módulo fuente
4. **Usar http_request** para llamar a las APIs de los módulos
5. **Provider por defecto: deepseek** (económico y rápido)

`;

  // Crear directorio si no existe
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`\n📁 Created directory: ${OUTPUT_DIR}`);
  }

  // Escribir archivo
  fs.writeFileSync(OUTPUT_FILE, content);

  console.log(`\n✨ Generated: ${OUTPUT_FILE}`);
  console.log(`   Modules: ${modulesFound}/${RELEVANT_MODULES.length}`);
  console.log(`   Size: ${(content.length / 1024).toFixed(1)} KB`);
}

// Ejecutar
generateKnowledge();
