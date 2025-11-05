# Arquitectura Final del Event Core

**Documento Maestro de Arquitectura**
**Versión:** 1.0.0
**Fecha:** 2025-10-06

---

## 🎯 Principios Arquitectónicos

### 1. Core Minimalista

El **core** es deliberadamente minimalista y contiene SOLO:

✅ Event bus local (EventEmitter)
✅ MQTT broker embebido + cliente
✅ Module system (loader, hot-reload)
✅ HTTP API Gateway (expone APIs)
✅ Discovery básico (retained messages)
✅ Observabilidad (logs, traces, métricas)
✅ **Sistema de hooks** (para que módulos intercepten)

❌ **NO contiene:** Security, business logic, features específicas

### 2. Todo como Módulos

**TODA la funcionalidad especializada son módulos:**

- `security-p2p` - Seguridad P2P con llaves maestras
- `file-watcher` - Observador de filesystem
- `ai-gateway` - Integración con Claude API
- `storage-manager` - Gestión de datos persistentes
- Cualquier otra feature...

**Ventajas:**
- Core simple y estable
- Hot-reload de cualquier feature
- Testing aislado por módulo
- Múltiples implementaciones (ej: varios módulos de security)

### 3. Comunicación 100% API

**TODA comunicación es vía API:**

- **HTTP REST** - Operaciones síncronas (status, reload, etc.)
- **MQTT Pub/Sub** - Eventos asíncronos (file.created, etc.)
- **MQTT Request-Reply** - Llamadas async entre cores

**El CLI es solo un cliente HTTP** que consume las mismas APIs que:
- Web UI
- Mobile app
- Otros cores
- Scripts externos

---

## 📐 Diagrama de Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                         EVENT CORE                              │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ MQTT Broker (Aedes) + MQTT Client                         │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────┐ │
│  │  Event Bus   │  │ HTTP Gateway │  │  Module System      │ │
│  │ (EventEmit)  │  │ (APIs REST)  │  │ (Loader+Hot-reload) │ │
│  └──────────────┘  └──────────────┘  └─────────────────────┘ │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────┐ │
│  │  Discovery   │  │ Observability│  │  Hook System        │ │
│  │  (Retained)  │  │ (Logs/Trace) │  │  (Interceptors)     │ │
│  └──────────────┘  └──────────────┘  └─────────────────────┘ │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                    ┌─────────┴──────────┐
                    │     MODULES        │
                    └─────────┬──────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
┌───────▼────────┐  ┌────────▼────────┐  ┌────────▼────────┐
│  security-p2p  │  │  file-watcher   │  │   ai-gateway    │
│                │  │                 │  │                 │
│ • KeyManager   │  │ • fs.watch()    │  │ • Claude API    │
│ • Handshake    │  │ • Emit events   │  │ • NLP requests  │
│ • Encryption   │  │                 │  │                 │
│                │  │                 │  │                 │
│ Hooks:         │  │ Hooks:          │  │ Hooks:          │
│ • beforePublish│  │ • none          │  │ • beforePublish │
│ • beforeReceive│  │                 │  │                 │
│                │  │                 │  │                 │
│ APIs:          │  │ APIs:           │  │ APIs:           │
│ • /trust       │  │ • /watch        │  │ • /analyze      │
│ • /revoke      │  │ • /unwatch      │  │ • /complete     │
└────────────────┘  └─────────────────┘  └─────────────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
                   HTTP/MQTT APIs
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
┌───────▼────────┐  ┌────────▼────────┐  ┌────────▼────────┐
│   CLI (HTTP)   │  │  Web UI (HTTP)  │  │ Otro Core       │
│                │  │                 │  │ (MQTT)          │
│ • core status  │  │ • Dashboard     │  │ • Pub/Sub       │
│ • core trust   │  │ • Logs view     │  │ • Request-Reply │
│ • core reload  │  │ • Metrics       │  │                 │
└────────────────┘  └─────────────────┘  └─────────────────┘
```

---

## 🔌 Sistema de Hooks

### Concepto

Los **hooks** permiten a los módulos **interceptar** operaciones del core sin modificarlo.

**Hooks disponibles:**

```javascript
{
  beforeEventPublish: [],   // Antes de publicar evento (puede cifrar)
  afterEventPublish: [],    // Después de publicar evento
  beforeEventReceive: [],   // Antes de emitir evento localmente (puede descifrar)
  afterEventReceive: [],    // Después de emitir evento
  beforeModuleLoad: [],     // Antes de cargar módulo
  afterModuleLoad: [],      // Después de cargar módulo
  beforeAPICall: [],        // Antes de ejecutar API
  afterAPICall: []          // Después de ejecutar API
}
```

### Implementación en Core

```javascript
// core/core.js

