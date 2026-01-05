# Plan de Implementación: Sistema de Agentes Auto-Generativos

**Versión:** 1.0.0
**Fecha:** 2026-01-04
**Estado:** En Planificación

---

## Objetivo

Implementar un sistema donde la IA pueda crear agentes funcionales de forma autónoma, integrando los módulos existentes (telegram-service, ocr-service, ai-gateway, prompt-manager).

---

## Fases de Implementación

### Fase 1: Tools de Gestión de Agentes

**Prioridad:** Alta
**Dependencias:** Ninguna

#### 1.1 Tool: create_prompt

**Archivo:** `modules/ai-agent-framework/tool-manager.js`

```javascript
{
  name: 'create_prompt',
  description: 'Crea un nuevo prompt en prompt-manager',
  parameters: {
    name: { type: 'string', required: true, description: 'Nombre único (kebab-case)' },
    content: { type: 'string', required: true, description: 'Contenido del prompt' },
    slot_type: { type: 'string', default: 'system', enum: ['system', 'context', 'prefix', 'suffix', 'format'] },
    description: { type: 'string', description: 'Descripción del prompt' },
    tags: { type: 'array', items: { type: 'string' }, description: 'Tags para categorización' }
  },
  handler: async (args, context) => {
    const response = await fetch('http://localhost:3000/modules/prompt-manager/prompts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args)
    });
    return response.json();
  }
}
```

#### 1.2 Tool: create_agent

```javascript
{
  name: 'create_agent',
  description: 'Crea un nuevo agente en ai-agent-framework',
  parameters: {
    name: { type: 'string', required: true, description: 'Nombre único del agente' },
    description: { type: 'string', description: 'Descripción del agente' },
    prompt_id: { type: 'string', required: true, description: 'ID del prompt a usar' },
    provider: { type: 'string', default: 'deepseek', enum: ['deepseek', 'openai', 'anthropic', 'ollama', 'auto'] },
    model: { type: 'string', description: 'Modelo específico' },
    temperature: { type: 'number', default: 0.3, min: 0, max: 1 },
    subscribes: { type: 'array', required: true, items: { type: 'string' }, description: 'Eventos a escuchar' },
    tools: { type: 'array', default: ['http_request'], items: { type: 'string' }, description: 'Tools permitidas' },
    enabled: { type: 'boolean', default: true }
  },
  handler: async (args, context) => {
    const response = await fetch('http://localhost:3000/modules/ai-agent-framework/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args)
    });
    return response.json();
  }
}
```

#### 1.3 Tool: list_agents

```javascript
{
  name: 'list_agents',
  description: 'Lista todos los agentes existentes',
  parameters: {
    enabled_only: { type: 'boolean', default: false, description: 'Solo agentes activos' }
  },
  handler: async (args, context) => {
    const response = await fetch('http://localhost:3000/modules/ai-agent-framework/agents');
    const data = await response.json();
    if (args.enabled_only) {
      data.agents = data.agents.filter(a => a.enabled);
    }
    return data;
  }
}
```

---

### Fase 2: Generador de Conocimiento

**Prioridad:** Alta
**Dependencias:** Fase 1

#### 2.1 Script: generate-architect-knowledge.js

**Archivo:** `scripts/generate-architect-knowledge.js`

