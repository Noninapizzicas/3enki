# Cambios Arquitectónicos - Refactorización

**Documento de Control de Cambios**
**Fecha:** 2025-10-06
**Versión:** 1.0.0
**Tipo:** Refactorización Arquitectónica Mayor

---

## 🎯 Resumen Ejecutivo

Se realizaron dos correcciones arquitectónicas críticas basadas en feedback del usuario:

1. **Security de componente core → módulo especializado**
2. **CLI de herramienta con lógica → cliente HTTP puro**

Estas correcciones mejoran significativamente la modularidad, testabilidad y escalabilidad del sistema.

---

## 📊 Comparación Antes/Después

### **Arquitectura Original (Incorrecta)**

```
Core (Monolítico)
├── core/security/          ← Security dentro del core
│   ├── key-manager.js
│   ├── crypto-handshake.js
│   └── secure-envelope.js
└── cli/commands/           ← CLI con lógica de negocio
    └── security.js         ← Acceso directo a this.core
```

**Problemas:**
- ❌ Security no es hot-reloadable
- ❌ Core tiene features, no solo infraestructura
- ❌ CLI no puede conectarse a core remoto
- ❌ Duplicación de lógica (CLI tiene business logic)
- ❌ CLI fuertemente acoplado al Core

### **Arquitectura Refactorizada (Correcta)**

```
Core (Minimalista)
├── hooks/                  ← Sistema de hooks
└── api/                    ← HTTP Gateway

modules/
└── security-p2p/           ← Security como módulo
    ├── module.json
    ├── index.js           ← Hook-based integration
    ├── key-manager.js
    ├── crypto-handshake.js
    └── secure-envelope.js

cli/
└── index.js               ← Pure HTTP client
```

**Beneficios:**
- ✅ Security es hot-reloadable
- ✅ Core solo tiene infraestructura
- ✅ CLI funciona local y remoto
- ✅ Zero duplicación de lógica
- ✅ CLI desacoplado del Core

---

## 🔄 Cambios Específicos

### 1. Security como Módulo

#### **Antes:**
```javascript
// core/core.js
class Core {
  async start() {
    this.keyManager = new KeyManager(this);
    this.cryptoHandshake = new CryptoHandshake(this, this.keyManager);
    // ...
  }

  async emitSecure(eventType, data) {
    return this.secureRouter.publishSecure(eventType, data);
  }
}
```

#### **Después:**
```javascript
// core/core.js
class Core {
  constructor() {
    this.hooks = new HookManager();  // ← Hook system
  }
}

// modules/security-p2p/index.js
class SecurityP2PModule {
  async onLoad(core) {
    this.keyManager = new KeyManager(core);
    core.hooks.register('beforeEventPublish', this.encryptOutgoingEvent.bind(this));
  }
}
```

**Cambios:**
- Security se inicializa en `modules/security-p2p/index.js`, no en `core/core.js`
- Core no conoce Security, solo provee hooks
- Security intercepta eventos via hooks

---

### 2. CLI como Cliente HTTP

#### **Antes:**
```javascript
// cli/commands/security.js
class SecurityCommands {
  constructor(core) {
    this.core = core;  // ← Acceso directo al Core
  }

  async status() {
    const fingerprint = this.core.keyManager.getPublicKeyFingerprint();  // ← Llamada directa
    console.log(fingerprint);
  }
}
```

#### **Después:**
```javascript
// cli/index.js
class CoreCLI {
  constructor(coreUrl = 'http://localhost:3000') {
    this.coreUrl = coreUrl;  // ← Solo URL del core
  }

  async securityStatus() {
    const data = await this.request('GET', '/modules/security-p2p/status');  // ← HTTP request
    console.log(data.fingerprint);  // ← Solo renderizar
  }
}
```

**Cambios:**
- CLI no tiene referencia al Core
- CLI hace HTTP requests en lugar de llamadas directas
- CLI puede conectarse a core remoto via `CORE_URL` env var

---

## 📋 Archivos Modificados

### Documentación Actualizada

1. **`docs/SECURITY_ARCHITECTURE.md`**
   - Sección 5: "Integración con el Core" → "Integración como Módulo"
   - Sección 6: "CLI de Gestión de Seguridad" → "CLI como Cliente HTTP Puro"
   - Agregado: module.json manifest
   - Agregado: Hook system implementation
   - Agregado: HTTP API endpoints

2. **`README.md`**
   - Actualizado diagrama de arquitectura
   - Agregada sección "🧩 Filosofía Arquitectónica"
   - Actualizada estructura de directorios
   - Agregado enfoque en "Core Minimalista"

### Documentación Creada

3. **`docs/SECURITY_AS_MODULE.md`** (nuevo)
   - Guía completa de refactorización
   - Comparación antes/después
   - Implementación detallada
   - Checklist de implementación

4. **`docs/ARCHITECTURE_FINAL.md`** (existía previamente)
   - Ya documentaba la arquitectura correcta
   - Usado como referencia para las correcciones

5. **`docs/ARCHITECTURAL_CHANGES.md`** (este archivo)
   - Resumen ejecutivo de cambios
   - Control de versiones de arquitectura

---

