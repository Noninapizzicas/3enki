# Event-Core - Contexto del Proyecto

## Resumen

**Event-Core** es un Meta-Core Event-Driven Framework con arquitectura fractal que escala desde un proceso standalone hasta sistemas distribuidos complejos.

| Característica | Valor |
|----------------|-------|
| Versión | v1.2.0 |
| Estado | Production Ready |
| Stack | Node.js 18+ |
| Messaging | MQTT (Aedes embebido) |
| Frontend | SvelteKit 2 + Tailwind |

---

## Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                         EVENT-CORE                               │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐                               │
│  │   FRONTEND  │  │  CLI HTTP   │              ← Clients        │
│  │  (Svelte)   │  │  (Pure)     │                               │
│  └──────┬──────┘  └──────┬──────┘                               │
│         │                │                                       │
│  ╔══════╧════════════════╧══════╗                               │
│  ║      HTTP GATEWAY (:3000)    ║               ← API Layer     │
│  ╚═══════════════╤══════════════╝                               │
│                  │                                               │
│  ┌───────────────┴───────────────┐                              │
│  │            CORE               │                              │
│  │  ┌─────────┐  ┌─────────┐     │                              │
│  │  │  Hook   │  │  Event  │     │                              │
│  │  │ Manager │  │   Bus   │     │                              │
│  │  └────┬────┘  └────┬────┘     │                              │
│  │       │            │          │                              │
│  │  ┌────┴────────────┴────┐     │                              │
│  │  │   MQTT BROKER        │     │              ← Messaging     │
│  │  └──────────────────────┘     │                              │
│  └───────────────────────────────┘                              │
│                  │                                               │
│  ┌───────────────┴───────────────┐                              │
│  │          MODULES              │              ← Features      │
│  │  [ai-gateway] [credential]    │                              │
│  │  [prompt] [tool-orchestrator] │                              │
│  └───────────────────────────────┘                              │
│                  │                                               │
│  ┌───────────────┴───────────────┐                              │
│  │          PLUGINS              │              ← Extensions    │
│  │  [github] [slack] [weather]   │                              │
│  └───────────────────────────────┘                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Estructura del Proyecto

```
event-core/
├── core/                    # Núcleo del sistema
│   ├── hooks.js            # Sistema de hooks
│   ├── constants.js        # Constantes centralizadas
│   ├── broker/             # MQTT broker (Aedes)
│   ├── mqtt/               # Cliente MQTT
│   ├── events/             # Event Bus híbrido
│   ├── gateway/            # HTTP Gateway
│   ├── modules/            # Loader y Registry
│   ├── validation/         # JSON Schema (AJV)
│   ├── observability/      # Logger, Tracer, Metrics
│   ├── discovery/          # Descubrimiento de cores
│   └── config/             # Configuración
│
├── modules/                 # Módulos funcionales (12)
│   ├── ai-gateway/         # Gateway LLMs
│   ├── credential-manager/ # Gestión credenciales
│   ├── prompt-manager/     # Gestión prompts
│   ├── tool-orchestrator/  # Orquestador herramientas
│   ├── menu-generator/     # Generador menús IA
│   ├── admin-panel/        # Panel administración
│   ├── dashboard/          # Dashboard observabilidad
│   ├── plugin-manager/     # Gestor plugins
│   ├── ai-agent-framework/ # Framework agentes
│   ├── calling-generator/  # Function calling
│   ├── notas/              # Gestión notas
│   └── metricas/           # Métricas
│
├── plugins/                 # Plugins JSON
│   ├── github/             # GitHub API
│   ├── slack/              # Slack API
│   ├── weather/            # Weather API
│   └── http-utils/         # HTTP utilities
│
├── frontend/                # Aplicación SvelteKit
│   └── src/
│       ├── lib/components/ # Componentes Svelte
│       ├── lib/stores/     # Stores (MQTT, modules)
│       └── routes/         # Páginas
│
├── blueprints/              # Definiciones YAML de módulos
│   ├── _schema.yaml        # Esquema de blueprints
│   ├── _template.yaml      # Template base
│   └── tareas.yaml         # Ejemplo
│
├── plop-templates/          # Templates Plop.js
│   ├── module/             # Backend module
│   ├── full-module/        # Backend + Frontend
│   └── svelte-component/   # Componente Svelte
│
├── services/                # Servicios (providers)
│   └── providers/
│       └── local/           # Providers locales
│           ├── sharp/       # Procesamiento imagen (prepare-ocr)
│           ├── pdf-to-png/  # PDF a imagen (Poppler/pdftoppm)
│           ├── google-vision/ # OCR Google Vision API
│           └── gmail/       # Gmail API (search, read, download)
│
├── data/                    # Datos runtime
│   ├── projects/            # Proyectos (config + handlers + storage)
│   ├── bots/                # Archivos recibidos por bots Telegram
│   ├── gmail/               # Adjuntos descargados de Gmail
│   └── scheduler/           # Jobs programados (cron)
│
├── prompts/                 # Prompts IA (15)
├── strategy/                # Visión y roadmap
├── docs/                    # Documentación
├── tests/                   # Tests
├── cli/                     # CLI HTTP client
├── docker-compose.yml       # Multi-core setup
└── package.json
```

