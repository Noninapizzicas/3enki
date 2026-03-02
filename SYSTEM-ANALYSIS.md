# Analisis del Sistema Event-Core

> Fecha: 2026-03-02
> Autor: Analisis automatizado (code-verified)
> Version analizada: v0.2.0 (package.json)

---

## 1. RESUMEN EJECUTIVO

**Event-Core** es un meta-framework event-driven construido sobre Node.js 18+ con MQTT (Aedes broker embebido), SvelteKit 2 + Svelte 5, y SQLite (sql.js). Implementa una arquitectura modular distribuida donde multiples cores se comunican via MQTT pub/sub, con un sistema de 46 modulos descubiertos automaticamente y 35 proveedores de servicios.

La vertical principal implementada es **Pizzepos** — un sistema POS completo para pizzeria con 14 modulos especializados (cuentas, pedidos, cobros, cocina, comandero, etc.).

### Estadisticas del Codigo (verificadas)

| Area | Archivos | Lineas de codigo |
|------|----------|-----------------|
| index.js | 1 | 678 |
| core/ | ~30 .js | 15,672 |
| modules/ | ~100 .js | 52,443 |
| frontend/ | ~200 .svelte/.ts | 38,298 |
| services/providers/ | 35 .js | 13,508 |
| handlers/ | ~20 .js | 5,999 |
| **Total JS (sin node_modules)** | **~400** | **~121,700** |

---

## 2. ARQUITECTURA CORE

### 2.1 Punto de Entrada: `index.js` (678 lineas)

Secuencia de inicializacion de 8 pasos:

```
1. Observability     → Logger + Tracer + Metrics
2. Validation        → JSON Schema (AJV)
3. MQTT              → Aedes broker embebido + mqtt.js client
4. Hooks             → Sistema de lifecycle hooks
5. EventBus          → Pub/sub hibrido (local + MQTT)
5.5 UIRequestHandler → Request/response sobre MQTT para frontend
6. Providers         → Carga servicios de services/providers/
6.5 Modules          → Carga modulos de modules/ (auto-discovery recursivo)
6.7 Handlers         → Carga handlers globales y por proyecto
7. ServiceRegistry   → Auto-allocacion de puerto
8. HTTP Gateway      → Express server con routing a modulos
```

### 2.2 Componentes Core (`core/`)

| Componente | Ubicacion | Lineas | Funcion |
|-----------|-----------|--------|---------|
| EventBus | core/events/bus.js | ~600 | Emisor hibrido local+MQTT con envelopes estandar |
| Envelope | core/events/envelope.js | ~150 | Estructura estandar de eventos (id, type, source, data, trace) |
| MQTTClient | core/mqtt/index.js | ~400 | Wrapper con pool de conexiones y broker embebido |
| ModuleLoader | core/modules/loader.js | ~800 | Auto-discovery y carga de modulos con wiring declarativo |
| ModuleRegistry | core/modules/registry.js | ~200 | Registro de modulos cargados |
| HTTPGateway | core/gateway/http.js | ~600 | Express server con routing, CORS, compresion, cache |
| UIRequestHandler | core/ui/UIRequestHandler.js | ~300 | Request/response sobre MQTT (ui/request/{domain}/{action}) |
| HandlerLoader | core/handler-loader.js | ~500 | Carga y ejecuta handlers JavaScript puros |
| ServiceExecutor | core/service-executor.js | ~200 | Ejecutor de llamadas a providers |
| HandlerStore | core/handler-store.js | ~150 | Key-value persistente por handler |
| HookManager | core/hooks.js | ~200 | Interceptores pre/post para lifecycle |
| Discovery | core/discovery/ | ~300 | Descubrimiento multi-core via MQTT retained (NO integrado en startup) |
| FlowEngine | core/flow/ | ~400 | Motor de flows con registry (legacy, reemplazado por handlers) |
| Orchestrator | core/orchestrator/ | ~200 | Orquestador de servicios multi-maquina |
| Constants | core/constants.js | ~1000 | Constantes generadas del sistema |
| Observability | core/observability/ | ~800 | Logger, Tracer, Metrics, ActivityLogger |
| Validation | core/validation/ | ~400 | AJV schemas + middleware |
| Config | core/config/ | ~200 | Carga config con prioridad CLI > ENV > file |
| Providers | core/providers/ | ~300 | ProviderRegistry + ProviderLoader + ProviderExecutor |

