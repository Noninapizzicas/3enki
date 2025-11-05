# Definición Completa del Event Core

**Documento de Diseño Arquitectónico Completo**
**Versión:** 1.0.0
**Fecha:** 2025-10-06
**Autor:** Conversación Claude + Usuario

---

## 📋 Tabla de Contenidos

1. [Visión y Contexto](#visión-y-contexto)
2. [Arquitectura Fractal](#arquitectura-fractal)
3. [Protocolo MQTT](#protocolo-mqtt)
4. [Sistema de Módulos](#sistema-de-módulos)
5. [Comunicación y APIs](#comunicación-y-apis)
6. [Discovery y Registry](#discovery-y-registry)
7. [Observabilidad](#observabilidad)
8. [Schemas y Contratos](#schemas-y-contratos)
9. [Stack Técnico](#stack-técnico)
10. [Implementación Completa](#implementación-completa)
11. [Decisiones de Diseño](#decisiones-de-diseño)

---

## 1. Visión y Contexto

### 1.1 Origen del Proyecto

Este proyecto nace de la necesidad de crear un sistema fundamentalmente diferente a los frameworks event-driven tradicionales (NestJS, Moleculer, EventEmitter2). No es simplemente un framework más, sino una **arquitectura base recursiva y composable**.

### 1.2 La Metáfora: "Cimientos de una Casa"

La visión central es construir **un core de cores** - una estructura diseñada como si fueran los cimientos de una casa que se pueden convertir en:

- **Una casa** → Proyecto simple, proceso standalone
- **Un rascacielos** → Sistema modular complejo en una sola máquina
- **Una manzana de rascacielos** → Múltiples servicios/cores comunicándose entre sí

Es una **arquitectura fractal**: la misma estructura base sirve independientemente de la escala.

### 1.3 Diferenciación Fundamental

**Lo que hace este core único:**

1. **No es solo un framework event-driven** - Es una meta-arquitectura recursiva
2. **Diseñado desde día 1 para escalar** - De 1 core → N cores distribuidos con el mismo código
3. **Los cimientos son los mismos** - Independientemente de la escala (1 proceso o 1000 cores)
4. **Event-driven 100%** - Todo es un evento, no hay excepciones
5. **Zero dependencias filosófico** - Solo lo esencial, sin bloat
6. **IA como ciudadano de primera clase** - No es un add-on, está integrado en el core

### 1.4 Propósito y Uso Personal

Este sistema está pensado para:
- **Uso personal inicialmente** - No esperar estructura típica ni enfoque estándar
- **Base para múltiples proyectos modulares** - Crear el core una vez, reutilizar 100 veces
- **Solucionar problemas de la vida real** - Los módulos ayudarán a resolver problemas concretos
- **Integrar IA en los flujos de software** - Para realizar tareas específicas o toma de decisiones

### 1.5 Filosofía: "Implementación a Full desde el Principio"

**NO creemos en MVPs ni medias tintas.**

Cuando se implementa algo, se implementa completo. Nada de "feature mínima viable" que luego hay que refactorizar. Cada componente se diseña y construye completo desde el inicio.

Esto significa:
- Core v0.1.0 incluye TODO (broker, módulos, discovery, observabilidad, CLI)
- No se cortan esquinas
- No se dejan "TODOs" para después
- Calidad desde el primer commit

---

## 2. Arquitectura Fractal

### 2.1 Concepto de Fractal Arquitectónico

El core funciona como una estructura fractal donde:
- Un **core** puede contener **módulos**
- Un **módulo** puede ser un **core** embebido
- Múltiples **cores** pueden comunicarse como **peers**
- La **topología** puede escalar sin cambiar el código

### 2.2 Escalabilidad en Tres Niveles

#### **Nivel 1: Single-Core Modular (Casa)**

```
┌─────────────────────────────────────┐
│           CORE A                     │
│                                     │
│  ┌─────────┐  ┌─────────┐          │
│  │ Module  │  │ Module  │          │
│  │  Echo   │  │ Watcher │          │
│  └─────────┘  └─────────┘          │
│                                     │
│  Event Bus Local (EventEmitter)    │
│  MQTT Broker Embebido (Aedes)      │
└─────────────────────────────────────┘
```

**Características:**
- Un solo proceso Node.js
- Módulos se comunican vía EventEmitter local
- MQTT broker embebido para preparar distribución
- Perfecto para CLIs, automatizaciones, desarrollo

**Complejidad:** ⭐️ (baja)

---

#### **Nivel 2: Multi-Core Local (Rascacielos)**

```
┌─────────────────────────────────────────────────┐
│              Misma Máquina                      │
│                                                 │
│  ┌──────────────┐    ┌──────────────┐         │
│  │   CORE A     │    │   CORE B     │         │
│  │              │    │              │         │
│  │  Modules:    │    │  Modules:    │         │
│  │  - echo      │    │  - ai-gw     │         │
│  │  - watcher   │    │  - analyzer  │         │
│  └──────┬───────┘    └──────┬───────┘         │
│         │                   │                  │
│         └─────────┬─────────┘                  │
│                   │                            │
│      ┌────────────▼──────────────┐            │
│      │  MQTT Broker (Aedes)      │            │
│      │  localhost:1883           │            │
│      └───────────────────────────┘            │
└─────────────────────────────────────────────────┘
```

**Características:**
- Múltiples procesos Node.js en una máquina
- Comunicación vía MQTT (IPC/localhost)
- Discovery automático vía filesystem o retained messages
- Hot-reload sin downtime
- Aprovechar múltiples CPUs

**Complejidad:** ⭐️⭐️⭐️ (media)

---

#### **Nivel 3: Multi-Core Distribuido (Manzana de Rascacielos)**

```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Termux     │      │   Laptop     │      │   Server     │
│   Android    │      │   Linux      │      │   Cloud      │
│              │      │              │      │              │
│  ┌────────┐  │      │  ┌────────┐  │      │  ┌────────┐  │
│  │ Core A │  │◄────►│  │ Core B │  │◄────►│  │ Core C │  │
│  └────────┘  │      │  └────────┘  │      │  └────────┘  │
│              │      │              │      │              │
└──────────────┘      └──────────────┘      └──────────────┘
         │                    │                     │
         └────────────────────┼─────────────────────┘
                              │
                   ┌──────────▼──────────┐
                   │  MQTT Broker        │
                   │  (Mosquitto Cloud)  │
                   │  mqtt://broker:1883 │
                   └─────────────────────┘
```

**Características:**
- Cores en diferentes máquinas/ubicaciones
- Comunicación vía MQTT sobre red (TCP/TLS)
- Discovery vía MQTT retained messages
- Service mesh natural
- Alta disponibilidad, redundancia
- Escalabilidad horizontal ilimitada

**Complejidad:** ⭐️⭐️⭐️⭐️⭐️ (muy alta)

---

### 2.3 Composabilidad Recursiva

Un core puede contener otros cores:

```javascript
// Core padre
const parentCore = new Core({ id: 'parent' });

// Core hijo (embebido)
const childCore = new Core({ id: 'child', parent: parentCore });

// El core hijo puede tener sus propios módulos
childCore.loadModule('./modules/specialized');

// Eventos del hijo se propagan al padre (opcional)
childCore.on('event.*', (event) => {
  parentCore.emit(`child.${event.type}`, event.data);
});
```

**Esto permite:**
- Módulos complejos que son cores completos
- Aislamiento de contextos
- Delegación de responsabilidades
- Topologías arbitrariamente complejas

---

## 3. Protocolo MQTT

### 3.1 ¿Por Qué MQTT?

MQTT fue identificado como la **pieza clave** que resuelve todos los escollos de comunicación distribuida.

**MQTT proporciona automáticamente:**

✅ **Pub/Sub nativo** - Diseñado exactamente para event-driven
✅ **Topic wildcards** - Suscripciones flexibles (`file/+/created`, `core/*/events`)
✅ **QoS levels** - Control fino de delivery guarantees
✅ **Retained messages** - Discovery automático
✅ **Last Will & Testament** - Detección de failures sin polling
✅ **Ligero** - Perfecto para Termux, bajo overhead
✅ **Broker centralizado O embebido** - Flexibilidad total
✅ **Mismo código local y distribuido** - Solo cambia URL del broker

### 3.2 Decisión de Broker: Híbrido Aedes + Mosquitto

**Estrategia elegida:** Broker embebido con fallback a externo

```javascript
class Core {
  async initMQTT() {
    try {
      // Intenta conectar a broker externo (si existe)
      this.mqtt = await mqtt.connectAsync('mqtt://localhost:1883', {
        timeout: 2000
      });
      console.log('✓ Connected to external MQTT broker');
    } catch {
      // Fallback: levanta broker embebido
      console.log('⚡ Starting embedded MQTT broker (Aedes)');
      this.broker = await this.startEmbeddedBroker();
      this.mqtt = await mqtt.connectAsync('mqtt://localhost:1883');
    }
  }

  async startEmbeddedBroker() {
    const aedes = require('aedes')();
    const server = require('net').createServer(aedes.handle);

    return new Promise((resolve) => {
      server.listen(1883, () => {
        console.log('Aedes MQTT broker started on port 1883');
        resolve(aedes);
      });
    });
  }
}
```

**Ventajas de este enfoque:**

1. **Zero setup** - Funciona out-of-the-box sin instalar nada
2. **Termux-friendly** - No requiere permisos root ni pkg install
3. **Evolutivo** - Puedes usar Mosquitto externo después para producción
4. **Resiliente** - Si no hay broker disponible, el core lo crea automáticamente
5. **Desarrollo rápido** - No necesitas levantar infraestructura para empezar
6. **Producción lista** - Cuando crece, solo cambias URL a broker dedicado

### 3.3 Topic Structure (Convención Estricta)

**Estructura jerárquica obligatoria:**

```
core/{core-id}/{tipo}/{dominio}/{acción}/{detalles}
```

#### **Eventos (Event Publishing)**

```
core/a/events/file/created
core/a/events/file/modified
core/a/events/file/deleted
core/a/events/ai/request/analyze
core/a/events/ai/response/analyze
core/a/events/module/loaded/echo
core/a/events/module/unloaded/echo
core/a/events/error/validation/schema-mismatch
```

**Patrón:** `core/{core-id}/events/{domain}/{action}/{subaction?}`

---

#### **APIs (Request-Reply Pattern)**

```
core/a/api/request/analyze/uuid-1234
core/a/api/response/analyze/uuid-1234
core/b/api/request/transform/uuid-5678
core/b/api/response/transform/uuid-5678
```

**Patrón:** `core/{core-id}/api/{request|response}/{service}/{requestId}`

---

#### **Control y Discovery**

```
core/a/status              (retained - estado actual del core)
core/a/capabilities        (retained - APIs y suscripciones)
core/a/heartbeat           (periódico - health check)
core/a/modules/loaded      (retained - módulos cargados)
```

**Patrón:** `core/{core-id}/{metadata-type}`

---

#### **Telemetría y Observabilidad**

```
core/a/logs/error
core/a/logs/warn
core/a/logs/info
core/a/logs/debug
core/a/metrics/cpu
core/a/metrics/memory
core/a/metrics/events-per-second
core/a/traces/{trace-id}
```

**Patrón:** `core/{core-id}/{telemetry-type}/{level|metric-name}`

---

#### **Wildcards Comunes**

```javascript
// Todos los eventos de todos los cores
'core/+/events/#'

// Eventos de file.* de todos los cores
'core/+/events/file/#'

// Todos los eventos de core-a
'core/a/events/#'

// Status de todos los cores (discovery)
'core/+/status'

// Todos los errores de todos los cores
'core/+/events/error/#'
'core/+/logs/error'

// Heartbeats de todos los cores
'core/+/heartbeat'
```

**Sintaxis wildcards MQTT:**
- `+` = wildcard de un nivel (ej: `core/+/status` match `core/a/status`, `core/b/status`)
- `#` = wildcard multi-nivel (ej: `core/a/events/#` match todo bajo `core/a/events/`)

---

### 3.4 QoS Strategy (Quality of Service)

**Decisión:** QoS diferenciado por tipo de mensaje

```javascript
const QOS_LEVELS = {
  // QoS 0: At-most-once (fire & forget)
  TELEMETRY: 0,      // Logs, métricas, traces
  HEARTBEAT: 0,      // Health checks periódicos

  // QoS 1: At-least-once (con retry)
  EVENTS: 1,         // Domain events, commands
  DISCOVERY: 1,      // Status, capabilities, modules
  API_REQUEST: 1,    // Request-reply calls

  // QoS 2: Exactly-once (NO USAR - overkill y lento)
  // CRITICAL: 2     // Solo para casos extremadamente críticos
};

// Uso en el código
core.publish('file.created', data, { qos: QOS_LEVELS.EVENTS });
core.publish('metrics.cpu', data, { qos: QOS_LEVELS.TELEMETRY });
```

**Rationale:**

1. **QoS 0 para telemetría** - Perder un log o métrica no es crítico, priorizar throughput
2. **QoS 1 para eventos** - Garantizar entrega con retry, tolerar duplicados (idempotencia)
3. **QoS 2 evitar** - Overhead brutal (4-way handshake), rara vez necesario, implementar idempotencia en su lugar

---

### 3.5 Retained Messages (Discovery Automático)

**Concepto:** Retained messages persisten en el broker y se entregan automáticamente a nuevos suscriptores.

#### **Status Publishing (Retained)**

```javascript
// Cuando un core inicia, publica su status como retained
client.publish('core/a/status', JSON.stringify({
  state: 'ready',
  version: '0.1.0',
  started_at: Date.now(),
  pid: process.pid,
  hostname: os.hostname(),
  apis: ['analyze', 'process', 'transform'],
  subscriptions: ['file.*', 'ai.request.*'],
  capabilities: {
    modules: ['echo', 'file-watcher', 'ai-gateway'],
    features: ['hot-reload', 'tracing', 'metrics']
  }
}), {
  retain: true,  // ← Mensaje persiste en broker
  qos: 1
});
```

**Resultado:**
- Cuando Core B inicia y se suscribe a `core/+/status`, recibe INMEDIATAMENTE el status de Core A
- No necesita esperar a que Core A republique
- Discovery instantáneo y sin coordinación

---

#### **Last Will & Testament (Failure Detection)**

```javascript
// Al conectar, core configura su "testamento"
client.on('connect', () => {
  client.publish('core/a/status',
    JSON.stringify({ state: 'ready', ... }),
    {
      retain: true,
      qos: 1,
      will: {  // ← Last Will
        topic: 'core/a/status',
        payload: JSON.stringify({
          state: 'offline',
          offline_at: Date.now()
        }),
        qos: 1,
        retain: true
      }
    }
  );
});
```

**Comportamiento:**
- Si Core A se desconecta limpiamente → publica su propio offline status
- Si Core A **crashea** → el broker automáticamente publica el Last Will
- Otros cores ven el cambio de status sin polling

**Esto elimina la necesidad de:**
- Health check polling
- Timeouts manuales
- Coordinación de failure detection

---

### 3.6 Heartbeat Mechanism

Complemento a Last Will para monitoreo activo:

```javascript
// Heartbeat cada 30 segundos
setInterval(() => {
  client.publish('core/a/heartbeat', JSON.stringify({
    timestamp: Date.now(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    event_count: core.metrics.totalEvents
  }), { qos: 0 });  // QoS 0 - no crítico
}, 30000);

// Otros cores monitorizan
client.subscribe('core/+/heartbeat');

client.on('message', (topic, message) => {
  if (topic.includes('heartbeat')) {
    const [_, coreId] = topic.split('/');
    registry.updateLastSeen(coreId, Date.now());
  }
});

// Detector de cores silenciosos
setInterval(() => {
  const stale = registry.findStale(60000); // 60s sin heartbeat
  stale.forEach(coreId => {
    console.warn(`Core ${coreId} not responding, marking as suspicious`);
  });
}, 30000);
```

---

### 3.7 Event Envelope (Estructura Estándar)

**Todos los eventos siguen el mismo envelope:**

```json
{
  "event_id": "uuid-v4",
  "event_type": "file.created",
  "timestamp": 1696600000000,
  "source": {
    "core_id": "core-a",
    "module": "file-watcher",
    "version": "1.0.0"
  },
  "trace": {
    "trace_id": "trace-uuid",
    "span_id": "span-uuid",
    "parent_span_id": "parent-span-uuid"
  },
  "data": {
    "path": "/data/document.txt",
    "size": 1024,
    "mime": "text/plain"
  },
  "metadata": {
    "correlation_id": "request-uuid",
    "causation_id": "event-that-caused-this"
  }
}
```

**Campos obligatorios:**
- `event_id` - Identificador único del evento (idempotencia)
- `event_type` - Tipo de evento (ej: `file.created`)
- `timestamp` - Unix timestamp en milisegundos
- `source.core_id` - Core que originó el evento
- `data` - Payload del evento (validado con JSON Schema)

**Campos opcionales:**
- `source.module` - Módulo que generó el evento
- `trace.*` - W3C Trace Context para distributed tracing
- `metadata.*` - Correlation/causation para tracking

---

## 4. Sistema de Módulos

### 4.1 Filosofía: Módulos como Plugins

Los módulos son **plugins autodescubiertos** que extienden el core sin modificarlo.

**Principios:**
1. **Zero coupling** - Módulos no conocen otros módulos directamente
2. **Event-driven communication** - Solo vía eventos MQTT/EventBus
3. **Declarative manifest** - Capabilities declaradas en `module.json`
4. **Hot-reload** - Cargar/descargar sin reiniciar core
5. **Isolated context** - Cada módulo tiene su propio contexto

---

### 4.2 Estructura de un Módulo

```
modules/
  └── file-watcher/
      ├── module.json        # Manifest (obligatorio)
      ├── index.js           # Entry point (obligatorio)
      ├── schema/            # JSON Schemas (opcional)
      │   ├── file-created.schema.json
      │   └── file-modified.schema.json
      ├── config.json        # Configuración del módulo (opcional)
      ├── README.md          # Documentación (recomendado)
      └── tests/             # Tests del módulo (recomendado)
          └── index.test.js
```

---

### 4.3 Module Manifest (module.json)

```json
{
  "name": "file-watcher",
  "version": "1.0.0",
  "description": "Observa cambios en sistema de archivos y emite eventos",
  "author": "User",

  "entry": "./index.js",

  "provides": {
    "events": [
      "file.created",
      "file.modified",
      "file.deleted"
    ],
    "apis": [
      {
        "name": "watch",
        "method": "POST",
        "path": "/watch",
        "description": "Inicia observación de directorio",
        "schema": "./schema/watch-request.schema.json"
      },
      {
        "name": "unwatch",
        "method": "POST",
        "path": "/unwatch",
        "description": "Detiene observación de directorio",
        "schema": "./schema/unwatch-request.schema.json"
      }
    ]
  },

  "subscribes": [
    "config.reload",
    "core.shutdown"
  ],

  "dependencies": {
    "core": ">=0.1.0",
    "modules": []
  },

  "config": {
    "watch_paths": ["/data"],
    "ignore_patterns": ["*.tmp", "*.log"],
    "debounce_ms": 500
  },

  "lifecycle": {
    "onLoad": true,
    "onUnload": true,
    "onEvent": true,
    "onError": true
  }
}
```

**Campos clave:**

- `provides.events` - Eventos que este módulo puede emitir
- `provides.apis` - APIs HTTP que expone
- `subscribes` - Eventos a los que se suscribe
- `config` - Configuración por defecto
- `lifecycle` - Hooks que implementa

---

### 4.4 Module Entry Point (index.js)

```javascript
// modules/file-watcher/index.js

class FileWatcherModule {
  constructor(core, manifest, config) {
    this.core = core;
    this.manifest = manifest;
    this.config = config;
    this.watchers = new Map();
  }

  // Lifecycle: Se llama cuando el módulo se carga
  async onLoad() {
    console.log(`[${this.manifest.name}] Loading...`);

    // Suscribirse a eventos
    this.core.on('config.reload', this.handleConfigReload.bind(this));
    this.core.on('core.shutdown', this.handleShutdown.bind(this));

    // Iniciar watchers configurados
    for (const path of this.config.watch_paths) {
      await this.watch(path);
    }

    console.log(`[${this.manifest.name}] Loaded successfully`);
  }

  // Lifecycle: Se llama cuando el módulo se descarga
  async onUnload() {
    console.log(`[${this.manifest.name}] Unloading...`);

    // Limpiar recursos
    for (const [path, watcher] of this.watchers) {
      watcher.close();
    }
    this.watchers.clear();

    console.log(`[${this.manifest.name}] Unloaded`);
  }

  // API: Iniciar observación de directorio
  async watch(path) {
    if (this.watchers.has(path)) {
      throw new Error(`Already watching ${path}`);
    }

    const fs = require('fs');
    const watcher = fs.watch(path, { recursive: true }, (eventType, filename) => {
      this.handleFileChange(path, eventType, filename);
    });

    this.watchers.set(path, watcher);
    return { watching: path };
  }

  // Handler interno
  handleFileChange(basePath, eventType, filename) {
    const fullPath = `${basePath}/${filename}`;

    // Emitir evento
    this.core.emit('file.created', {
      path: fullPath,
      timestamp: Date.now(),
      type: eventType
    });
  }

  // Handler de evento suscrito
  handleConfigReload(config) {
    console.log(`[${this.manifest.name}] Config reloaded`);
    this.config = { ...this.config, ...config };
  }

  handleShutdown() {
    console.log(`[${this.manifest.name}] Shutting down gracefully`);
    this.onUnload();
  }
}

// Export obligatorio
module.exports = FileWatcherModule;
```

---

### 4.5 Module Loader (Autodescubrimiento)

```javascript
// core/modules/module-loader.js

const fs = require('fs');
const path = require('path');

class ModuleLoader {
  constructor(core, modulesPath = './modules') {
    this.core = core;
    this.modulesPath = modulesPath;
    this.loadedModules = new Map();
  }

  // Escanear directorio de módulos
  async discover() {
    console.log(`Discovering modules in ${this.modulesPath}...`);

    const entries = fs.readdirSync(this.modulesPath, { withFileTypes: true });
    const modules = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const modulePath = path.join(this.modulesPath, entry.name);
      const manifestPath = path.join(modulePath, 'module.json');

      if (!fs.existsSync(manifestPath)) {
        console.warn(`Skipping ${entry.name}: no module.json found`);
        continue;
      }

      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        modules.push({ manifest, path: modulePath });
      } catch (error) {
        console.error(`Error reading manifest for ${entry.name}:`, error.message);
      }
    }

    console.log(`Discovered ${modules.length} modules`);
    return modules;
  }

  // Cargar un módulo
  async load(manifest, modulePath) {
    console.log(`Loading module: ${manifest.name}@${manifest.version}`);

    // Validar manifest
    await this.validateManifest(manifest);

    // Cargar configuración
    const config = await this.loadConfig(modulePath, manifest.config);

    // Cargar entry point
    const entryPath = path.join(modulePath, manifest.entry || 'index.js');
    const ModuleClass = require(entryPath);

    // Instanciar módulo
    const instance = new ModuleClass(this.core, manifest, config);

    // Llamar lifecycle hook
    if (instance.onLoad) {
      await instance.onLoad();
    }

    // Registrar módulo
    this.loadedModules.set(manifest.name, {
      manifest,
      instance,
      path: modulePath,
      loadedAt: Date.now()
    });

    // Emitir evento
    this.core.emit('module.loaded', {
      module: manifest.name,
      version: manifest.version
    });

    console.log(`✓ Module ${manifest.name} loaded successfully`);
  }

  // Descargar un módulo
  async unload(moduleName) {
    const moduleData = this.loadedModules.get(moduleName);
    if (!moduleData) {
      throw new Error(`Module ${moduleName} not loaded`);
    }

    console.log(`Unloading module: ${moduleName}`);

    // Llamar lifecycle hook
    if (moduleData.instance.onUnload) {
      await moduleData.instance.onUnload();
    }

    // Eliminar del cache de require
    const entryPath = path.join(moduleData.path, moduleData.manifest.entry || 'index.js');
    delete require.cache[require.resolve(entryPath)];

    // Eliminar del registro
    this.loadedModules.delete(moduleName);

    // Emitir evento
    this.core.emit('module.unloaded', {
      module: moduleName
    });

    console.log(`✓ Module ${moduleName} unloaded`);
  }

  // Recargar un módulo (unload + load)
  async reload(moduleName) {
    const moduleData = this.loadedModules.get(moduleName);
    if (!moduleData) {
      throw new Error(`Module ${moduleName} not loaded`);
    }

    console.log(`Reloading module: ${moduleName}`);

    await this.unload(moduleName);
    await this.load(moduleData.manifest, moduleData.path);

    console.log(`✓ Module ${moduleName} reloaded`);
  }

  // Validar manifest con JSON Schema
  async validateManifest(manifest) {
    const schema = require('../schemas/module-manifest.schema.json');
    const Ajv = require('ajv'); // Solo dep para JSON Schema validation
    const ajv = new Ajv();

    const valid = ajv.validate(schema, manifest);
    if (!valid) {
      throw new Error(`Invalid manifest: ${ajv.errorsText()}`);
    }
  }

  // Cargar configuración del módulo
  async loadConfig(modulePath, defaultConfig) {
    const configPath = path.join(modulePath, 'config.json');

    if (fs.existsSync(configPath)) {
      const userConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return { ...defaultConfig, ...userConfig };
    }

    return defaultConfig;
  }

  // Listar módulos cargados
  list() {
    return Array.from(this.loadedModules.entries()).map(([name, data]) => ({
      name,
      version: data.manifest.version,
      loadedAt: data.loadedAt,
      provides: data.manifest.provides,
      subscribes: data.manifest.subscribes
    }));
  }
}

module.exports = ModuleLoader;
```

---

### 4.6 Hot-Reload con fs.watch (Zero Deps)

```javascript
// core/modules/module-manager.js

const fs = require('fs');
const path = require('path');

class ModuleManager {
  constructor(core, loader) {
    this.core = core;
    this.loader = loader;
    this.watchers = new Map();
  }

  // Activar hot-reload para módulos
  watchModules() {
    console.log('Activating hot-reload for modules...');

    const modulesPath = this.loader.modulesPath;

    // Watch cambios en directorio de módulos
    const watcher = fs.watch(modulesPath, { recursive: true }, (eventType, filename) => {
      this.handleModuleChange(eventType, filename);
    });

    this.watchers.set(modulesPath, watcher);
    console.log('✓ Hot-reload active');
  }

  // Handler de cambios en módulos
  async handleModuleChange(eventType, filename) {
    // Extraer nombre del módulo del path
    const parts = filename.split(path.sep);
    const moduleName = parts[0];

    // Ignorar cambios en archivos temporales, logs, etc.
    if (this.shouldIgnore(filename)) {
      return;
    }

    console.log(`Module change detected: ${moduleName} (${filename})`);

    // Debounce para evitar reloads múltiples
    if (this.reloadTimers.has(moduleName)) {
      clearTimeout(this.reloadTimers.get(moduleName));
    }

    this.reloadTimers.set(moduleName, setTimeout(async () => {
      try {
        await this.loader.reload(moduleName);
        console.log(`✓ Hot-reload: ${moduleName}`);
      } catch (error) {
        console.error(`Error reloading ${moduleName}:`, error.message);
      }
      this.reloadTimers.delete(moduleName);
    }, 500)); // 500ms debounce
  }

  shouldIgnore(filename) {
    const ignorePatterns = [
      /\.tmp$/,
      /\.log$/,
      /\.swp$/,
      /~$/,
      /node_modules/,
      /\.git/
    ];

    return ignorePatterns.some(pattern => pattern.test(filename));
  }

  stopWatching() {
    for (const [path, watcher] of this.watchers) {
      watcher.close();
    }
    this.watchers.clear();
  }
}

module.exports = ModuleManager;
```

---

## 5. Comunicación y APIs

### 5.1 Paradigma: API-First + Pub/Sub

**Cambio de paradigma clave:** Toda la comunicación se realiza a través de APIs.

Cada core:
- **Produce servicios** → Expone APIs (HTTP o MQTT Request-Reply)
- **Consume eventos** → Suscripciones selectivas a topics MQTT
- **Es autónomo** → Gestiona su estado, módulos, suscripciones

**El trabajo crítico está en cómo gestionar las suscripciones** para que cada core recoja sus mensajes y actúe.

---

### 5.2 Event Publishing (Local → MQTT)

```javascript
// core/events/event-router.js

class EventRouter {
  constructor(core, eventBus, mqttClient) {
    this.core = core;
    this.eventBus = eventBus;  // EventEmitter local
    this.mqttClient = mqttClient;
  }

  // Publicar evento (local + MQTT)
  async publish(eventType, data, options = {}) {
    const event = this.createEventEnvelope(eventType, data);

    // Validar con JSON Schema
    await this.validateEvent(event);

    // 1. Emitir localmente primero (para módulos del mismo core)
    this.eventBus.emit(eventType, event);

    // 2. Publicar en MQTT (para otros cores)
    if (this.shouldPublishExternal(eventType, options)) {
      const topic = this.buildTopic(eventType);
      const qos = options.qos || QOS_LEVELS.EVENTS;

      this.mqttClient.publish(
        topic,
        JSON.stringify(event),
        { qos, retain: options.retain || false }
      );
    }
  }

  createEventEnvelope(eventType, data) {
    return {
      event_id: this.generateUUID(),
      event_type: eventType,
      timestamp: Date.now(),
      source: {
        core_id: this.core.id,
        module: this.core.currentModule || 'core',
        version: this.core.version
      },
      trace: this.core.tracer.getCurrentContext(),
      data: data
    };
  }

  buildTopic(eventType) {
    // file.created → core/a/events/file/created
    const parts = eventType.split('.');
    return `core/${this.core.id}/events/${parts.join('/')}`;
  }

  shouldPublishExternal(eventType, options) {
    // Eventos internos no se publican externamente
    if (eventType.startsWith('_')) return false;
    if (options.local === true) return false;
    return true;
  }
}
```

---

### 5.3 Event Subscription (MQTT → Local)

```javascript
// core/events/event-subscriber.js

class EventSubscriber {
  constructor(core, eventBus, mqttClient) {
    this.core = core;
    this.eventBus = eventBus;
    this.mqttClient = mqttClient;
    this.subscriptions = new Map();
  }

  // Suscribirse a eventos de otros cores
  async subscribe(pattern) {
    console.log(`Subscribing to: ${pattern}`);

    // Convertir pattern de evento a topic MQTT
    // Ejemplo: "file.*" → "core/+/events/file/#"
    const topic = this.eventPatternToTopic(pattern);

    await this.mqttClient.subscribe(topic, { qos: 1 });
    this.subscriptions.set(pattern, topic);
  }

  // Handler de mensajes MQTT
  handleMQTTMessage(topic, message) {
    try {
      const event = JSON.parse(message.toString());

      // Extraer info del topic
      const topicParts = topic.split('/');
      const sourceCoreId = topicParts[1];

      // Ignorar eventos de este mismo core (ya se emitieron localmente)
      if (sourceCoreId === this.core.id) {
        return;
      }

      // Validar evento
      this.validateEvent(event);

      // Emitir en event bus local
      this.eventBus.emit(event.event_type, event);

      // Trace
      this.core.tracer.recordEventReceived(event);

    } catch (error) {
      console.error('Error handling MQTT message:', error);
    }
  }

  eventPatternToTopic(pattern) {
    // "file.*" → "core/+/events/file/#"
    // "*.error" → "core/+/events/+/error"
    // "file.created" → "core/+/events/file/created"

    const parts = pattern.split('.');
    const mqttParts = parts.map(part => {
      if (part === '*') return '+';  // Single-level wildcard
      if (part === '**') return '#'; // Multi-level wildcard
      return part;
    });

    return `core/+/events/${mqttParts.join('/')}`;
  }
}
```

---

### 5.4 Request-Reply Pattern (Async APIs via MQTT)

Para llamadas API asíncronas entre cores:

```javascript
// core/api/request-reply.js

class RequestReplyClient {
  constructor(core, mqttClient) {
    this.core = core;
    this.mqttClient = mqttClient;
    this.pendingRequests = new Map();
    this.timeout = 30000; // 30s default timeout

    // Suscribirse a respuestas dirigidas a este core
    this.mqttClient.subscribe(`core/${core.id}/api/response/#`);
    this.mqttClient.on('message', this.handleResponse.bind(this));
  }

  // Llamar API de otro core
  async request(targetCoreId, service, data, options = {}) {
    const requestId = this.generateUUID();
    const timeout = options.timeout || this.timeout;

    // Topic de request
    const requestTopic = `core/${targetCoreId}/api/request/${service}/${requestId}`;

    // Topic de response (donde esperamos la respuesta)
    const responseTopic = `core/${this.core.id}/api/response/${service}/${requestId}`;

    // Crear promise para esperar respuesta
    const responsePromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Request timeout: ${service}@${targetCoreId}`));
      }, timeout);

      this.pendingRequests.set(requestId, { resolve, reject, timer });
    });

    // Publicar request
    await this.mqttClient.publish(requestTopic, JSON.stringify({
      request_id: requestId,
      source_core_id: this.core.id,
      service,
      data,
      reply_to: responseTopic,
      timestamp: Date.now()
    }), { qos: 1 });

    // Esperar respuesta
    return responsePromise;
  }

  // Handler de respuestas
  handleResponse(topic, message) {
    try {
      // Extraer requestId del topic
      // core/a/api/response/analyze/uuid-1234
      const parts = topic.split('/');
      const requestId = parts[parts.length - 1];

      const pending = this.pendingRequests.get(requestId);
      if (!pending) return; // Response llegó tarde o timeout

      // Limpiar timeout
      clearTimeout(pending.timer);
      this.pendingRequests.delete(requestId);

      // Parsear respuesta
      const response = JSON.parse(message.toString());

      // Resolver promise
      if (response.error) {
        pending.reject(new Error(response.error));
      } else {
        pending.resolve(response.data);
      }

    } catch (error) {
      console.error('Error handling response:', error);
    }
  }
}

// Server side (responder a requests)
class RequestReplyServer {
  constructor(core, mqttClient) {
    this.core = core;
    this.mqttClient = mqttClient;
    this.handlers = new Map();

    // Suscribirse a requests dirigidos a este core
    this.mqttClient.subscribe(`core/${core.id}/api/request/#`);
    this.mqttClient.on('message', this.handleRequest.bind(this));
  }

  // Registrar handler para un servicio
  register(service, handler) {
    this.handlers.set(service, handler);
  }

  // Handler de requests
  async handleRequest(topic, message) {
    // Solo procesar requests para este core
    if (!topic.startsWith(`core/${this.core.id}/api/request/`)) {
      return;
    }

    try {
      const request = JSON.parse(message.toString());
      const service = request.service;

      // Buscar handler
      const handler = this.handlers.get(service);
      if (!handler) {
        await this.sendError(request, `Service not found: ${service}`);
        return;
      }

      // Ejecutar handler
      const result = await handler(request.data, request);

      // Enviar respuesta
      await this.sendResponse(request, result);

    } catch (error) {
      await this.sendError(request, error.message);
    }
  }

  async sendResponse(request, data) {
    await this.mqttClient.publish(request.reply_to, JSON.stringify({
      request_id: request.request_id,
      timestamp: Date.now(),
      data
    }), { qos: 1 });
  }

  async sendError(request, errorMessage) {
    await this.mqttClient.publish(request.reply_to, JSON.stringify({
      request_id: request.request_id,
      timestamp: Date.now(),
      error: errorMessage
    }), { qos: 1 });
  }
}
```

**Uso:**

```javascript
// Core A llama servicio de Core B
const result = await core.api.request('core-b', 'analyze', {
  file: '/data/document.txt'
});

// Core B registra handler
core.api.register('analyze', async (data, request) => {
  const analysis = await analyzeFile(data.file);
  return { result: analysis };
});
```

---

### 5.5 HTTP API Gateway (Complementario)

Para operaciones síncronas tradicionales:

```javascript
// core/api/http-gateway.js

const http = require('http');
const url = require('url');

class HTTPGateway {
  constructor(core, port = 3000) {
    this.core = core;
    this.port = port;
    this.routes = new Map();
    this.server = null;
  }

  async start() {
    this.server = http.createServer(this.handleRequest.bind(this));

    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
        console.log(`HTTP API Gateway listening on port ${this.port}`);
        resolve();
      });
    });
  }

  // Registrar ruta
  register(method, path, handler) {
    const key = `${method}:${path}`;
    this.routes.set(key, handler);
  }

  // Handler de requests HTTP
  async handleRequest(req, res) {
    const parsedUrl = url.parse(req.url, true);
    const key = `${req.method}:${parsedUrl.pathname}`;

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    try {
      const handler = this.routes.get(key);

      if (!handler) {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'Not found' }));
        return;
      }

      // Parsear body (si existe)
      const body = await this.parseBody(req);

      // Ejecutar handler
      const result = await handler({
        query: parsedUrl.query,
        body,
        headers: req.headers
      });

      // Responder
      res.statusCode = 200;
      res.end(JSON.stringify(result));

    } catch (error) {
      console.error('HTTP error:', error);
      res.statusCode = 500;
      res.end(JSON.stringify({ error: error.message }));
    }
  }

  async parseBody(req) {
    return new Promise((resolve) => {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch {
          resolve({});
        }
      });
    });
  }

  async stop() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(resolve);
      });
    }
  }
}
```

---

## 6. Discovery y Registry

### 6.1 Discovery Automático con Retained Messages

Ver sección 3.5 para detalles completos de retained messages.

**Resumen:**
- Cores publican status como retained message al iniciar
- Nuevos cores reciben automáticamente status de cores existentes al suscribirse
- Last Will & Testament para detección de crashes

---

### 6.2 Discovery Manager

```javascript
// core/discovery/discovery-manager.js