---

## Secciones Principales

### 1. CORE
Núcleo minimalista con infraestructura event-driven:
- **HookManager**: Intercepta operaciones sin acoplamiento
- **EventBus**: Pub/Sub híbrido (EventEmitter + MQTT)
- **HTTP Gateway**: Expone APIs automáticamente
- **Module Loader**: Autodescubrimiento y hot-reload
- **ValidationManager**: JSON Schema con AJV
- **Observability**: Logger, Tracer W3C, Metrics

### 2. MODULES (12 módulos)
Features como plugins independientes:

| Módulo | Descripción |
|--------|-------------|
| ai-gateway | Gateway unificado LLMs (DeepSeek, Claude, OpenAI, Ollama) |
| credential-manager | Gestión multi-nivel credenciales |
| prompt-manager | Gestión prompts con versionado |
| tool-orchestrator | Orquestador herramientas IA |
| menu-generator | Generador menús con chat IA |
| admin-panel | Panel administración web |
| dashboard | Dashboard observabilidad |
| plugin-manager | Gestor de plugins |
| ai-agent-framework | Framework agentes event-driven |
| calling-generator | Generador function calling |
| notas | Gestión de notas |
| metricas | Sistema métricas |

### 3. PROVIDER SYSTEM (Servicios)

Sistema de servicios locales y externos descubiertos automáticamente.

**Estructura de un provider local:**
```
services/providers/local/{nombre}/
├── index.js          # Implementación (funciones exportadas)
└── manifest.json     # Contrato (input/output schemas)
```

**Cómo se llaman desde handlers:**
```javascript
const result = await services.call('local.{nombre}', '{accion}', {
  /* params */
}, { timeout: 60000 });

const d = result.data || result;  // Datos de respuesta
```

**Flujo interno de services.call():**
```
services.call('local.X', 'Y', params)
  → publica evento: local.X.Y.request
  → ProviderExecutor ejecuta handler.Y(params)
  → publica evento: local.X.Y.response
  → ServiceExecutor resuelve la Promise
```

**Providers locales disponibles:**

| Provider | Acción | Descripción |
|----------|--------|-------------|
| local.sharp | prepare-ocr | Prepara imagen para OCR (grayscale, normalize, sharpen, resize) |
| local.pdf-to-png | convert | PDF a PNG via pdftoppm (Poppler), configurable DPI |
| local.google-vision | extract | OCR con Google Vision API (DOCUMENT_TEXT_DETECTION) |
| local.gmail | search | Buscar correos en Gmail |
| local.gmail | read | Leer correo completo |
| local.gmail | attachments.download | Descargar adjunto |

