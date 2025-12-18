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

### 3. PLUGINS
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

## Notas

- Auto-UI fue descartado (sistema UI declarativa JSON)
- Frontend usa SvelteKit nativo
- Blueprints son útiles para scaffolding rápido
- Plugins no requieren código (solo JSON)
- **constants.js es auto-generado** - NO editar manualmente

---

*Última actualización: 2025-12-01*
