# 🧪 Test Wii Module

Módulo de prueba para validar templates WII

**Versión:** 1.0.0
**Autor:** Event Core Team

## 📋 Descripción

Este módulo es una prueba para validar que los templates de Plop generan correctamente la configuración de WII (Web Interface Integration) con Auto-UI v2.0.

## 🎯 Funcionalidades

- ✅ Gestión de items (crear, listar, eliminar)
- ✅ Publicación de eventos (item.created, item.updated)
- ✅ Suscripción a eventos (*.created)
- ✅ Interfaz web completa con Auto-UI v2.0
- ✅ Dashboard con estadísticas y tabla avanzada
- ✅ Formulario de creación
- ✅ Actualizaciones en tiempo real vía MQTT

## 🔌 APIs HTTP

### `GET /modules/test-wii-module/items`
Obtiene la lista de todos los items.

**Respuesta:**
```json
{
  "items": [...],
  "count": 3,
  "timestamp": "2025-11-28T..."
}
```

### `POST /modules/test-wii-module/items`
Crea un nuevo item.

**Body:**
```json
{
  "name": "Mi item",
  "status": "active"
}
```

### `DELETE /modules/test-wii-module/items/:id`
Elimina un item por ID.

### `GET /modules/test-wii-module/health`
Health check del módulo.

## 📤 Eventos Publicados

- **item.created**: Se publica cuando se crea un nuevo item
- **item.updated**: Se publica cuando se actualiza un item

## 📥 Eventos Suscritos

- **\*.created**: Escucha todos los eventos de tipo "created"

## 🎨 Interfaz Web (WII)

El módulo incluye una interfaz web completa con Auto-UI v2.0:

### Vista Principal (Dashboard)
- **Layout**: Dos columnas (65% / 35%)
- **Widgets**:
  - 📊 Tarjeta de estadísticas (Total de items)
  - ✓ Tarjeta de estado (Estado del módulo)
  - 📋 Tabla avanzada (Lista de items con acciones)
  - ℹ️ Panel de información (Versión y estado)

### Vista de Creación
- Formulario automático basado en schema
- Validación de campos
- Permisos: admin

### MQTT
- Actualizaciones automáticas en tiempo real
- Topics:
  - `test-wii-module.created`
  - `test-wii-module.updated`
  - `test-wii-module.deleted`

## 🚀 Uso

```bash
# Iniciar el servidor
npm start

# Probar el módulo
curl http://localhost:3000/modules/test-wii-module/health

# Obtener items
curl http://localhost:3000/modules/test-wii-module/items

# Crear item
curl -X POST http://localhost:3000/modules/test-wii-module/items \
  -H "Content-Type: application/json" \
  -d '{"name": "Nuevo item", "status": "active"}'
```

## 📦 Estructura de Archivos

```
test-wii-module/
├── index.js              # Lógica del módulo
├── module.json           # Configuración (incluye UI)
├── README.md             # Documentación
└── schemas/
    ├── events.json       # Schemas de eventos
    └── test-wii-module.json  # Schema principal
```

## 🧪 Validación de Templates

Este módulo demuestra que los templates de Plop incluyen:

✅ Configuración completa de Auto-UI v2.0
✅ Layout responsive de dos columnas
✅ Widgets modernos (stat-card, table-advanced, card)
✅ Sistema de permisos
✅ Integración MQTT para actualizaciones en tiempo real
✅ Formularios automáticos con validación
✅ Schemas JSON completos

---

Generado con ❤️ usando templates de Event Core