**ai-gateway (LLMs):**
```javascript
// IMPORTANTE: el servicio se llama 'ai', NO 'ai-gateway'
// ai-gateway escucha eventos ai.chat.request (sin guión)
const result = await services.call('ai', 'chat', {
  messages: [{ role: 'system', content: '...' }, { role: 'user', content: '...' }],
  provider: 'deepseek',    // deepseek | claude | openai | ollama
  temperature: 0.1,
  max_tokens: 2000
}, { timeout: 60000 });
```

**Credential Manager:**
- Credenciales en `.env` (solo en servidor, NO en repo)
- Patrón: `PROVIDER_API_KEY_LEVEL` (ej: `GOOGLE_API_KEY_GLOBAL`)
- Cascada: CUSTOM → CLIENT → PROJECT → GLOBAL
- Legacy: `PROVIDER_API_KEY` (sin nivel = GLOBAL)
- Tokens especiales: `GMAIL_REFRESH_TOKEN_{account}`
- **Preserva líneas no gestionadas** al guardar .env

### 4. HANDLER SYSTEM (Proyectos)

Los handlers son la lógica de negocio. Viven dentro de cada proyecto.

**Estructura de un proyecto:**
```
data/projects/{projectId}/
├── config/
│   └── config.json       # Configuración del proyecto
├── handlers/
│   ├── mi-handler.js     # Handlers activos
│   └── _archive/         # Handlers archivados
└── storage/              # Datos del proyecto (runtime)
    ├── preprocesadas/    # Imágenes preparadas
    ├── ocr/              # Textos OCR
    ├── estructuradas/    # JSONs estructurados
    ├── export/           # CSVs exportados
    └── procesados/       # Originales ya procesados
```

**Anatomía de un handler:**
```javascript
module.exports = {
  name: 'mi-handler',
  trigger: 'bot.command.received',   // Evento que lo activa

  filter: (event) => {               // Filtro opcional
    const data = event.data || event;
    return data.command === 'micomando';
  },

  async handle(event, { logger, emit, services, config, projectId }) {
    const data = event.data || event;
    const chatId = data.chatId;
    const cfg = config.config || {};
    const botName = cfg.telegram?.botName || data.botName;

    // Usar servicios
    const result = await services.call('local.X', 'Y', params);

    // Emitir eventos (ej: enviar mensaje Telegram)
    emit('telegram.send_message.request', { botName, chatId, text: '...' });
    emit('telegram.send_document.request', { botName, chatId, filePath, caption });

    // Logger
    logger.info('handler.ok', { /* datos */ });
    logger.error('handler.error', { error: error.message });
  }
};
```

**Context disponible en handle():**
- `services` — Llamar a providers (services.call)
- `emit` — Publicar eventos (Telegram, etc.)
- `logger` — Logging estructurado
- `config` — Config del proyecto (config.json)
- `projectId` — ID del proyecto
- `store` — Almacenamiento persistente

### 5. PLUGINS
Sistema de plugins JSON sin código:
- **github**: create_issue, create_comment, list_issues
- **slack**: send_message, create_channel, upload_file
- **weather**: get_current_weather, get_forecast
- **http-utils**: get_request, post_request, webhook_call

### 4. FRONTEND
Aplicación SvelteKit 2:
- Svelte 5 + TypeScript
- Tailwind CSS
- MQTT.js (real-time)
- Componentes: Button, Input, Card, Table, Modal

**Principios UI:**
- Pantalla única (sin navegación tradicional)
- 1 clic = 1 panel (sin doble-clic, sin long-press)
- Datos via MQTT (NO endpoints /ui/state)
- Paneles flotantes con tabs internas

### 5. BLUEPRINTS
Sistema de scaffolding YAML → módulos completos:
```yaml
name: mi-modulo
entity:
  name: item
  plural: items
fields:
  - name: titulo
    type: string
    required: true
events:
  publish:
    - name: item.creado
```
Generar: `npx plop from-blueprint`

