# Event Core - Quick Reference Guide

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      EVENT CORE v0.2.0                      │
│          Meta-Core Event-Driven Framework with MQTT         │
└─────────────────────────────────────────────────────────────┘

         ┌──────────────┐
         │   CLI Tool   │──────────┐
         └──────────────┘          │
                                   │
    ┌────────────────────────┐    │    ┌──────────────────┐
    │   Modules (Plugins)    │    │    │  HTTP Gateway    │
    │  - echo               │    │    │  (REST API)      │
    │  - security-p2p       │    │    │                  │
    │  - dashboard          │    ├───→├──────────────────┤
    │  - file-watcher       │    │    │  Request Handlers│
    │  - todo-list          │    │    └──────────────────┘
    └────────────────────────┘    │
                                   │    ┌──────────────────┐
    ┌────────────────────────┐    │    │   Web UI System  │
    │   Hook System          │    │    │  (WCAG Compliant)│
    │  (Interceptors)        │    └───→├──────────────────┤
    └────────────────────────┘         │  Dashboard      │
                                       │  Admin Interface│
    ┌────────────────────────┐         └──────────────────┘
    │   Event Bus            │
    │  Local + MQTT          │         ┌──────────────────┐
    └────────────────────────┘    ┌───→│  MQTT Broker     │
           ▲        │             │    │  (Aedes)        │
           │        │             │    │  Port: 1883     │
           └────────┼─────────────┘    └──────────────────┘
                    │
    ┌───────────────────────────────────────────────────────┐
    │         Observability Layer                           │
    │  ┌─────────────┐ ┌─────────┐ ┌──────────────────┐    │
    │  │   Logger    │ │ Tracer  │ │  Metrics         │    │
    │  │ (Structured)│ │(W3C)    │ │  (Counter/Histo) │    │
    │  └─────────────┘ └─────────┘ └──────────────────┘    │
    └───────────────────────────────────────────────────────┘
                    │
    ┌───────────────────────────────────────────────────────┐
    │         Configuration & Service Discovery            │
    │  ┌──────────┐ ┌──────────────┐ ┌─────────────────┐   │
    │  │Config    │ │Service Reg   │ │ Port Manager    │   │
    │  │(CLI/ENV) │ │(Discovery)   │ │ (Auto-alloc)    │   │
    │  └──────────┘ └──────────────┘ └─────────────────┘   │
    └───────────────────────────────────────────────────────┘
```

## Critical Components & Files

### 1. CORE INFRASTRUCTURE (core/)
| Component | File | Purpose | LOC |
|-----------|------|---------|-----|
| **Hooks** | `core/hooks.js` | Interception system | 262 |
| **MQTT** | `core/mqtt/client.js` | MQTT with fallback | 445 |
| **Events** | `core/events/bus.js` | Event pub/sub | 370 |
| **Modules** | `core/modules/loader.js` | Module discovery | 607 |
| **Gateway** | `core/gateway/http.js` | HTTP API server | 400+ |
| **Logger** | `core/observability/logger.js` | Logging | 100+ |
| **Config** | `core/config/index.js` | Configuration | 222 |

### 2. MODULE ARCHITECTURE
```
modules/{name}/
├── module.json       # Manifest (name, version, APIs, hooks)
├── index.js         # Module class (onLoad, onUnload, handlers)
└── [optional]       # Assets, helpers, etc.
```

**Existing Modules:**
- `echo` - Example/testing module
- `security-p2p` - P2P encryption & trust
- `dashboard` - Observability UI
- `file-watcher` - File system monitoring
- `todo-list` - Data management

### 3. INITIALIZATION SEQUENCE (index.js)

```
1️⃣  Parse CLI Args & Config
    ↓
2️⃣  Initialize Observability (Logger, Tracer, Metrics)
    ↓
3️⃣  Connect MQTT Broker (external or embedded)
    ↓
4️⃣  Initialize Hook System
    ↓
5️⃣  Initialize Event Bus (local + distributed)
    ↓
6️⃣  Load Modules (auto-discovery)
    ↓
7️⃣  Start HTTP Gateway (REST API)
    ↓
🎯 CORE RUNNING (heartbeat, signal handlers)
```

## API Quick Reference

### Hook System
```javascript
core.hooks.register('beforeEventPublish', async (ctx) => {
  // Modify or block events
  return ctx;  // Continue / null to block
});
```

### Event Bus
```javascript
// Publish event
await core.events.emit('user.created', { id: 123 });

// Subscribe locally
core.events.on('user.created', (envelope) => {
  console.log(envelope.data);
});

// Send to specific core
await core.events.emitTo('core-b', 'user.created', data);
```

### HTTP API Handler
```javascript
class MyModule {
  async handleGetData(req) {
    // req = { method, path, query, body, headers, request_id }
    return { data: [...] };  // Becomes JSON response
  }
}
```

### Logging & Metrics
```javascript
core.logger.info('event.published', { event_type: 'user.created' });
core.metrics.increment('events.published');
await core.metrics.measure('db.query', async () => {
  return await db.query('SELECT * FROM users');
});
```

## Configuration Priority

```
CLI Arguments (--port 3000)
    ↑
