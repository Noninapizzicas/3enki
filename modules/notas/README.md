# 📝 Módulo Notas

Gestión de notas rápidas con eventos en tiempo real.

## 📦 Eventos Publicados

### `nota.creada`

Cuando se crea una nueva nota.

```json
{
  "event_type": "nota.creada",
  "payload": {
    "nota_id": "nota_1234567890_abc12",
    "titulo": "Mi nota",
    "contenido": "Contenido de la nota",
    "color": "yellow",
    "pinned": false
  }
}
```

### `nota.actualizada`

Cuando se actualiza una nota existente.

```json
{
  "event_type": "nota.actualizada",
  "payload": {
    "nota_id": "nota_1234567890_abc12",
    "updates": { "titulo": "Nuevo título" },
    "previous": { "titulo": "Título anterior" }
  }
}
```

### `nota.eliminada`

Cuando se elimina una nota.

```json
{
  "event_type": "nota.eliminada",
  "payload": {
    "nota_id": "nota_1234567890_abc12",
    "titulo": "Nota eliminada"
  }
}
```

## 🔌 APIs HTTP

| Método | Path | Descripción |
|--------|------|-------------|
| GET | `/notas` | Listar notas (filtros: `color`, `pinned`) |
| GET | `/notas/:id` | Obtener nota por ID |
| POST | `/notas` | Crear nueva nota |
| PATCH | `/notas/:id` | Actualizar nota |
| DELETE | `/notas/:id` | Eliminar nota |
| POST | `/notas/:id/pin` | Toggle fijar/desfijar |
| GET | `/health` | Health check |
| GET | `/metrics` | Métricas del módulo |

## 🎨 Colores Disponibles

- `yellow` (default)
- `green`
- `blue`
- `pink`
- `purple`
- `orange`

## 🧪 Ejemplos de Uso

### Listar notas

```bash
curl http://localhost:3000/modules/notas/notas
```

### Crear nota

```bash
curl -X POST http://localhost:3000/modules/notas/notas \
  -H "Content-Type: application/json" \
  -d '{
    "titulo": "Nueva nota",
    "contenido": "Contenido de ejemplo",
    "color": "blue"
  }'
```

### Actualizar nota

```bash
curl -X PATCH http://localhost:3000/modules/notas/notas/nota_123 \
  -H "Content-Type: application/json" \
  -d '{"titulo": "Título actualizado"}'
```

### Fijar/desfijar nota

```bash
curl -X POST http://localhost:3000/modules/notas/notas/nota_123/pin
```

### Filtrar por color

```bash
curl http://localhost:3000/modules/notas/notas?color=blue
```

### Ver solo fijadas

```bash
curl http://localhost:3000/modules/notas/notas?pinned=true
```

## 📊 Métricas

| Métrica | Tipo | Descripción |
|---------|------|-------------|
| `nota.creada.total` | Counter | Total de notas creadas |
| `nota.actualizada.total` | Counter | Total de actualizaciones |
| `nota.eliminada.total` | Counter | Total de eliminaciones |
| `nota.activas.count` | Gauge | Notas activas actuales |
| `nota.pinned.count` | Gauge | Notas fijadas actuales |

## 📁 Estructura

```
modules/notas/
├── module.json       # Manifest y contratos
├── index.js          # Lógica del módulo (~380 líneas)
├── schemas/
│   ├── nota.json     # Schema de datos
│   └── events.json   # Schema de eventos
└── README.md         # Esta documentación
```

---

**Versión:** 1.0.0
**Autor:** Event-Core Team