### 6. PROMPTS (15)
Prompts especializados para desarrollo:
- estratega_producto_y_roadmap
- arquitecto_event_driven
- arquitecto_ux / arquitecto_dx
- orquestador_implementacion
- generador_contratos
- curador_documentacion

### 7. SISTEMA DE CONSTANTES

Sistema centralizado para evitar errores de typos en eventos y rutas.

#### Flujo de trabajo
```
module.json (fuente) → generate-constants → constants.js (generado)
```

#### Estructura module.json
```json
{
  "name": "mi-modulo",
  "events": {
    "publishes": [
      { "event": "mi-modulo.creado", "description": "..." }
    ],
    "subscribes": [
      { "event": "otro.evento", "handler": "onOtroEvento" }
    ]
  }
}
```

#### Uso de constantes
```javascript
const { EVENTS } = require('../../core/constants');

// En vez de strings hardcodeados:
// ❌ eventBus.publish('tool.call.success', data);

// Usar constantes:
// ✅ eventBus.publish(EVENTS.TOOL.CALL_SUCCESS, data);
```

#### Validación en EventBus
```javascript
// Activar validación (detecta typos en desarrollo)
const eventBus = new EventBus({
  validateEvents: true,      // Warn si evento no registrado
  strictValidation: false    // true = lanza error
});
```

#### Regenerar constantes
```bash
npm run generate:constants   # Después de modificar module.json
```

---

## Comandos Útiles

### Desarrollo
```bash
npm start              # Iniciar core
npm run dev            # Modo desarrollo
npm test               # Tests unitarios
npm run test:integration
npm run generate:constants  # Regenerar constantes desde module.json
```

### Generadores Plop
```bash
npx plop module        # Crear módulo backend
npx plop full-module   # Backend + Frontend Svelte
npx plop svelte-component  # Componente Svelte
npx plop from-blueprint    # Desde YAML
npx plop api           # Agregar API
npx plop event         # Agregar evento
```

### Docker
```bash
docker-compose up      # Multi-core setup
docker-compose logs -f
```

---

## Dependencias

```json
{
  "aedes": "^0.51.3",      // MQTT broker
  "ajv": "^8.12.0",        // JSON Schema validation
  "mqtt": "^5.3.5",        // MQTT client
  "ws": "^8.18.3",         // WebSocket
  "dotenv": "^17.2.3"      // Env vars
}
```

---

## Valores del Proyecto

1. **Simplicidad Radical** - Mínima complejidad
2. **Core Minimalista** - Solo infraestructura
3. **Modularidad Total** - Features como plugins
4. **API-First** - Todo expuesto via HTTP/MQTT
5. **Zero Dependencias** - Solo lo esencial
6. **Portable Everywhere** - Termux → Docker → K8s

---

## Proyecto Referencia: facturas-nonina

Pipeline automatizado de facturas para negocio (Pizzería Nonina). Procesa facturas de dos fuentes, extrae datos con OCR + IA, y genera CSV fiscal para asesoría española.

### Fuentes de entrada

| Fuente | Directorio | Tipos |
|--------|-----------|-------|
| Telegram bot | `data/bots/{botName}/received/` | Fotos de facturas (jpg, png) |
| Gmail | `data/gmail/{account}/` | PDFs adjuntos |

Los nombres de bot y cuenta Gmail vienen de `config.json` → reutilizable para distintas empresas.

### Pipeline completo (/gofull)

```
Gmail download → PDF→PNG → Sharp → OCR → Estructura → CSV → Mover procesados
```

| Paso | Servicio | Detalle |
|------|----------|---------|
| 1. Gmail | `local.gmail` search/read/download | Descarga adjuntos no leídos |
| 2. PDF→PNG | `local.pdf-to-png` convert | pdftoppm 300 DPI |
| 3. Sharp | `local.sharp` prepare-ocr | grayscale, normalize, sharpen, max 2400x3200 |
| 4. OCR | `local.google-vision` extract | DOCUMENT_TEXT_DETECTION, languageHints: ['es'] |
| 5. Estructura | `ai` chat (DeepSeek) | Texto OCR → JSON estructurado (emisor, receptor, líneas, totales) |
| 6. CSV | Generación local | Formato SII/modelo 303, separador `;`, BOM UTF-8 |
| 7. Descarte | fs.renameSync | Originales sin error → `storage/procesados/` |

