# Event Core: Arquitectura Multi-Disciplina

## Visión

Event Core como **plataforma central** que puede servir a múltiples disciplinas/verticales de negocio, compartiendo infraestructura pero manteniendo aislamiento total de datos y configuración.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│                         EVENT CORE PLATFORM                                 │
│                                                                             │
│   "Una infraestructura, infinitas posibilidades"                           │
│                                                                             │
│   ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐             │
│   │Hosteler.│ │ Clínica │ │Educación│ │ Legal   │ │Inmobil. │  ...        │
│   └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘             │
│        │           │           │           │           │                   │
│        └───────────┴───────────┴───────────┴───────────┘                   │
│                                │                                            │
│                    ┌───────────▼───────────┐                               │
│                    │   EXECUTION CONTEXT   │                               │
│                    │   (El DNA del evento) │                               │
│                    └───────────────────────┘                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Índice

1. [Modelo de Capas](#modelo-de-capas)
2. [Execution Context Universal](#execution-context-universal)
3. [Aislamiento por Disciplina](#aislamiento-por-disciplina)
4. [Flujo de Resolución de Contexto](#flujo-de-resolución-de-contexto)
5. [Configuración por Disciplina](#configuración-por-disciplina)
6. [Casos de Uso](#casos-de-uso)
7. [Modelo de Negocio](#modelo-de-negocio)
8. [Implementación](#implementación)

---

## Modelo de Capas

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CAPA DE CANALES                                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│  │ Telegram │ │ WhatsApp │ │   Web    │ │   API    │ │  Mobile  │         │
│  │   Bots   │ │   Bots   │ │  Portal  │ │  REST    │ │   Apps   │         │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘         │
│       │            │            │            │            │                │
│       └────────────┴────────────┴─────┬──────┴────────────┘                │
│                                       │                                     │
├───────────────────────────────────────┼─────────────────────────────────────┤
│                           CAPA DE CONTEXTO                                  │
│                                       │                                     │
│                          ┌────────────▼────────────┐                       │
│                          │    CONTEXT RESOLVER     │                       │
│                          │                         │                       │
│                          │  Canal → Disciplina     │                       │
│                          │  Identity → Usuario     │                       │
│                          │  Usuario → Permisos     │                       │
│                          └────────────┬────────────┘                       │
│                                       │                                     │
│                          ┌────────────▼────────────┐                       │
│                          │   EXECUTION CONTEXT     │                       │
│                          │   (Viaja con evento)    │                       │
│                          └────────────┬────────────┘                       │
│                                       │                                     │
├───────────────────────────────────────┼─────────────────────────────────────┤
│                           CAPA DE EVENTOS                                   │
│                                       │                                     │
│                          ┌────────────▼────────────┐                       │
│                          │       EVENT BUS         │                       │
│                          │        (MQTT)           │                       │
│                          └────────────┬────────────┘                       │
│                                       │                                     │
│       ┌───────────────┬───────────────┼───────────────┬───────────────┐    │
│       │               │               │               │               │    │
│       ▼               ▼               ▼               ▼               ▼    │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐  │
│  │   AI    │    │ Filesys │    │Database │    │ Notif.  │    │  Tools  │  │
│  │ Gateway │    │         │    │ Manager │    │         │    │         │  │
│  └─────────┘    └─────────┘    └─────────┘    └─────────┘    └─────────┘  │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                           CAPA DE DATOS                                     │
│                                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│  │ Hostelería  │  │   Clínica   │  │  Educación  │  │    Legal    │       │
│  │     DB      │  │     DB      │  │     DB      │  │     DB      │       │
│  │   Storage   │  │   Storage   │  │   Storage   │  │   Storage   │       │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘       │
│         │                │                │                │               │
│         └────────────────┴────────────────┴────────────────┘               │
│                                   │                                         │
│                          AISLAMIENTO TOTAL                                  │
│                      (No pueden cruzar datos)                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Execution Context Universal

### Estructura Completa

```javascript
/**
 * ExecutionContext - El DNA de cada evento
 *
 * Viaja con TODOS los eventos del sistema.
 * Determina: dónde, quién, qué puede hacer, cómo procesar.
 */
const ExecutionContext = {

  // ═══════════════════════════════════════════════════════════════════
  // NIVEL 1: DISCIPLINA (El más alto - determina el "universo")
  // ═══════════════════════════════════════════════════════════════════
  discipline: {
    id: "hosteleria",                    // Identificador único
    name: "Gestión Hostelería",          // Nombre display

    // Recursos asignados a esta disciplina
    resources: {
      database: "hosteleria_db",         // Base de datos dedicada
      storage_root: "/data/hosteleria",  // Raíz de almacenamiento
      cache_namespace: "host:",          // Namespace en Redis/cache
    },

    // Configuración de AI para esta disciplina
    ai: {
      default_model: "gpt-4",
      system_prompt_path: "disciplines/hosteleria/prompts/assistant.md",
      temperature: 0.7,
      max_tokens: 4000,
      allowed_tools: ["menu-generator", "inventory", "orders", "pos-sync"]
    },

    // Compliance y regulaciones
    compliance: {
      data_retention_days: 365,
      encryption_required: false,
      audit_level: "standard",           // standard | detailed | medical
      gdpr_applicable: true
    }
  },

  // ═══════════════════════════════════════════════════════════════════
  // NIVEL 2: CLIENTE (Dentro de la disciplina)
  // ═══════════════════════════════════════════════════════════════════
  client: {
    id: "restaurante-la-buena-mesa",
    name: "La Buena Mesa",

    // Plan de suscripción
    subscription: {
      plan: "premium",                   // free | basic | premium | enterprise
      ai_tokens_monthly: 100000,
      ai_tokens_used: 45000,
      storage_gb: 50,
      users_max: 20
    },

    // Configuración específica del cliente
    config: {
      locale: "es-ES",
      timezone: "Europe/Madrid",
      currency: "EUR",
      tax_rate: 0.10,

      // Integraciones habilitadas
      integrations: {
        pos: { type: "square", api_key_ref: "cred:pos-square" },
        delivery: ["glovo", "uber-eats"],
        accounting: { type: "holded", api_key_ref: "cred:holded" }
      }
    },

    // Paths específicos
    paths: {
      storage: "/data/hosteleria/clients/la-buena-mesa",
      database_schema: "client_la_buena_mesa"
    }
  },

  // ═══════════════════════════════════════════════════════════════════
  // NIVEL 3: PROYECTO (Opcional - subdivisión del cliente)
  // ═══════════════════════════════════════════════════════════════════
  project: {
    id: "campana-navidad-2024",
    name: "Campaña Menú Navidad 2024",

    paths: {
      storage: "/data/hosteleria/clients/la-buena-mesa/projects/navidad-2024"
    },

    // Configuración específica del proyecto
    config: {
      start_date: "2024-11-01",
      end_date: "2024-12-31",
      budget: 5000
    }
  },

  // ═══════════════════════════════════════════════════════════════════
  // NIVEL 4: IDENTIDAD (Quién ejecuta)
  // ═══════════════════════════════════════════════════════════════════
  identity: {
    // Usuario del sistema
    user: {
      id: "user-carlos-chef",
      email: "carlos@labuenesa.com",
      name: "Carlos García",
      type: "human"                      // human | agent | system | api
    },

    // Roles y permisos
    authorization: {
      roles: ["chef", "menu_manager"],
      permissions: [
        "menu.create",
        "menu.edit",
        "menu.delete",
        "inventory.view",
        "orders.view"
        // NO tiene: "billing.*", "users.*"
      ],

      // Límites específicos
      limits: {
        ai_requests_per_hour: 50,
        file_upload_max_mb: 100
      }
    },

    // Identidad externa (cómo llegó)
    external_identity: {
      type: "telegram",
      id: "tg:123456789",
      username: "@carlos_chef",
      verified: true
    },

    // Sesión actual
    session: {
      id: "sess-abc123",
      started_at: "2024-01-07T10:00:00Z",
      ip: "192.168.1.100",
      user_agent: "Telegram Bot API"
    }
  },

  // ═══════════════════════════════════════════════════════════════════
  // NIVEL 5: CANAL (Por dónde llegó el evento)
  // ═══════════════════════════════════════════════════════════════════
  channel: {
    type: "telegram",                    // telegram | whatsapp | web | api | agent

    // Identificadores del canal
    bot_id: "bot-hosteleria-admin",
    chat_id: "chat-789",
    message_id: "msg-456",

    // Conversación (si aplica)
    conversation: {
      id: "conv-xyz",
      started_at: "2024-01-07T09:30:00Z",
      messages_count: 15
    }
  },

  // ═══════════════════════════════════════════════════════════════════
  // NIVEL 6: TRAZABILIDAD
  // ═══════════════════════════════════════════════════════════════════
  trace: {
    // IDs de correlación
    correlation_id: "corr-main-123",     // ID principal de la operación
    causation_id: "evt-parent-456",      // Evento que causó este

    // OpenTelemetry compatible
    trace_id: "trace-abc",
    span_id: "span-xyz",
    parent_span_id: "span-parent",

    // Timestamps
    initiated_at: "2024-01-07T10:30:00.000Z",

    // Cadena de eventos (para debugging)
    event_chain: [
      "telegram.message.received",
      "context.resolved",
      "ai.chat.request"
      // ... el evento actual se añade al procesar
    ]
  },

  // ═══════════════════════════════════════════════════════════════════
  // NIVEL 7: RUNTIME (Información del procesamiento)
  // ═══════════════════════════════════════════════════════════════════
  runtime: {
    // Dónde se está procesando
    node_id: "core-node-1",
    environment: "production",           // production | staging | development

    // Feature flags activos
    features: {
      new_menu_ui: true,
      beta_ai_model: false
    },

    // Quotas en tiempo real
    quotas: {
      ai_tokens_remaining: 55000,
      api_calls_remaining: 9500
    }
  }
};
```

### Versión Compacta (Para Transmisión)

```javascript
/**
 * Versión compacta del contexto para minimizar tamaño en MQTT
 * Se expande al recibir usando el ContextRegistry
 */
const CompactContext = {
  // IDs que se expanden via lookup
  d: "hosteleria",              // discipline_id
  c: "rest-buena-mesa",         // client_id
  p: "navidad-2024",            // project_id (opcional)
  u: "user-carlos",             // user_id

  // Siempre inline (cambia por request)
  ch: {                         // channel
    t: "tg",                    // type: telegram
    b: "bot-host-admin",        // bot_id
    m: "msg-456"                // message_id
  },

  // Trace (siempre inline)
  tr: {
    co: "corr-123",             // correlation_id
    ca: "evt-456"               // causation_id
  }
};

// El receptor expande:
const fullContext = await contextRegistry.expand(compactContext);
```

---

## Aislamiento por Disciplina

### Base de Datos

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DATABASE ISOLATION                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Opción A: Bases de datos separadas (Máximo aislamiento)                   │
│  ════════════════════════════════════════════════════                      │
│                                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                     │
│  │ hosteleria   │  │   clinica    │  │  educacion   │                     │
│  │    .db       │  │     .db      │  │     .db      │                     │
│  │              │  │              │  │              │                     │
│  │ - menus      │  │ - patients   │  │ - courses    │                     │
│  │ - orders     │  │ - records    │  │ - students   │                     │
│  │ - inventory  │  │ - appoint.   │  │ - exams      │                     │
│  └──────────────┘  └──────────────┘  └──────────────┘                     │
│                                                                             │
│  Opción B: Schemas separados (Balance)                                     │
│  ════════════════════════════════════════════════════                      │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        eventcore.db                                  │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │   │
│  │  │   schema:   │  │   schema:   │  │   schema:   │                 │   │
│  │  │ hosteleria  │  │   clinica   │  │  educacion  │                 │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Opción C: Tenant ID en cada tabla (Mínimo aislamiento)                   │
│  ════════════════════════════════════════════════════                      │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  tabla: documents                                                    │   │
│  │  ┌────────────┬───────────────┬──────────────────┬─────────────┐   │   │
│  │  │ id         │ discipline_id │ client_id        │ data        │   │   │
│  │  ├────────────┼───────────────┼──────────────────┼─────────────┤   │   │
│  │  │ 1          │ hosteleria    │ rest-buena-mesa  │ {...}       │   │   │
│  │  │ 2          │ clinica       │ clinica-salud    │ {...}       │   │   │
│  │  │ 3          │ educacion     │ academia-xyz     │ {...}       │   │   │
│  │  └────────────┴───────────────┴──────────────────┴─────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  RECOMENDACIÓN: Opción A para datos sensibles (clínica)                   │
│                 Opción B para la mayoría                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Storage (Filesystem)

```
/data/
├── disciplines/
│   ├── hosteleria/
│   │   ├── _shared/                    # Recursos compartidos de la disciplina
│   │   │   ├── prompts/
│   │   │   ├── templates/
│   │   │   └── assets/
│   │   │
│   │   └── clients/
│   │       ├── restaurante-buena-mesa/
│   │       │   ├── menus/
│   │       │   ├── images/
│   │       │   ├── invoices/
│   │       │   └── projects/
│   │       │       └── navidad-2024/
│   │       │
│   │       └── restaurante-el-rincón/
│   │           └── ...
│   │
│   ├── clinica/
│   │   ├── _shared/
│   │   └── clients/
│   │       └── clinica-salud-total/
│   │           ├── patients/           # ENCRIPTADO
│   │           ├── records/            # ENCRIPTADO
│   │           └── appointments/
│   │
│   └── educacion/
│       ├── _shared/
│       │   └── course-templates/
│       └── clients/
│           └── academia-aprende/
│               ├── courses/
│               ├── exams/
│               └── certificates/
│
└── _platform/                          # Datos de la plataforma
    ├── logs/
    ├── metrics/
    └── backups/
```

### Resolución de Path con Contexto

```javascript
// modules/filesystem/index.js

class FilesystemModule {

  /**
   * Resuelve el path real basándose en el contexto del evento
   */
  resolvePath(relativePath, context) {
    const { discipline, client, project } = context;

    // Construir path base
    let basePath = `/data/disciplines/${discipline.id}`;

    // Si es recurso compartido de la disciplina
    if (relativePath.startsWith('_shared/')) {
      return path.join(basePath, relativePath);
    }

    // Path del cliente
    basePath = path.join(basePath, 'clients', client.id);

    // Si hay proyecto activo
    if (project?.id) {
      basePath = path.join(basePath, 'projects', project.id);
    }

    return path.join(basePath, relativePath);
  }

  /**
   * Handler de fs.write.request CON CONTEXTO
   */
  async onWriteRequest(event) {
    const { path: relativePath, content } = event.data;
    const context = event.context;

    // Validar que tiene contexto
    if (!context?.discipline || !context?.client) {
      throw new Error('Missing required context for filesystem operation');
    }

    // Verificar permisos
    if (!this.hasPermission(context, 'file.write')) {
      throw new Error('Permission denied: file.write');
    }

    // Resolver path real
    const fullPath = this.resolvePath(relativePath, context);

    // Verificar que no escapa del sandbox
    this.validatePathInSandbox(fullPath, context);

    // Escribir
    await fs.writeFile(fullPath, content);

    // Log con contexto completo (auditoría)
    this.logger.info('file.written', {
      path: fullPath,
      discipline: context.discipline.id,
      client: context.client.id,
      user: context.identity.user.id,
      correlation_id: context.trace.correlation_id
    });

    return { success: true, path: fullPath };
  }
}
```

---

## Flujo de Resolución de Contexto

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FLUJO: Mensaje de Telegram                               │
└─────────────────────────────────────────────────────────────────────────────┘

     Telegram                                                    Event Core
        │                                                            │
        │  POST /webhook/telegram-bot-hosteleria                    │
        │ ─────────────────────────────────────────────────────────►│
        │  {                                                         │
        │    "message": {                                            │
        │      "from": { "id": 123456789 },                         │
        │      "chat": { "id": -987654321 },                        │
        │      "text": "Genera menú del día"                        │
        │    }                                                       │
        │  }                                                         │
        │                                                            │
        │                                    ┌───────────────────────┤
        │                                    │   1. IDENTIFICAR BOT  │
        │                                    │                       │
        │                                    │   URL contiene:       │
        │                                    │   "telegram-bot-      │
        │                                    │    hosteleria"        │
        │                                    │                       │
        │                                    │   → discipline:       │
        │                                    │     hosteleria        │
        │                                    └───────────────────────┤
        │                                                            │
        │                                    ┌───────────────────────┤
        │                                    │  2. RESOLVER USUARIO  │
        │                                    │                       │
        │                                    │  telegram_id: 123456  │
        │                                    │        ↓              │
        │                                    │  SELECT * FROM        │
        │                                    │  user_identities      │
        │                                    │  WHERE type='telegram'│
        │                                    │  AND external_id=...  │
        │                                    │        ↓              │
        │                                    │  user_id: "carlos"    │
        │                                    │  client_id: "rest-x"  │
        │                                    └───────────────────────┤
        │                                                            │
        │                                    ┌───────────────────────┤
        │                                    │  3. CARGAR CONTEXTO   │
        │                                    │                       │
        │                                    │  discipline.config    │
        │                                    │  client.config        │
        │                                    │  user.permissions     │
        │                                    │  channel.conversation │
        │                                    └───────────────────────┤
        │                                                            │
        │                                    ┌───────────────────────┤
        │                                    │  4. EMITIR EVENTO     │
        │                                    │     CON CONTEXTO      │
        │                                    │                       │
        │                                    │  telegram.message     │
        │                                    │  .received {          │
        │                                    │    data: {...},       │
        │                                    │    context: {         │
        │                                    │      discipline,      │
        │                                    │      client,          │
        │                                    │      identity,        │
        │                                    │      channel,         │
        │                                    │      trace            │
        │                                    │    }                  │
        │                                    │  }                    │
        │                                    └───────────────────────┤
        │                                                            │
        │                                            │               │
        │                                            ▼               │
        │                                    ┌───────────────┐       │
        │                                    │  AI Gateway   │       │
        │                                    │               │       │
        │                                    │ Lee contexto: │       │
        │                                    │ - Qué modelo  │       │
        │                                    │ - Qué prompt  │       │
        │                                    │ - Qué tools   │       │
        │                                    └───────┬───────┘       │
        │                                            │               │
        │                                            ▼               │
        │                                    ┌───────────────┐       │
        │                                    │  Filesystem   │       │
        │                                    │               │       │
        │                                    │ Lee contexto: │       │
        │                                    │ - Dónde       │       │
        │                                    │   guardar     │       │
        │                                    └───────────────┘       │
        │                                                            │
```

---

## Configuración por Disciplina

### Archivo de Definición de Disciplina

```yaml
# disciplines/hosteleria/discipline.yaml

id: hosteleria
name: Gestión Hostelería
description: Plataforma para restaurantes, bares y servicios de comida

# Recursos
resources:
  database:
    type: sqlite  # sqlite | postgres | mysql
    name: hosteleria_db
    path: /data/disciplines/hosteleria/db/main.db

  storage:
    root: /data/disciplines/hosteleria
    max_per_client_gb: 50

  cache:
    namespace: "host:"
    ttl_default: 3600

# Configuración de AI
ai:
  default_model: gpt-4
  fallback_model: gpt-3.5-turbo

  system_prompt: |
    Eres un asistente especializado en gestión de restaurantes.
    Ayudas con: menús, inventario, pedidos, y gestión general.
    Siempre respondes en el idioma del usuario.

  temperature: 0.7
  max_tokens: 4000

  # Herramientas disponibles para esta disciplina
  tools:
    - menu_generator
    - inventory_check
    - order_create
    - pos_sync
    - delivery_publish
    - supplier_contact

# Compliance
compliance:
  data_retention_days: 365
  audit_level: standard
  encryption: optional
  gdpr: true

# Integraciones disponibles
integrations:
  - name: square_pos
    type: pos
    required: false
  - name: glovo
    type: delivery
    required: false
  - name: uber_eats
    type: delivery
    required: false

# Planes de suscripción
plans:
  free:
    ai_tokens_monthly: 10000
    storage_gb: 1
    users_max: 2
    integrations: []

  basic:
    ai_tokens_monthly: 50000
    storage_gb: 10
    users_max: 5
    integrations: [pos]
    price_monthly: 29

  premium:
    ai_tokens_monthly: 200000
    storage_gb: 50
    users_max: 20
    integrations: [pos, delivery, accounting]
    price_monthly: 99

  enterprise:
    ai_tokens_monthly: unlimited
    storage_gb: 500
    users_max: unlimited
    integrations: all
    price_monthly: custom

# Canales
channels:
  telegram:
    bots:
      - id: bot-hosteleria-orders
        name: "Pedidos Hostelería"
        purpose: customer_orders
      - id: bot-hosteleria-admin
        name: "Admin Hostelería"
        purpose: staff_management

  whatsapp:
    enabled: true

  web:
    portal_url: https://hosteleria.eventcore.io
```

### Carga de Disciplinas

```javascript
// modules/discipline-manager/index.js

class DisciplineManager {

  async loadDisciplines() {
    const disciplinesPath = '/config/disciplines';
    const dirs = await fs.readdir(disciplinesPath);

    for (const dir of dirs) {
      const configPath = path.join(disciplinesPath, dir, 'discipline.yaml');

      if (await fs.exists(configPath)) {
        const config = yaml.parse(await fs.readFile(configPath, 'utf8'));

        this.disciplines.set(config.id, {
          ...config,
          loaded_at: new Date()
        });

        this.logger.info('discipline.loaded', {
          id: config.id,
          name: config.name,
          plans: Object.keys(config.plans)
        });
      }
    }
  }

  getDisciplineConfig(disciplineId) {
    return this.disciplines.get(disciplineId);
  }

  getAIConfigForDiscipline(disciplineId) {
    const discipline = this.disciplines.get(disciplineId);
    return discipline?.ai || null;
  }

  getToolsForDiscipline(disciplineId) {
    const discipline = this.disciplines.get(disciplineId);
    return discipline?.ai?.tools || [];
  }
}
```

---

## Casos de Uso

### Caso 1: Mismo Comando, Diferente Disciplina

```javascript
// Usuario en Telegram escribe: "Genera un informe"

// ═══ HOSTELERÍA ═══
// Bot: bot-hosteleria-admin
// Contexto resuelto: discipline=hosteleria, client=restaurante-x

ai.chat.request {
  data: { prompt: "Genera un informe" },
  context: {
    discipline: { id: "hosteleria", ai: { tools: ["sales_report", "inventory_report"] } },
    client: { id: "restaurante-x" }
  }
}

// AI interpreta: "Informe de ventas del restaurante"
// Genera: PDF con ventas, platos más vendidos, inventario bajo


// ═══ CLÍNICA ═══
// Bot: bot-clinica-admin
// Contexto resuelto: discipline=clinica, client=clinica-salud

ai.chat.request {
  data: { prompt: "Genera un informe" },
  context: {
    discipline: { id: "clinica", ai: { tools: ["patient_stats", "appointment_report"] } },
    client: { id: "clinica-salud" }
  }
}

// AI interpreta: "Informe de pacientes/citas"
// Genera: PDF con estadísticas de pacientes, citas pendientes (ANONIMIZADO)


// ═══ EDUCACIÓN ═══
// Bot: bot-educacion-tutor
// Contexto resuelto: discipline=educacion, client=academia-xyz

ai.chat.request {
  data: { prompt: "Genera un informe" },
  context: {
    discipline: { id: "educacion", ai: { tools: ["student_progress", "course_stats"] } },
    client: { id: "academia-xyz" }
  }
}

// AI interpreta: "Informe de progreso de alumnos"
// Genera: PDF con notas, asistencia, cursos completados
```

### Caso 2: Aislamiento de Datos

```javascript
// Un usuario malintencionado intenta acceder a datos de otra disciplina

fs.read.request {
  data: { path: "../../clinica/clients/clinica-x/patients/data.json" },
  context: {
    discipline: { id: "hosteleria" },
    client: { id: "restaurante-y" }
  }
}

// Filesystem recibe y valida:
const fullPath = this.resolvePath(data.path, context);
// fullPath = "/data/disciplines/hosteleria/clients/restaurante-y/../../clinica/..."

this.validatePathInSandbox(fullPath, context);
// ❌ ERROR: Path escapa del sandbox de hosteleria
// throw new Error('Access denied: path outside discipline sandbox');
```

### Caso 3: Facturación Multi-Disciplina

```javascript
// Sistema de billing consulta uso por disciplina

const usage = await billingService.getUsageReport('2024-01');

// Resultado:
{
  period: "2024-01",
  disciplines: {
    hosteleria: {
      clients: 45,
      total_ai_tokens: 2_500_000,
      total_storage_gb: 120,
      revenue: 4500  // 45 clients * avg $100
    },
    clinica: {
      clients: 12,
      total_ai_tokens: 800_000,
      total_storage_gb: 45,
      revenue: 2400  // Premium plans
    },
    educacion: {
      clients: 8,
      total_ai_tokens: 1_200_000,
      total_storage_gb: 200,  // Mucho contenido de cursos
      revenue: 1600
    }
  },
  total_revenue: 8500
}
```

---

## Modelo de Negocio

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MODELO DE NEGOCIO                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  NIVEL 1: Platform Fee (Event Core)                                        │
│  ══════════════════════════════════                                        │
│  • Tú operas la plataforma                                                 │
│  • Cobras por uso de infraestructura                                       │
│  • Disciplinas pueden ser tuyas o de partners                              │
│                                                                             │
│  NIVEL 2: Discipline Fee                                                   │
│  ═══════════════════════                                                   │
│  • Cada disciplina puede tener su modelo:                                  │
│    - Hostelería: €29-99/mes por restaurante                               │
│    - Clínica: €199/mes por clínica (más regulado)                         │
│    - Educación: €5/alumno/mes                                              │
│                                                                             │
│  NIVEL 3: Usage-Based                                                      │
│  ════════════════════                                                      │
│  • AI tokens: €0.01 por 1000 tokens                                        │
│  • Storage: €0.10 por GB/mes                                               │
│  • API calls: €0.001 por llamada                                           │
│                                                                             │
│  NIVEL 4: Marketplace                                                      │
│  ════════════════════                                                      │
│  • Integraciones premium                                                   │
│  • Templates de disciplinas                                                │
│  • Plugins y extensiones                                                   │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  EJEMPLO: 100 clientes distribuidos                                        │
│                                                                             │
│  Hostelería: 50 restaurantes × €50/mes avg    = €2,500/mes                │
│  Clínica:    10 clínicas × €199/mes           = €1,990/mes                │
│  Educación:  5 academias × 200 alumnos × €5   = €5,000/mes                │
│  Legal:      15 bufetes × €99/mes             = €1,485/mes                │
│  Otros:      20 clientes × €30/mes            = €600/mes                  │
│                                                                             │
│  TOTAL: ~€11,575/mes = ~€139,000/año                                      │
│                                                                             │
│  Costos infra (AI, servers, etc): ~€2,000/mes                             │
│  Margen: ~€9,500/mes                                                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Implementación

### Fase 1: Fundación (Semanas 1-2)

```
□ Extender EventEnvelope con campo 'context'
□ Crear módulo ContextResolver
□ Crear módulo DisciplineManager
□ Definir schema de base de datos para multi-tenancy
□ Tests unitarios
```

### Fase 2: Primera Disciplina (Semanas 3-4)

```
□ Migrar hostelería como primera disciplina
□ Crear discipline.yaml para hostelería
□ Adaptar filesystem para leer contexto
□ Adaptar AI gateway para leer contexto
□ Tests de integración
```

### Fase 3: Puntos de Entrada (Semanas 5-6)

```
□ Telegram service: resolver contexto al recibir
□ HTTP gateway: resolver contexto de API calls
□ Chat UI: propagar contexto existente
□ Tests end-to-end
```

### Fase 4: Expansión (Semanas 7+)

```
□ Añadir segunda disciplina (clínica o educación)
□ Sistema de billing por disciplina
□ Panel de administración multi-disciplina
□ Documentación para crear nuevas disciplinas
```

---

## Conclusión

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  EVENT CORE + CONTEXTO + DISCIPLINAS = PLATAFORMA ESCALABLE                │
│                                                                             │
│  ✅ Una infraestructura, múltiples negocios                                │
│  ✅ Aislamiento total de datos                                             │
│  ✅ Configuración específica por vertical                                  │
│  ✅ Modelo de negocio flexible                                             │
│  ✅ Escalable horizontalmente                                              │
│  ✅ Auditable y compliant                                                  │
│                                                                             │
│  El CONTEXTO es la pieza que hace posible que UN sistema                   │
│  sirva a MUCHOS sin comprometer seguridad ni funcionalidad.                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```