class DiscoveryManager {
  constructor(core, mqttClient) {
    this.core = core;
    this.mqttClient = mqttClient;
    this.registry = new Map(); // core_id → metadata
  }

  async start() {
    // Publicar nuestro status
    await this.announcePresence();

    // Suscribirse a status de otros cores
    await this.mqttClient.subscribe('core/+/status', { qos: 1 });
    await this.mqttClient.subscribe('core/+/heartbeat', { qos: 0 });

    // Handler de mensajes
    this.mqttClient.on('message', this.handleDiscoveryMessage.bind(this));

    // Iniciar heartbeat
    this.startHeartbeat();

    // Detector de cores stale
    this.startStaleDetector();
  }

  async announcePresence() {
    const status = {
      core_id: this.core.id,
      state: 'ready',
      version: this.core.version,
      started_at: Date.now(),
      hostname: require('os').hostname(),
      pid: process.pid,
      platform: process.platform,
      node_version: process.version,
      apis: this.getAvailableAPIs(),
      subscriptions: this.getSubscriptions(),
      modules: this.getLoadedModules(),
      capabilities: this.core.capabilities
    };

    await this.mqttClient.publish(
      `core/${this.core.id}/status`,
      JSON.stringify(status),
      {
        retain: true,
        qos: 1,
        will: {
          topic: `core/${this.core.id}/status`,
          payload: JSON.stringify({
            core_id: this.core.id,
            state: 'offline',
            offline_at: Date.now()
          }),
          qos: 1,
          retain: true
        }
      }
    );

    console.log(`✓ Announced presence: ${this.core.id}`);
  }

