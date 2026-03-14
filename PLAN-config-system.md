# Diseño: Sistema de Configuración para Event-Core

## Problema

Con 47+ módulos activos y creciendo, la gestión de configuración tiene estos problemas:

1. **Inconsistencia** — módulos leen config de 3 sitios distintos (`core.moduleConfig`, `core.config.xxx`, hardcoded)
2. **Sin validación** — un módulo puede arrancar con config inválida y fallar en runtime
3. **Sin schema** — no hay forma de saber qué config acepta un módulo sin leer su código
4. **Sin runtime updates** — cambiar cualquier config requiere reiniciar
5. **Sin scoping** — no hay config por proyecto (ej: un proyecto pizzería con precios distintos)
6. **Defaults dispersos** — cada módulo inventa su patrón de fallback

## Diseño: 3 Niveles de Config

```
┌─────────────────────────────────────────────────┐
│                  CONFIG SYSTEM                   │
│                                                  │
│  ┌──────────────┐  ┌────────────┐  ┌──────────┐ │
│  │    GLOBAL     │  │   MODULE   │  │ PROJECT  │ │
│  │  config.json  │  │ module.json│  │ DB/store │ │
│  │  + ENV + CLI  │  │  .config   │  │          │ │
│  └──────┬───────┘  └─────┬──────┘  └────┬─────┘ │
│         │                │               │       │
│         └────────┬───────┘               │       │
│                  ▼                        │       │
│         ┌──────────────┐                 │       │
│         │ ConfigManager │◄───────────────┘       │
│         │  (en loader)  │                        │
│         └──────┬───────┘                         │
│                │ resolve(moduleName, key)         │
│                ▼                                  │
│         Config final: project > module > global   │
└─────────────────────────────────────────────────┘
```

### Nivel 1: Global (`config.json` + ENV + CLI)
- Ya existe y funciona bien
- Sin cambios necesarios
- Prioridad: CLI > ENV > config.{env}.json > config.json

### Nivel 2: Module (`module.json → config + configSchema`)
- Ya existe parcialmente (`manifest.config`)
- **Nuevo**: añadir `configSchema` para validación y defaults

### Nivel 3: Project-scoped (futuro)
- Config por proyecto almacenada en DB via project-manager
- Override de config de módulo para un proyecto específico
- **No implementar ahora** — diseñar la interfaz para que sea posible después

## Cambios Concretos

### 1. Añadir `configSchema` al module.json

Cada módulo declara qué config acepta. Ejemplo para `database-manager`:

```json
{
  "name": "database-manager",
  "config": {
    "projectsPath": "./data/projects",
    "autoSave": true,
    "maxDatabases": 100,
    "queryTimeout": 10000
  },
  "configSchema": {
    "projectsPath": { "type": "string", "required": true, "description": "Ruta donde se almacenan las DBs de proyectos" },
    "autoSave":     { "type": "boolean", "default": true, "description": "Auto-guardar tras cada write" },
    "maxDatabases": { "type": "number", "default": 100, "min": 1, "max": 1000, "description": "Máximo de DBs simultáneas" },
    "queryTimeout": { "type": "number", "default": 10000, "min": 1000, "description": "Timeout de queries en ms" }
  }
}
```

**Tipos soportados**: `string`, `number`, `boolean`, `object`, `array`
**Validadores**: `required`, `default`, `min`, `max`, `enum`, `pattern`

### 2. Lógica de resolución en el Loader

El loader ya construye `moduleContext` (línea 320-324 de loader.js). El cambio:

```javascript
// ANTES (actual)
const moduleContext = {
  ...this.core,
  moduleConfig: manifest.config || {},
  moduleLoader: this
};

// DESPUÉS (nuevo)
const moduleConfig = this.resolveModuleConfig(manifest);
const moduleContext = {
  ...this.core,
  moduleConfig,
  moduleLoader: this
};
```

Nuevo método `resolveModuleConfig(manifest)`:

```javascript
resolveModuleConfig(manifest) {
  const schema = manifest.configSchema || {};
  const declared = manifest.config || {};

  // 1. Empezar con defaults del schema
  const resolved = {};
  for (const [key, def] of Object.entries(schema)) {
    if (def.default !== undefined) {
      resolved[key] = def.default;
    }
  }

  // 2. Merge config declarada en module.json
  Object.assign(resolved, declared);

  // 3. Override desde config.json global (sección modules.config.{moduleName})
  const globalOverrides = getConfigValue(this.core.config, `modules.config.${manifest.name}`, {});
  Object.assign(resolved, globalOverrides);

  // 4. Override desde ENV: MODULE_{NAME}_KEY=value
  this.applyEnvOverrides(manifest.name, resolved, schema);

  // 5. Validar contra schema
  this.validateModuleConfig(manifest.name, resolved, schema);

  return resolved;
}
```

**Cadena de prioridad**:
```
ENV (MODULE_DATABASE_MANAGER_QUERY_TIMEOUT=5000)
  > config.json → modules.config.database-manager.queryTimeout
    > module.json → config.queryTimeout
      > configSchema defaults
```

### 3. Validación de config de módulos

