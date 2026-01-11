# Factura Processor Module

Procesa facturas recibidas via Telegram con OCR (Tesseract).

## Flujo de Eventos

```
Telegram (imagen factura)
    |
    v
telegram-service -> telegram.photo.received
    |
    v
bot-manager -> descarga -> bot.file.stored
    |
    v
factura-processor (filtra botName="facturas-asesoria")
    |
    v
Lee archivo -> base64 -> ocr.extract.request
    |
    v
ocr-service (Tesseract) -> ocr.extract.completed
    |
    v
factura-processor -> guarda texto en /data/facturas-procesadas/
    |
    v
Actualiza archivo original con estado "P" (Procesado)
    |
    v
Publica factura.processed
```

## Configuracion

En `module.json`:

```json
{
  "config": {
    "botName": "facturas-asesoria",
    "outputPath": "./data/facturas-procesadas",
    "language": "spa",
    "processOnStartup": true,
    "supportedMimeTypes": [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf"
    ]
  }
}
```

## Eventos

### Suscribe
- `bot.file.stored` - Archivos guardados por bot-manager
- `ocr.extract.completed` - Resultado exitoso de OCR
- `ocr.extract.failed` - Error de OCR

### Publica
- `factura.queued` - Factura encolada
- `factura.processing` - Factura siendo procesada
- `factura.processed` - Factura procesada exitosamente
- `factura.failed` - Error procesando factura

## APIs HTTP

| Metodo | Path | Descripcion |
|--------|------|-------------|
| GET | /health | Estado del modulo |
| GET | /pending | Lista facturas pendientes |
| GET | /processed | Lista facturas procesadas |
| POST | /process/:filename | Procesa archivo especifico |
| POST | /reprocess | Reprocesa todas las pendientes |

## Estructura de Salida

Por cada factura procesada se generan dos archivos:

### {timestamp}_{nombre}.txt
```
============================================================
FACTURA PROCESADA
============================================================

Archivo Original: factura.jpg
Ruta Original: ./data/bots/facturas-asesoria/received/...
Fecha Recepcion: 2026-01-11T10:30:00.000Z
Fecha Procesamiento: 2026-01-11T10:30:05.000Z
Caption: (sin caption)

--- OCR Info ---
Engine: tesseract
Confianza: 87.5%
Palabras: 150
Duracion: 2500ms

============================================================
TEXTO EXTRAIDO
============================================================

[Texto de la factura...]

============================================================
```

### {timestamp}_{nombre}.json
```json
{
  "source": {
    "filePath": "./data/bots/facturas-asesoria/received/...",
    "originalName": "factura.jpg",
    "receivedAt": "2026-01-11T10:30:00.000Z",
    "caption": null,
    "chatId": 123456,
    "userId": 789,
    "userName": "usuario"
  },
  "ocr": {
    "text": "Texto extraido...",
    "confidence": 0.875,
    "words": 150,
    "engine": "tesseract",
    "duration": 2500
  },
  "processedAt": "2026-01-11T10:30:05.000Z"
}
```

## Estados de Archivo

El sistema de estados sigue la convencion de `download-manager`:

- `R` - Received (recibido)
- `P` - Processed (procesado por OCR)
- `V` - Validated (validado)
- `A` - Archived (archivado)
- `E` - Error

Ejemplo de evolucion:
```
factura.jpg (original en Telegram)
  -> 20260111_103000_factura_R.jpg (recibido)
  -> 20260111_103000_factura_RP.jpg (procesado)
```
