# Event Core

Plataforma event-driven modular con IA integrada, MQTT nativo y arquitectura fractal. Un solo proceso que escala de standalone a N cores distribuidos.

**v0.2.0** | Node.js >= 18 | MIT

---

## Arquitectura

```
                    +-----------------------+
                    |     HTTP Gateway      |  :3000
                    |   (REST + UI static)  |
                    +-----------+-----------+
                                |
                    +-----------+-----------+
                    |     MQTT Broker       |  :1883 TCP / :9001 WS
                    |      (Aedes)          |
                    +-----------+-----------+
                                |
          +---------------------+---------------------+
          |                     |                     |
    +-----+------+     +-------+------+     +--------+-----+
    |   Core     |     |   Module     |     |   Frontend   |
    | hooks      |     |   Loader     |     |   SvelteKit  |
    | events     |     | autodiscovery|     |   via WS     |
    | gateway    |     | hot-reload   |     |   MQTT req   |
    | discovery  |     | 49 modules   |     |              |
    | validation |     +--------------+     +--------------+
    +------------+
```

**Principios:**
- El core es solo infraestructura. Todo feature es un modulo
- Comunicacion exclusiva por MQTT (pub/sub + request/response)
- Modulos se autodescubren, se cargan por manifiesto `module.json`
- La seguridad es modular: certificate-authority, security-p2p
- Frontend conecta via WebSocket al broker MQTT, nunca REST directo

---

## Estructura del Proyecto

```
event-core/
|-- index.js                 # Entry point
|-- config.json              # Configuracion principal
|-- package.json             # Dependencias (minimas)
|
|-- core/                    # Infraestructura (no features)
|   |-- broker/              # MQTT broker embebido (Aedes)
|   |-- mqtt/                # Cliente MQTT + pool + topics
|   |-- events/              # Event bus (EventEmitter + MQTT)
|   |-- gateway/             # HTTP Gateway + cache + compression
|   |-- hooks.js             # Sistema de hooks (beforeRequest, etc.)
|   |-- modules/             # Loader + registry de modulos
|   |-- discovery/           # Discovery de cores + heartbeat
|   |-- observability/       # Logger, Tracer, Metrics
|   |-- providers/           # Sistema de providers (IA, servicios)
|   |-- validation/          # JSON Schema validation
|   |-- ui/                  # UIRequestHandler (MQTT req/res)
|   |-- flow/                # Motor de flujos (agent, engine, registry)
|   +-- config/              # Carga de configuracion
|
|-- modules/                 # 49 modulos habilitados + 9 deshabilitados
|   |-- ai-gateway/          # Gateway IA multi-provider
|   |-- ai-agent-framework/  # Orquestacion de agentes IA
|   |-- agent-manager/       # Lifecycle de agentes
|   |-- certificate-authority/ # CA interna + mTLS
|   |-- security-p2p/        # Seguridad P2P (deshabilitado)
|   |-- credential-manager/  # Gestion de credenciales
|   |-- project-manager/     # Gestion de proyectos
|   |-- pizzepos/            # Sistema POS restauracion
|   |   |-- cuentas/         # Gestion de cuentas
|   |   |-- pedidos/         # Pedidos
|   |   |-- cobros/          # Cobros
|   |   |-- cocina/          # Pantalla cocina
|   |   |-- comandero/       # Comandero (camareros)
|   |   |-- productos/       # Catalogo productos
|   |   |-- carta-digital/   # Carta digital
|   |   +-- ...              # +8 sub-modulos mas
|   |-- facturas/            # Facturacion (OCR + IA)
|   |-- recetas/             # Gestion de recetas
|   |-- escandallo/          # Analisis de costes
|   |-- viabilidad/          # Estudios de viabilidad
|   |-- bot-manager/         # Bots multi-canal
|   |-- telegram-service/    # Integracion Telegram
|   |-- scheduler/           # Planificador de tareas (cron)
|   +-- ...                  # +20 modulos mas
|
|-- frontend/                # SvelteKit + TypeScript + Tailwind
|   +-- src/
|       |-- routes/          # Paginas (file-based routing)
|       |   |-- /            # Home - chat general
|       |   |-- /facturas    # Modo facturacion
|       |   |-- /[project_id]/menu-generator   # Generador cartas
|       |   |-- /[project_id]/comandero        # Comandero
|       |   |-- /[project_id]/cocina           # Pantalla cocina
|       |   |-- /[project_id]/recetas          # Recetas
|       |   |-- /[project_id]/escandallo       # Escandallo
|       |   +-- /[project_id]/viabilidad       # Viabilidad
|       |-- lib/
|       |   |-- modules/     # Modulos UI (manifest.json + Panel.svelte)
|       |   |-- stores/      # Svelte stores (28 archivos)
|       |   |-- components/  # Componentes reutilizables
|       |   +-- ui-core/     # MQTT client + mqtt-request.ts
|       +-- app.html
|
|-- contexto/                # Documentacion estructurada del sistema (JSON)
|-- handlers/                # Handlers globales y por proyecto
|-- services/providers/      # Providers: anthropic, google, elevenlabs, local/
|-- plugins/                 # github, ocr, slack, weather, http-utils
|-- tests/                   # Unit (10) + Integration (2)
|-- scripts/                 # Utilidades (create-module, migrations, etc.)
|-- deployment/              # Caddy, Helm, deploy.sh, vps-setup.sh
|-- docs/                    # 40+ guias (arquitectura, modulos, flujos)
|-- prompts/                 # 17 prompts IA especializados
|-- templates/               # Templates de facturas, emails
|-- plop-templates/          # Generadores de codigo (8 templates)
+-- firmware/                # IoT print-proxy (ESP32, PlatformIO)
```