### 2.3 Patrones Clave del Core

**Event Envelope estandar:**
```javascript
{
  event_id: "uuid",
  event_type: "pedido.creado",
  timestamp: "ISO-8601",
  source: { core_id: "core-a", module_id: "pedidos" },
  data: { /* payload */ },
  trace: { trace_id, span_id, parent_span_id },
  metadata: { /* custom */ }
}
```

**Topics MQTT:**
- Eventos: `core/{coreId}/events/{module}/{event}`
- UI Request: `ui/request/{domain}/{action}`
- UI Response: `ui/response/{requestId}`
- Servicios: `{provider}.{function}.request` / `.response`
- Discovery: `core/{coreId}/status`

**Module Auto-Wiring (declarativo en module.json):**
```javascript
// Las suscripciones y UI handlers se cablean ANTES de onLoad
// Los tools se registran DESPUES de onLoad
// 28/28 modulos core migrados a wiring declarativo
```

---

## 3. MODULOS (46 descubiertos, 40 activos, 6 disabled)

### 3.1 Modulos Core (32 en modules/)

#### Tier 1 — Infraestructura
| Modulo | Estado | Funcion |
|--------|--------|---------|
| credential-manager | activo | Credenciales multi-nivel (GLOBAL/PROJECT/CLIENT/CUSTOM) con cascada |
| database-manager | activo | SQLite por proyecto via sql.js |
| log-manager | activo | Gestion centralizada de logs |
| filesystem | activo | Operaciones de archivos |

#### Tier 2 — Plataforma
| Modulo | Estado | Funcion |
|--------|--------|---------|
| plugin-manager | activo | Descubre y gestiona plugins JSON |
| prompt-manager | activo | Gestion de prompts con versionado |
| prompt-composer | activo | Composicion de system prompts (con page-context) |
| scheduler | activo | Jobs con triggers cron/interval/datetime/event |

#### Tier 3 — Core de Negocio
| Modulo | Estado | Funcion |
|--------|--------|---------|
| project-manager | activo | CRUD proyectos, composicion 5 fases, split en 12 archivos lib/ |
| composition-manager | activo | Composicion de proyectos |
| context-manager | activo | Estado de aplicacion |
| system-inspector | activo | Inspeccion del sistema |
| ai-gateway | activo | Gateway unificado 6 LLM providers (DeepSeek, Claude, OpenAI, Groq, Gemini, Ollama) |
| ai-agent-framework | activo | Framework agentes IA event-driven con ToolManager unificado |
| agent-manager | activo | Gestion de agentes |

#### Tier 4 — Features
| Modulo | Estado | Funcion |
|--------|--------|---------|
| calling-generator | activo | Genera funciones JS desde plugins |
| bot-manager | activo | Gestion de bots (Telegram) |
| chat-ai-bridge | activo | Puente chat↔AI con agentic loop de tools |
| chat-session | activo | Sesiones de chat con historial SQLite |
| code-executor | activo | Ejecucion segura de codigo |

#### Tier 5 — UI y Presentacion
| Modulo | Estado | Funcion |
|--------|--------|---------|
| admin-panel | activo | Panel de administracion |
| pdf-viewer | activo | Visor de PDFs |
| telegram-service | activo | Servicio de Telegram v3.0.0 |
| text-editor | activo | Editor de texto |
| staff-manager | activo | Gestion de personal |
| security-p2p | activo | Seguridad peer-to-peer |