  handleDiscoveryMessage(topic, message) {
    try {
      const data = JSON.parse(message.toString());

      if (topic.includes('/status')) {
        this.handleStatusUpdate(data);
      } else if (topic.includes('/heartbeat')) {
        this.handleHeartbeat(data);
      }
    } catch (error) {
      console.error('Error handling discovery message:', error);
    }
  }

  handleStatusUpdate(status) {
    const coreId = status.core_id;

    // Ignorar nuestro propio status
    if (coreId === this.core.id) return;

    if (status.state === 'offline') {
      console.log(`Core ${coreId} went offline`);
      this.registry.delete(coreId);
      this.core.emit('core.offline', { core_id: coreId });
    } else {
      const isNew = !this.registry.has(coreId);

      this.registry.set(coreId, {
        ...status,
        discovered_at: Date.now(),
        last_seen: Date.now()
      });

      if (isNew) {
        console.log(`Discovered new core: ${coreId}`);
        this.core.emit('core.discovered', status);
      } else {
        console.log(`Core ${coreId} status updated`);
        this.core.emit('core.updated', status);
      }
    }
  }

  handleHeartbeat(data) {
    const coreId = data.core_id || this.extractCoreIdFromTopic(topic);

    if (this.registry.has(coreId)) {
      const entry = this.registry.get(coreId);
      entry.last_seen = Date.now();
      entry.heartbeat_data = data;
    }
  }