---

## Modulos

### Habilitados (49)

| Categoria | Modulos |
|-----------|---------|
| **Infraestructura** | credential-manager, database-manager, filesystem, plugin-manager, scheduler, system-inspector, composition-manager, context-manager |
| **IA & Agentes** | ai-gateway, ai-agent-framework, agent-manager, prompt-manager, prompt-engine, prompt-composer |
| **Chat & Bots** | chat-ai-bridge, chat-session, bot-manager, telegram-service, channel-manager, calling-generator |
| **PizzaPos** | pizzepos, cuentas, cuentas-canales, pedidos, cobros, cocina, comandero, productos, categorias, ingredientes, variaciones, persistencia-comandero, carta-digital, carta-impresion, menu-generator, impresion |
| **Negocio** | facturas, recetas, escandallo, viabilidad, project-manager |
| **Facturacion** | asesoria, fuentes |
| **Utilidades** | admin-panel, pdf-viewer, text-editor, code-executor |
| **Seguridad** | certificate-authority |

### Deshabilitados (9)

| Modulo | Descripcion |
|--------|-------------|
| `security-p2p` | Autenticacion y cifrado P2P entre cores distribuidos |
| `staff-manager` | Gestion de personal y roles |
| `log-manager` | Gestion avanzada de logs |
| `conversation-manager` | Persistencia de conversaciones |
| `dashboard` | Dashboard de observabilidad web |
| `metricas` | Recoleccion de metricas |
| `notas` | Sistema de notas |
| `scratch-designer` | Disenador visual |
| `ui-designer` | Disenador de UI |

---

## Seguridad

El sistema tiene dos modulos de seguridad, ambos implementados como modulos (no en el core):

### Certificate Authority (habilitado)

CA interna que emite certificados X.509 para autenticacion mTLS. Mismo patron que FNMT: CA propia genera certificados, el cliente los importa, cada request se autentica por certificado.

```
modules/certificate-authority/
|-- index.js              # Lifecycle + 10 API handlers
|-- ca-manager.js         # CA raiz, emision, revocacion, CRL, P12
|-- mtls-middleware.js     # Hook beforeRequest para validar cert cliente
|-- module.json            # Manifiesto (route code: 3333)
+-- prompt.json            # Prompt IA para el modulo
```

**Capacidades:**
- Generar CA raiz auto-firmada (RSA 2048 + SHA-256)
- Emitir certificados cliente (portal facturacion) y dispositivo
- Revocar, renovar, verificar certificados
- CRL (Certificate Revocation List)
- Bundles P12 para importar en navegador
- Middleware mTLS: modo proxy (nginx) o nativo (Node.js TLS)
- Configuracion nginx generada automaticamente

**API (via `/3333/` o `/modules/certificate-authority/`):**

