---
name: facturas
description: >-
  Procesamiento comercial de facturas: pipeline step-based con agentes IA,
  OCR y validación. Pipeline v2: Intake → Convert → Prepare → OCR → Structure
  (IA) → Validate → Store. Soporta PDF, imágenes (JPG, PNG, WebP, TIFF).
  Notificación a Telegram. Exportación a CSV fiscal.
fuente: enki
dominio: negocio
tags: [facturas, pipeline, ocr, ia, csv, pdf, procesamiento]
---

# Facturas

> **Qué es.** Pipeline de procesamiento de facturas. Recibe un PDF o imagen,
> lo convierte, aplica OCR, extrae datos estructurados vía IA, valida, y
> persiste. Notifica al usuario por Telegram el resultado. Exporta a CSV
> fiscal.
>
> Código: `modules/facturas/index.js` · v`3.0.0`

---

## 1 · LÓGICA

### Pipeline v2 (7 pasos)

```
1. INTAKE     → Recibe archivo (PDF/imagen) desde cualquier fuente
2. CONVERT    → PDF → imágenes (sharp: 300dpi, grayscale, normalize, sharpen)
3. PREPARE    → Preprocesa para OCR
4. OCR        → Extrae texto (provider: local.google-vision, es/en)
5. STRUCTURE  → IA estructura los campos fiscales (deepseek/anthropic/openai/gemini)
6. VALIDATE   → Validación de campos contra reglas
7. STORE      → Persiste + notifica Telegram
```

### Fuentes de entrada

| Fuente | Cómo llega |
|--------|------------|
| `telegram` | Usuario envía PDF/imagen al bot |
| `gmail` | Adjunto de email (Gmail API) |
| `manual` | Subida directa desde UI o tool LLM |

### Estados de una factura

```
pendiente → procesando → procesada → exportada
                  ↘ error
```

---

## 2 · TOOLS (invocables por LLM)

### `facturas.procesar`

```jsonc
{
  "projectId": "uuid",
  "filePath": "/data/projects/uuid/storage/pendientes/factura_001.pdf",
  "source": "manual"        // telegram | gmail | manual
}
// → 200 { "id": "fac_001", "estado": "procesando" }
// → 200 { "id": "fac_001", "estado": "procesada", "factura": { /* campos fiscales */ } }
```

Process es síncrono si es rápido; si el OCR tarda, devuelve `procesando`
y el usuario puede consultar con `facturas.listar`.

### `facturas.listar`

```jsonc
{ "projectId": "uuid", "estado": "procesada", "limit": 50 }
// → 200 { "facturas": [/*...*/], "total": 12 }
```

### `facturas.estadisticas`

```jsonc
{ "projectId": "uuid" }
// → 200 { "total": 50, "pendientes": 3, "procesadas": 40, "errores": 5, "exportadas": 2, "por_origen": { "telegram": 30, "manual": 20 } }
```

---

## 3 · EVENTOS

### Publica

| Evento | Cuándo |
|--------|--------|
| `factura.recibida` | Factura aceptada como entrada del pipeline |
| `factura.procesada` | Pipeline completo OK (lleva factura_id + duplicate flag) |
| `factura.error` | Pipeline fallido o archivo inválido (código canónico + mensaje) |
| `factura.exportada` | CSV fiscal generado (project_id + total + ruta) |
| `telegram.send_message.request` | Notificación fire-and-forget al chat que envió la factura |

### Escucha

| Evento | Handler | Descripción |
|--------|---------|-------------|
| `factura.entrada` | `onFacturaEntrada` | Entrada al pipeline desde fuentes externas (telegram, gmail, manual) |

---

## 4 · FLUJO TÍPICO

### Procesar factura desde el chat

```
1. USUARIO envía PDF        → "procesa esta factura"
2. LLM invoca               → facturas.procesar { filePath, source: "manual" }
3. PIPELINE arranca          → Intake → Convert → Prepare → OCR → Structure → Validate → Store
4. OCR extrae texto          → google-vision (DOCUMENT_TEXT_DETECTION)
5. IA estructura campos      → { emisor, cif, fecha, importe, iva, total, ... }
6. Persiste + notifica       → factura.procesada + Telegram
7. RESPUESTA                 → { estado: "procesada", factura: { ... } }
```

### Exportar CSV fiscal

```
1. USUARIO pide              → "exporta las facturas de julio"
2. LLM invoca               → facturas.exportar (UI handler)
3. MÓDULO genera             → CSV con todas las procesadas del período
4. RESPUESTA                 → factura.exportada { ruta, total }
```

---

## 5 · INTEGRACIÓN

> **Tool principal:** `facturas.procesar` (procesa PDF/imagen → campos fiscales).
> `facturas.listar` para consultar históricos.

> **OCR:** `provider: local.google-vision` con hint DOCUMENT_TEXT_DETECTION.
> Idiomas: es, en. Preprocesado: 300dpi, grayscale, normalize, sharpen.

> **IA:** providers disponibles: deepseek, anthropic, openai, gemini.
> Temperature 0.1 (baja, queremos extracción precisa, no creatividad).

> **Persistencia:** DB de facturas vía ServiceExecutor + archivos en
> `data/projects/<id>/storage/`. CSV export en `.../export/facturas_<fecha>.csv`.

> **Notificación:** Telegram al chat que envió la factura.