```javascript
/**
 * Genera el conocimiento del Agente Arquitecto desde los module.json
 *
 * Uso: node scripts/generate-architect-knowledge.js
 * Output: modules/ai-agent-framework/prompts/architect-knowledge.md
 */

const fs = require('fs');
const path = require('path');

const MODULES_PATH = path.join(__dirname, '..', 'modules');
const OUTPUT_PATH = path.join(__dirname, '..', 'modules', 'ai-agent-framework', 'prompts', 'architect-knowledge.md');

// Módulos relevantes para el Arquitecto
const RELEVANT_MODULES = [
  'telegram-service',
  'ocr-service',
  'ai-gateway',
  'prompt-manager',
  'database-manager',
  'credential-manager',
  'filesystem'
];

function generateKnowledge() {
  let content = `# Conocimiento del Sistema\n\n`;
  content += `Fecha de generación: ${new Date().toISOString()}\n\n`;
  content += `---\n\n`;
  content += `## Módulos Disponibles\n\n`;

  for (const moduleName of RELEVANT_MODULES) {
    const manifestPath = path.join(MODULES_PATH, moduleName, 'module.json');

    if (!fs.existsSync(manifestPath)) {
      continue;
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    content += `### ${manifest.name} (v${manifest.version})\n\n`;
    content += `${manifest.description}\n\n`;

    // APIs
    if (manifest.apis && manifest.apis.length > 0) {
      content += `**APIs:**\n`;
      for (const api of manifest.apis) {
        content += `- \`${api.method} /modules/${manifest.name}${api.path}\`: ${api.description || api.handler}\n`;
      }
      content += `\n`;
    }

    // Eventos
    if (manifest.events) {
      if (manifest.events.publishes && manifest.events.publishes.length > 0) {
        content += `**Eventos emitidos:** ${manifest.events.publishes.join(', ')}\n`;
      }
      if (manifest.events.subscribes && manifest.events.subscribes.length > 0) {
        content += `**Eventos escuchados:** ${manifest.events.subscribes.join(', ')}\n`;
      }
      content += `\n`;
    }

    // Tools
    if (manifest.tools && manifest.tools.length > 0) {
      content += `**Tools para AI:**\n`;
      for (const tool of manifest.tools) {
        content += `- \`${tool.name}\`: ${tool.description}\n`;
      }
      content += `\n`;
    }

    content += `---\n\n`;
  }

  // Patrones de integración
  content += `## Patrones de Integración\n\n`;
  content += `### Telegram → OCR → Respuesta\n\n`;
  content += `\`\`\`\n`;
  content += `subscribes: ["telegram.photo.received"]\n`;
  content += `tools: ["http_request"]\n`;
  content += `\n`;
  content += `Flujo:\n`;
  content += `1. Recibir evento telegram.photo.received\n`;
  content += `2. GET /modules/telegram-service/file/{fileId}?download=true\n`;
  content += `3. POST /modules/ocr-service/extract {input: base64}\n`;
  content += `4. POST /modules/telegram-service/send {chatId, text}\n`;
  content += `\`\`\`\n\n`;

  // Escribir archivo
  const outputDir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_PATH, content);
  console.log(`Generated: ${OUTPUT_PATH}`);
}

generateKnowledge();
```

---

### Fase 3: Agente Arquitecto

**Prioridad:** Alta
**Dependencias:** Fase 1, Fase 2

#### 3.1 Prompt del Arquitecto

**Archivo:** `modules/ai-agent-framework/prompts/architect-system.md`

```markdown
Eres el Agente Arquitecto del sistema Event-Core. Tu función es crear y gestionar otros agentes.

## Tus Capacidades

Tienes acceso a las siguientes herramientas:
- create_prompt: Crear prompts en prompt-manager
- create_agent: Crear agentes en ai-agent-framework
- list_agents: Ver agentes existentes
- http_request: Llamadas HTTP para consultar módulos

## Conocimiento del Sistema

{{architect_knowledge}}

## Instrucciones

Cuando el usuario te pida crear un agente:

1. **Analiza** qué módulos necesita el agente
2. **Diseña** el prompt con las instrucciones claras
3. **Crea** el prompt usando create_prompt
4. **Crea** el agente usando create_agent
5. **Confirma** al usuario lo que has creado

## Configuración por Defecto

- Provider: deepseek (económico y rápido)
- Temperature: 0.3 (determinista)
- Tools: http_request, publish_event

## Ejemplo de Creación

Usuario: "Crea un agente que procese fotos de Telegram con OCR"

1. Creo prompt:
[TOOL:create_prompt]({"name":"media-processor-system","slot_type":"system","content":"..."})

2. Creo agente:
[TOOL:create_agent]({"name":"media-processor","prompt_id":"xxx","subscribes":["telegram.photo.received"],"tools":["http_request"]})

