# PACO - Registro de Cambios y Procesos

**Fecha:** 2025-11-23
**Sesión:** Implementación de Constantes Centralizadas + UI Renderer Dinámico

---

## 1. Constantes Centralizadas del Sistema

### 1.1 Problema Identificado

Los módulos tenían valores hardcodeados para:
- Nombres de eventos MQTT (`'file.created'`, `'project.updated'`, etc.)
- Rutas de APIs HTTP
- Nombres de campos en requests/responses
- Códigos de error

Esto generaba inconsistencias y dificultaba el mantenimiento.

### 1.2 Solución Implementada

#### Archivo creado: `core/constants.js`

```javascript
// Estructura del archivo
module.exports = {
  EVENTS,      // Nombres de eventos MQTT
  API_ROUTES,  // Rutas HTTP por módulo
  FIELDS,      // Campos estándar (request_id, success, data, etc.)
  ERRORS,      // Códigos y mensajes de error
  CONFIG,      // Límites, timeouts, formatos
  HELPERS      // Funciones utilitarias
};
```

**Dominios de eventos definidos:**
- `PROJECT` - Gestión de proyectos
- `CONVERSATION` - Conversaciones
- `MESSAGE` - Mensajes de chat
- `FILE` - Archivos
- `EDITOR` - Editor de texto
- `PDF` - Visor PDF
- `AI` - Gateway de IA
- `PROMPT` - Gestión de prompts
- `CREDENTIAL` - Credenciales
- `DB` - Base de datos
- `TOOL` - Orquestador de tools
- `STORAGE` - Almacenamiento

**Convención de nombres:**
```
{dominio}.{accion}[.{tipo}]

Ejemplos:
- file.created
- project.list.request
- project.list.response
```

#### Script creado: `scripts/migrate-to-constants.js`

Script de migración automática que:
1. Escanea todos los módulos en `modules/`
2. Detecta strings hardcodeados que coinciden con constantes
3. Reemplaza por referencias a `EVENTS.DOMINIO.ACCION`
4. Agrega import de constantes si es necesario
5. Crea backups antes de modificar

**Uso:**
```bash
# Dry run (ver cambios sin aplicar)
node scripts/migrate-to-constants.js --dry-run

# Migrar solo un módulo
node scripts/migrate-to-constants.js --module=admin-panel

# Migrar todo
node scripts/migrate-to-constants.js
```

### 1.3 Resultado de la Migración

```
Módulos procesados: 14
Módulos modificados: 2
  - admin-panel: 2 eventos migrados
  - file-watcher: 2 eventos migrados

Backups guardados en: backups/backup-{timestamp}/
```

---

## 2. Fix Sistémico: Context en HTTP Handlers

### 2.1 Problema Identificado

El endpoint `/modules/metricas/metrics` fallaba con:
```
Cannot read properties of undefined (reading 'correlationId')
```

**Causa:** El gateway HTTP (`core/gateway/http.js`) solo pasaba 1 argumento a los handlers, pero los módulos esperaban 2: `(req, context)`.

### 2.2 Solución Implementada

#### Archivo modificado: `core/gateway/http.js` (línea ~417)

**Antes:**
```javascript
result = await apiData.handler({
  method: req.method,
  path: pathname,
  query,
  body: context.body,
  headers: req.headers,
  request_id: requestId
});
```

**Después:**
```javascript
// Construir objeto de contexto para el handler
const handlerContext = {
  correlationId: requestId,
  request_id: requestId,
  timestamp: new Date().toISOString()
};

result = await apiData.handler({
  method: req.method,
  path: pathname,
  query,
  body: context.body,
  headers: req.headers,
  request_id: requestId
}, handlerContext);
```

### 2.3 Impacto

- **Sistémico:** Todos los handlers de todos los módulos ahora reciben `context` con `correlationId`
- **Compatibilidad:** Los handlers que no usen `context` siguen funcionando
- **Observabilidad:** Mejor trazabilidad con correlation IDs en logs

---

## 3. UI Renderer Dinámico (JSON-Driven)

### 3.1 Problema Identificado

El módulo `metricas` tenía configuración UI correcta en `module.json`:
```json
{
  "ui": {
    "enabled": true,
    "title": "Métricas del Sistema",
    "icon": "📊",
    "components": ["dashboard-metricas", "metric-card"],
    "views": {
      "main": {
        "type": "dashboard",
        "component": "dashboard-metricas",
        "config": {
          "endpoint": "/modules/metricas/metrics",
          "mqtt_topics": ["metricas.snapshot"],
          "refresh_interval": 5000
        }
      }
    }
  }
}
```

Y el componente `ui-components/dashboard-metricas.component.json` existía.

**Pero:** `/ui/metricas` retornaba 404 porque el `UIGateway` solo servía archivos estáticos, no generaba vistas dinámicamente.

### 3.2 Solución Implementada

#### Archivo modificado: `core/gateway/ui.js`

**Métodos agregados:**