#### Disabled
| Modulo | Estado | Razon |
|--------|--------|-------|
| conversation-manager | disabled | Legacy facade — reemplazado por chat-session + chat-ai-bridge |
| dashboard | disabled | Panel de observabilidad |
| metricas | disabled | Metricas centralizadas |
| notas | disabled | Notas rapidas |
| scratch-designer | disabled | Disenador scratch |
| ui-designer | disabled | Disenador visual de interfaces |

### 3.2 Modulos Pizzepos (14 en modules/pizzepos/)

| Modulo | Version | Funcion |
|--------|---------|---------|
| cuentas | 2.2+ | Maquina de estados: pendiente→con_pedido→en_preparacion→listo→para_cobrar→cobrado |
| cuentas-canales | 1.0 | 5 canales Strategy pattern: mesa, telefono, llevar, glovo, whatsapp |
| pedidos | 1.0 | Gestion de pedidos event-driven |
| cobros | 1.1 | 7 metodos de pago (efectivo, tarjeta, bizum, transferencia, mixto, link, QR) |
| cocina | 2.1 | Display cocina tiempo real, 3 estados por item (pendiente→preparando→listo) |
| comandero | 1.0+ | Toma de pedidos, grid productos, categorias, envio a cocina |
| productos | 2.0 | Catalogo de productos |
| categorias | 1.0 | Catalogo de categorias |
| ingredientes | 1.0 | Catalogo de ingredientes y alergenos |
| variaciones | 1.0 | Quitar/anadir ingredientes (formato canonico objeto) |
| menu-generator | 4.0+ | Pipeline IA: upload carta → OCR → LLM → menu estructurado (10 tools) |
| persistencia-comandero | 1.0 | Persistencia de estado del comandero |
| impresion | 1.0 | Impresion termica de tickets |
| carta-impresion | 1.0 | Impresion de cartas de menu |

---

## 4. PROVEEDORES DE SERVICIOS (35 en services/providers/local/)

### 4.1 Documentos y OCR
| Provider | Funcion |
|----------|---------|
| google-vision | OCR via Google Vision API |
| google-documentai | Extraccion estructurada via Document AI |
| tesseract | OCR local (Tesseract.js v6) |
| scribe-ocr | OCR alternativo (Scribe.js) |
| document-processor | Procesamiento de documentos |
| pdf | Generacion de PDFs (PDFKit) |
| pdf-parse | Parsing de PDFs |
| pdf-to-png | Conversion PDF → PNG |
| pdfjs | Rendering PDF (pdfjs-dist) |

### 4.2 Imagenes y Media
| Provider | Funcion |
|----------|---------|
| sharp | Procesamiento de imagenes |
| svg | Generacion de SVGs |
| ffmpeg | Procesamiento de video/audio |
| whisper | Speech-to-text |

### 4.3 Datos y Formatos
| Provider | Funcion |
|----------|---------|
| csv | Generacion/parsing CSV |
| xlsx | Procesamiento Excel |
| zip | Compresion/descompresion |
| dxf | Archivos DXF (CAD) |

### 4.4 APIs Externas
| Provider | Funcion |
|----------|---------|
| gmail | Envio/lectura email |
| slack | Integracion Slack |
| stripe | Pagos con Stripe |
| notion | Integracion Notion |
| woocommerce | Integracion WooCommerce |
| glovo | Integracion Glovo (delivery) |
| whatsapp | Integracion WhatsApp |
| etherscan | Blockchain explorer |
| coingecko | Precios crypto |
| yahoo-finance | Datos financieros |

### 4.5 Utilidades del Sistema
| Provider | Funcion |
|----------|---------|
| backup-manager | Backups automaticos |
| context-sync | Sincronizacion de contexto |
| esp32 | Control de dispositivos ESP32 |
| facturas-db | Base de datos de facturas |
| handler-generator | Generacion de handlers |
| learning | Sistema de aprendizaje (feedback + recomendaciones) |
| skills | Generacion de providers locales |
| url-data | Extraccion de datos de URLs |