```
GET  /status        Estado CA + estadisticas
GET  /ca-cert       Descargar certificado raiz (publico)
POST /issue         Emitir certificado {commonName, type, identifier}
POST /revoke        Revocar {serialNumber, reason}
POST /renew         Renovar {serialNumber}
GET  /list          Listar certificados (?type=client&status=active)
POST /verify        Verificar certificado PEM
GET  /crl           Lista de revocacion
GET  /download-p12  Descargar bundle .p12
GET  /nginx-config  Configuracion nginx para mTLS
GET  /health        Health check
```

**Tipos de certificado:**
- `client` — Portal de facturacion. OU: "Portal Clientes". Identifica proyecto/cliente
- `device` — Dispositivos de trabajo. OU: "Dispositivos". Control de acceso por dispositivo

**Eventos:** `certificate.issued`, `certificate.revoked`, `certificate.renewed`, `certificate.expired`

**Estado UI:** El backend tiene `ui_handlers` listos. El frontend tiene store (`certificate-authority.ts`) y modulo UI (`frontend/src/lib/modules/certificate-authority/`). Aparece en la work-bar con icono `🔐`.

**Config (en config.json):**
```json
{
  "mtls_enabled": false,
  "mtls_mode": "proxy",
  "allow_unauthenticated": true,
  "cert_validity_days": 365,
  "ca_validity_days": 3650
}
```

### Security P2P (deshabilitado)

Seguridad para comunicacion entre cores distribuidos. Cifrado y autenticacion de mensajes MQTT entre nodos.

**Estado:** Implementado pero deshabilitado en config. Se activa cuando se despliega en modo multi-core.

---

## Frontend

SvelteKit + TypeScript + Tailwind CSS. Conecta al backend exclusivamente via MQTT WebSocket (:9001).

### Filosofia UI

Cada ruta es un **modo de trabajo**, no una app separada. Todas comparten:
- Chat con IA (siempre disponible)
- System-bar (proyecto activo, provider, credenciales)
- Archivos del proyecto

Lo que cambia entre rutas es la **work-bar**: herramientas especificas del modo.

### Zonas de la interfaz

| Zona | Ubicacion | Contenido |
|------|-----------|-----------|
| **work-bar** | Top | Herramientas del modo actual (cambia por ruta) |
| **chat-config** | Config | Proyecto, provider, prompts, credenciales |
| **chat-tools** | Bottom | Archivos, adjuntos |
| **system-bar** | Right | Modulos del sistema |

### Modulos UI

Los modulos UI se autodescubren via `manifest.json` + `index.ts` en `frontend/src/lib/modules/`. Cada uno define `zone`, `icon`, `label` y opcionalmente `routes` (en que rutas aparece).

Los paneles se abren como **flotantes** sobre el contenido — no reemplazan la pantalla.

### Stores (28)

```
attachments, carta, certificate-authority, channels, chat,
cocina, comandero, conversations, credentials, cuentas,
escandallo, facturas, files, impresion, llevadoo,
menu-generator, page-context, persistence, projects, prompts,
recetas, staff, theme, ui, viabilidad, workspace
```

### Comunicacion UI - Backend

```
Frontend                        Backend
   |                               |
   |-- ui/request/{domain}/{action} -->|
   |                               |-- procesa handler
   |<-- ui/response/{request_id} --|
   |                               |
```

```typescript
const response = await mqttRequest('project', 'list');
const certs = await mqttRequest('certificate-authority', 'list');
```

---

## Comunicacion MQTT

Puerto TCP: 1883 | WebSocket: 9001

### Topics

```
# Core
core/{core-id}/events/{domain}/{action}    # Eventos internos
core/{core-id}/status                      # Discovery (retained)
core/{core-id}/heartbeat                   # Health check

# UI Request/Response
ui/request/{domain}/{action}               # Frontend -> Backend
ui/response/{request_id}                   # Backend -> Frontend

# Broadcast
broadcast/{event}                          # Eventos globales
```

### ui_handlers

Cada modulo declara `ui_handlers` en su `module.json`. El core los registra automaticamente:

```json
{
  "ui_handlers": [
    { "domain": "certificate-authority", "action": "list", "handler": "handleListCertificates" },
    { "domain": "certificate-authority", "action": "issue", "handler": "handleIssueCertificate" }
  ]
}
```