1. `renderModuleView(request, response, moduleName)`
   - Lee `module.json.ui` del módulo solicitado
   - Carga el componente JSON desde `ui-components/`
   - Genera HTML dinámico

2. `generateViewHTML(moduleName, uiConfig, viewConfig, componentDef)`
   - Construye HTML completo con:
     - Design tokens del sistema (colores, espaciado)
     - Header con título e icono del módulo
     - Secciones desde la definición del componente
     - JavaScript para fetch y auto-refresh
     - Indicador de estado de conexión

#### Archivo modificado: `core/gateway/http.js` (línea ~822)

**Ruta agregada:**
```javascript
} else if (pathname.match(/^\/ui\/[a-z0-9-]+$/i)) {
  // Dynamic module view: /ui/:moduleName
  const moduleName = pathname.replace('/ui/', '');
  await this.uiGateway.renderModuleView(request, response, moduleName);
}
```

### 3.3 Funcionamiento

1. Usuario accede a `/ui/metricas`
2. Gateway detecta patrón `/ui/:moduleName`
3. `renderModuleView()` busca módulo `metricas`
4. Lee configuración de `module.json.ui.views.main`
5. Carga `ui-components/dashboard-metricas.component.json`
6. Genera HTML con:
   - Endpoint: `/modules/metricas/metrics`
   - Refresh: 5 segundos
   - MQTT topics: `metricas.snapshot`
   - Secciones: counters, gauges, timings
7. Retorna HTML al navegador
8. JavaScript hace fetch inicial y configura auto-refresh

### 3.4 Características de la UI Generada

- **Responsive:** Grid adaptable a diferentes tamaños
- **Dark theme:** Colores del design system
- **Auto-refresh:** Configurable desde JSON
- **Empty states:** Mensajes cuando no hay datos
- **Status indicator:** Muestra última actualización
- **Design tokens:** Variables CSS del sistema

---

## 4. Archivos Modificados/Creados

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `core/constants.js` | CREADO | Constantes centralizadas del sistema |
| `scripts/migrate-to-constants.js` | CREADO | Script de migración automática |
| `core/gateway/http.js` | MODIFICADO | Fix context en handlers + ruta UI dinámica |
| `core/gateway/ui.js` | MODIFICADO | Renderer dinámico de vistas JSON-driven |
| `modules/admin-panel/index.js` | MODIFICADO | Migración a constantes (automática) |
| `modules/file-watcher/index.js` | MODIFICADO | Migración a constantes (automática) |

---

## 5. URLs Disponibles

| URL | Descripción |
|-----|-------------|
| `http://localhost:3000/ui/metricas` | Dashboard de métricas (dinámico) |
| `http://localhost:3000/ui/` | Admin Panel |
| `http://localhost:3000/ui/modules` | Lista módulos con UI habilitada |
| `http://localhost:3000/modules/metricas/metrics` | API JSON de métricas |
| `http://localhost:3000/modules/metricas/health` | Health check del módulo |

---

## 6. Cómo Agregar UI a Otros Módulos

### Paso 1: Configurar `module.json`

```json
{
  "name": "mi-modulo",
  "ui": {
    "enabled": true,
    "title": "Mi Módulo",
    "icon": "🚀",
    "components": ["mi-dashboard"],
    "views": {
      "main": {
        "type": "dashboard",
        "component": "mi-dashboard",
        "config": {
          "endpoint": "/modules/mi-modulo/data",
          "mqtt_topics": ["mi-modulo.updated"],
          "refresh_interval": 10000
        }
      }
    }
  }
}
```

### Paso 2: Crear componente (opcional)

`ui-components/mi-dashboard.component.json`:
```json
{
  "component": "mi-dashboard",
  "sections": [
    {
      "id": "stats",
      "title": "Estadísticas",
      "data_source": { "field": "stats" }
    }
  ],
  "mqtt": {
    "enabled": true,
    "topics": ["mi-modulo.updated"]
  }
}
```

### Paso 3: Acceder

```
http://localhost:3000/ui/mi-modulo
```

---

## 7. Comandos Útiles

```bash
# Arrancar el sistema
node index.js

# Ver métricas
curl http://localhost:3000/modules/metricas/metrics

# Ver módulos con UI
curl http://localhost:3000/ui/modules

# Migrar módulo a constantes
node scripts/migrate-to-constants.js --module=nombre --dry-run

# Health check
curl http://localhost:3000/health
```

---

## 8. Principios Respetados

### Event-Driven Architecture
- Sin HTTP interno entre módulos
- Comunicación via `eventBus.publish/subscribe`
- correlationId en todos los eventos

### JSON-Driven UI
- CERO HTML/CSS/JS manual en módulos
- Configuración declarativa en JSON
- Componentes reutilizables en `ui-components/`

### Observabilidad
- Logging estructurado con correlation_id
- Métricas (counters, gauges, timings)
- Health endpoints

---

**Autor:** Claude (Especialista Event Core)
**Versión:** 1.0.0
**Sistema:** Event Core v0.1.0