---

## 5. FRONTEND (SvelteKit 2 + Svelte 5 + Tailwind CSS)

### 5.1 Rutas

**Project-scoped (bajo /[project_id]/):**
- `/[project_id]/comandero` — Pantalla de cuentas activas
- `/[project_id]/comandero/[cuenta_id]` — Pedido de una cuenta
- `/[project_id]/cocina` — Display de cocina fullscreen dark
- `/[project_id]/menu-generator` — Pipeline de generacion de menus
- `/[project_id]/facturas` — Gestion de facturas
- `/[project_id]/chat` — Chat con contexto de proyecto

**Globales:**
- `/` — Home (LazyShell)
- `/chat` — Chat standalone
- `/facturas` — Facturas (legacy, redirige a proyecto activo)
- `/comandero` — Comandero (legacy, redirige)
- `/menu-generator` — Menu generator (legacy, redirige)
- `/staff` — Gestion de personal

### 5.2 Stores (21 archivos en frontend/src/lib/stores/)

| Store | Funcion |
|-------|---------|
| chat.ts | Estado del chat, envio de mensajes con pageContext |
| cocina.ts | Store de cocina con MQTT subscriptions, optimistic updates, sonido |
| comandero.ts | Estado del comandero |
| cuentas.ts | Estado de cuentas con maquina de estados |
| credentials.ts | Credenciales (8 providers espejados del backend) |
| facturas.ts | Estado de facturas |
| impresion.ts | Estado de impresion |
| menu-generator.ts | Estado del menu generator |
| page-context.ts | Patron reutilizable: contexto de pagina para chat contextual |
| projects.ts | Proyectos y proyecto activo |
| workspace.ts | Estado del workspace |
| ui.ts | Estado UI general |
| theme.ts | Tema visual |
| staff.ts | Gestion de personal |
| persistence.ts | Persistencia local |
| conversations.ts | Conversaciones |
| prompts.ts | Prompts disponibles |
| files.ts | Archivos |
| attachments.ts | Adjuntos |
| html-preview.ts | Preview HTML |
| index.ts | Re-exports |

### 5.3 Patron page-context

Patron central reutilizable que conecta UI y chat contextual:

```
1. +page.svelte → setPageContext({ route, title, description, instructions, state })
2. Panel completa accion → updatePageState('key', value)
3. Usuario envia mensaje → chat.ts captura getPageContextSnapshot()
4. chat-ai-bridge → prompt-composer con page_context
5. prompt-composer → ## Page Context en system prompt
6. LLM recibe contexto de la pagina → usa tools informadamente
7. onDestroy → clearPageContext()
```

Primera implementacion: menu-generator (10 tools + 5 paneles).
Siguientes: comandero, cocina, facturacion.

---

## 6. HANDLERS (Sistema de Orquestacion)

### 6.1 Estructura

```
handlers/
├── global/              # Sin project_id, credenciales GLOBAL
│   ├── telegram-url-extractor.js
│   └── archived/
└── projects/
    └── facturas-nonina/ # project_id=facturas-nonina, credenciales PROJECT_facturas-nonina
        └── (handlers de procesamiento de facturas)
```

### 6.2 Contexto del Handler

```javascript
module.exports = {
  name: 'mi-handler',
  trigger: 'evento.recibido',
  filter: (event) => event.data?.tipo === 'pdf',
  async handle(event, { services, logger, emit, config, store, projectId }) {
    const data = event.data || event;  // CRITICO: EventBus envuelve en .data
    // services.call('provider', 'action', params)
    // emit('evento.procesado', { ...data, resultado })
    // await store.set('key', value)
  }
};
```

### 6.3 Encadenamiento via emit()