Environment Variables (EVENT_CORE_PORT=3000)
    ↑
config.production.json
    ↑
config.json (default)
```

## Testing

```bash
# Run all tests
npm test

# Specific test suites
npm run test:hooks           # Hook system
npm run test:observability   # Logging/tracing
npm run test:gateway         # HTTP Gateway
npm run test:security        # P2P security
npm run test:integration     # Full system
```

**Test Coverage:** 2,215 lines across 7 files

## Design Patterns Used

✅ **Event-Driven Architecture** - Pub/Sub via EventBus + MQTT
✅ **Plugin Architecture** - Dynamic module loading/unloading
✅ **Middleware/Hooks** - Interceptors for cross-cutting concerns
✅ **Registry Pattern** - Module & Service registries
✅ **Adapter Pattern** - MQTT/HTTP adapters
✅ **Configuration Pattern** - Layered config management
✅ **Observability Pattern** - Logging, tracing, metrics

## Key Strengths

✅ Modular, zero coupling between components
✅ Highly extensible (hooks, modules, config)
✅ Distributed event-driven architecture
✅ Comprehensive observability (logging, tracing, metrics)
✅ Graceful degradation (embedded broker fallback)
✅ Hot-reload support for development
✅ Minimal dependencies (only mqtt, aedes, ajv, dotenv)

## Areas for Improvement

🔧 Input validation (JSON schema integration)
🔧 Rate limiting on HTTP endpoints
🔧 Security (authentication, authorization)
🔧 Performance (connection pooling, caching)
🔧 Module dependency resolution
🔧 Secrets management
🔧 Error code standardization

## Critical Data Flows

### Event Publishing
```
Module → EventBus → Hooks → Envelope → MQTT Publish → Remote Cores
```

### HTTP Request
```
Request → Parser → Hooks → Registry Lookup → Handler → Response
```

### Module Loading
```
Discover → Validate → Instantiate → onLoad() → Register → Ready
```

## Configuration Examples

```bash
# Start with custom port
node index.js --port 3001 --core-id core-b

# Production with external broker
NODE_ENV=production \
EVENT_CORE_BROKER_HOST=mqtt.example.com \
EVENT_CORE_LOG_LEVEL=warn \
node index.js

# Development with debug logging
EVENT_CORE_LOG_LEVEL=debug node index.js

# Custom modules path
node index.js --modules-path /path/to/modules
```

## Performance Characteristics

| Metric | Value |
|--------|-------|
| Startup Time | < 1 second |
| MQTT Latency | < 10ms (local) |
| HTTP Response | < 50ms (typical) |
| Memory | 40-60MB |
| CPU (idle) | < 5% |

## File Paths Summary

```
/home/user/event-core/
├── index.js                                      # Entry point
├── config.json                                   # Default config
├── package.json                                  # Dependencies
│
├── core/                                         # Infrastructure
│   ├── hooks.js
│   ├── mqtt/client.js
│   ├── broker/embedded.js
│   ├── events/bus.js
│   ├── modules/loader.js
│   ├── gateway/http.js
│   ├── observability/*.js
│   └── utils/service-registry.js
│
├── modules/                                      # Plugins
│   ├── echo/
│   ├── security-p2p/
│   ├── dashboard/
│   ├── file-watcher/
│   └── todo-list/
│
├── tests/                                        # Test suite
│   ├── unit/hooks.test.js
│   ├── unit/observability.test.js
│   ├── unit/http-gateway.test.js
│   └── integration/full-stack.test.js
│
├── cli/                                          # Command-line tool
│   ├── index.js
│   └── client.js
│
└── ui/                                           # Web UI
    ├── renderer/
    ├── admin/
    └── styles/
```

## Quick Start Commands

```bash
# Install dependencies
npm install

# Start core
npm start

# Start with debug logging
npm run dev

# Run tests
npm test

# CLI commands
event-core health                    # Health check
event-core stats                     # Get stats
event-core call GET /modules         # List modules
event-core call GET /modules/echo/ping  # Call API
```

## Status Matrix

| Component | Status | Quality | Notes |
|-----------|--------|---------|-------|
| Hooks | ✅ v1.0 | Excellent | Full interception support |
| MQTT | ✅ v1.0 | Good | Embedded + external broker |
| Events | ✅ v1.0 | Excellent | Local + distributed |
| Modules | ✅ v1.0 | Excellent | Full hot-reload support |
| Gateway | ✅ v1.0 | Good | Built-in http module |
| Observability | ✅ v1.0 | Excellent | Complete stack |
| Testing | ⚠️ v0.8 | Good | 2,215 LOC coverage |
| Security | ⚠️ v0.7 | Fair | P2P module included |
| Documentation | ✅ v1.0 | Excellent | Comprehensive |

---

**Full Analysis:** See `COMPREHENSIVE_TECHNICAL_ANALYSIS.md`
