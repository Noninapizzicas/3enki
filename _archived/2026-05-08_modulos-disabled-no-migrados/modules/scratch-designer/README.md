# Scratch Designer

Diseñador visual de interfaces con sistema de bloques tipo Scratch.

## Descripcion

Este modulo permite crear interfaces de usuario arrastrando y conectando bloques visuales, similar a Scratch. Los diseños se exportan como JSON compatible con el sistema de UI de Event-Core.

## Estructura

```
scratch-designer/
├── module.json          # Manifest del modulo
├── index.js             # Punto de entrada (< 500 lineas)
├── lib/
│   ├── blocks.js        # Generador de paleta de bloques
│   ├── designs.js       # CRUD de diseños
│   └── export.js        # Exportador JSON/module-ui
├── schemas/
│   ├── design.json      # Schema de diseños
│   └── events.json      # Schema de eventos
└── README.md            # Esta documentacion
```

## Eventos Publicados

### `scratch.design.created`

Se publica cuando se crea un nuevo diseño.

```json
{
  "event_type": "scratch.design.created",
  "payload": {
    "design_id": "uuid",
    "nombre": "Mi Pantalla"
  }
}
```

### `scratch.design.updated`

Se publica cuando se actualiza un diseño existente.

```json
{
  "event_type": "scratch.design.updated",
  "payload": {
    "design_id": "uuid"
  }
}
```

### `scratch.design.deleted`

Se publica cuando se elimina un diseño.

```json
{
  "event_type": "scratch.design.deleted",
  "payload": {
    "design_id": "uuid"
  }
}
```

### `scratch.design.exported`

Se publica cuando se exporta un diseño.

```json
{
  "event_type": "scratch.design.exported",
  "payload": {
    "design_id": "uuid",
    "format": "json"
  }
}
```

## APIs HTTP

| Metodo | Path | Descripcion |
|--------|------|-------------|
| **Bloques** | | |
| GET | `/blocks/all` | Todos los bloques por categoria |
| GET | `/blocks/modules` | Bloques de modulos |
| GET | `/blocks/events` | Bloques de eventos |
| GET | `/blocks/actions` | Bloques de acciones |
| GET | `/blocks/components` | Bloques de componentes UI |
| GET | `/blocks/containers` | Bloques contenedores |
| GET | `/blocks/data` | Bloques de datos |
| GET | `/blocks/conditions` | Bloques de condiciones |
| **Diseños** | | |
| GET | `/designs` | Listar diseños |
| POST | `/designs` | Crear diseño |
| GET | `/designs/:id` | Obtener diseño |
| PUT | `/designs/:id` | Actualizar diseño |
| DELETE | `/designs/:id` | Eliminar diseño |
| POST | `/designs/:id/duplicate` | Duplicar diseño |
| **Validacion** | | |
| POST | `/validate/connection` | Validar conexion entre bloques |
| POST | `/validate/design` | Validar diseño completo |
| **Export** | | |
| POST | `/export/json` | Exportar como JSON |
| POST | `/export/module-ui` | Exportar como module-ui |
| **Observability** | | |
| GET | `/health` | Health check |
| GET | `/metrics` | Metricas del modulo |

## Ejemplos de Uso

### Crear diseño

```bash
curl -X POST http://localhost:3000/modules/scratch-designer/designs \
  -H "Content-Type: application/json" \
  -d '{"nombre": "Mi Pantalla", "tipo": "mobile"}'
```

### Obtener bloques

```bash
curl http://localhost:3000/modules/scratch-designer/blocks/all
```

### Exportar diseño

```bash
curl -X POST http://localhost:3000/modules/scratch-designer/export/json \
  -H "Content-Type: application/json" \
  -d '{"design_id": "uuid-del-diseño"}'
```

## Categorias de Bloques

| Categoria | Color | Descripcion |
|-----------|-------|-------------|
| pantalla | Morado | Bloque raiz de pantalla |
| layout | Azul | Layouts (fullscreen, sidebar, etc) |
| contenedor | Cyan | Contenedores (cards, panels, grids) |
| componente | Verde | Componentes UI (botones, inputs, tablas) |
| modulo | Naranja | Referencias a modulos del sistema |
| evento | Rojo | Eventos (escuchar, emitir) |
| accion | Rosa | Acciones (navegar, API, toast) |
| condicion | Naranja | Logica (si, repetir, comparar) |
| datos | Violeta | Datos (variables, endpoints) |

## Metricas

El modulo expone las siguientes metricas en `/metrics`:

**Counters:**
- `design.created.total` - Diseños creados
- `design.exported.total` - Diseños exportados
- `api.calls.total` - Total de llamadas API
- `errors.total` - Total de errores

**Gauges:**
- `designs.active.count` - Diseños activos
- `blocks.categories.count` - Categorias de bloques

**Timings:**
- `design.created.duration` - Tiempo de creacion
- `design.updated.duration` - Tiempo de actualizacion
- `design.exported.duration` - Tiempo de exportacion

## Version

- **Version:** 2.0.0
- **Autor:** Event Core Team