  startHeartbeat() {
    setInterval(() => {
      this.mqttClient.publish(
        `core/${this.core.id}/heartbeat`,
        JSON.stringify({
          timestamp: Date.now(),
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          events_processed: this.core.metrics.totalEvents
        }),
        { qos: 0 }
      );
    }, 30000); // Cada 30s
  }

  startStaleDetector() {
    setInterval(() => {
      const now = Date.now();
      const staleThreshold = 60000; // 60s

      for (const [coreId, data] of this.registry.entries()) {
        if (now - data.last_seen > staleThreshold) {
          console.warn(`Core ${coreId} is stale (no heartbeat for ${staleThreshold}ms)`);
          this.core.emit('core.stale', { core_id: coreId, last_seen: data.last_seen });
        }
      }
    }, 30000);
  }

  // API pública
  getDiscoveredCores() {
    return Array.from(this.registry.values());
  }

  getCoreById(coreId) {
    return this.registry.get(coreId);
  }

  findCoresByCapability(capability) {
    return this.getDiscoveredCores().filter(core =>
      core.capabilities && core.capabilities.includes(capability)
    );
  }
}
```

---

## 7. Observabilidad

### 7.1 Logging Estructurado JSON

```javascript
// core/observability/logger.js

class Logger {
  constructor(core) {
    this.core = core;
    this.minLevel = process.env.LOG_LEVEL || 'info';
    this.levels = { error: 0, warn: 1, info: 2, debug: 3 };
  }