El frontend llama con `mqttRequest('certificate-authority', 'list')` y recibe la respuesta.

---

## Providers

### IA (ai-gateway)

6 providers LLM con tool calling:

| Provider | Modelos |
|----------|---------|
| DeepSeek | deepseek-chat, deepseek-reasoner |
| Anthropic | claude-sonnet-4-20250514 |
| OpenAI | gpt-4o, gpt-4o-mini |
| Groq | llama, mixtral |
| Gemini | gemini-2.0-flash |
| Ollama | modelos locales |

### Servicios locales

Providers locales en `services/providers/local/` — funciones del sistema expuestas como tools para la IA (filesystem, OCR, PDF, etc.)

### Credenciales

4 niveles de resolucion: GLOBAL -> PROJECT -> CLIENT -> CUSTOM. Las credenciales nunca se resuelven dentro del provider.

---

## Inicio Rapido

```bash
# Instalar dependencias
npm install

# Iniciar el core
node index.js

# O en modo debug
node index.js --log-level debug

# Frontend (en otra terminal)
cd frontend && npm install && npm run dev

# Health check
curl http://localhost:3000/health

# Ver modulos cargados
curl http://localhost:3000/modules

# CLI
node cli/index.js health
node cli/index.js modules
```

### Docker

```bash
docker-compose up        # Desarrollo
docker-compose -f docker-compose.production.yml up  # Produccion
```

### Multi-Machine

```bash
./network/setup-core.sh     # Setup wizard interactivo
./network/validate.sh       # Validar configuracion
./network/latency-test.sh   # Test de latencia
```

---

## Tests

```bash
npm test                       # Tests basicos
npm run test:hooks            # Hook system (21 tests)
npm run test:observability    # Observability (19 tests)
npm run test:gateway          # HTTP Gateway (20 tests)
npm run test:security         # Security P2P
npm run test:integration      # Full stack (18/19 tests)
```

60+ tests unitarios + 18 tests de integracion.

---

## Generacion de Codigo

```bash
npm run plop                  # Menu interactivo
npm run create-module         # Crear modulo nuevo
npm run create-module -- --interactive  # Modo interactivo
```

Templates disponibles: module, service-module, full-module, handler, local-provider, svelte-component, selector-panel, chat-module.

---

## Directorio contexto/

Documentacion estructurada del sistema en formato JSON. 31 archivos que describen la arquitectura real, modulos, patrones, convenciones. Sirve como fuente de verdad para desarrollo asistido por IA.

Archivos clave:
- `system.json` — Arquitectura, puertos, convenciones
- `modules.json` — Sistema de modulos (55 total)
- `mqtt.json` — Patrones de comunicacion MQTT
- `ui.json` — Frontend, stores, work-bar, paneles
- `ai-gateway.json` — Providers IA y tool calling
- `certificate-authority.json` — CA interna y mTLS
- `pizzepos.json` — Sistema POS completo
- `handlers.json` — Sistema de handlers event-driven
- `credentials.json` — Gestion de credenciales multi-nivel

---

## Puertos

| Puerto | Servicio |
|--------|----------|
| 3000 | HTTP Gateway (REST + UI estatica) |
| 1883 | MQTT Broker (TCP) |
| 9001 | MQTT Broker (WebSocket) |
| 5173 | Frontend dev server (SvelteKit) |

---

## Dependencias

Minimas por diseno. Solo Node.js built-ins + estas:

| Dependencia | Uso |
|-------------|-----|
| aedes | MQTT broker embebido |
| mqtt | Cliente MQTT |
| ws | WebSocket server |
| ajv | JSON Schema validation |
| sharp | Procesamiento de imagenes |
| pdfkit, pdf-parse, pdfjs-dist | Generacion y procesamiento PDF |
| tesseract.js, scribe.js-ocr | OCR local |
| sql.js | SQLite en memoria |
| node-cron | Planificacion de tareas |
| dotenv | Variables de entorno |

---

## Despliegue

- **Standalone:** `node index.js` — un proceso, todo incluido
- **Docker:** `docker-compose up` — con broker externo opcional
- **VPS:** `./setup-vps.sh` — wizard de configuracion
- **Kubernetes:** Charts Helm en `deployment/helm/`
- **Multi-core:** Multiples instancias conectadas al mismo broker MQTT

---

## Licencia

MIT