class Core extends EventEmitter {
  constructor(config) {
    super();
    this.hooks = {
      beforeEventPublish: [],
      afterEventPublish: [],
      beforeEventReceive: [],
      afterEventReceive: [],
      beforeModuleLoad: [],
      afterModuleLoad: [],
      beforeAPICall: [],
      afterAPICall: []
    };
  }

  // Registrar hook (módulos llaman esto)
  registerHook(hookName, handler) {
    if (!this.hooks[hookName]) {
      throw new Error(`Unknown hook: ${hookName}`);
    }

    this.hooks[hookName].push(handler);

    this.logger.debug('hook.registered', {
      hook: hookName,
      module: handler.module || 'unknown'
    });
  }

  // Ejecutar hooks en secuencia
  async executeHooks(hookName, context) {
    const handlers = this.hooks[hookName] || [];

    let currentContext = context;

    for (const handler of handlers) {
      try {
        const result = await handler(currentContext);

        // Si el hook retorna null, bloquear la operación
        if (result === null) {
          this.logger.warn('hook.blocked', {
            hook: hookName,
            reason: 'handler_returned_null'
          });
          return null;
        }

        // Si el hook modifica el contexto, usar la versión modificada
        if (result !== undefined) {
          currentContext = result;
        }

      } catch (error) {
        this.logger.error('hook.error', {
          hook: hookName,
          error: error.message
        });

        // Si un hook falla, continuar con los demás
        // (o podrías decidir bloquear la operación)
      }
    }

    return currentContext;
  }

  // Publicar evento (con hooks)
  async emit(eventType, data, options = {}) {
    // Hook: beforeEventPublish
    const context = await this.executeHooks('beforeEventPublish', {
      eventType,
      data,
      options
    });

    // Si un hook bloqueó el evento
    if (context === null) {
      this.logger.warn('event.blocked', { eventType });
      return;
    }

    // Publicar evento con contexto (posiblemente modificado)
    await this.eventRouter.publish(
      context.eventType,
      context.data,
      context.options
    );

    // Hook: afterEventPublish
    await this.executeHooks('afterEventPublish', context);
  }

  // Recibir evento MQTT (con hooks)
  async handleMQTTMessage(topic, message) {
    const event = JSON.parse(message.toString());

    // Hook: beforeEventReceive
    const context = await this.executeHooks('beforeEventReceive', {
      topic,
      message,
      event
    });

    // Si un hook bloqueó el evento
    if (context === null) {
      this.logger.warn('event.receive.blocked', { topic });
      return;
    }

    // Emitir evento localmente
    this.eventBus.emit(context.event.event_type, context.event);

    // Hook: afterEventReceive
    await this.executeHooks('afterEventReceive', context);
  }
}
```

### Ejemplo: Módulo usando Hooks

```javascript
// modules/security-p2p/index.js

class SecurityP2PModule {
  async onLoad() {
    // Registrar hooks
    this.core.registerHook(
      'beforeEventPublish',
      this.interceptPublish.bind(this)
    );

    this.core.registerHook(
      'beforeEventReceive',
      this.interceptReceive.bind(this)
    );
  }

  // Hook: Cifrar eventos salientes a peers trusted
  async interceptPublish(context) {
    const { eventType, data, options } = context;

    // Si el evento va a un peer trusted, cifrarlo
    if (options.targetCoreId && this.keyManager.isPeerTrusted(options.targetCoreId)) {
      console.log(`🔒 Encrypting event for ${options.targetCoreId}`);

      const secureMessage = this.secureEnvelope.encryptForPeer(
        options.targetCoreId,
        { event_type: eventType, data }
      );

      // Modificar contexto
      return {
        eventType: 'secure.encrypted',  // Cambiar tipo de evento
        data: secureMessage,             // Data cifrada
        options: {
          ...options,
          topic: `core/${options.targetCoreId}/events/secure`,
          _encrypted: true
        }
      };
    }

    // No modificar contexto si no es para peer trusted
    return context;
  }