  log(level, message, context = {}) {
    if (this.levels[level] > this.levels[this.minLevel]) {
      return; // Skip si está por debajo del nivel mínimo
    }

    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      core_id: this.core.id,
      trace_id: this.core.tracer.getCurrentTraceId(),
      span_id: this.core.tracer.getCurrentSpanId(),
      ...context
    };

    // Output a stdout (JSON)
    console.log(JSON.stringify(entry));

    // Publicar a MQTT (para agregadores centralizados)
    this.core.mqtt.publish(
      `core/${this.core.id}/logs/${level}`,
      JSON.stringify(entry),
      { qos: 0 } // QoS 0 para logs (best-effort)
    );
  }

  error(message, context) { this.log('error', message, context); }
  warn(message, context)  { this.log('warn', message, context); }
  info(message, context)  { this.log('info', message, context); }
  debug(message, context) { this.log('debug', message, context); }
}
```

**Uso:**

```javascript
logger.info('module.loaded', {
  module: 'echo',
  version: '1.0.0',
  load_time_ms: 45
});

// Output:
// {"timestamp":"2025-10-06T16:00:00.000Z","level":"info","message":"module.loaded","core_id":"core-a","trace_id":"...","module":"echo","version":"1.0.0","load_time_ms":45}
```

---

### 7.2 Distributed Tracing (W3C Trace Context)

```javascript
// core/observability/tracer.js