```javascript
validateModuleConfig(moduleName, config, schema) {
  const errors = [];

  for (const [key, def] of Object.entries(schema)) {
    const value = config[key];

    // Required check
    if (def.required && (value === undefined || value === null)) {
      errors.push(`${key} is required`);
      continue;
    }

    if (value === undefined) continue;

    // Type check
    if (def.type && typeof value !== def.type) {
      errors.push(`${key}: expected ${def.type}, got ${typeof value}`);
    }

    // Range check (numbers)
    if (def.type === 'number') {
      if (def.min !== undefined && value < def.min) errors.push(`${key}: minimum is ${def.min}`);
      if (def.max !== undefined && value > def.max) errors.push(`${key}: maximum is ${def.max}`);
    }

    // Enum check
    if (def.enum && !def.enum.includes(value)) {
      errors.push(`${key}: must be one of [${def.enum.join(', ')}]`);
    }

    // Pattern check (strings)
    if (def.pattern && typeof value === 'string' && !new RegExp(def.pattern).test(value)) {
      errors.push(`${key}: does not match pattern ${def.pattern}`);
    }
  }

  if (errors.length > 0) {
    this.logger.warn(`[${moduleName}] Config validation warnings:`, errors);
    // Warn, don't crash — backwards compatible
  }
}
```

### 4. ENV Overrides por módulo

Convención: `MODULE_{NOMBRE_UPPER}_{KEY_UPPER}=valor`

```
MODULE_DATABASE_MANAGER_QUERY_TIMEOUT=5000
MODULE_AI_GATEWAY_DEFAULT_PROVIDER=anthropic
MODULE_SCHEDULER_MAX_CONCURRENT_JOBS=50
```

```javascript
applyEnvOverrides(moduleName, config, schema) {
  const prefix = `MODULE_${moduleName.replace(/-/g, '_').toUpperCase()}_`;

  for (const [envKey, envValue] of Object.entries(process.env)) {
    if (!envKey.startsWith(prefix)) continue;

    const configKey = this.envKeyToConfigKey(envKey.slice(prefix.length), schema);
    if (!configKey) continue;

    const def = schema[configKey];
    config[configKey] = this.coerceType(envValue, def?.type);
  }
}
```

### 5. Override global desde config.json

Nuevo campo en config.json para override centralizado:

```json
{
  "modules": {
    "path": "./modules",
    "enabled": [...],
    "disabled": [...],
    "config": {
      "database-manager": {
        "queryTimeout": 5000,
        "maxDatabases": 200
      },
      "scheduler": {
        "maxConcurrentJobs": 50
      },
      "ai-gateway": {
        "defaultProvider": "anthropic"
      }
    }
  }
}
```

Esto permite al operador overridear config de módulos sin tocar sus module.json.

### 6. API para consultar config en runtime

Nuevo endpoint en el loader (registrado como API interna):

```
GET /config/modules                    → Lista de módulos con su config resuelta
GET /config/modules/:name             → Config resuelta de un módulo
GET /config/modules/:name/schema      → Schema de config de un módulo
PUT /config/modules/:name             → Override runtime (no persiste por defecto)
PUT /config/modules/:name?persist=true → Override + persiste en config.json
```

Evento:
```
module.config.updated → { module: 'scheduler', key: 'maxConcurrentJobs', value: 50, previous: 100 }
```

Los módulos que quieran reaccionar a cambios de config suscriben:
```json
{
  "subscribes": [
    { "event": "module.config.updated", "handler": "onConfigUpdated" }
  ]
}
```

## Plan de implementación

### Fase 1: Fundación (sin romper nada)
1. Añadir `resolveModuleConfig()` al loader — backwards compatible, si no hay `configSchema`, funciona igual que hoy
2. Añadir `validateModuleConfig()` — solo warnings en log, no bloquea arranque
3. Añadir soporte para `modules.config.{name}` en config.json
4. Añadir soporte para ENV overrides `MODULE_*`
5. Actualizar contexto/modules.json con la nueva documentación

### Fase 2: Schemas progresivos
1. Añadir `configSchema` a los 10 módulos más críticos (database-manager, ai-gateway, scheduler, credential-manager, chat-session, etc.)
2. Los demás módulos funcionan sin schema — sin presión
3. Log al arranque: "X/Y modules have config schema defined"

### Fase 3: Runtime config (futuro)
1. API para consultar/modificar config en runtime
2. Evento `module.config.updated` para módulos reactivos
3. Persistencia opcional de overrides

### Fase 4: Project-scoped config (futuro)
1. Config por proyecto almacenada en project-manager
2. Resolución: project > module > global
3. Útil para: configuración de AI por proyecto, timeouts específicos, etc.

## Resumen de cambios

| Archivo | Cambio |
|---------|--------|
| `core/modules/loader.js` | Añadir `resolveModuleConfig()`, `validateModuleConfig()`, `applyEnvOverrides()` |
| `config.json` | Añadir sección `modules.config` (vacía inicialmente) |
| `module.json` (por módulo) | Añadir `configSchema` progresivamente |
| `contexto/modules.json` | Documentar el nuevo sistema |

**Cero breaking changes.** Todo es aditivo. Los módulos sin `configSchema` funcionan exactamente igual que hoy.