Los handlers se conectan entre si emitiendo eventos:
```
telegram.document.received → recibir-documento
    → emit('documento.recibido')
        → procesar-ocr → emit('texto.extraido')
            → extraer-datos → emit('factura.procesada')
```

---

## 7. SISTEMA DE PLUGINS

```
plugins/
├── github/     # Integracion GitHub
├── http-utils/ # Utilidades HTTP
├── ocr/        # Procesamiento OCR
├── slack/      # Integracion Slack
└── weather/    # API del tiempo
```

Los plugins son JSON que el `plugin-manager` carga y el `calling-generator` convierte en funciones JS ejecutables.

---

## 8. DISCREPANCIAS CONTEXTO vs CODIGO REAL

### 8.1 Modulos que existen en codigo pero NO en INVENTARIO-SISTEMA.json

| Modulo | Existe en codigo | En INVENTARIO |
|--------|-----------------|---------------|
| security-p2p | Si | No |
| staff-manager | Si | No |
| carta-impresion | Si | No |
| composition-manager | Si | No en lista principal |
| context-manager | Si | No en lista principal |
| database-manager | Si | No en lista principal |
| agent-manager | Si | No en lista principal |
| chat-ai-bridge | Si | No en lista principal |
| chat-session | Si | No en lista principal |
| code-executor | Si | No en lista principal |
| prompt-composer | Si | No en lista principal |
| scheduler | Si | No en lista principal |
| persistencia-comandero | Si | No en lista principal |

### 8.2 INVENTARIO-SISTEMA.json tiene estructura diferente

El INVENTARIO organiza modulos en `principales` (modules/) y `negocio_restaurante` (otros-modulos/modules/), pero la realidad es:
- **No existe** `otros-modulos/modules/` como directorio separado
- Los modulos de restaurante estan en `modules/pizzepos/`
- El INVENTARIO lista solo 13 modulos principales + 11 de restaurante = 24, pero hay **46 reales**

### 8.3 Conteo de modulos en contexto/modules.json vs realidad

- **contexto/modules.json dice:** 30 core + 13 pizzepos = 43 total, 37 activos
- **Realidad:** 32 core + 14 pizzepos = 46 total, ~40 activos
- **Diferencia:** +3 core (security-p2p, staff-manager, no contados) y +1 pizzepos (carta-impresion)

### 8.4 Discovery NO integrado en startup

- `core/discovery/` tiene codigo completo para descubrimiento multi-core
- **NO esta** instanciado en index.js
- contexto/mejoras-pendientes.json lo documenta como pendiente
- Implicacion: el sistema NO puede descubrir otros cores automaticamente

### 8.5 FlowEngine es legacy

- `core/flow/` existe pero fue reemplazado por el sistema de handlers
- contexto/flow-engine.json lo documenta pero handlers.json dice "reemplaza flow-engine"
- El codigo sigue presente pero no se usa activamente

### 8.6 Version inconsistente

- `package.json`: v0.2.0
- `contexto/index.json`: v0.5.0
- `index.js` banner: v0.1.0
- **Ninguna es autoritativa**

### 8.7 Eventos de cocina desactualizados en INVENTARIO

- INVENTARIO lista: `cocina.item_preparado`, `cocina.pedido_listo`
- Realidad (module.json): tambien tiene `cocina.item_preparando` (nuevo evento del primer tap)

---

## 9. FLUJO DE DATOS PRINCIPAL (Pizzepos)

```
[Frontend Svelte]
    ↓ MQTT ui/request/cuentas/create
[UIRequestHandler]
    ↓ Delega a modulo cuentas
[cuentas] → cuenta.creada (evento)
    ↓
[comandero] ← usuario selecciona productos
    ↓ pedido.item_agregado (evento)
[pedidos] → registra items
    ↓ pedido.enviado_cocina (evento)
[cocina] → muestra en pantalla
    ↓ cocina.item_preparando → cocina.item_preparado
    ↓ cocina.pedido_listo (evento)
[cuentas] → actualiza estado (en_preparacion → listo → para_cobrar)
    ↓
[cobros] → procesa pago (7 metodos)
    ↓ cobro.completado (evento)
[cuentas] → estado = cobrado → cuenta cerrada
```