class Tracer {
  constructor(core) {
    this.core = core;
    this.currentTrace = null;
    this.currentSpan = null;
    this.spans = [];
  }

  // Iniciar un trace nuevo
  startTrace(name, context = {}) {
    const traceId = this.generateTraceId();
    const spanId = this.generateSpanId();

    this.currentTrace = {
      trace_id: traceId,
      name,
      started_at: Date.now(),
      context
    };

    this.currentSpan = {
      span_id: spanId,
      parent_span_id: null,
      name,
      started_at: Date.now()
    };

    return { trace_id: traceId, span_id: spanId };
  }

  // Iniciar un span hijo
  startSpan(name, context = {}) {
    if (!this.currentTrace) {
      throw new Error('No active trace. Call startTrace() first.');
    }

    const parentSpanId = this.currentSpan.span_id;
    const spanId = this.generateSpanId();

    this.currentSpan = {
      span_id: spanId,
      parent_span_id: parentSpanId,
      name,
      started_at: Date.now(),
      context
    };

    return { span_id: spanId, parent_span_id: parentSpanId };
  }

  // Finalizar span actual
  endSpan(result = {}) {
    if (!this.currentSpan) return;

    const span = {
      ...this.currentSpan,
      ended_at: Date.now(),
      duration_ms: Date.now() - this.currentSpan.started_at,
      result
    };

    this.spans.push(span);

    // Publicar span a MQTT
    this.core.mqtt.publish(
      `core/${this.core.id}/traces/${this.currentTrace.trace_id}`,
      JSON.stringify(span),
      { qos: 0 }
    );

    // Volver al span padre
    const parentSpan = this.spans.find(s => s.span_id === span.parent_span_id);
    this.currentSpan = parentSpan || null;
  }

  // Finalizar trace completo
  endTrace(result = {}) {
    if (!this.currentTrace) return;

    const trace = {
      ...this.currentTrace,
      ended_at: Date.now(),
      duration_ms: Date.now() - this.currentTrace.started_at,
      spans: this.spans,
      result
    };

    // Log trace completo
    this.core.logger.info('trace.completed', {
      trace_id: trace.trace_id,
      duration_ms: trace.duration_ms,
      span_count: trace.spans.length
    });

    // Reset
    this.currentTrace = null;
    this.currentSpan = null;
    this.spans = [];

    return trace;
  }

  // Obtener contexto actual (para propagar en eventos)
  getCurrentContext() {
    if (!this.currentTrace) return null;

    return {
      trace_id: this.currentTrace.trace_id,
      span_id: this.currentSpan?.span_id || null,
      parent_span_id: this.currentSpan?.parent_span_id || null
    };
  }

  // Restaurar contexto (cuando se recibe evento externo)
  restoreContext(traceContext) {
    if (!traceContext) return;

    this.currentTrace = {
      trace_id: traceContext.trace_id,
      restored: true
    };

    this.currentSpan = {
      span_id: traceContext.span_id,
      parent_span_id: traceContext.parent_span_id,
      started_at: Date.now()
    };
  }

  generateTraceId() {
    return this.generateId(32); // 128-bit
  }

  generateSpanId() {
    return this.generateId(16); // 64-bit
  }

  generateId(length) {
    const chars = '0123456789abcdef';
    let id = '';
    for (let i = 0; i < length; i++) {
      id += chars[Math.floor(Math.random() * chars.length)];
    }
    return id;
  }
}
```

**Uso:**

```javascript
// Iniciar trace
const trace = core.tracer.startTrace('process-file');

// Span para lectura de archivo
core.tracer.startSpan('read-file');
const content = await readFile('/data/file.txt');
core.tracer.endSpan({ bytes_read: content.length });

// Span para procesamiento
core.tracer.startSpan('analyze-content');
const analysis = await analyzeContent(content);
core.tracer.endSpan({ entities_found: analysis.entities.length });

// Finalizar trace
core.tracer.endTrace({ success: true });
```

---

### 7.3 Métricas Básicas

```javascript
// core/observability/metrics.js

class Metrics {
  constructor(core) {
    this.core = core;
    this.counters = new Map();
    this.histograms = new Map();
    this.gauges = new Map();

    // Publicar métricas periódicamente
    setInterval(() => this.publish(), 10000); // Cada 10s
  }

  // Incrementar contador
  increment(name, value = 1, tags = {}) {
    const key = this.buildKey(name, tags);
    const current = this.counters.get(key) || 0;
    this.counters.set(key, current + value);
  }

  // Registrar valor en histograma
  histogram(name, value, tags = {}) {
    const key = this.buildKey(name, tags);
    const values = this.histograms.get(key) || [];
    values.push(value);
    this.histograms.set(key, values);
  }

  // Establecer gauge (valor absoluto)
  gauge(name, value, tags = {}) {
    const key = this.buildKey(name, tags);
    this.gauges.set(key, value);
  }

  // Publicar métricas a MQTT
  publish() {
    const metrics = {
      timestamp: Date.now(),
      core_id: this.core.id,
      counters: this.serializeCounters(),
      histograms: this.serializeHistograms(),
      gauges: this.serializeGauges()
    };

    this.core.mqtt.publish(
      `core/${this.core.id}/metrics`,
      JSON.stringify(metrics),
      { qos: 0 }
    );

    // Reset histograms después de publicar
    this.histograms.clear();
  }

  serializeCounters() {
    const result = {};
    for (const [key, value] of this.counters) {
      result[key] = value;
    }
    return result;
  }

  serializeHistograms() {
    const result = {};
    for (const [key, values] of this.histograms) {
      result[key] = {
        count: values.length,
        sum: values.reduce((a, b) => a + b, 0),
        min: Math.min(...values),
        max: Math.max(...values),
        avg: values.reduce((a, b) => a + b, 0) / values.length,
        p50: this.percentile(values, 0.5),
        p95: this.percentile(values, 0.95),
        p99: this.percentile(values, 0.99)
      };
    }
    return result;
  }

  serializeGauges() {
    const result = {};
    for (const [key, value] of this.gauges) {
      result[key] = value;
    }
    return result;
  }

  buildKey(name, tags) {
    if (Object.keys(tags).length === 0) return name;
    const tagStr = Object.entries(tags)
      .map(([k, v]) => `${k}:${v}`)
      .join(',');
    return `${name}{${tagStr}}`;
  }

  percentile(values, p) {
    const sorted = values.slice().sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[index];
  }
}
```

**Uso:**

```javascript
// Contador
core.metrics.increment('events.published', 1, { topic: 'file.created' });

// Histograma (latencias)
core.metrics.histogram('mqtt.latency', 23.5, { operation: 'publish' });

// Gauge (memoria actual)
core.metrics.gauge('memory.used', process.memoryUsage().heapUsed);
```

---

## 8. Schemas y Contratos

### 8.1 JSON Schema Obligatorio

**Principio:** Todo evento y mensaje DEBE tener un JSON Schema definido.

### 8.2 Schema Validator

```javascript
// core/events/event-validator.js

const Ajv = require('ajv');
const addFormats = require('ajv-formats');

class EventValidator {
  constructor(core) {
    this.core = core;
    this.ajv = new Ajv({ allErrors: true });
    addFormats(this.ajv);
    this.schemas = new Map();

    // Cargar schemas del core
    this.loadCoreSchemas();
  }

  loadCoreSchemas() {
    const fs = require('fs');
    const path = require('path');
    const schemasPath = path.join(__dirname, '../schemas');

    const files = fs.readdirSync(schemasPath);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const schemaPath = path.join(schemasPath, file);
      const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

      this.registerSchema(schema.$id || file.replace('.json', ''), schema);
    }
  }

  registerSchema(name, schema) {
    this.ajv.addSchema(schema, name);
    this.schemas.set(name, schema);
  }

  validate(schemaName, data) {
    const validate = this.ajv.getSchema(schemaName);

    if (!validate) {
      throw new Error(`Schema not found: ${schemaName}`);
    }

    const valid = validate(data);

    if (!valid) {
      const errors = validate.errors.map(err => ({
        path: err.instancePath,
        message: err.message,
        params: err.params
      }));

      throw new ValidationError('Schema validation failed', errors);
    }

    return true;
  }

  validateEvent(event) {
    // Validar envelope genérico
    this.validate('event-envelope', event);

    // Validar data específico del evento
    const schemaName = event.event_type.replace(/\./g, '-');
    if (this.schemas.has(schemaName)) {
      this.validate(schemaName, event.data);
    }
  }
}

