# Setup: Proyecto Factura Asesoría

Sistema de recepción de facturas por Telegram.

## Arquitectura

```
Telegram → Bot → Agente Receptor → /pendientes/ + BD
                                         ↓
                              (noche) Agente Batch
                                         ↓
                              /procesadas/ + datos OCR
```

## Requisitos Previos

1. **Bot de Telegram** configurado en credential-manager
2. **DeepSeek API key** para el agente
3. **Event-Core** corriendo

## Paso 1: Crear estructura de directorios

```bash
# Ejecutar en servidor o via API
mkdir -p /data/projects/factura-asesoria/pendientes
mkdir -p /data/projects/factura-asesoria/procesadas
```

O via API:
```bash
curl -X POST http://localhost:3000/modules/filesystem/mkdir \
  -H "Content-Type: application/json" \
  -d '{"path": "/projects/factura-asesoria/pendientes"}'

curl -X POST http://localhost:3000/modules/filesystem/mkdir \
  -H "Content-Type: application/json" \
  -d '{"path": "/projects/factura-asesoria/procesadas"}'
```

## Paso 2: Inicializar base de datos

```bash
curl -X POST http://localhost:3000/modules/database-manager/databases/factura-asesoria/init \
  -H "Content-Type: application/json" \
  -d @modules/ai-agent-framework/schemas/factura-asesoria-schema.sql
```

O copiar el contenido de `schemas/factura-asesoria-schema.sql` y ejecutar.

## Paso 3: Verificar agente cargado

```bash
curl http://localhost:3000/modules/ai-agent-framework/agents

# Debe aparecer:
# - receptor-facturas (enabled: true)
```

## Paso 4: Configurar bot Telegram

En credential-manager, guardar:
- **Key**: `TELEGRAM_BOT_facturas`
- **Value**: `tu-bot-token`
- **Level**: PROJECT
- **Identifier**: factura-asesoria

## Uso

1. Envía una foto al bot de Telegram
2. El agente:
   - Descarga la imagen
   - La guarda en `/pendientes/`
   - Registra en BD
   - Responde: "📄 Factura recibida"

## Verificar funcionamiento

```bash
# Ver facturas pendientes
curl "http://localhost:3000/modules/database-manager/databases/factura-asesoria/query" \
  -d '{"sql": "SELECT * FROM v_facturas_pendientes"}'

# Ver resumen
curl "http://localhost:3000/modules/database-manager/databases/factura-asesoria/query" \
  -d '{"sql": "SELECT * FROM v_resumen_diario"}'
```

## Siguiente fase: Procesamiento batch

Ver `PLAN-AI-AGENTS.md` para implementar:
- Agente procesador nocturno
- Extracción de datos con AI
- Notificaciones de resumen
