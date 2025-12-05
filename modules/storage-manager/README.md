# Módulo Storage Manager

**Event-driven file storage management with project isolation**

## 🎯 Propósito

Gestiona almacenamiento de archivos por proyecto:
- ✅ Auto-crea estructura de directorios cuando se crea proyecto
- ✅ Auto-elimina storage cuando se elimina proyecto
- ✅ Upload/download/delete archivos
- ✅ Organización por categorías (uploads, exports, temp, files)
- ✅ Tracking de uso de storage
- ✅ Limpieza automática de archivos temporales
- ✅ 100% event-driven

---

## 🏗️ Arquitectura

```
┌──────────────────────────────────────┐
│     Storage Manager                  │
├──────────────────────────────────────┤
│ • File Registry (in-memory)          │
│ • Upload/Download Management         │
│ • Auto Storage Creation/Deletion     │
│ • Category Organization              │
│ • Temp File Cleanup                  │
└──────────────────────────────────────┘
         ↕ escucha eventos
┌──────────────────────────────────────┐
│  Project Manager                     │
│  (project.created, project.deleted)  │
└──────────────────────────────────────┘
```

**Estructura de Storage:**
```
data/storage/
└── {project-id}/
    ├── uploads/       # Archivos subidos por usuarios
    ├── exports/       # Exports generados (CSV, PDF, etc.)
    ├── temp/          # Archivos temporales (auto-cleanup)
    └── files/         # Otros archivos del proyecto
```

---

## 🔄 Funcionamiento Automático

### Al crear proyecto

```
1. project-manager publica project.created
        ↓
2. storage-manager escucha evento
        ↓
3. Crea estructura de directorios automáticamente
        ↓
4. Publica storage.created
```

### Al eliminar proyecto

```
1. project-manager publica project.deleted
        ↓
2. storage-manager escucha evento
        ↓
3. Elimina todos los archivos y directorios
        ↓
4. Publica storage.deleted con stats (bytes freed, files deleted)
```

---

## 📤 Upload de Archivos

### Via HTTP API

```bash
curl -X POST http://localhost:3000/modules/storage-manager/storage/proj-123/upload \
  -F "file=@document.pdf" \
  -F "category=uploads" \
  -F 'metadata={"description":"Important document"}'
```

**Respuesta:**
```json
{
  "success": true,
  "file": {
    "id": "file-abc-123",
    "project_id": "proj-123",
    "filename": "file-abc-123_document.pdf",
    "original_filename": "document.pdf",
    "path": "/data/storage/proj-123/uploads/file-abc-123_document.pdf",
    "relative_path": "proj-123/uploads/file-abc-123_document.pdf",
    "size": 245760,
    "mime_type": "application/pdf",
    "category": "uploads",
    "created_at": "2024-01-15T10:30:00.000Z",
    "metadata": {
      "description": "Important document"
    }
  }
}
```

**Categorías disponibles:**
- `uploads` - Archivos subidos por usuarios
- `exports` - Exports generados (CSV, PDF, etc.)
- `temp` - Archivos temporales (se limpian automáticamente)
- `files` - Otros archivos del proyecto

---

## 📋 Listar Archivos

### Listar todos los archivos del proyecto

```bash
curl http://localhost:3000/modules/storage-manager/storage/proj-123/files
```

**Respuesta:**
```json
{
  "success": true,
  "files": [
    {
      "id": "file-abc-123",
      "filename": "file-abc-123_document.pdf",
      "original_filename": "document.pdf",
      "size": 245760,
      "mime_type": "application/pdf",
      "category": "uploads",
      "created_at": "2024-01-15T10:30:00.000Z"
    },
    {
      "id": "file-def-456",
      "filename": "file-def-456_export.csv",
      "original_filename": "export.csv",
      "size": 12800,
      "mime_type": "text/csv",
      "category": "exports",
      "created_at": "2024-01-15T11:00:00.000Z"
    }
  ],
  "count": 2,
  "total_size": 258560
}
```

### Filtrar por categoría

```bash
curl "http://localhost:3000/modules/storage-manager/storage/proj-123/files?category=uploads"
```

---

## 📥 Download de Archivos

```bash
curl http://localhost:3000/modules/storage-manager/storage/proj-123/download/file-abc-123 \
  -o document.pdf
```

El archivo se descarga con su nombre original (`document.pdf`).

---

## 🗑️ Eliminar Archivos

```bash
curl -X DELETE http://localhost:3000/modules/storage-manager/storage/proj-123/files/file-abc-123
```

**Respuesta:**
```json
{
  "success": true,
  "file_id": "file-abc-123",
  "message": "File deleted successfully"
}
```

---

## 🧹 Limpieza de Archivos Temporales

Los archivos en la categoría `temp` se pueden limpiar automáticamente si tienen más de X horas (configurable).

```bash
curl -X POST http://localhost:3000/modules/storage-manager/storage/proj-123/cleanup
```

**Respuesta:**
```json
{
  "success": true,
  "files_deleted": 5,
  "bytes_freed": 1048576
}
```