class ValidationError extends Error {
  constructor(message, errors) {
    super(message);
    this.name = 'ValidationError';
    this.errors = errors;
  }
}
```

### 8.3 Event Envelope Schema

```json
// core/schemas/event-envelope.schema.json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "event-envelope",
  "title": "Event Envelope",
  "description": "Estructura estándar para todos los eventos",
  "type": "object",
  "required": ["event_id", "event_type", "timestamp", "source", "data"],
  "properties": {
    "event_id": {
      "type": "string",
      "format": "uuid",
      "description": "Identificador único del evento"
    },
    "event_type": {
      "type": "string",
      "pattern": "^[a-z][a-z0-9]*\\.[a-z][a-z0-9]*(\\.[a-z][a-z0-9]*)*$",
      "description": "Tipo de evento (ej: file.created)"
    },
    "timestamp": {
      "type": "integer",
      "minimum": 0,
      "description": "Unix timestamp en milisegundos"
    },
    "source": {
      "type": "object",
      "required": ["core_id"],
      "properties": {
        "core_id": {
          "type": "string",
          "description": "ID del core que originó el evento"
        },
        "module": {
          "type": "string",
          "description": "Módulo que generó el evento"
        },
        "version": {
          "type": "string",
          "description": "Versión del módulo"
        }
      }
    },
    "trace": {
      "type": "object",
      "properties": {
        "trace_id": { "type": "string" },
        "span_id": { "type": "string" },
        "parent_span_id": { "type": "string" }
      }
    },
    "data": {
      "type": "object",
      "description": "Payload del evento (validado con schema específico)"
    },
    "metadata": {
      "type": "object",
      "properties": {
        "correlation_id": { "type": "string" },
        "causation_id": { "type": "string" }
      }
    }
  },
  "additionalProperties": false
}
```

### 8.4 Module Manifest Schema

```json
// core/schemas/module-manifest.schema.json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "module-manifest",
  "title": "Module Manifest",
  "description": "Schema para module.json",
  "type": "object",
  "required": ["name", "version", "entry"],
  "properties": {
    "name": {
      "type": "string",
      "pattern": "^[a-z][a-z0-9-]*$",
      "description": "Nombre del módulo (kebab-case)"
    },
    "version": {
      "type": "string",
      "pattern": "^\\d+\\.\\d+\\.\\d+$",
      "description": "Versión semántica"
    },
    "description": {
      "type": "string",
      "minLength": 10
    },
    "author": {
      "type": "string"
    },
    "entry": {
      "type": "string",
      "description": "Entry point (ej: ./index.js)"
    },
    "provides": {
      "type": "object",
      "properties": {
        "events": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Eventos que este módulo puede emitir"
        },
        "apis": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["name", "method", "path"],
            "properties": {
              "name": { "type": "string" },
              "method": { "type": "string", "enum": ["GET", "POST", "PUT", "DELETE"] },
              "path": { "type": "string" },
              "description": { "type": "string" },
              "schema": { "type": "string" }
            }
          }
        }
      }
    },
    "subscribes": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Eventos a los que se suscribe"
    },
    "dependencies": {
      "type": "object",
      "properties": {
        "core": { "type": "string" },
        "modules": {
          "type": "array",
          "items": { "type": "string" }
        }
      }
    },
    "config": {
      "type": "object",
      "description": "Configuración por defecto"
    },
    "lifecycle": {
      "type": "object",
      "properties": {
        "onLoad": { "type": "boolean" },
        "onUnload": { "type": "boolean" },
        "onEvent": { "type": "boolean" },
        "onError": { "type": "boolean" }
      }
    }
  },
  "additionalProperties": false
}
```

---

## 9. Stack Técnico

### 9.1 Dependencias

**Filosofía: Zero deps externas salvo lo esencial**

```json
{
  "dependencies": {
    "aedes": "^0.50.0",      // MQTT broker embebido
    "mqtt": "^5.3.0",         // MQTT client
    "ajv": "^8.12.0",         // JSON Schema validator
    "ajv-formats": "^2.1.1"   // Formatos adicionales para Ajv (uuid, date-time, etc)
  }
}
```

**TODO lo demás:** Node.js built-ins
- `fs`, `path` - File system operations
- `http`, `net` - HTTP server, TCP sockets
- `events` - EventEmitter
- `os` - System info
- `crypto` - UUID generation (aunque podríamos usar implementación propia)

### 9.2 Rationale de Dependencias

**¿Por qué Aedes?**
- Broker MQTT completo en JavaScript puro
- Zero deps binarias (funciona en Termux sin compilación)
- Lightweight (< 1MB)
- Battle-tested y activamente mantenido

**¿Por qué mqtt (cliente)?**
- Cliente MQTT estándar Node.js
- Soporte completo MQTT 3.1.1 y 5.0
- Reconnect automático
- API promise-based

**¿Por qué Ajv?**
- JSON Schema validator más rápido en JavaScript
- Soporte completo JSON Schema Draft-07
- Zero deps
- Compile-time optimization

---

## 10. Implementación Completa

### 10.1 Core Class Principal

```javascript
// core/core.js

const EventEmitter = require('events');
const MQTTBroker = require('./broker/aedes-broker');
const MQTTClient = require('./mqtt/mqtt-client');
const EventRouter = require('./events/event-router');
const EventSubscriber = require('./events/event-subscriber');
const EventValidator = require('./events/event-validator');
const ModuleLoader = require('./modules/module-loader');
const ModuleManager = require('./modules/module-manager');
const HTTPGateway = require('./api/http-gateway');
const RequestReplyClient = require('./api/request-reply-client');
const RequestReplyServer = require('./api/request-reply-server');
const DiscoveryManager = require('./discovery/discovery-manager');
const Logger = require('./observability/logger');
const Tracer = require('./observability/tracer');
const Metrics = require('./observability/metrics');

class Core extends EventEmitter {
  constructor(config = {}) {
    super();

    this.id = config.id || `core-${this.generateShortId()}`;
    this.version = '0.1.0';
    this.config = config;

    // Estado
    this.state = 'initializing';
    this.startedAt = null;

    // Componentes (se inicializan en start())
    this.broker = null;           // MQTT broker embebido
    this.mqtt = null;             // MQTT client
    this.eventBus = new EventEmitter(); // Event bus local
    this.eventRouter = null;
    this.eventSubscriber = null;
    this.validator = null;
    this.moduleLoader = null;
    this.moduleManager = null;
    this.httpGateway = null;
    this.apiClient = null;
    this.apiServer = null;
    this.discovery = null;
    this.logger = null;
    this.tracer = null;
    this.metrics = null;
  }

  async start() {
    console.log(`Starting Core: ${this.id}`);

    try {
      // 1. Inicializar observabilidad primero
      this.logger = new Logger(this);
      this.tracer = new Tracer(this);
      this.metrics = new Metrics(this);

      this.logger.info('core.starting', { core_id: this.id, version: this.version });

      // 2. Inicializar MQTT (broker + client)
      await this.initMQTT();

      // 3. Inicializar sistema de eventos
      this.validator = new EventValidator(this);
      this.eventRouter = new EventRouter(this, this.eventBus, this.mqtt);
      this.eventSubscriber = new EventSubscriber(this, this.eventBus, this.mqtt);

      // 4. Inicializar sistema de módulos
      this.moduleLoader = new ModuleLoader(this, this.config.modulesPath || './modules');
      this.moduleManager = new ModuleManager(this, this.moduleLoader);

      // 5. Inicializar APIs
      this.httpGateway = new HTTPGateway(this, this.config.httpPort || 3000);
      this.apiClient = new RequestReplyClient(this, this.mqtt);
      this.apiServer = new RequestReplyServer(this, this.mqtt);

      // 6. Inicializar discovery
      this.discovery = new DiscoveryManager(this, this.mqtt);

      // 7. Cargar módulos
      const modules = await this.moduleLoader.discover();
      for (const { manifest, path } of modules) {
        await this.moduleLoader.load(manifest, path);
      }

      // 8. Activar hot-reload
      if (this.config.hotReload !== false) {
        this.moduleManager.watchModules();
      }

      // 9. Iniciar HTTP Gateway
      await this.httpGateway.start();

      // 10. Anunciar presencia
      await this.discovery.start();

      // Estado ready
      this.state = 'ready';
      this.startedAt = Date.now();

      this.logger.info('core.ready', {
        core_id: this.id,
        modules_loaded: this.moduleLoader.loadedModules.size,
        startup_time_ms: Date.now() - this.startedAt
      });

      console.log(`✓ Core ${this.id} ready`);

    } catch (error) {
      this.logger.error('core.startup_failed', { error: error.message });
      throw error;
    }
  }

  async initMQTT() {
    const brokerUrl = this.config.brokerUrl || 'mqtt://localhost:1883';

    try {
      // Intentar conectar a broker externo
      this.logger.info('mqtt.connecting', { url: brokerUrl });
      this.mqtt = await MQTTClient.connect(brokerUrl, {
        clientId: this.id,
        clean: false, // Persistent session
        reconnectPeriod: 1000,
        connectTimeout: 2000
      });

      this.logger.info('mqtt.connected', { url: brokerUrl, type: 'external' });

    } catch (error) {
      // Fallback: levantar broker embebido
      this.logger.warn('mqtt.external_unavailable', { error: error.message });
      this.logger.info('mqtt.starting_embedded');

      this.broker = new MQTTBroker({
        port: this.config.brokerPort || 1883
      });

      await this.broker.start();

      // Conectar a broker embebido
      this.mqtt = await MQTTClient.connect('mqtt://localhost:1883', {
        clientId: this.id,
        clean: false
      });

      this.logger.info('mqtt.connected', { type: 'embedded' });
    }
  }