  // Hook: Descifrar eventos entrantes
  async interceptReceive(context) {
    const { topic, event } = context;

    // Si es un mensaje seguro
    if (topic.includes('/events/secure')) {
      const sourceCoreId = event.source.core_id;

      // Verificar trust
      if (!this.keyManager.isPeerTrusted(sourceCoreId)) {
        console.warn(`🚫 Blocked message from untrusted: ${sourceCoreId}`);
        return null; // Bloquear evento
      }

      // Descifrar
      try {
        const decrypted = this.secureEnvelope.decryptFromPeer(
          sourceCoreId,
          event.data
        );

        console.log(`🔓 Decrypted event from ${sourceCoreId}`);

        // Modificar evento
        return {
          topic,
          message: context.message,
          event: {
            ...event,
            event_type: decrypted.event_type,
            data: decrypted.data,
            source: { ...event.source, secure: true }
          }
        };

      } catch (error) {
        console.error('Decryption failed:', error);
        return null; // Bloquear si no se puede descifrar
      }
    }

    return context; // No modificar
  }
}
```

---

## 🌐 HTTP API Gateway

### Responsabilidades

1. **Exponer APIs REST** del core
2. **Permitir que módulos registren APIs** automáticamente
3. **Routing** de requests a handlers correctos
4. **CORS, parsing, error handling**

### Implementación

```javascript
// core/api/http-gateway.js

class HTTPGateway {
  constructor(core, port = 3000) {
    this.core = core;
    this.port = port;
    this.routes = new Map();
    this.server = null;
  }