---

## 10. MEJORAS PENDIENTES (verificadas contra codigo)

### Alta prioridad
| ID | Estado | Descripcion |
|----|--------|-------------|
| anthropic-prompt-caching | pendiente | Cache de system prompt (90% ahorro) |
| ocr-space-provider | pendiente | Alternativa OCR a Tesseract para fotos reales |
| integrar-discovery-startup | pendiente | Integrar Discovery en secuencia de inicio |

### Media prioridad
| ID | Estado | Descripcion |
|----|--------|-------------|
| refactor-ai-gateway | pendiente | Migrar estructurar-deepseek para usar ai-gateway |
| anthropic-extended-thinking | pendiente | Thinking adaptivo para tareas complejas |
| anthropic-code-execution | pendiente | Sandbox de ejecucion de codigo |
| optimizar-listSystems-n1 | pendiente | JOIN en vez de N+1 queries |
| gemini-file-search-rag | pendiente | RAG gestionado de Google |

### Baja prioridad
| ID | Estado | Descripcion |
|----|--------|-------------|
| streaming-nativo-sse | pendiente | Streaming real vs post-hoc actual |
| openai-responses-api | pendiente | Migrar a Responses API |
| groq-compound-models | pendiente | Web search + code execution server-side |
| eliminar-conversation-manager | parcial | Facade eliminada, modulo aun existe (disabled) |

### Implementados recientemente
| ID | Fecha | Descripcion |
|----|-------|-------------|
| pantallas-cocina (fase 1) | 2026-02-26 | Frontend cocina completo con MQTT tiempo real |
| unificar-tool-registries | 2026-02-10 | ToolManager importa de moduleLoader |
| nuevos-providers-groq-gemini | 2026-02-10 | Groq y Gemini en ai-gateway |
| deepseek-reasoning-mode | 2026-02-10 | Chain-of-thought visible |
| fix-tool-calling-anthropic-gemini | 2026-02-11 | Ciclo completo de tools para 6 providers |
| split-project-manager | 2026-02-16 | 3731 → 128 lineas index.js + 12 archivos lib/ |
| chat-context-optimization | 2026-02-10 | Caching system prompt, templates por tipo |

---

## 11. FORTALEZAS DEL SISTEMA

1. **Arquitectura event-driven bien ejecutada** — Todo se comunica via eventos, desacoplamiento real
2. **Module auto-wiring declarativo** — module.json define todo, el loader cablean automaticamente
3. **Sistema de handlers pragmatico** — JavaScript puro, sin abstracciones innecesarias
4. **Patron page-context reutilizable** — Conecta UI y chat sin acoplamiento
5. **AI Gateway multi-provider** — 6 providers con tool calling unificado
6. **Vertical Pizzepos completa** — 14 modulos con flujo end-to-end funcional
7. **35 service providers** — Ecosistema rico de integraciones
8. **Frontend reactivo** — MQTT subscriptions en tiempo real

## 12. DEBILIDADES Y DEUDA TECNICA

1. **Discovery no integrado** — Codigo listo pero no se usa, sistema es single-core de facto
2. **Versiones inconsistentes** — 3 versiones diferentes segun donde mires
3. **FlowEngine legacy** — Codigo muerto en core/flow/
4. **INVENTARIO-SISTEMA.json desactualizado** — Falta 22+ modulos, estructura incorrecta
5. **conversation-manager zombie** — Disabled pero codigo sigue presente
6. **Streaming post-hoc** — No es streaming real, simula con timer
7. **No hay tests actualizados** — package.json referencia tests de modulos que cambiaron
8. **6 modulos disabled sin plan claro** — dashboard, metricas, notas podrian ser utiles
