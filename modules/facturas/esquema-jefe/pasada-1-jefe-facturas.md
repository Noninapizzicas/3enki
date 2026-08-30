# Pasada 1 — prisma de 5 huecos con LENTE JEFE · sujeto: la cara del JEFE de `facturas`

> SUJETO (no el módulo entero): **"la capacidad del módulo facturas de servir las
> DECISIONES de su rol JEFE sobre las FACTURAS ENTRANTES del negocio: qué puede
> declarar, de qué necesita informarse y qué señales sostienen esas decisiones."**
> Alimento verificado: `modules/facturas/module.json` (v3.0.0) + `index.js` (657
> líneas) + `pipeline/invoice-pipeline.js` + `services/providers/local/facturas-db/index.js`
> leídos hoja a hoja. Cero tecnología de sistema ambiente.
> NOTA DE RUTA: facturas vive en la RAÍZ de `modules/` (NO en un vertical) — el
> blueprint objetivo es `modules/facturas/facturas.blueprint.json`.

## El JEFE de este módulo (quién es)

El responsable de las CUENTAS PENDIENTES/PAGADAS del negocio: que cada factura
que entra (telegram, gmail, manual) termine **procesada, correcta y exportada**
a contabilidad/asesoría. No el bot que la manda (fuente externa), ni el pipeline
que la diseca (fábrica IA/OCR — cara del SISTEMA). El jefe entra aquí cuando:
(a) llega una factura nueva y hay que meterla al circuito, (b) la IA extrajo mal
un dato (proveedor, importe, estado) y hay que corregirlo a mano antes de que
toque asesoría, (c) el pipeline falló (OCR que no lee, IA que no estructura) y
hay que relanzar, (d) toca cerrar la semana fiscal y exportar el CSV.

## Hueco 1 · IDENTIDAD — ¿qué DECIDE el jefe aquí?

| # | Decisión | Evidencia de código |
|---|----------|---------------------|
| D1 | METER una factura al circuito: registrar el archivo y que el pipeline lo procese | `handleSubir(data)` → `{ proyecto, archivo:{nombre, contenido(base64)}, source? }` — persiste en `data/projects/<p>/storage/pendientes/` y dispara `_procesarArchivo` |
| D2 | CORREGIR los datos extraídos antes de exportar: proveedor, montos, estado de pago | `handleActualizar(data)` → `{ proyecto, id, datos }` → `local.facturas-db.actualizar { campos: datos }` — UPDATE SQL directo (sin whitelist) |
| D3 | RELANZAR el pipeline cuando falló o el OCR dejó la factura a medias | `handleReprocesar(data)` → `{ proyecto, id }` — lee `path_original` de la DB (404 si no existe en disco) y reprocesa |
| D4 | CERRAR el ciclo fiscal: exportar CSV (contabilidad/asesoría) y marcar facturas exportadas | `handleExportar(data)` → `{ proyecto, semana? }` — genera `facturas_<yyyymmdd>.csv`, marca `estado='exportada'` por ids |

Lo que el jefe NO decide aquí: que la factura LLEGUE (entra sola vía
`factura.entrada` — telegram/comedor/proveedor/gmail; el chat la despacha), ni
el interior del pipeline (Intake→Convert→Prepare→OCR→Structure(IA)→Validate→Store
es fabricación del sistema), ni borrar facturas (no existe delete).

## Hueco 2 · PARA QUÉ — cada decisión con su FIN

| Decisión | Para qué (fin en el negocio) |
|----------|------------------------------|
| D1 subir | que ninguna factura quede fuera del circuito fiscal |
| D2 actualizar | que la asesoría reciba cifras CIERTAS, no las de la IA |
| D3 reprocesar | que un fallo técnico (OCR/IA) no pare el ciclo fiscal |
| D4 exportar | cerrar semana/mes: CSV fiscal → contabilidad, facturas marcadas |

## Hueco 3 · Formas de juicio (¿qué distingue lo CORRECTO?)

- Qué es "procesada y lista para exportar": `estado='procesada'` con datos
  extraídos poblados (`proveedor_nombre`, `total_factura`) y `estado_pago` saneado.
- Qué es una factura rota: `estado='error'` con `ocr_error` / `code+message` en
  el evento — el error se NOMBRA en su fila, no en un modal global.
- Qué es duplicado: el pipeline detecta por `file_hash` → resultado 409 (ALREADY_EXISTS).
- Qué se exporta: solo `estado='procesada'` (la query de exportar las selecciona
  ORDER BY fecha_entrada) — exportar ANTES de corregir → cifra errónea en asesoría.

## Hueco 4 · Repetición (frecuencia de cada hoja)

- Diaria: corregir datos extraídos (D2) — el OCR/IA falla en datos concretos.
- Varias por semana: subir la que llega por un canal manual (D1).
- Bajo volumen: reprocesar (D3) — solo cuando `factura.error` o texto ilegible.
- Ritual semanal: exportar (D4) — cierre con confirmador-nombrado (gruesa).

## Hueco 5 · Huecos del módulo para el UI [ABIERTO]

- Sin filtrado server-side real por proyecto en `listar` (pasa `proyecto` a la
  DB pero la DB indexa por tabla propio-proyecto `ensureSchema(proyecto)`).
- No hay `borrar` ni `retirar` del ciclo — el jefe no puede sacar una mala.
- `procesar` vs `subir`: `procesar` exige `filePath` EN DISCO; `subir` acepta
  `{archivo:{nombre, contenido(base64)}}` y ESTA es la cara de subir del jefe.
- Los errores crudos (`OCR_EMPTY`, `STRUCTURE_...`) llegan con nombre técnico.