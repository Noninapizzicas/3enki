# Flow Engine

Motor de flujos generico que conecta servicios, APIs, agentes y logica.

## Concepto

Un **flujo** es una secuencia de pasos que se ejecuta cuando ocurre un evento.
Cada paso puede ser:

- **service**: Llama a un servicio local (OCR, filesystem, telegram, etc.)
- **transform**: Transforma datos (map, filter, merge, etc.)
- **condition**: Bifurcacion condicional (if/then/else)
- **parallel**: Ejecuta pasos en paralelo
- **agent**: Invoca un agente AI
- **http**: Llamada HTTP externa
- **delay**: Espera un tiempo
- **log**: Escribe en el log
- **set**: Define variables

## Ejemplo: Procesar Facturas

```json
{
  "id": "procesar-facturas",
  "name": "Procesar Facturas OCR",
  "trigger": {
    "event": "bot.file.stored",
    "filter": {
      "botName": "facturas-asesoria"
    }
  },
  "steps": [
    {
      "id": "leer-archivo",
      "type": "service",
      "service": "filesystem",
      "action": "read",
      "path": "{{ trigger.file.path }}"
    },
    {
      "id": "ocr",
      "type": "service",
      "service": "ocr",
      "action": "extract",
      "input": "{{ steps.leer-archivo.output.content }}",
      "config": { "language": "spa" }
    },
    {
      "id": "guardar",
      "type": "service",
      "service": "filesystem",
      "action": "write",
      "path": "./data/facturas/{{ trigger.file.originalName }}.txt",
      "content": "{{ steps.ocr.output.text }}"
    }
  ]
}
```

## Variables

Usa `{{ path.to.value }}` para interpolar variables:

| Variable | Descripcion |
|----------|-------------|
| `{{ trigger.* }}` | Datos del evento trigger |
| `{{ steps.ID.output.* }}` | Resultado de un paso anterior |
| `{{ variables.* }}` | Variables definidas con step "set" |
| `{{ now }}` | Timestamp ISO actual |
| `{{ date }}` | Fecha YYYY-MM-DD |
| `{{ time }}` | Hora HH:mm:ss |
| `{{ uuid }}` | UUID aleatorio |
| `{{ env.VAR }}` | Variable de entorno |

### Funciones

```
{{ default(trigger.caption, "sin caption") }}  # Valor por defecto
{{ lowercase(trigger.file.originalName) }}     # Minusculas
{{ uppercase(value) }}                          # Mayusculas
{{ length(steps.ocr.output.text) }}            # Longitud
```

## Tipos de Steps

### service

Llama a servicios locales via eventos.

```json
{
  "type": "service",
  "service": "ocr",
  "action": "extract",
  "input": "{{ steps.leer.output.content }}",
  "config": { "language": "spa" }
}
```

Servicios disponibles (patron: `{provider}.{action}.request`):

**Locales:**
- `filesystem`: read, write, append, delete, exists, list, rename (sincrono)
- `ocr`: extract (usa ocr-service existente)
- `local.tesseract`: extract (OCR directo)
- `local.pdf`: create
- `local.csv`: create, parse
- `local.xlsx`: create, parse

**APIs externas (requieren credencial):**
- `google.vision`: extract (OCR)
- `google.tts`: synthesize (Text-to-Speech)
- `google.translate`: text
- `anthropic.vision`: extract (OCR con analisis)
- `elevenlabs.tts`: synthesize

**Telegram:**
- `telegram`: send_message

### transform

Transforma datos.

```json
{
  "type": "transform",
  "operation": "map",
  "config": {
    "mapping": {
      "nombre": "{{ trigger.file.originalName }}",
      "texto": "{{ steps.ocr.output.text }}"
    }
  }
}
```

Operaciones:
- `map`: Mapea campos
- `filter`: Filtra array
- `merge`: Combina objetos
- `extract`: Extrae campos especificos
- `template`: Aplica template string
- `json.parse` / `json.stringify`: Conversion JSON
- `split` / `join`: Separar/unir strings
- `regex`: Extraer con expresion regular

### condition

Bifurcacion condicional.

