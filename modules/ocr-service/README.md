# Ocr Service

Servicio OCR con soporte multi-engine (Tesseract, Google Vision, Claude Vision)

## Arquitectura

Este módulo sigue el patrón **Service Module** que permite:

- ✅ **Funcionar standalone** con el engine builtin
- ✅ **Extenderse con plugins** en `plugins/ocr/`
- ✅ **Soportar engines locales y remotos** (APIs externas)

```
modules/ocr-service/
├── module.json          ← Configuración del módulo
├── index.js             ← Orquestador genérico
├── lib/
│   ├── plugin-loader.js ← Descubrimiento de plugins
│   └── api-executor.js  ← Ejecutor de APIs externas
├── builtin/
│   └── default.js       ← Engine por defecto
└── schemas/
    └── events.json      ← Esquemas de eventos

plugins/ocr/            ← Plugins externos (opcional)
├── {engine-name}/
│   ├── engine.json      ← Configuración del engine
│   └── handler.js       ← Handler (solo para locales)
└── ...
```

## Uso

### Via HTTP API

```bash
# Procesar con engine automático
curl -X POST http://localhost:3000/modules/ocr-service/extract \
  -H "Content-Type: application/json" \
  -d '{"input": "base64_encoded_data"}'

# Procesar con engine específico
curl -X POST http://localhost:3000/modules/ocr-service/extract \
  -H "Content-Type: application/json" \
  -d '{"input": "base64_data", "engine": "default"}'

# Listar engines disponibles
curl http://localhost:3000/modules/ocr-service/engines
```

### Via Eventos (MQTT)

```javascript
// Solicitar procesamiento
await eventBus.publish('ocr.extract.request', {
  request_id: 'req-123',
  input: base64Data,
  options: { engine: 'auto' }
});

// Escuchar resultado
await eventBus.subscribe('ocr.extract.completed', (event) => {
  console.log('Resultado:', event.data.text);
});
```

### Via UI Handler (MQTT)

```javascript
// Desde frontend
const result = await mqttRequest('ocr', 'extract', {
  input: base64Data,
  engine: 'auto'
});
```

## Crear un Plugin

### Plugin Local

```
plugins/ocr/mi-engine/
├── engine.json
└── handler.js
```

**engine.json:**
```json
{
  "name": "mi-engine",
  "type": "ocr-engine",
  "version": "1.0.0",
  "local": true,
  "priority": 1,
  "capabilities": ["feature1", "feature2"],
  "config": {}
}
```

**handler.js:**
```javascript
module.exports = {
  capabilities: ['feature1'],

  async extract(input, options) {
    // Procesar input
    return {
      text: 'resultado',
      confidence: 0.95
    };
  },

  async terminate() {
    // Cleanup
  }
};
```

### Plugin Remoto (API)

```
plugins/ocr/external-api/
└── engine.json
```

**engine.json:**
```json
{
  "name": "external-api",
  "type": "ocr-engine",
  "version": "1.0.0",
  "local": false,
  "provider": "PROVIDER_NAME",
  "credentialKey": "PROVIDER_API_KEY",
  "priority": 2,
  "capabilities": ["feature1"],
  "request": {
    "method": "POST",
    "url": "https://api.provider.com/endpoint?key=",
    "headers": {
      "Content-Type": "application/json"
    },
    "body": {
      "data": ""
    }
  },
  "response": {
    "textPath": "result.text",
    "confidencePath": "result.confidence"
  }
}
```

## Eventos

| Evento | Descripción |
|--------|-------------|
| `ocr.extract.request` | Solicitud de procesamiento |
| `ocr.extract.completed` | Procesamiento exitoso |
| `ocr.extract.failed` | Error en procesamiento |
| `ocr.engine.loaded` | Engine cargado |

## Configuración

En `module.json`:

```json
{
  "config": {
    "pluginsPath": "../../plugins/ocr",
    "defaultEngine": "auto",
    "fallbackEnabled": true,
    "timeout": 30000
  }
}
```

## Métricas

- `ocr.extract.total` - Total de extracciones
- `ocr.extract.success` - Extracciones exitosas
- `ocr.extract.error` - Errores
- `ocr.extract.duration` - Tiempo de procesamiento
- `ocr.engines.active` - Engines activos

---

Generado con: `npx plop service-module`
