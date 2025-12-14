# Log Manager Module

Sistema centralizado de logs para Event Core. Recolecta logs de todos los módulos (backend y frontend) y los almacena en formato JSONL para fácil análisis.

## Ubicación de Logs

```
data/logs/
├── current.jsonl      # Logs del día actual (LEER ESTE)
├── 2025-01-14.jsonl   # Histórico por día
├── 2025-01-13.jsonl
└── index.json         # Índice con estadísticas
```

## Formato de Logs (JSONL)

Cada línea es un JSON independiente:

```json
{"ts":"2025-01-14T10:00:01.123Z","level":"info","source":"backend","module":"ai-gateway","msg":"request.received","ctx":{"provider":"claude"}}
{"ts":"2025-01-14T10:00:02.456Z","level":"error","source":"backend","module":"database","msg":"query.failed","ctx":{"error":"timeout"}}
```

### Campos

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `ts` | string | Timestamp ISO 8601 |
| `level` | string | debug, info, warn, error |
| `source` | string | backend, frontend |
| `module` | string | Nombre del módulo origen |
| `msg` | string | Evento en dot.notation |
| `ctx` | object | Contexto adicional |
| `traceId` | string | ID de traza (opcional) |
| `error` | object | Detalles del error (opcional) |

## Para la IA

### Leer logs actuales
```bash
cat data/logs/current.jsonl
```

### Filtrar por nivel
```bash
# Solo errores
grep '"level":"error"' data/logs/current.jsonl

# Errores y warnings
grep -E '"level":"(error|warn)"' data/logs/current.jsonl
```

### Filtrar por módulo
```bash
grep '"module":"ai-gateway"' data/logs/current.jsonl
```

### Buscar texto
```bash
grep "timeout" data/logs/current.jsonl
```

### Últimos N logs
```bash
tail -n 50 data/logs/current.jsonl
```

### Logs de una fecha específica
```bash
cat data/logs/2025-01-13.jsonl
```

### Contar errores por módulo
```bash
grep '"level":"error"' data/logs/current.jsonl | grep -o '"module":"[^"]*"' | sort | uniq -c
```

## APIs REST

### GET /modules/log-manager/api/logs

Obtener logs con filtros.

**Query params:**
- `level` - Filtrar por nivel (comma-separated: `error,warn`)
- `module` - Filtrar por módulo (comma-separated: `ai-gateway,database`)
- `source` - Filtrar por fuente (`backend`/`frontend`)
- `search` - Búsqueda en mensaje y contexto
- `from` - Fecha desde (YYYY-MM-DD)
- `to` - Fecha hasta (YYYY-MM-DD)
- `limit` - Límite de resultados (default: 100)
- `offset` - Offset para paginación

**Ejemplo:**
```bash
curl "http://localhost:3000/modules/log-manager/api/logs?level=error&limit=50"
```

### POST /modules/log-manager/api/logs

Agregar un log (desde frontend).

**Body:**
```json
{
  "level": "error",
  "module": "chat",
  "msg": "send.failed",
  "ctx": { "error": "timeout" }
}
```

### GET /modules/log-manager/api/stats

Estadísticas de logs.

**Respuesta:**
```json
{
  "success": true,
  "stats": {
    "total": 1234,
    "byLevel": { "info": 1000, "warn": 200, "error": 34 },
    "byModule": { "ai-gateway": 500, "database": 300 }
  }
}
```

### GET /modules/log-manager/api/files

Listar archivos de logs disponibles.

### DELETE /modules/log-manager/api/logs

Limpiar logs antiguos.

**Query params:**
- `olderThan` - Días de antigüedad

## Configuración

En `module.json`:

```json
{
  "config": {
    "logsPath": "./data/logs",
    "maxFileSize": 10485760,
    "retentionDays": 30,
    "rotateDaily": true
  }
}
```

## Niveles de Log

| Nivel | Uso |
|-------|-----|
| `debug` | Información detallada para debugging |
| `info` | Eventos normales del sistema |
| `warn` | Situaciones anómalas pero manejables |
| `error` | Errores que requieren atención |

## Ejemplos de Análisis

### ¿Qué errores ocurrieron hoy?
```bash
grep '"level":"error"' data/logs/current.jsonl | jq .
```

### ¿Cuántas peticiones al AI gateway?
```bash
grep '"module":"ai-gateway"' data/logs/current.jsonl | wc -l
```

### ¿Qué módulos generan más logs?
```bash
cat data/logs/current.jsonl | grep -o '"module":"[^"]*"' | sort | uniq -c | sort -rn
```

### Timeline de errores
```bash
grep '"level":"error"' data/logs/current.jsonl | jq -r '[.ts, .module, .msg] | @tsv'
```