```json
{
  "id": "check-confianza",
  "type": "condition",
  "if": "{{ steps.ocr.output.confidence }} < 0.5",
  "then": "usar-google-vision",
  "else": "guardar-resultado"
}
```

Operadores: `==`, `!=`, `<`, `>`, `<=`, `>=`, `contains`, `startsWith`, `endsWith`

### parallel

Ejecuta pasos en paralelo.

```json
{
  "type": "parallel",
  "steps": [
    { "id": "guardar-json", "type": "service", ... },
    { "id": "guardar-txt", "type": "service", ... },
    { "id": "notificar", "type": "service", ... }
  ]
}
```

### agent

Invoca un agente AI.

```json
{
  "type": "agent",
  "agent": "extractor-datos",
  "task": "Extrae los campos de esta factura: {{ steps.ocr.output.text }}",
  "timeout": 120000
}
```

### http

Llamada HTTP externa.

```json
{
  "type": "http",
  "url": "https://api.example.com/webhook",
  "method": "POST",
  "headers": { "Authorization": "Bearer {{ env.API_KEY }}" },
  "body": { "text": "{{ steps.ocr.output.text }}" }
}
```

### delay

Espera un tiempo.

```json
{
  "type": "delay",
  "ms": 5000
}
```

### log

Escribe en el log.

```json
{
  "type": "log",
  "level": "info",
  "message": "Procesado: {{ trigger.file.originalName }}"
}
```

### set

Define variables para usar en pasos posteriores.

```json
{
  "type": "set",
  "variables": {
    "outputPath": "./data/facturas/{{ date }}",
    "fileName": "{{ trigger.file.originalName }}"
  }
}
```

## Filtros de Trigger

```json
{
  "trigger": {
    "event": "bot.file.stored",
    "filter": {
      "botName": "facturas-asesoria",
      "file.mimeType": { "$in": ["image/jpeg", "image/png"] },
      "file.size": { "$lt": 10000000 }
    }
  }
}
```

Operadores de filtro:
- `$eq`, `$ne`: Igual / No igual
- `$in`, `$nin`: En lista / No en lista
- `$gt`, `$gte`, `$lt`, `$lte`: Comparacion numerica
- `$contains`, `$startsWith`, `$endsWith`: Strings
- `$regex`: Expresion regular
- `$exists`: Existe o no

## Manejo de Errores

Por defecto, un error en un paso falla todo el flujo. Puedes cambiar esto:

```json
{
  "id": "paso-opcional",
  "type": "service",
  "onError": "continue"
}
```

O saltar a un paso de manejo de error:

```json
{
  "id": "paso-critico",
  "type": "service",
  "onError": "manejar-error"
},
{
  "id": "manejar-error",
  "type": "log",
  "message": "Error: {{ context.error.message }}"
}
```

## APIs HTTP

| Metodo | Path | Descripcion |
|--------|------|-------------|
| GET | /flows | Lista flujos |
| GET | /flows/:id | Obtiene flujo |
| POST | /flows | Crea flujo |
| PUT | /flows/:id | Actualiza flujo |
| DELETE | /flows/:id | Elimina flujo |
| POST | /flows/:id/trigger | Dispara flujo manualmente |
| GET | /executions | Lista ejecuciones |
| GET | /executions/:id | Estado de ejecucion |
| POST | /executions/:id/cancel | Cancela ejecucion |

## Crear Flujos

### Via archivo JSON

Crea un archivo en `modules/flow-engine/flows/mi-flujo.json`

### Via API

```bash
curl -X POST http://localhost:3000/modules/flow-engine/flows \
  -H "Content-Type: application/json" \
  -d '{"id": "mi-flujo", "steps": [...]}'
```

### Via codigo

```javascript
const flowEngine = core.getModule('flow-engine');
await flowEngine.registerFlow({
  id: 'mi-flujo',
  trigger: { event: 'bot.file.stored' },
  steps: [...]
});
```

## Eventos Publicados

- `flow.started`: Flujo iniciado
- `flow.step.started`: Paso iniciado
- `flow.step.completed`: Paso completado
- `flow.step.failed`: Paso fallido
- `flow.completed`: Flujo completado
- `flow.failed`: Flujo fallido
