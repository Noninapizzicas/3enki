# File Browser Module

Módulo para navegar y gestionar archivos dentro de los proyectos.

## Características

- **Listar archivos**: Lista archivos y carpetas en un proyecto
- **Leer contenido**: Lee el contenido de archivos de texto
- **Crear archivos/carpetas**: Crea nuevos archivos o directorios
- **Eliminar**: Elimina archivos o carpetas
- **Buscar**: Busca archivos por nombre o contenido

## APIs HTTP

### GET `/modules/file-browser/files`

Lista archivos en un directorio del proyecto.

**Query params:**
- `project_id` (requerido): ID del proyecto
- `path` (opcional): Ruta relativa dentro del proyecto (default: `/`)
- `filter` (opcional): Filtro de extensiones (ej: `md,json,txt`)

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "project_id": "proj-123",
    "path": "/",
    "files": [
      {
        "name": "README.md",
        "type": "file",
        "extension": ".md",
        "size": 1024,
        "modified": "2025-01-15T10:30:00Z",
        "path": "/README.md"
      }
    ]
  }
}
```

### GET `/modules/file-browser/files/content`

Obtiene el contenido de un archivo.

**Query params:**
- `project_id` (requerido)
- `file_path` (requerido): Ruta del archivo

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "file_path": "/README.md",
    "content": "# Mi Proyecto...",
    "size": 1024,
    "modified": "2025-01-15T10:30:00Z",
    "extension": ".md"
  }
}
```

### POST `/modules/file-browser/files`

Crea un nuevo archivo o carpeta.

**Body:**
```json
{
  "project_id": "proj-123",
  "file_path": "/docs/new-file.md",
  "content": "# Contenido inicial",
  "type": "file"
}
```

### DELETE `/modules/file-browser/files`

Elimina un archivo o carpeta.

**Query params:**
- `project_id` (requerido)
- `file_path` (requerido)

### GET `/modules/file-browser/files/search`

Busca archivos por nombre o contenido.

**Query params:**
- `project_id` (requerido)
- `query` (requerido): Texto a buscar
- `search_content` (opcional): Buscar en el contenido (default: false)

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "query": "readme",
    "results": [
      {
        "name": "README.md",
        "path": "/README.md",
        "type": "file",
        "size": 1024,
        "modified": "2025-01-15T10:30:00Z",
        "match_type": "filename"
      }
    ],
    "count": 1
  }
}
```

## Eventos MQTT

### Subscripciones

- `file.list.request` - Solicitud para listar archivos
- `file.content.request` - Solicitud para leer contenido
- `file.create.request` - Solicitud para crear archivo
- `file.delete.request` - Solicitud para eliminar archivo
- `file.search.request` - Solicitud para buscar archivos

### Publicaciones

- `file.list.response` - Respuesta con lista de archivos
- `file.content.response` - Respuesta con contenido
- `file.created` - Archivo/carpeta creado
- `file.deleted` - Archivo/carpeta eliminado
- `file.search.response` - Resultados de búsqueda

## Seguridad

- **Path traversal protection**: Valida que todas las rutas estén dentro del directorio del proyecto
- **Extensiones permitidas**: Solo permite buscar en contenido de archivos de texto conocidos
- **Access control**: Requiere project_id válido para todas las operaciones

## Integración con UI

El módulo está diseñado para integrarse con el componente `file-browser` en la UI:

```json
{
  "component": "file-browser",
  "config": {
    "endpoint": "/modules/file-browser/files",
    "mqtt_topics": ["file.created", "file.deleted"]
  }
}
```

## Métricas

- `files_listed_total` - Total de listados de archivos
- `files_created_total` - Total de archivos creados
- `files_deleted_total` - Total de archivos eliminados
- `search_queries_total` - Total de búsquedas realizadas