3. Confirmo: "He creado el agente media-processor que escucha fotos de Telegram y las procesa con OCR."
```

#### 3.2 Definición del Agente Arquitecto

**Archivo:** `modules/ai-agent-framework/agents/architect.json`

```json
{
  "id": "architect",
  "name": "architect",
  "description": "Meta-agente que crea y gestiona otros agentes",
  "provider": "deepseek",
  "model": "deepseek-chat",
  "temperature": 0.3,
  "max_tokens": 4000,
  "prompt_id": "architect-system",
  "subscribes": [],
  "tools": [
    "create_prompt",
    "create_agent",
    "list_agents",
    "http_request"
  ],
  "context_enabled": true,
  "context_window": 20,
  "enabled": true,
  "metadata": {
    "type": "meta-agent",
    "version": "1.0.0",
    "auto_load": true
  }
}
```

---

### Fase 4: Integración y Testing

**Prioridad:** Media
**Dependencias:** Fase 3

#### 4.1 Tests de Tools

**Archivo:** `tests/unit/agent-tools.test.js`

```javascript
describe('Agent Tools', () => {
  describe('create_prompt', () => {
    it('should create a prompt in prompt-manager', async () => {
      const result = await toolManager.execute('create_prompt', {
        name: 'test-prompt',
        content: 'Test content',
        slot_type: 'system'
      });

      expect(result.success).toBe(true);
      expect(result.prompt.id).toBeDefined();
    });
  });

  describe('create_agent', () => {
    it('should create an agent', async () => {
      const result = await toolManager.execute('create_agent', {
        name: 'test-agent',
        prompt_id: 'test-prompt',
        subscribes: ['test.event']
      });

      expect(result.success).toBe(true);
      expect(result.agent.id).toBeDefined();
    });
  });

  describe('list_agents', () => {
    it('should list all agents', async () => {
      const result = await toolManager.execute('list_agents', {});

      expect(result.agents).toBeInstanceOf(Array);
    });
  });
});
```

#### 4.2 Test de Integración

**Archivo:** `tests/integration/architect-agent.test.js`

```javascript
describe('Architect Agent Integration', () => {
  it('should create media-processor agent via Architect', async () => {
    // Trigger Architect manually
    const result = await agentFramework.triggerAgent('architect', {
      message: 'Crea un agente que procese fotos de Telegram con OCR'
    });

    expect(result.tools_used).toContain('create_prompt');
    expect(result.tools_used).toContain('create_agent');

    // Verify agent was created
    const agents = await agentFramework.listAgents();
    const mediaProcessor = agents.find(a => a.name === 'media-processor');

    expect(mediaProcessor).toBeDefined();
    expect(mediaProcessor.subscribes).toContain('telegram.photo.received');
  });
});
```

---

## Checklist de Implementación

### Fase 1: Tools
- [ ] Implementar tool `create_prompt`
- [ ] Implementar tool `create_agent`
- [ ] Implementar tool `list_agents`
- [ ] Registrar tools en ToolManager
- [ ] Tests unitarios de tools

### Fase 2: Generador
- [ ] Crear script generate-architect-knowledge.js
- [ ] Ejecutar y verificar output
- [ ] Integrar en proceso de build

### Fase 3: Arquitecto
- [ ] Crear prompt del Arquitecto
- [ ] Crear definición JSON del Arquitecto
- [ ] Cargar Arquitecto al iniciar sistema
- [ ] Tests del Arquitecto

### Fase 4: Integración
- [ ] Test E2E: crear agente via Arquitecto
- [ ] Test E2E: agente creado funciona
- [ ] Documentación de uso
- [ ] Demo

---

## Estimación

| Fase | Tareas | Complejidad |
|------|--------|-------------|
| Fase 1: Tools | 5 | Baja |
| Fase 2: Generador | 2 | Baja |
| Fase 3: Arquitecto | 4 | Media |
| Fase 4: Testing | 4 | Media |

---

## Riesgos y Mitigaciones

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| DeepSeek falla | Agentes no funcionan | Fallback automático en ai-gateway |
| Prompt mal diseñado | Agentes incorrectos | Templates probados + validación |
| Bucle infinito | Sistema bloqueado | Timeouts + límite de herramientas |
| Coste excesivo | Factura alta | DeepSeek por defecto (barato) |

---

## Próximos Pasos

1. **Revisar** este plan con el equipo
2. **Aprobar** las fases
3. **Implementar** Fase 1 (Tools)
4. **Probar** con caso simple
5. **Iterar** según feedback

---

**Última actualización:** 2026-01-04