**Configuración:**
```json
{
  "tempCleanupAfterHours": 24
}
```

---

## 📊 Información de Storage

```bash
curl http://localhost:3000/modules/storage-manager/storage/proj-123/info
```

**Respuesta:**
```json
{
  "success": true,
  "storage": {
    "project_id": "proj-123",
    "total_size": 5242880,
    "file_count": 15,
    "by_category": {
      "uploads": {
        "size": 3145728,
        "count": 8
      },
      "exports": {
        "size": 1048576,
        "count": 4
      },
      "temp": {
        "size": 524288,
        "count": 2
      },
      "files": {
        "size": 524288,
        "count": 1
      }
    }
  }
}
```

---

## 📡 Eventos Publicados

### storage.created
Publicado automáticamente cuando se crea un proyecto.

```json
{
  "event_id": "uuid",
  "event_type": "storage.created",
  "correlation_id": "uuid",
  "occurred_at": "2024-01-15T10:30:00.000Z",
  "producer": "storage-manager",
  "payload": {
    "project_id": "proj-123",
    "directories": ["uploads", "exports", "temp", "files"],
    "created_at": "2024-01-15T10:30:00.000Z"
  }
}
```

### storage.deleted
Publicado automáticamente cuando se elimina un proyecto.

```json
{
  "event_type": "storage.deleted",
  "payload": {
    "project_id": "proj-123",
    "files_deleted": 25,
    "bytes_freed": 10485760,
    "deleted_at": "2024-01-15T12:00:00.000Z"
  }
}
```

### file.uploaded
Publicado cuando se sube un archivo.

```json
{
  "event_type": "file.uploaded",
  "payload": {
    "file_id": "file-abc-123",
    "project_id": "proj-123",
    "filename": "file-abc-123_document.pdf",
    "size": 245760,
    "category": "uploads",
    "mime_type": "application/pdf",
    "uploaded_at": "2024-01-15T10:30:00.000Z"
  }
}
```

### file.deleted
Publicado cuando se elimina un archivo.

```json
{
  "event_type": "file.deleted",
  "payload": {
    "file_id": "file-abc-123",
    "project_id": "proj-123",
    "filename": "file-abc-123_document.pdf",
    "size": 245760,
    "deleted_at": "2024-01-15T11:30:00.000Z"
  }
}
```

### storage.cleaned
Publicado cuando se limpian archivos temporales.

```json
{
  "event_type": "storage.cleaned",
  "payload": {
    "project_id": "proj-123",
    "files_deleted": 5,
    "bytes_freed": 1048576,
    "cleaned_at": "2024-01-15T14:00:00.000Z"
  }
}
```

---

## 🔍 Eventos de Query (Request/Response)

### file.list.request / file.list.response

**Request:**
```javascript
await eventBus.publish('file.list.request', {
  request_id: 'req-123',
  project_id: 'proj-123',
  category: 'uploads', // opcional
  correlation_id: 'corr-456'
});
```

**Response:**
```json
{
  "event_type": "file.list.response",
  "payload": {
    "request_id": "req-123",
    "success": true,
    "project_id": "proj-123",
    "files": [...],
    "count": 8,
    "total_size": 3145728
  }
}
```

### file.get.request / file.get.response

**Request:**
```javascript
await eventBus.publish('file.get.request', {
  request_id: 'req-123',
  file_id: 'file-abc-123',
  correlation_id: 'corr-456'
});
```

**Response:**
```json
{
  "event_type": "file.get.response",
  "payload": {
    "request_id": "req-123",
    "success": true,
    "file": { "id": "file-abc-123", ... }
  }
}
```

### storage.info.request / storage.info.response

**Request:**
```javascript
await eventBus.publish('storage.info.request', {
  request_id: 'req-123',
  project_id: 'proj-123',
  correlation_id: 'corr-456'
});
```

**Response:**
```json
{
  "event_type": "storage.info.response",
  "payload": {
    "request_id": "req-123",
    "success": true,
    "storage": {
      "project_id": "proj-123",
      "total_size": 5242880,
      "file_count": 15,
      "by_category": { ... }
    }
  }
}
```

---

## 📊 Métricas

### Counters
- `storage.created.total` - Storages creados
- `storage.deleted.total` - Storages eliminados
- `file.uploaded.total` - Archivos subidos
- `file.downloaded.total` - Archivos descargados
- `file.deleted.total` - Archivos eliminados
- `storage.cleanup.total` - Limpiezas realizadas
- `storage.error.total` - Errores

### Gauges
- `storage.projects.count` - Proyectos con storage
- `storage.total.bytes` - Total bytes usados
- `storage.files.count` - Total archivos

### Timings
- `file.upload.duration` - Duración upload
- `file.download.duration` - Duración download
- `storage.cleanup.duration` - Duración cleanup

---

## ⚙️ Configuración

```json
{
  "basePath": "data/storage",
  "maxFileSize": 104857600,
  "allowedMimeTypes": ["image/*", "application/pdf", "text/*", "application/json"],
  "tempCleanupAfterHours": 24,
  "directories": {
    "uploads": "uploads",
    "exports": "exports",
    "temp": "temp",
    "files": "files"
  }
}
```

