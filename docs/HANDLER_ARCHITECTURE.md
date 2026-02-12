# Arquitectura de Handlers: Acciones Centralizadas

**Versión:** 1.0.0
**Fecha:** 2026-02-12

---

## Principio

> Un handler es una **acción**: cuando pase X, haz Y.
> No pertenece a ningún módulo.
> El módulo **dice** (publica eventos, declara contratos).
> El handler **hace** (reacciona al evento, ejecuta lógica).

---

## Problema

Con el patrón anterior, los handlers estaban repartidos en múltiples ubicaciones:

```
handlers/                              ← globales aquí
data/projects/pizzepos/handlers/       ← proyecto aquí
data/projects/facturas/handlers/       ← otro proyecto aquí
modules/project-manager/index.js       ← y métodos de clase aquí
```

Cada módulo reimplementaba el mismo pegamento: suscribirse al evento, bind de métodos,
inyección de contexto, error handling. Código repetido en cada módulo.

---

## Solución: Un Solo Sitio

Todos los handlers viven en un único árbol:

```
handlers/
├── global/                    ← acciones del sistema
│   ├── menu-ocr-pipeline.js
│   ├── telegram-url-extractor.js
│   └── ...
│
└── projects/                  ← acciones por proyecto
    ├── pizzepos/
    │   ├── carta-scan.js
    │   └── carta-chat.js
    ├── facturas-nonina/
    │   ├── procesar-facturas.js
    │   └── ...
    └── _ejemplo/
        └── gmail-programado.js
```

### Ventajas

- **Un solo sitio**: sabes dónde está todo
- **Menos código repetido**: el HandlerLoader hace el pegamento una vez
- **Descubrimiento automático**: escanea el árbol y registra
- **Misma interfaz**: todos los handlers tienen `{ name, trigger, handle }`
- **Contexto inyectado**: services, logger, emit, config, store — automático

---

## Separación: Módulo vs Handler

### El módulo es el **contrato**

```
modules/project-manager/
└── module.json
    {
      "name": "project-manager",
      "version": "1.0.0",
      "publishes": ["project.created", "project.deleted"],
      "subscribes": ["project.create.request"],
      "apis": [
        { "method": "POST", "path": "/projects" }
      ]
    }
```

El módulo declara:
- Qué eventos publica (su vocabulario)
- A qué eventos reacciona
- Qué APIs expone
- Qué herramientas ofrece al AI

### El handler es la **acción**

```javascript
// handlers/global/create-project.js
module.exports = {
  name: 'create-project',
  trigger: 'project.create.request',
  description: 'Crea un proyecto nuevo con su estructura de directorios',

  async handle(event, { services, logger, emit, config, store }) {
    // Lógica de crear proyecto
    const project = await createProject(event.data);

    // Emitir resultado
    emit('project.created', { project });
  }
};
```

El handler:
- Escucha un evento (trigger)
- Ejecuta lógica
- Emite resultados
- No sabe quién publicó el evento
- No pertenece a ningún módulo

---

## Estructura de un Handler

```javascript
module.exports = {
  // Requeridos
  name: 'nombre-unico',           // Identificador
  trigger: 'evento.a.escuchar',   // Evento que dispara la acción
  handle: async (event, ctx) => { },  // La acción

  // Opcionales
  description: 'Qué hace',        // Documentación
  enabled: true,                   // Activar/desactivar
  filter: (event) => boolean,      // Filtro previo a ejecución
};
```

### Contexto inyectado automáticamente

| Campo       | Tipo     | Descripción                                      |
|-------------|----------|--------------------------------------------------|
| `services`  | Object   | `services.call(provider, action, params)`        |
| `logger`    | Logger   | Logging estructurado                             |
| `emit`      | Function | `emit(evento, data)` — publica nuevos eventos    |
| `config`    | Object   | Config del proyecto (de `config/*.json`)          |
| `store`     | Store    | Key-value persistente por handler                |
| `projectId` | String   | ID del proyecto (null si global)                 |

---

## Descubrimiento

El `HandlerLoader` escanea el árbol `handlers/` automáticamente:

```
1. handlers/global/*.js       → Carga como handlers globales (projectId = null)
2. handlers/projects/{id}/*.js → Carga como handlers del proyecto {id}
```

### Reglas de descubrimiento

- Solo archivos `.js`
- Ignora archivos que empiezan con `_` (convención para deshabilitados/ejemplos)
- Ignora `index.js`
- Soporta export de handler único o array de handlers
- Valida que tenga `name`, `trigger` y `handle`

---

## Compatibilidad

El sistema mantiene compatibilidad con las ubicaciones anteriores:

| Ubicación                                | Estado         |
|------------------------------------------|----------------|
| `handlers/global/`                       | **Nuevo** — preferido para globales |
| `handlers/projects/{id}/`               | **Nuevo** — preferido para proyectos |
| `handlers/*.js`                          | Compatible — sigue funcionando |
| `data/projects/{id}/handlers/`           | Compatible — sigue funcionando |

El orden de carga es:
1. `handlers/global/` y `handlers/*.js` (raíz) como globales
2. `handlers/projects/{id}/` para cada proyecto descubierto
3. `data/projects/{id}/handlers/` como fallback

---

## Migración Progresiva

No es necesario migrar todo de golpe. La estrategia es:

1. **Nuevos handlers** → siempre en `handlers/global/` o `handlers/projects/{id}/`
2. **Handlers existentes en data/** → se mueven cuando se tocan
3. **Lógica de módulos** → se extrae a handlers cuando se refactoriza el módulo

El objetivo final es que los módulos sean solo contratos (`module.json`) y toda
la lógica ejecutable viva como handlers centralizados.

---

## Diagrama

```
┌──────────────────────────────────────────────────┐
│                   EVENT BUS                       │
│                                                    │
│  publish('project.create.request', data)          │
│       │                                            │
│       │  ┌─────────────────────────────────────┐  │
│       └──│ HandlerLoader                        │  │
│          │                                       │  │
│          │  handlers/                            │  │
│          │  ├── global/                          │  │
│          │  │   └── create-project.js ◄── match  │  │
│          │  └── projects/                        │  │
│          │      └── pizzepos/                    │  │
│          │          └── carta-scan.js            │  │
│          └─────────────────────────────────────┘  │
│                                                    │
│  ┌─────────────────────────────────────────────┐  │
│  │ Módulos (solo contratos)                     │  │
│  │                                               │  │
│  │  modules/project-manager/module.json          │  │
│  │    publishes: [project.created]               │  │
│  │    subscribes: [project.create.request]       │  │
│  │                                               │  │
│  │  → El módulo DICE qué eventos existen         │  │
│  │  → El handler HACE cuando llegan              │  │
│  └─────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```