  async start() {
    // 1. Registrar rutas del core
    this.registerCoreRoutes();

    // 2. Escuchar cuando módulos se cargan
    this.core.on('module.loaded', (moduleData) => {
      this.registerModuleRoutes(moduleData);
    });

    // 3. Iniciar servidor HTTP
    const http = require('http');
    this.server = http.createServer(this.handleRequest.bind(this));

    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
        console.log(`✓ HTTP API Gateway listening on :${this.port}`);
        resolve();
      });
    });
  }

  registerCoreRoutes() {
    // GET /status
    this.register('GET', '/status', async () => ({
      core_id: this.core.id,
      version: this.core.version,
      state: this.core.state,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      modules: this.core.moduleLoader.loadedModules.size,
      trusted_peers: this.core.security?.getTrustedPeers().length || 0
    }));

    // GET /modules
    this.register('GET', '/modules', async () => {
      return this.core.moduleLoader.list();
    });

    // POST /modules/reload/:name
    this.register('POST', '/modules/reload/:name', async (params) => {
      await this.core.moduleLoader.reload(params.name);
      return { status: 'reloaded', module: params.name };
    });

    // GET /cores (discovered)
    this.register('GET', '/cores', async () => {
      return this.core.discovery.getDiscoveredCores();
    });

    // GET /metrics
    this.register('GET', '/metrics', async () => ({
      counters: this.core.metrics.serializeCounters(),
      histograms: this.core.metrics.serializeHistograms(),
      gauges: this.core.metrics.serializeGauges()
    }));

    // GET /logs?limit=100
    this.register('GET', '/logs', async (params, query) => {
      const limit = parseInt(query.limit || '100');
      return this.core.logger.getRecent(limit);
    });

    // POST /events (publish event via HTTP)
    this.register('POST', '/events', async (params, query, body) => {
      await this.core.emit(body.event_type, body.data, body.options || {});
      return { status: 'published', event_type: body.event_type };
    });
  }

  // Módulos registran sus APIs automáticamente
  registerModuleRoutes(moduleData) {
    const manifest = moduleData.manifest;

    if (!manifest.provides?.apis) return;

    console.log(`Registering APIs for module: ${manifest.name}`);

    manifest.provides.apis.forEach(api => {
      const fullPath = `/modules/${manifest.name}${api.path}`;

      this.register(api.method, fullPath, async (params, query, body) => {
        // Hook: beforeAPICall
        const hookContext = await this.core.executeHooks('beforeAPICall', {
          module: manifest.name,
          api: api.name,
          params,
          query,
          body
        });

        if (hookContext === null) {
          throw new Error('API call blocked by hook');
        }

        // Llamar handler del módulo
        const handler = moduleData.instance[api.name];
        if (!handler) {
          throw new Error(`API handler not found: ${api.name}`);
        }

        const result = await handler.call(moduleData.instance, {
          params: hookContext.params,
          query: hookContext.query,
          body: hookContext.body
        });

        // Hook: afterAPICall
        await this.core.executeHooks('afterAPICall', {
          module: manifest.name,
          api: api.name,
          result
        });

        return result;
      });

      console.log(`  ${api.method} ${fullPath}`);
    });
  }

  register(method, path, handler) {
    const key = `${method}:${path}`;
    this.routes.set(key, { handler, pathPattern: path });
  }

  async handleRequest(req, res) {
    const url = require('url');
    const parsedUrl = url.parse(req.url, true);

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');

    // OPTIONS (preflight)
    if (req.method === 'OPTIONS') {
      res.statusCode = 200;
      res.end();
      return;
    }

    try {
      // Parsear body
      const body = await this.parseBody(req);

      // Buscar ruta
      const route = this.matchRoute(req.method, parsedUrl.pathname);

      if (!route) {
        res.statusCode = 404;
        res.end(JSON.stringify({
          error: 'Not found',
          path: parsedUrl.pathname
        }));
        return;
      }

      // Log request
      this.core.logger.debug('http.request', {
        method: req.method,
        path: parsedUrl.pathname,
        params: route.params
      });

      // Ejecutar handler
      const result = await route.handler(
        route.params,
        parsedUrl.query,
        body
      );

      // Responder
      res.statusCode = 200;
      res.end(JSON.stringify(result));

      // Métricas
      this.core.metrics.increment('http.requests', {
        method: req.method,
        status: 200
      });

    } catch (error) {
      console.error('HTTP error:', error);

      res.statusCode = error.statusCode || 500;
      res.end(JSON.stringify({
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }));

      this.core.metrics.increment('http.requests', {
        method: req.method,
        status: res.statusCode
      });
    }
  }

  matchRoute(method, path) {
    // Match exacto
    const exactKey = `${method}:${path}`;
    if (this.routes.has(exactKey)) {
      return {
        handler: this.routes.get(exactKey).handler,
        params: {}
      };
    }

    // Match con parámetros (/modules/reload/:name)
    for (const [key, route] of this.routes.entries()) {
      if (!key.startsWith(`${method}:`)) continue;

      const pattern = route.pathPattern;

      // Convertir pattern a regex
      const paramNames = [];
      const regexPattern = pattern.replace(/:\w+/g, (match) => {
        paramNames.push(match.slice(1)); // Remove ':'
        return '([^/]+)';
      });

      const regex = new RegExp(`^${regexPattern}$`);
      const match = path.match(regex);

      if (match) {
        const params = {};
        paramNames.forEach((name, i) => {
          params[name] = match[i + 1];
        });

        return { handler: route.handler, params };
      }
    }

    return null;
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

module.exports = HTTPGateway;
```

---

## 📱 CLI como Cliente HTTP Puro

### Filosofía

El **CLI NO tiene lógica de negocio**, solo:
- Parsea argumentos de línea de comandos
- Hace HTTP requests al core
- Formatea la salida para consola

**Ventajas:**
- CLI puede conectarse a core remoto
- Mismas APIs para CLI, Web UI, scripts
- Testing más fácil (test las APIs, no el CLI)

### Implementación

```javascript
// cli/index.js

const http = require('http');

class CoreCLI {
  constructor(coreUrl = 'http://localhost:3000') {
    this.coreUrl = coreUrl;
  }

  // Hacer request HTTP al core
  async request(method, path, body = null) {
    return new Promise((resolve, reject) => {
      const url = require('url');
      const parsedUrl = url.parse(`${this.coreUrl}${path}`);

      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 3000,
        path: parsedUrl.path,
        method,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'CoreCLI/1.0'
        }
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);

            if (res.statusCode >= 400) {
              reject(new Error(parsed.error || 'Request failed'));
            } else {
              resolve(parsed);
            }
          } catch {
            resolve(data);
          }
        });
      });

      req.on('error', reject);

      if (body) {
        req.write(JSON.stringify(body));
      }

      req.end();
    });
  }

  // === COMANDOS ===

  async status() {
    const status = await this.request('GET', '/status');

    console.log('\n📊 Core Status\n');
    console.log(`  Core ID:       ${status.core_id}`);
    console.log(`  Version:       ${status.version}`);
    console.log(`  State:         ${status.state}`);
    console.log(`  Uptime:        ${Math.floor(status.uptime)}s`);
    console.log(`  Modules:       ${status.modules}`);
    console.log(`  Trusted Peers: ${status.trusted_peers}`);
    console.log('');
  }

  async listModules() {
    const modules = await this.request('GET', '/modules');

    console.log('\n📦 Loaded Modules\n');

    if (modules.length === 0) {
      console.log('  (none)');
    } else {
      modules.forEach(m => {
        console.log(`  • ${m.name}@${m.version}`);
        console.log(`    Status: ${m.status || 'loaded'}`);
        console.log(`    Loaded: ${new Date(m.loadedAt).toLocaleString()}`);
        console.log('');
      });
    }
  }

  async reloadModule(name) {
    console.log(`\n🔄 Reloading module: ${name}...\n`);

    const result = await this.request('POST', `/modules/reload/${name}`);

    console.log(`✓ ${result.module} reloaded successfully`);
    console.log('');
  }

  async listCores() {
    const cores = await this.request('GET', '/cores');

    console.log('\n🌐 Discovered Cores\n');

    if (cores.length === 0) {
      console.log('  (none)');
    } else {
      cores.forEach(c => {
        console.log(`  • ${c.core_id}`);
        console.log(`    State: ${c.state}`);
        console.log(`    Version: ${c.version}`);
        console.log(`    Last seen: ${new Date(c.last_seen).toLocaleString()}`);
        console.log('');
      });
    }
  }

  async trustPeer(coreId, publicKeyPath) {
    const fs = require('fs');

    if (!fs.existsSync(publicKeyPath)) {
      throw new Error(`Public key file not found: ${publicKeyPath}`);
    }

    const publicKey = fs.readFileSync(publicKeyPath, 'utf8');

    console.log(`\n🤝 Initiating trust with ${coreId}...\n`);

    const result = await this.request('POST', '/modules/security-p2p/trust', {
      core_id: coreId,
      public_key: publicKey
    });

    console.log(`✓ Handshake initiated`);
    console.log(`  Status: ${result.status}`);
    console.log(`  Fingerprint: ${result.fingerprint}`);
    console.log('');
    console.log('⏳ Waiting for peer response (may take up to 30s)...');
  }

  async listTrusted() {
    const result = await this.request('GET', '/modules/security-p2p/trusted');

    console.log('\n🔒 Trusted Peers\n');

    if (result.peers.length === 0) {
      console.log('  (none)');
    } else {
      result.peers.forEach(p => {
        console.log(`  • ${p.core_id}`);
        console.log(`    Fingerprint: ${p.fingerprint}`);
        console.log(`    Since: ${new Date(p.activatedAt).toLocaleString()}`);
        console.log('');
      });
    }
  }

  async revokePeer(coreId) {
    console.log(`\n🚫 Revoking trust for ${coreId}...\n`);

    const result = await this.request('POST', '/modules/security-p2p/revoke', {
      core_id: coreId
    });

    console.log(`✓ Trust revoked`);
    console.log(`  Core: ${result.core_id}`);
    console.log('');
  }

  async showPublicKey() {
    const result = await this.request('GET', '/modules/security-p2p/public-key');

    console.log('\n🔑 Public Key (share with trusted peers)\n');
    console.log(result.public_key);
    console.log('\n📌 Fingerprint (for verification):\n');
    console.log(result.fingerprint);
    console.log('');
  }

  async logs(limit = 100) {
    const logs = await this.request('GET', `/logs?limit=${limit}`);

    console.log(`\n📝 Recent Logs (last ${limit})\n`);

    logs.forEach(log => {
      const timestamp = new Date(log.timestamp).toLocaleTimeString();
      const level = log.level.toUpperCase().padEnd(5);
      console.log(`[${timestamp}] ${level} ${log.message}`);

      if (log.context && Object.keys(log.context).length > 0) {
        console.log(`  ${JSON.stringify(log.context)}`);
      }
    });

    console.log('');
  }
}