**Control de reprocesamiento:** Los archivos procesados sin error se mueven a `procesados/`. Los que fallan se quedan en inbox para reintento en la siguiente ejecución.

### Handlers disponibles

| Comando | Handler | Función |
|---------|---------|---------|
| `/gofull` | procesar-facturas.js | Pipeline batch completo |
| `/gogmail` | test-gmail.js | Solo descarga Gmail |
| `/gopdf` | test-pdf.js | Solo conversión PDF→PNG |
| `/gosharp` | test-preparar.js | Solo preparación Sharp |
| `/gocr` | test-ocr.js | Solo OCR Google Vision |
| `/gostructure` | test-structure.js | Solo estructura DeepSeek |
| `/goexport` | test-export.js | Solo generar CSV fiscal |

### Config del proyecto

```json
// data/projects/facturas-nonina/config/config.json
{
  "telegram": { "botName": "facturas_noninapizzicas_bot" },
  "gmail": { "account": "noninapizzicas", "query": "has:attachment is:unread" },
  "storage": {
    "inbox": {
      "telegram": "./data/bots/facturas_noninapizzicas_bot/received",
      "gmail": "./data/gmail/noninapizzicas"
    },
    "procesados": "./data/projects/facturas-nonina/storage/procesados"
  },
  "schedule": { "gmail": { "cron": "0 3 * * 0" } }
}
```

### CSV fiscal (formato)

Libro Registro Facturas Recibidas — columnas separadas por `;`:
```
Fecha;Num_Factura;NIF_Emisor;Nombre_Emisor;NIF_Receptor;Nombre_Receptor;
Descripcion;Base_Imponible;Tipo_IVA;Cuota_IVA;Tipo_RE;Cuota_RE;
Total_Factura;Forma_Pago;Clave_Operacion
```
Clave operación: F1 (factura corriente) o F2 (simplificada).

### Scheduler

Job `facturas-nonina-gmail-domingo` en `data/scheduler/jobs.json`:
- Cron: `0 3 * * 0` (domingos 3:00 AM Europe/Madrid)
- Ejecuta el pipeline batch completo

---

## Gotchas y Lecciones Aprendidas

| Problema | Causa | Solución |
|----------|-------|----------|
| `services.call('ai-gateway', 'chat')` no funciona | ai-gateway escucha `ai.chat.request`, no `ai-gateway.chat.request` | Usar `services.call('ai', 'chat')` |
| DeepSeek timeout en vision | DeepSeek V3 NO soporta imágenes via API | Usar Google Vision para OCR |
| Requests HTTP colgados sin timeout | base-provider.js no tenía timeout | Añadido `req.setTimeout(90000)` |
| credential-manager borra claves .env | Solo cargaba patrón `_API_KEY_` con nivel | Añadido soporte legacy `_API_KEY` + preservar líneas no gestionadas |
| Gmail "No refresh token" | Token guardado como `GMAIL_API_KEY_GLOBAL` | Renombrar a `GMAIL_REFRESH_TOKEN_{account}` |
| Error sin diagnóstico en batch | Handler solo logueaba error, no lo mostraba | Añadir `primerError` al mensaje Telegram |

---

## Notas

- Auto-UI fue descartado (sistema UI declarativa JSON)
- Frontend usa SvelteKit nativo
- Blueprints son útiles para scaffolding rápido
- Plugins no requieren código (solo JSON)
- **constants.js es auto-generado** - NO editar manualmente
- **Entorno producción**: Termux en Android (recursos limitados, procesar en horario bajo)
- **Principios**: reutilizar código existente, no crear innecesariamente, analizar antes de implementar

---

*Última actualización: 2026-02-03*