**Parámetros:**
- `basePath`: Directorio base para storage (default: `data/storage`)
- `maxFileSize`: Tamaño máximo de archivo en bytes (default: 100MB)
- `allowedMimeTypes`: Tipos MIME permitidos
- `tempCleanupAfterHours`: Horas antes de limpiar archivos temp (default: 24)
- `directories`: Nombres de categorías de directorios

---

## 🎯 Casos de Uso

1. **User Uploads** - Usuarios suben avatares, documentos, etc.
2. **Export Reports** - Sistema genera y almacena exports (CSV, PDF)
3. **Temp Processing** - Archivos temporales durante procesamiento
4. **Backups** - Almacenar backups de configuración
5. **AI Artifacts** - Almacenar outputs de AI (imágenes, textos, etc.)

---

## 🔗 Integración con Otros Módulos

### Project Manager
Storage auto-creado/eliminado:
```javascript
// project-manager publica
await eventBus.publish('project.created', { project_id: 'proj-123', ... });

// storage-manager escucha y auto-crea directorios
```

### AI Agent Framework
Agentes pueden guardar artifacts:
```javascript
// Agent genera imagen
const imageBuffer = await aiConnector.generateImage(prompt);

// Upload a storage
const file = await storageManager.uploadFile(projectId, {
  buffer: imageBuffer,
  name: 'generated-image.png',
  size: imageBuffer.length,
  mimetype: 'image/png'
}, 'files', { generated_by: 'ai-agent', prompt });
```

### Chat API
Almacenar attachments de conversaciones:
```javascript
// User sube archivo en chat
const file = await storageManager.uploadFile(projectId, req.file, 'uploads', {
  conversation_id: conversationId,
  user_id: userId
});

// Asociar archivo a mensaje
await chatApi.addMessage(conversationId, {
  content: 'Uploaded file',
  attachments: [{ file_id: file.id, filename: file.original_filename }]
});
```

---

## 📝 Ejemplo Completo

```bash
# 1. Crear proyecto
curl -X POST http://localhost:3000/modules/project-manager/projects \
  -H "Content-Type: application/json" \
  -d '{"name": "My Project"}'

# Respuesta: {"success": true, "project": {"id": "proj-123", ...}}
# Storage auto-creado via evento project.created

# 2. Upload archivo
curl -X POST http://localhost:3000/modules/storage-manager/storage/proj-123/upload \
  -F "file=@document.pdf" \
  -F "category=uploads"

# Respuesta: {"success": true, "file": {"id": "file-abc-123", ...}}

# 3. Listar archivos
curl http://localhost:3000/modules/storage-manager/storage/proj-123/files

# 4. Download archivo
curl http://localhost:3000/modules/storage-manager/storage/proj-123/download/file-abc-123 \
  -o document.pdf

# 5. Ver info de storage
curl http://localhost:3000/modules/storage-manager/storage/proj-123/info

# 6. Limpiar temp files
curl -X POST http://localhost:3000/modules/storage-manager/storage/proj-123/cleanup

# 7. Eliminar archivo
curl -X DELETE http://localhost:3000/modules/storage-manager/storage/proj-123/files/file-abc-123

# 8. Eliminar proyecto
curl -X DELETE http://localhost:3000/modules/project-manager/projects/proj-123

# Storage auto-eliminado via evento project.deleted
```

---

## 🔒 Seguridad

1. **Validación de Tamaño**: Rechaza archivos > maxFileSize
2. **MIME Type Validation**: Solo permite tipos configurados
3. **Project Isolation**: Cada proyecto tiene su storage separado
4. **Path Traversal Protection**: Valida paths para evitar ../
5. **File ID Prefix**: Archivos tienen UUID prefix para evitar colisiones

---

## ⚠️ Consideraciones

1. **Auto Storage Creation**: Storage se crea automáticamente al crear proyecto
2. **Auto Storage Deletion**: Storage se elimina al eliminar proyecto (¡cuidado con datos!)
3. **Temp Cleanup**: Archivos en `temp/` se limpian automáticamente después de X horas
4. **File ID Naming**: Archivos se guardan como `{uuid}_{original-name}`
5. **In-Memory Registry**: Metadata en memoria (se recarga al iniciar)
6. **No Database**: No usa DB, solo filesystem (para simplificar)
7. **Event-Driven**: 100% comunicación via eventos

---

## 🏁 Health & Metrics

```bash
# Health check
curl http://localhost:3000/modules/storage-manager/health

# Respuesta
{
  "status": "healthy",
  "module": "storage-manager",
  "total_files": 150,
  "total_size": 52428800,
  "projects_count": 10,
  "uptime": 3600.5
}

# Metrics
curl http://localhost:3000/modules/storage-manager/metrics

# Respuesta
{
  "module": "storage-manager",
  "metrics": {
    "total_files": 150,
    "total_size": 52428800,
    "projects_count": 10
  }
}
```
