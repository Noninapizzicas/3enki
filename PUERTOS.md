# Gestión de Puertos y Orquestación de Servicios

**Documento de Diseño Técnico**
**Versión:** 1.0
**Fecha:** 2025-10-20
**Autor:** Event Core Team
**Estado:** Propuesta para Implementación

---

## 📋 Índice

1. [Problema Actual](#problema-actual)
2. [Objetivos](#objetivos)
3. [Solución Propuesta](#solución-propuesta)
4. [Arquitectura Detallada](#arquitectura-detallada)
5. [Port Ranges por Tipo](#port-ranges-por-tipo)
6. [Componentes a Implementar](#componentes-a-implementar)
7. [Casos de Uso](#casos-de-uso)
8. [Plan de Implementación](#plan-de-implementación)
9. [Ejemplos de Código](#ejemplos-de-código)
10. [Testing](#testing)

---

## ❌ Problema Actual

### Situación Sin Gestión

```bash
# ❌ El CAOS sin gestión de puertos:

# Terminal 1
$ node index.js
Error: listen EADDRINUSE: address already in use 0.0.0.0:3000

# Terminal 2
$ postgres -p 5432
Error: Port 5432 already in use

# Terminal 3
$ mosquitto -p 1883
Error: Address already in use

# Al arrancar múltiples cores:
$ node index.js  # Core A → :3000
$ node index.js  # Core B → ❌ EADDRINUSE!

# Al detener servicios:
$ killall node   # 💀 Mata TODO sin orden
$ killall postgres  # ¿Se guardó el estado?
```

### Problemas Identificados

1. **Conflictos de Puertos**
   - No hay coordinación entre servicios
   - Misma aplicación no puede arrancar múltiples veces
   - Servicios externos (postgres, redis) chocan

2. **Caos Operacional**
   - No hay orden de arranque/parada
   - Sin gestión de dependencias
   - Shutdown no es graceful
   - No hay cleanup automático

3. **Falta de Discovery**
   - Servicios no se conocen entre sí
   - No hay registro central
   - Imposible saber qué está corriendo

4. **Escalabilidad Limitada**
   - No puedes arrancar N cores fácilmente
   - Multi-core requiere configuración manual
   - No hay load balancing automático

---

## 🎯 Objetivos

### Objetivos Funcionales

1. **Gestión Automática de Puertos**
   - ✅ Detectar puertos libres automáticamente
   - ✅ Evitar conflictos sin configuración manual
   - ✅ Asignar puertos por rangos según tipo de servicio

2. **Service Discovery**
   - ✅ Registry central de todos los servicios
   - ✅ Servicios se registran/desregistran automáticamente
   - ✅ Health checks y heartbeats
   - ✅ Cleanup automático de servicios muertos

3. **Orquestación de Servicios**
   - ✅ Arranque ordenado por dependencias
   - ✅ Parada ordenada (inverso)
   - ✅ Health checks antes de continuar
   - ✅ Auto-restart en caso de fallos

4. **Simplicidad de Uso**
   - ✅ Un comando para arrancar todo
   - ✅ Un comando para parar todo
   - ✅ Zero configuración manual de puertos

### Objetivos No Funcionales

1. **Zero Dependencias Externas**
   - Solo Node.js built-ins (net, fs, child_process)
   - Compatible con filosofía Event-Core

2. **Portable**
   - Funciona en Termux, Linux, macOS
   - No requiere permisos especiales

3. **Extensible**
   - Fácil añadir nuevos tipos de servicios
   - Compatible con Docker después
   - Base para Kubernetes futuro

---

## ✅ Solución Propuesta

### Arquitectura de 3 Capas

```
┌─────────────────────────────────────────────────┐
│  Capa 3: CLI de Gestión                        │
│  ./scripts/services.sh [start|stop|status]     │
└───────────────────┬─────────────────────────────┘
                    │
┌───────────────────▼─────────────────────────────┐
│  Capa 2: Service Orchestrator                  │
│  - Dependency Graph Resolution                 │
│  - Startup/Shutdown ordenado                   │
│  - Health Checks                               │
│  - Auto-restart                                │
└───────────────────┬─────────────────────────────┘
                    │
┌───────────────────▼─────────────────────────────┐
│  Capa 1: Port Manager + Service Registry       │
│  - Port allocation automática                  │
│  - Service registration                        │
│  - Discovery de servicios                      │
│  - Heartbeats y cleanup                        │
└─────────────────────────────────────────────────┘
```

### Flujo de Operación

#### Arranque de Servicios

```
1. Usuario ejecuta: ./scripts/services.sh start

2. Service Orchestrator:
   ├─ Lee definiciones de servicios (config/services.js)
   ├─ Resuelve orden por dependencias (topological sort)
   └─ Inicia servicios en orden:

3. Para cada servicio:
   ├─ Port Manager: Encuentra puerto libre en rango
   ├─ Service Registry: Registra servicio + puerto
   ├─ Spawn proceso con puerto asignado
   ├─ Health Check: Espera a que esté healthy
   └─ Continúa con siguiente servicio

4. Resultado:
   └─ Todos los servicios corriendo sin conflictos
```

#### Parada de Servicios

```
1. Usuario ejecuta: ./scripts/services.sh stop

2. Service Orchestrator:
   ├─ Resuelve orden inverso de dependencias
   └─ Para servicios en orden:

3. Para cada servicio:
   ├─ Envía SIGTERM (graceful shutdown)
   ├─ Espera 10s para cleanup
   ├─ Si no termina: SIGKILL
   ├─ Service Registry: Desregistra servicio
   └─ Continúa con siguiente servicio

4. Resultado:
   └─ Shutdown ordenado y limpio
```

---

## 🏗️ Arquitectura Detallada

### Componente 1: Port Manager

**Ubicación:** `core/utils/port-manager.js`

**Responsabilidades:**
- Detectar si un puerto está disponible
- Encontrar puerto libre en un rango
- Validar puertos antes de asignar

**API Pública:**

```javascript
class PortManager {
  // Verifica si puerto está disponible
  async isPortAvailable(port: number): Promise<boolean>

  // Encuentra puerto libre desde basePort
  async findFreePort(basePort?: number): Promise<number>

  // Reserva un puerto temporalmente
  reservePort(port: number): void

  // Libera un puerto reservado
  releasePort(port: number): void

  // Obtiene puertos reservados
  getReservedPorts(): number[]
}
```

**Algoritmo de Búsqueda:**

1. Partir de `basePort` (ej: 3000)
2. Intentar conectar al puerto
3. Si conexión falla → puerto libre ✅
4. Si conexión exitosa → puerto ocupado, probar siguiente
5. Máximo 100 intentos
6. Si no encuentra → error

---

### Componente 2: Service Registry

**Ubicación:** `core/utils/service-registry.js`

**Responsabilidades:**
- Mantener registro de servicios activos
- Asignar puertos por tipo de servicio
- Health checks y heartbeats
- Cleanup de servicios muertos

**Estructura de Datos:**

```json
{
  "services": {
    "core-a": {
      "id": "core-a",
      "type": "EVENT_CORE",
      "port": 3333,
      "pid": 12345,
      "startedAt": "2025-10-20T10:00:00.000Z",
      "lastHeartbeat": "2025-10-20T10:05:00.000Z",
      "status": "running",
      "metadata": {
        "version": "0.1.0",
        "modules": ["echo", "security-p2p"]
      }
    },
    "postgres-main": {
      "id": "postgres-main",
      "type": "POSTGRES",
      "port": 5432,
      "pid": 12346,
      "startedAt": "2025-10-20T09:59:00.000Z",
      "lastHeartbeat": "2025-10-20T10:05:00.000Z",
      "status": "running",
      "metadata": {
        "database": "event_core_db"
      }
    }
  }
}
```

**Archivo de Persistencia:** `.services.json`

**API Pública:**

```javascript
class ServiceRegistry {
  // Registra un servicio
  register(serviceId, serviceType, port, metadata): void

  // Desregistra un servicio
  unregister(serviceId): void

  // Actualiza heartbeat
  heartbeat(serviceId): void

  // Obtiene servicios activos
  getActiveServices(): Object

  // Obtiene servicios por tipo
  getServicesByType(type): Array

  // Encuentra puerto libre para tipo
  async findFreePort(serviceType): Promise<number>

  // Limpia servicios muertos
  cleanup(): void

  // Obtiene estadísticas
  getStats(): Object
}
```

---

### Componente 3: Service Orchestrator

**Ubicación:** `core/orchestrator/service-manager.js`

**Responsabilidades:**
- Gestionar definiciones de servicios
- Resolver dependency graph
- Arrancar/parar servicios en orden
- Health checks automáticos
- Auto-restart en fallos

**Definición de Servicio:**

```javascript
{
  id: 'core-a',
  type: 'EVENT_CORE',
  command: 'node',
  args: ['index.js'],
  env: {
    CORE_ID: 'core-a',
    HTTP_PORT: '{PORT}',  // Placeholder reemplazado
    MQTT_BROKER_URL: 'mqtt://localhost:1883'
  },
  healthCheck: async (port) => {
    const res = await fetch(`http://localhost:${port}/health`);
    return res.ok;
  },
  dependsOn: ['mqtt-broker'],  // Dependencias
  startDelay: 2000,  // Espera después de dependencias
  autoRestart: true   // Auto-restart en fallo
}
```

**API Pública:**

```javascript
class ServiceManager {
  // Define un servicio
  define(serviceId, definition): void

  // Resuelve orden de arranque
  resolveStartOrder(): Array<string>

  // Arranca un servicio específico
  async startService(serviceId): Promise<Object>

  // Arranca todos los servicios
  async startAll(): Promise<Array>

  // Para un servicio
  async stopService(serviceId, signal?): Promise<void>

  // Para todos los servicios
  async stopAll(): Promise<void>

  // Reinicia un servicio
  async restartService(serviceId): Promise<void>

  // Muestra estado
  printStatus(): void
}
```

**Dependency Graph:**

```
Ejemplo de dependencias:

mqtt-broker  ←┐
             │
postgres     ├─ core-a ←─┐
             │           │
redis        ├─ core-b ←─┤
             │           │
             └─ core-c ←─┴─ caddy

Orden de arranque (topological sort):
1. mqtt-broker
2. postgres
3. redis
4. core-a
5. core-b
6. core-c
7. caddy

Orden de parada (reverso):
1. caddy
2. core-c
3. core-b
4. core-a
5. redis
6. postgres
7. mqtt-broker
```

---

## 📊 Port Ranges por Tipo

### Rangos Definidos

```javascript
// config/port-ranges.js

module.exports = {
  // Event Core instances
  EVENT_CORE: {
    start: 3000,
    end: 3999,
    description: 'Event Core HTTP Gateways'
  },

  // Message Brokers
  MQTT: {
    start: 1883,
    end: 1893,
    description: 'MQTT Brokers (Mosquitto/Aedes)'
  },

  MQTT_WS: {
    start: 9001,
    end: 9011,
    description: 'MQTT over WebSocket'
  },

  // Databases
  POSTGRES: {
    start: 5432,
    end: 5442,
    description: 'PostgreSQL instances'
  },

  REDIS: {
    start: 6379,
    end: 6389,
    description: 'Redis instances'
  },

  MONGODB: {
    start: 27017,
    end: 27027,
    description: 'MongoDB instances'
  },

  // Proxies & Gateways
  CADDY: {
    start: 8080,
    end: 8090,
    description: 'Caddy HTTP/HTTPS'
  },

  NGINX: {
    start: 8000,
    end: 8010,
    description: 'Nginx instances'
  },

  // Custom Services
  MICROSERVICES: {
    start: 7000,
    end: 7999,
    description: 'Custom microservices'
  },

  // Monitoring
  PROMETHEUS: {
    start: 9090,
    end: 9100,
    description: 'Prometheus'
  },

  GRAFANA: {
    start: 3100,
    end: 3110,
    description: 'Grafana'
  }
};
```

### Beneficios de Port Ranges

1. **Organización Clara**
   - Sabes dónde buscar cada tipo
   - Fácil debugging (puerto 3XXX → Event Core)

2. **Escalabilidad**
   - 1000 puertos por Event Cores
   - 10 puertos por DBs (suficiente)

3. **Documentación**
   - Auto-documentado por el código
   - Fácil onboarding

---

## 🔧 Componentes a Implementar

### Archivos Nuevos a Crear

```
event-core/
├── core/
│   ├── utils/
│   │   ├── port-manager.js        ← NUEVO (15 min)
│   │   └── service-registry.js    ← NUEVO (20 min)
│   └── orchestrator/
│       └── service-manager.js     ← NUEVO (25 min)
│
├── config/
│   ├── port-ranges.js             ← NUEVO (5 min)
│   └── services.js                ← NUEVO (15 min)
│
├── orchestrator/
│   └── cli.js                     ← NUEVO (10 min)
│
└── scripts/
    ├── services.sh                ← NUEVO (10 min)
    └── start-multi-core.sh        ← NUEVO (5 min)

Total: ~105 minutos (~2 horas)
```

### Archivos a Modificar

```
event-core/
├── index.js                       ← MODIFICAR (integrar port manager)
├── package.json                   ← MODIFICAR (añadir scripts)
└── README.md                      ← MODIFICAR (documentar nuevas features)
```

---

## 📝 Casos de Uso

### Caso 1: Desarrollo Local (Single Developer)

**Escenario:**
Desarrollador trabaja en laptop, arranca/para servicios frecuentemente.

**Sin gestión:**
```bash
# Día típico sin gestión
$ node index.js           # ❌ Puerto 3000 ocupado
$ lsof -ti:3000 | xargs kill -9  # 💀 Mata proceso
$ node index.js           # ✅ Ahora funciona
# ... pero perdió estado, no fue graceful
```

**Con gestión:**
```bash
# Día típico con gestión
$ ./scripts/services.sh start
✅ mqtt-broker → :1883
✅ postgres → :5432
✅ core-a → :3333 (detectó 3000 ocupado, usó 3333)
✅ All services started

$ ./scripts/services.sh stop
✅ Graceful shutdown, estado guardado
```

---

### Caso 2: Multi-Core Local (Validar Arquitectura Fractal)

**Escenario:**
Desarrollador quiere probar comunicación entre 3 cores localmente.

**Sin gestión:**
```bash
# Configuración manual
$ CORE_ID=core-a HTTP_PORT=3000 node index.js &
$ CORE_ID=core-b HTTP_PORT=3001 node index.js &
$ CORE_ID=core-c HTTP_PORT=3002 node index.js &
# Tienes que recordar los puertos, configurar Caddy manual
```

**Con gestión:**
```bash
# Automático
$ ./scripts/start-multi-core.sh 3

✅ Core A started on :3333
✅ Core B started on :3334
✅ Core C started on :3335
✅ Caddy load balancer on :8080 → [3333, 3334, 3335]

# Acceso unificado
$ curl http://localhost:8080/health
# Caddy distribuye carga entre los 3 cores
```

---

### Caso 3: Stack Completo (Event Core + DBs + Tools)

**Escenario:**
Sistema completo con Event Core + Postgres + Redis + MQTT + Caddy.

**Sin gestión:**
```bash
# 5 servicios, 5 terminales
# Terminal 1
$ postgres -p 5432

# Terminal 2
$ redis-server --port 6379

# Terminal 3
$ mosquitto -p 1883

# Terminal 4
$ node index.js

# Terminal 5
$ caddy run

# Para detener: matar cada uno manualmente 💀
```

**Con gestión:**
```bash
# Un comando
$ ./scripts/services.sh start

📋 Start order: mqtt-broker → postgres → redis → core-a → caddy
🚀 Starting mqtt-broker... ✅ :1883
🚀 Starting postgres...    ✅ :5432
🚀 Starting redis...       ✅ :6379
🚀 Starting core-a...      ✅ :3333
🚀 Starting caddy...       ✅ :8080

✅ All services started (health checked)

# Para detener (orden inverso, graceful):
$ ./scripts/services.sh stop

🛑 Stopping caddy...       ✅
🛑 Stopping core-a...      ✅
🛑 Stopping redis...       ✅
🛑 Stopping postgres...    ✅
🛑 Stopping mqtt-broker... ✅

✅ All services stopped
```

---

### Caso 4: Recovery Automático

**Escenario:**
Un core crashea, debe reiniciarse automáticamente.

**Comportamiento:**
```bash
$ ./scripts/services.sh start
✅ core-a started on :3333

# ... core-a crashea por un bug

⚠️  core-a exited (code: 1)
🔄 Auto-restarting core-a in 5s...
🚀 Starting core-a...
✅ core-a restarted on :3334 (3333 todavía limpiándose)
```

---

## 📅 Plan de Implementación

### Fase 1: Port Manager (15 min)

**Archivo:** `core/utils/port-manager.js`

**Features:**
- ✅ `isPortAvailable(port)`
- ✅ `findFreePort(basePort)`
- ✅ `reservePort(port)`
- ✅ `releasePort(port)`

**Testing:**
```bash
# Test manual
node -e "
const PortManager = require('./core/utils/port-manager');
const pm = new PortManager();
pm.findFreePort(3000).then(port => console.log('Free port:', port));
"
```

---

### Fase 2: Service Registry (20 min)

**Archivo:** `core/utils/service-registry.js`

**Features:**
- ✅ `register(id, type, port, metadata)`
- ✅ `unregister(id)`
- ✅ `getActiveServices()`
- ✅ `findFreePort(type)` - usa port-ranges
- ✅ `cleanup()` - detecta procesos muertos

**Testing:**
```bash
node -e "
const ServiceRegistry = require('./core/utils/service-registry');
const reg = new ServiceRegistry();
reg.register('test-core', 'EVENT_CORE', 3333, {version: '0.1.0'});
console.log(reg.getActiveServices());
"
```

---

### Fase 3: Service Orchestrator (25 min)

**Archivo:** `core/orchestrator/service-manager.js`

**Features:**
- ✅ `define(id, definition)`
- ✅ `resolveStartOrder()` - topological sort
- ✅ `startAll()` - arranca en orden
- ✅ `stopAll()` - para en orden inverso
- ✅ Health checks
- ✅ Auto-restart

**Testing:**
```bash
# Test con servicios dummy
node orchestrator/cli.js start-all
```

---

### Fase 4: Configuración de Servicios (15 min)

**Archivo:** `config/services.js`

**Definir servicios:**
```javascript
module.exports = {
  'mqtt-broker': { /* definición */ },
  'postgres': { /* definición */ },
  'core-a': { /* definición */ },
  'caddy': { /* definición */ }
};
```

---

### Fase 5: CLI Scripts (15 min)

**Archivos:**
- `scripts/services.sh` - wrapper principal
- `orchestrator/cli.js` - CLI del orchestrator
- `scripts/start-multi-core.sh` - helper multi-core

**Testing:**
```bash
./scripts/services.sh start
./scripts/services.sh status
./scripts/services.sh stop
```

---

### Fase 6: Integración (10 min)

**Modificar `index.js`:**
```javascript
const ServiceRegistry = require('./core/utils/service-registry');
const registry = new ServiceRegistry();

// Encontrar puerto libre
const port = await registry.findFreePort('EVENT_CORE');

// Registrar servicio
registry.register(config.coreId, 'EVENT_CORE', port, {
  version: '0.1.0',
  modules: loadedModules
});

// Heartbeat cada 10s
setInterval(() => registry.heartbeat(config.coreId), 10000);
```

---

### Fase 7: Documentación (5 min)

**Actualizar:**
- `README.md` - Añadir sección de gestión de servicios
- `PUERTOS.md` - Este documento
- `QUICKSTART.md` - Comandos nuevos

---

## 💻 Ejemplos de Código

### Ejemplo 1: Port Manager Básico

```javascript
// Uso simple
const PortManager = require('./core/utils/port-manager');
const pm = new PortManager({ basePort: 3000, maxAttempts: 100 });

// Encontrar puerto libre
const port = await pm.findFreePort();
console.log(`Using port: ${port}`);

// Verificar puerto específico
const available = await pm.isPortAvailable(3000);
if (available) {
  console.log('Port 3000 is free');
}
```

---

### Ejemplo 2: Service Registry

```javascript
const ServiceRegistry = require('./core/utils/service-registry');
const registry = new ServiceRegistry();

// Registrar Event Core
registry.register('core-a', 'EVENT_CORE', 3333, {
  version: '0.1.0',
  modules: ['echo', 'security-p2p']
});

// Heartbeat (cada 10s en producción)
setInterval(() => {
  registry.heartbeat('core-a');
}, 10000);

// Listar servicios activos
const services = registry.getActiveServices();
console.log('Active services:', Object.keys(services));

// Cleanup al salir
process.on('SIGTERM', () => {
  registry.unregister('core-a');
});
```

---

### Ejemplo 3: Service Orchestrator

```javascript
const ServiceManager = require('./core/orchestrator/service-manager');
const manager = new ServiceManager();

// Definir servicios
manager.define('mqtt-broker', {
  type: 'MQTT',
  command: 'aedes',
  args: ['--port', '{PORT}'],
  healthCheck: async (port) => {
    // Check MQTT connection
    return true;
  },
  dependsOn: []
});

manager.define('core-a', {
  type: 'EVENT_CORE',
  command: 'node',
  args: ['index.js'],
  env: {
    CORE_ID: 'core-a',
    HTTP_PORT: '{PORT}'
  },
  healthCheck: async (port) => {
    const res = await fetch(`http://localhost:${port}/health`);
    return res.ok;
  },
  dependsOn: ['mqtt-broker']
});

// Arrancar todos
await manager.startAll();

// Ver estado
manager.printStatus();

// Parar todos (graceful)
await manager.stopAll();
```

---

### Ejemplo 4: Uso desde CLI

```bash
# Arrancar todos los servicios
./scripts/services.sh start

# Arrancar solo un servicio (y sus dependencias)
./scripts/services.sh start core-a

# Ver estado
./scripts/services.sh status

# Parar todos
./scripts/services.sh stop

# Reiniciar un servicio
./scripts/services.sh restart core-a

# Ver logs
./scripts/services.sh logs core-a
```

---

## 🧪 Testing

### Tests Unitarios

```javascript
// tests/unit/port-manager.test.js
describe('PortManager', () => {
  test('finds free port', async () => {
    const pm = new PortManager();
    const port = await pm.findFreePort(3000);
    expect(port).toBeGreaterThanOrEqual(3000);
  });

  test('detects occupied port', async () => {
    const server = net.createServer().listen(3456);
    const pm = new PortManager();
    const available = await pm.isPortAvailable(3456);
    expect(available).toBe(false);
    server.close();
  });
});

// tests/unit/service-registry.test.js
describe('ServiceRegistry', () => {
  test('registers service', () => {
    const reg = new ServiceRegistry();
    reg.register('test', 'EVENT_CORE', 3333, {});
    const services = reg.getActiveServices();
    expect(services['test']).toBeDefined();
  });

  test('cleans up dead services', () => {
    const reg = new ServiceRegistry();
    reg.register('test', 'EVENT_CORE', 3333, { pid: 99999 });
    reg.cleanup();
    const services = reg.getActiveServices();
    expect(services['test']).toBeUndefined();
  });
});
```

### Tests de Integración

```javascript
// tests/integration/orchestrator.test.js
describe('Service Orchestrator', () => {
  test('starts services in dependency order', async () => {
    const manager = new ServiceManager();

    manager.define('service-a', {
      type: 'TEST',
      command: 'node',
      args: ['-e', 'setTimeout(() => {}, 5000)'],
      dependsOn: []
    });

    manager.define('service-b', {
      type: 'TEST',
      command: 'node',
      args: ['-e', 'setTimeout(() => {}, 5000)'],
      dependsOn: ['service-a']
    });

    const order = manager.resolveStartOrder();
    expect(order).toEqual(['service-a', 'service-b']);

    await manager.startAll();
    // Verificar que ambos están corriendo

    await manager.stopAll();
  });
});
```

---

## 📚 Referencias

### Inspiración Técnica

- **Docker Compose:** Gestión de dependencias y orden de arranque
- **Kubernetes:** Service discovery y health checks
- **systemd:** Dependency resolution y auto-restart
- **PM2:** Process management y monitoring

### Diferencias Clave con Event-Core

| Feature | Docker/K8s | Event-Core |
|---------|------------|------------|
| Dependencies | Externas | Zero (solo Node.js) |
| Config | YAML/JSON | JavaScript nativo |
| Overhead | Alto | Mínimo |
| Portabilidad | Containers | Directo en OS |
| Complejidad | Alta | Baja |

---

## ✅ Criterios de Aceptación

### Para considerar implementación completa:

1. **Port Manager**
   - [ ] Detecta puertos libres correctamente
   - [ ] Funciona en Termux, Linux, macOS
   - [ ] Maneja errores gracefully

2. **Service Registry**
   - [ ] Persiste en .services.json
   - [ ] Detecta servicios muertos
   - [ ] Asigna puertos por rangos

3. **Service Orchestrator**
   - [ ] Resuelve dependencias correctamente
   - [ ] Arranca en orden
   - [ ] Para en orden inverso
   - [ ] Health checks funcionan
   - [ ] Auto-restart funciona

4. **CLI**
   - [ ] `./scripts/services.sh start` funciona
   - [ ] `./scripts/services.sh stop` funciona
   - [ ] `./scripts/services.sh status` muestra info

5. **Integración**
   - [ ] Event Core usa port manager
   - [ ] Event Core se registra en registry
   - [ ] Múltiples cores funcionan sin conflictos

6. **Documentación**
   - [ ] README.md actualizado
   - [ ] Ejemplos de uso claros
   - [ ] Troubleshooting guide

---

## 🚀 Siguiente Paso

**Decisión requerida:**

¿Proceder con implementación según este diseño?

- **Sí → Implementar en orden:**
  1. Port Manager (15 min)
  2. Service Registry (20 min)
  3. Service Orchestrator (25 min)
  4. Config + Scripts (15 min)
  5. Integración (10 min)
  6. Testing (15 min)

  **Total: ~100 minutos (1h 40min)**

- **No → Ajustar diseño**
  - ¿Qué cambiar?
  - ¿Qué simplificar?
  - ¿Qué priorizar?

---

**Documento creado:** 2025-10-20
**Versión:** 1.0
**Estado:** Pendiente aprobación para implementación
