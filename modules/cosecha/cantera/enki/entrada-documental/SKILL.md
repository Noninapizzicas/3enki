---
name: entrada-documental
description: >-
  Skill de PROCESO de la entrada documental de Enki (vertical contabilidad): cómo entra un ticket,
  albarán o factura desde el mundo real (carpeta, Telegram, Gmail) hasta el asiento, qué módulo hace
  cada cosa y las trampas que SOLO se ven en producción (orden de línea del OCR, doble camino del
  hecho, rol del escritor en la cola). Úsala para operar, depurar o ampliar la cadena.
when-to-use: >-
  - Cuando un documento no entra, se queda a medias o genera excepciones raras.
  - Cuando hay que probar la cadena en vivo (core real) sin ensuciar el libro.
  - Cuando se añade un canal nuevo o se toca cualquier módulo de la entrada.
tags: [enki, proceso, contabilidad, entrada, documentos, ocr, asiento, produccion]
---

# Entrada documental — de un papel a un asiento

## La cadena (todo por EVENTO)

```
canal (carpeta inbox/ · Telegram · Gmail)
  → puerto-documento-digital.recibir          [A5]
      · hecho contabilidad.documento_recibido
      · fisico → lector-documento            [NUEVO]
  → lector-documento (pdftotext | tesseract | ocr4rs)   → texto + evidencia sha256
  → clasificador-documento (factura|albaran|ticket|otro + esquema regex)
  → extraccion-dato (aplica el esquema; propone, no asienta)
  → control-cuadre-documento (base+cuota==total; si no, a la cola)
  → hecho-compra (partida doble: gasto DEBE · 472 DEBE · 400 HABER)
  → contabilidad.hecho_recibido → escritor-diario (ÚNICO que escribe el libro)
```

Albarán: NO asienta (no devenga gasto) → `cruce-factura-recepcion` espera la factura.
Sin cuenta de gasto declarada se usa la política del vertical (`629`); nunca se inventa una.

## Resolución del proyecto (no se monta por proyecto)

`invocación (panel)` → `telegram.bridge.listar` (botName→project_id) → `vinculos_email`
→ único proyecto activo. Varios activos + sin vínculo → `400 PROYECTO_NO_RESUELTO`.

## Trampas medidas en producción (las tres duelen)

1. **Orden de línea del OCR.** `tesseract --psm 4` conserva `TOTAL 69,96` junto a su etiqueta;
   OCR4RS agrupa por bloques y deja los importes al final → un patrón `TOTAL <importe>` captura
   la cifra de una línea de detalle y el documento acaba en la cola por descuadre falso. Por eso
   el lector prueba tesseract primero y OCR4RS queda de respaldo.
2. **Doble camino del hecho.** `captura-documento` escuchaba `contabilidad.documento_recibido` y
   volvía a encadenar, aunque el puerto ya lo había hecho. Resultado: una excepción espuria
   (`documento incompleto/ambiguo`, payload `{}`) por CADA documento que entraba bien. Ley: el
   handler de un HECHO no re-encadena; admite y se para. Y el camino se elige por FORMA
   (formato → puerto · físico → lector · texto → extracción).
3. **El `rol` de la cola es del ESCRITOR, no del emisor.** `encolado-excepcion` exige
   `rol:'ENCOLADO_EXCEPCION'` (single-writer) y responde **403** a cualquier otro. Cinco módulos
   mandaban su propio rol → la excepción se perdía en silencio y un documento descuadrado
   desaparecía del radar. El emisor va en `origen`. Hay test de contrato:
   `tests/unit/entrada__cola-excepciones-rol.test.js`.

## Probar en vivo SIN ensuciar el libro

Un documento que **cuadra** asienta de verdad. Para probar la cadena sin escribir:

1. Sube un documento DESCUADRADO al buzón (`fs.write` base64) — no asienta, va a la cola.
2. Dispara `ingesta-documental.barrer.request {project_id, carpeta:'inbox/'}`.
3. Comprueba la respuesta de `extraccion-dato.juzgar.response` y `control-cuadre-documento.cuadra.response`
   con un sniffer MQTT (`subscribe('#')`, filtrar por nombre de evento): el log de actividad NO
   guarda payloads.
4. Revisa `storage/contabilidad/encolado-excepcion/encolado-excepcion.json` y **borra el fichero**
   de prueba con `fs.delete`.

Prueba completa de la cadena (con asiento real) en local:
`node tests/integration/entrada-documental-cadena.test.js`.

## Verificación

```
node tests/unit/entrada__{captura,lector,clasificador,ingesta,hecho-compra,cuadre}-*.test.js
node tests/unit/entrada__ingesta-email.test.js
node tests/unit/entrada__cola-excepciones-rol.test.js
node tests/integration/entrada-documental-cadena.test.js
```