// Entry point del CLI
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  // Permitir override de URL del core
  const coreUrl = process.env.CORE_URL || 'http://localhost:3000';
  const cli = new CoreCLI(coreUrl);

  try {
    switch (command) {
      case 'status':
        await cli.status();
        break;

      case 'modules':
        await cli.listModules();
        break;

      case 'reload':
        if (!args[1]) throw new Error('Usage: core reload <module-name>');
        await cli.reloadModule(args[1]);
        break;

      case 'cores':
        await cli.listCores();
        break;

      case 'trust-peer':
        if (!args[1] || !args[2]) {
          throw new Error('Usage: core trust-peer <core-id> <public-key-file>');
        }
        await cli.trustPeer(args[1], args[2]);
        break;

      case 'list-trusted':
        await cli.listTrusted();
        break;

      case 'revoke-peer':
        if (!args[1]) throw new Error('Usage: core revoke-peer <core-id>');
        await cli.revokePeer(args[1]);
        break;

      case 'show-public-key':
        await cli.showPublicKey();
        break;

      case 'logs':
        await cli.logs(parseInt(args[1] || '100'));
        break;

      default:
        console.log('\nUsage: core <command> [args]\n');
        console.log('Commands:');
        console.log('  status                     Show core status');
        console.log('  modules                    List loaded modules');
        console.log('  reload <name>              Reload module');
        console.log('  cores                      List discovered cores');
        console.log('  trust-peer <id> <key>      Trust new peer');
        console.log('  list-trusted               List trusted peers');
        console.log('  revoke-peer <id>           Revoke trust');
        console.log('  show-public-key            Show public key');
        console.log('  logs [limit]               Show recent logs');
        console.log('');
        console.log('Environment:');
        console.log('  CORE_URL                   Core API URL (default: http://localhost:3000)');
        console.log('');
        break;
    }
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}\n`);
    process.exit(1);
  }
}

// Ejecutar si es entry point
if (require.main === module) {
  main();
}

module.exports = CoreCLI;
```