## 🧩 Sistema de Hooks Implementado

El Core ahora expone un sistema de hooks para módulos:

```javascript
// core/hooks.js
class HookManager {
  register(hookName, handler) { ... }
  async execute(hookName, context) { ... }
}
```

**Hooks disponibles:**

- `beforeEventPublish` - Interceptar eventos antes de publicar
- `afterEventReceive` - Interceptar eventos después de recibir
- `beforeModuleLoad` - Antes de cargar un módulo
- `afterModuleLoad` - Después de cargar un módulo
- `beforeAPICall` - Antes de procesar una API request
- `afterAPICall` - Después de procesar una API response

**Uso por módulos:**

```javascript
// modules/security-p2p/index.js
async onLoad(core) {
  core.hooks.register('beforeEventPublish', async (context) => {
    // Modificar context o retornar null para bloquear
    return encryptedContext;
  });
}
```

---

## 🌐 HTTP APIs Expuestas por Módulos

Los módulos registran sus APIs en el HTTP Gateway:

```javascript
// modules/security-p2p/module.json
{
  "provides": {
    "apis": [
      {
        "name": "status",
        "method": "GET",
        "path": "/status"
      }
    ]
  }
}
```

**URL final:**
```
http://localhost:3000/modules/security-p2p/status
```

**Consumidores:**
- CLI (via HTTP client)
- Web UI (via fetch/axios)
- Scripts (via curl/http)
- Otros cores (via HTTP API)

---

## 🧪 Impacto en Testing

### **Antes:**
```javascript
// Requería instanciar todo el Core
const core = new Core(config);
await core.start();
const fingerprint = core.keyManager.getPublicKeyFingerprint();
```

### **Después:**
```javascript
// Testear módulo aislado
const mockCore = { hooks: new HookManager(), mqtt: mockMqtt };
const securityModule = new SecurityP2PModule();
await securityModule.onLoad(mockCore);

// Testear CLI con mock HTTP
const mockServer = createMockServer();
const cli = new CoreCLI('http://localhost:9999');
await cli.securityStatus();
```

**Beneficios:**
- ✅ Tests más rápidos (no requieren Core completo)
- ✅ Tests aislados (un módulo a la vez)
- ✅ Mocking simple (HTTP mock o hook mock)

---

## 📦 Estructura de Módulos Actualizada

### **module.json Completo**

```json
{
  "name": "security-p2p",
  "version": "1.0.0",
  "description": "P2P Zero Trust Security",

  "provides": {
    "hooks": ["beforeEventPublish", "afterEventReceive"],
    "apis": [
      { "name": "status", "method": "GET", "path": "/status" },
      { "name": "trustPeer", "method": "POST", "path": "/trust-peer" }
    ]
  },

  "subscribes": [
    "core/+/security/handshake/request/#",
    "core/+/security/handshake/response/#"
  ],

  "dependencies": [],

  "config": {
    "handshake_timeout_ms": 30000
  }
}
```

---

## 🎯 Checklist de Implementación

### Completados ✅

- [x] Crear `docs/SECURITY_AS_MODULE.md` con guía de refactorización
- [x] Actualizar `docs/SECURITY_ARCHITECTURE.md` secciones 5 y 6
- [x] Actualizar `README.md` con arquitectura correcta
- [x] Documentar sistema de hooks
- [x] Documentar APIs HTTP de módulos
- [x] Crear `docs/ARCHITECTURAL_CHANGES.md`

### Pendientes 🔲

- [ ] Implementar `core/hooks.js` (HookManager)
- [ ] Mover `core/security/` → `modules/security-p2p/`
- [ ] Implementar `modules/security-p2p/module.json`
- [ ] Refactorizar SecurityModule para usar hooks
- [ ] Implementar APIs HTTP en SecurityModule
- [ ] Refactorizar CLI a HTTP client puro
- [ ] Actualizar tests para nueva arquitectura
- [ ] Crear tests de integración hooks + módulos

---

## 🚀 Siguientes Pasos

1. **Generar Deliverables Estratégicos** - Usar prompt "Estratega de Producto" para crear:
   - `strategy/v1/vision.json`
   - `strategy/v1/okrs.json`
   - `strategy/v1/roadmap.json`

2. **Implementar Core Completo** - Según arquitectura refactorizada:
   - Core minimalista
   - Hook system
   - Module loader
   - HTTP API Gateway
   - MQTT broker embebido

3. **Implementar Módulos de Ejemplo**:
   - `modules/echo/` - Echo simple
   - `modules/security-p2p/` - Security completo
   - `modules/file-watcher/` - File watcher

4. **Implementar CLI HTTP Client**:
   - `cli/index.js` - Pure HTTP client
   - Comandos: security, modules, status, logs

---

## 📚 Referencias

- `docs/ARCHITECTURE_FINAL.md` - Arquitectura completa correcta
- `docs/SECURITY_AS_MODULE.md` - Guía de refactorización security
- `docs/CORE_DEFINITION.md` - Definición original del core
- `README.md` - Documentación principal del proyecto

---

**Versión:** 1.0.0
**Última Actualización:** 2025-10-06
**Estado:** Documentación completada, implementación pendiente
