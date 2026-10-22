---
name: lector-documento
description: >-
  Skill FULL del módulo REFLEJO STATELESS `lector-documento` de la vertical contabilidad (Enki).
  Convierte BYTES en TEXTO: un PDF con capa de texto se lee con `pdftotext`; una imagen o un PDF
  escaneado, con tesseract local (`--psm 4`, conserva el orden de línea) y OCR4RS como respaldo.
  Declara SIEMPRE con qué motor leyó y la evidencia (sha256+bytes). No clasifica, no extrae, no
  asienta. Encadena por evento a `clasificador-documento`.
when-to-use: >-
  - Cuando un documento físico (foto de ticket, PDF del proveedor) entra al sistema y hay que leerlo.
  - Cuando `TEXTO_VACIO` o `MOTOR_OCR_NO_DISPONIBLE` aparecen y hay que saber qué motor falló.
  - Cuando se depura por qué el importe de un ticket sale mal (orden de línea del OCR).
tags: [enki, modulo, reflejo, stateless, contabilidad, entrada, ocr, lectura, documentos]
---

# lector-documento — bytes → TEXTO

## Qué hace

Es el primer salto de la cadena documental: bytes opacos → texto legible. **Solo eso.**
No decide qué documento es (eso es `clasificador-documento`), no extrae campos
(`extraccion-dato`), no asienta (`escritor-diario`).

## Estrategia (del más barato al más caro)

1. **PDF con capa de texto** → `pdftotext -layout -enc UTF-8`. Si el texto llega a
   `min_chars_digital` (40 por defecto) → `source_kind:'digital'`, `motor:'pdftotext'`.
   El OCR **no se despierta**.
2. **Imagen o PDF escaneado** →
   a) **tesseract local**: `tesseract <img> - --psm 4 -l spa+eng`; un PDF escaneado se rasteriza
      antes con `pdftoppm -r 300 -png` (máx. 8 páginas). `--psm 4` **conserva el orden de línea**.
   b) Si no saca texto → `POST {base_url}/ocr` (OCR4RS, :8090), que devuelve páginas y es mejor
      con documentos grandes, pero **agrupa por bloques** y descoloca los importes.

> **Por qué tesseract primero (medido):** con un ticket real, OCR4RS devuelve
> `… TOTAL … GRACIAS POR SU COMPRA … 42,00 18.40 3,20 63.60 6.36 69.96`; un patrón
> `TOTAL <importe>` captura `42,00` (la primera cifra del bloque) y el documento acaba en la cola
> por descuadre falso. tesseract devuelve `TOTAL: 69,96` junto a su etiqueta y cuadra a la primera.

## Contrato (RPC `leer`, PREGUNTA → sin ui_handler)

Entrada: `{project_id, documento:{path|file_path, mime?, nombre?}, path?, ruta_absoluta?}`.
`ruta_absoluta` es **solo para pruebas locales**; en producción los bytes se leen del storage del
proyecto con `fs.read.request {project_id, path, encoding:'base64'}`.

Salida 200: `{project_id, tipo, documento, texto, paginas[], source_kind:'digital'|'ocr',
motor:'pdftotext'|'tesseract'|'ocr4rs', evidencia:{sha256,bytes}, ms, abierto:{texto:null}}`.

Publica:
- HECHO `contabilidad.documento_leido` (si hay texto).
- Encadena `clasificador-documento.clasificar.request` con `{project_id, documento, texto, source_kind, evidencia}`.

## Errores

| Código | HTTP | Causa |
|---|---|---|
| `INVALID_INPUT` | 400 | falta `project_id` o la ruta del documento |
| `FORMATO_NO_SOPORTADO` | 415 | extensión fuera de pdf/jpg/jpeg/png/webp/tif/tiff (se comprueba ANTES de leer bytes) |
| `RESOURCE_NOT_FOUND` | 404 | el fichero no está en el storage del proyecto |
| `MOTOR_OCR_NO_DISPONIBLE` | 502 | OCR4RS caído/timeout **y** tesseract sin texto |
| `TEXTO_VACIO` | 422 | menos de 8 caracteres legibles (imagen en blanco, PDF vacío, 4xx del motor) |

Ninguno devuelve texto inventado: el hueco se declara en `abierto.texto`.

## Verificación

```bash
node --check modules/contabilidad-entrada/lector-documento/index.js
node tests/unit/entrada__lector-documento.test.js          # 5/5
node tests/integration/entrada-documental-cadena.test.js   # cadena completa con OCR real
```