### Uso del CLI

```bash
# Local
$ core status
$ core modules
$ core trust-peer core-b ./peer-b-key.pem

# Remoto (cambiando solo URL)
$ CORE_URL=http://192.168.1.100:3000 core status
$ CORE_URL=http://core-remote.example.com:3000 core modules

# Scripts pueden usar las mismas APIs
$ curl http://localhost:3000/status
$ curl -X POST http://localhost:3000/modules/reload/echo
```

---

## 🔒 Security como Módulo

Ver documento completo: `docs/SECURITY_MODULE.md`

**Resumen:**
- Security es un **módulo** (`modules/security-p2p/`)
- Usa **hooks** para interceptar eventos (cifrar/descifrar)
- Registra **APIs HTTP** automáticamente
- **Opcional** - core funciona sin él

---

## 📊 Comparación: Antes vs Ahora

| Aspecto | ❌ Antes (Incorrecto) | ✅ Ahora (Correcto) |
|---------|----------------------|---------------------|
| **Security** | En el core | Módulo opcional |
| **CLI** | Lógica embebida | Cliente HTTP puro |
| **APIs** | Dispersas | Centralizadas en HTTP Gateway |
| **Extensibilidad** | Modificar core | Añadir módulos |
| **Testing** | Acoplado | Aislado por módulo |
| **Hot-reload** | Solo módulos básicos | Todo (incluso security) |
| **Remoto** | CLI solo local | CLI funciona remoto cambiando URL |

---

## 🎯 Implementación

### Orden de Implementación

**Semana 1: Core Minimalista**
1. MQTT Broker + Client
2. Event Bus + Router básico
3. Module Loader + Hot-reload
4. Sistema de Hooks
5. HTTP API Gateway

**Semana 2: Observabilidad + Discovery**
1. Logger estructurado
2. Tracer (W3C)
3. Metrics
4. Discovery Manager

**Semana 3: Módulos + CLI**
1. Módulo `security-p2p` completo
2. Módulo `echo` (testing)
3. Módulo `file-watcher`
4. CLI completo

**Timeline:** 3 semanas trabajo intensivo

---

## ✅ Criterios de Éxito

El core está listo cuando:

✅ Core inicia sin módulos y funciona
✅ HTTP API Gateway responde `/status`
✅ Módulos se cargan desde `./modules/`
✅ Hot-reload detecta cambios
✅ Hooks funcionan (módulo puede interceptar eventos)
✅ CLI conecta local y remoto
✅ Módulo `security-p2p` cifra/descifra correctamente
✅ Discovery encuentra otros cores
✅ Logs/traces/metrics se generan
✅ Tests pasan (unit + integration)

---

**Fin del documento de Arquitectura Final.**