  // API pública: Publicar evento
  async emit(eventType, data, options = {}) {
    return this.eventRouter.publish(eventType, data, options);
  }

  // API pública: Suscribirse a evento
  async on(eventPattern, handler) {
    // Suscribirse localmente
    this.eventBus.on(eventPattern, handler);

    // Si el pattern incluye wildcards, suscribirse también a MQTT
    if (eventPattern.includes('*') || eventPattern.includes('+')) {
      await this.eventSubscriber.subscribe(eventPattern);
    }
  }

  // API pública: Llamar API de otro core
  async request(targetCoreId, service, data, options) {
    return this.apiClient.request(targetCoreId, service, data, options);
  }

  // API pública: Registrar handler de API
  async registerAPI(service, handler) {
    this.apiServer.register(service, handler);
  }

  // Shutdown graceful
  async shutdown() {
    this.logger.info('core.shutting_down');

    try {
      // 1. Emitir evento shutdown
      await this.emit('core.shutdown', { core_id: this.id });

      // 2. Descargar todos los módulos
      for (const moduleName of this.moduleLoader.loadedModules.keys()) {
        await this.moduleLoader.unload(moduleName);
      }

      // 3. Detener hot-reload
      if (this.moduleManager) {
        this.moduleManager.stopWatching();
      }

      // 4. Cerrar HTTP Gateway
      if (this.httpGateway) {
        await this.httpGateway.stop();
      }

      // 5. Anunciar offline
      await this.mqtt.publish(`core/${this.id}/status`, JSON.stringify({
        core_id: this.id,
        state: 'offline',
        offline_at: Date.now()
      }), { retain: true, qos: 1 });

      // 6. Desconectar MQTT
      if (this.mqtt) {
        await this.mqtt.end();
      }

      // 7. Cerrar broker embebido (si existe)
      if (this.broker) {
        await this.broker.stop();
      }

      this.state = 'stopped';
      this.logger.info('core.shutdown_complete');

    } catch (error) {
      this.logger.error('core.shutdown_error', { error: error.message });
      throw error;
    }
  }

  generateShortId() {
    return Math.random().toString(36).substring(2, 8);
  }
}

module.exports = Core;
```

---

## 11. Decisiones de Diseño

### 11.1 Resumen de Decisiones Clave

| Decisión | Opción Elegida | Rationale |
|----------|---------------|-----------|
| **Broker MQTT** | Aedes embebido + fallback externo | Zero setup, evolutivo, Termux-friendly |
| **QoS Strategy** | QoS 1 eventos, QoS 0 telemetría | Balance confiabilidad/performance |
| **Topic Structure** | `core/{id}/{tipo}/{dominio}/{acción}` | Consistente, wildcards potentes, debuggable |
| **APIs** | Híbrido MQTT + HTTP | MQTT eventos async, HTTP síncronas |
| **Discovery** | Retained messages + heartbeat | Instantáneo, sin coordinación |
| **Schemas** | JSON Schema obligatorio | Contratos explícitos, validación automática |
| **Módulos** | Filesystem autodescubrimiento | Zero deps, hot-reload con fs.watch |
| **Observabilidad** | Logs JSON + W3C Traces + Métricas | Completo desde día 1 |
| **Filosofía** | Implementación a full, no MVPs | Calidad desde el inicio |

---

### 11.2 Trade-offs Conscientes

#### **MQTT vs gRPC/REST puro**

**Elegido:** MQTT
**Trade-off:**
- ✅ Pub/sub nativo, wildcards, retained messages, Last Will
- ❌ Menos familiar que REST, requiere broker

**Decisión:** MQTT resuelve tantos problemas automáticamente que compensa la menor familiaridad.

---

#### **Broker embebido vs externo obligatorio**

**Elegido:** Híbrido (embebido con fallback)
**Trade-off:**
- ✅ Zero setup, funciona out-of-the-box
- ❌ Broker embebido es single point of failure

**Decisión:** Para desarrollo y uso personal, zero setup es más valioso. En producción se puede usar broker externo cambiando solo URL.

---

#### **Hot-reload vs restart obligatorio**

**Elegido:** Hot-reload con fs.watch
**Trade-off:**
- ✅ DX excelente, iteración rápida
- ❌ Complejidad en module lifecycle, posibles memory leaks

**Decisión:** Hot-reload es crítico para DX. Memory leaks se mitigan con unload correcto y limpieza de require.cache.

---

#### **Zero deps vs usar librerías battle-tested**

**Elegido:** Zero deps (salvo Aedes, mqtt, Ajv)
**Trade-off:**
- ✅ Control total, portable, sin supply chain attacks
- ❌ Reinventar ruedas, más código a mantener

**Decisión:** Para un core que debe ser base estable, control total vale más que convenience. Las 4 deps elegidas son justificables (MQTT protocol, JSON Schema estándar).

---

#### **QoS 1 vs QoS 2**

**Elegido:** QoS 1 (at-least-once)
**Trade-off:**
- ✅ Retry automático, no pierde mensajes
- ❌ Puede duplicar mensajes

**Decisión:** QoS 2 es overkill (4-way handshake) y lento. Mejor QoS 1 + idempotencia en handlers (usando event_id para deduplicación).

---

### 11.3 Extensibilidad Futura

Decisiones que facilitan extensión futura:

1. **Topic structure jerárquica** - Fácil añadir niveles sin breaking changes
2. **Event envelope estándar** - Añadir campos opcionales sin romper parsers
3. **Module manifest declarativo** - Nuevas capabilities sin cambiar código core
4. **Observabilidad built-in** - Fácil integrar con Grafana, Prometheus, Jaeger
5. **Multi-transport posible** - Abstracción permite añadir WebSocket, gRPC más adelante

---

## 12. Siguiente Pasos

### 12.1 Roadmap de Implementación

**Semana 1: Core foundations**
- Día 1-2: MQTT broker + client, conexión híbrida
- Día 3-4: Event bus local, event router, validator
- Día 5-7: Module system (loader + manager + hot-reload)

**Semana 2: Features avanzados**
- Día 8-10: Discovery manager + heartbeat + Last Will
- Día 11-12: HTTP API Gateway + Request-Reply MQTT
- Día 13-14: Observabilidad (logger + tracer + metrics)

**Semana 3: CLI + Módulos + Docs**
- Día 15-17: CLI completo (start, status, modules, reload, logs)
- Día 18-19: 2-3 módulos ejemplo funcionales
- Día 20-21: Documentación completa + tests integración

**Timeline:** ~3 semanas trabajando intensivamente

---

### 12.2 Módulos Ejemplo Prioritarios

1. **echo** - Módulo trivial para testing
2. **file-watcher** - Observa filesystem y emite eventos
3. **ai-gateway** - Integración con Claude API

---

### 12.3 Validación del Core

**Criterios de éxito para v0.1.0:**

✅ Core inicia sin errores en Termux y Linux
✅ Broker embebido funciona automáticamente
✅ Módulos se cargan desde ./modules/
✅ Hot-reload detecta cambios y recarga
✅ Eventos locales se emiten correctamente
✅ Eventos MQTT se publican y reciben
✅ Discovery encuentra otros cores automáticamente
✅ Request-Reply funciona entre cores
✅ HTTP APIs responden correctamente
✅ Logs estructurados JSON se generan
✅ Traces W3C se propagan correctamente
✅ Métricas se publican periódicamente
✅ CLI funciona (start, status, modules, reload)
✅ 3 módulos ejemplo funcionan end-to-end
✅ Documentación completa con ejemplos ejecutables

---

## 13. Conclusión

Este documento captura **TODA** la conversación y decisiones sobre el Event Core, sin resumir nada.

**Lo que hace este core único:**
- Arquitectura fractal (mismos cimientos de casa a manzana)
- MQTT como protocolo unificador
- Zero dependencias filosofía
- Módulos como plugins con hot-reload
- Observabilidad built-in desde día 1
- Implementación completa, no MVPs

**El trabajo crítico identificado:**
- Gestión de suscripciones MQTT (quién recibe qué)
- Discovery automático robusto
- Hot-reload sin memory leaks
- Idempotencia en handlers (QoS 1 puede duplicar)
- Balance QoS/performance

**Próximo paso:**
Implementar el Core siguiendo este documento como especificación completa.

---

**Fin del documento.**

**Total:** ~50 páginas de diseño arquitectónico completo con todos los matices de la conversación.
