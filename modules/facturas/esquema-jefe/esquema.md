# ESQUEMA — cara del JEFE del módulo `facturas` (v3.0.0, pipeline v2)

> Árbol maestro consolidado (pasadas 1-2). Alimenta al agente de UI que escribe
> el panel. Ley de agnosticismo: cero tecnología de sistema ambiente. El análisis
> es de la CARA DEL JEFE sobre las FACTURAS ENTRANTES del negocio — la cara
> utilización (la factura que llega SOLA por chat/telegram, `factura.entrada`)
> y la fábrica del pipeline (IA/OCR) quedan fuera del árbol.

## 1. Quién es el jefe y qué decide

Responsable de las cuentas pendientes/pagadas: que cada factura entrante
termine **procesada, correcta y exportada**. Decide:
- **D1** meter una factura al circuito — `subir` (`archivo{nombre, contenido base64}`)
- **D2** corregir datos extraídos (proveedor, montos, estado de pago) — `actualizar {id, datos}`
- **D3** relanzar el pipeline cuando falló — `reprocesar {id}`
- **D4** cerrar el ciclo fiscal: CSV a contabilidad — `exportar {semana?}`

Lo que NO decide: que la factura llegue (entra sola desde chat/telegram/comedor
vía `factura.entrada` — utilización-sistema), ni el interior del pipeline
(Intake→Convert→Prepare→OCR→Structure(IA)→Validate→Store), ni borrar (no existe).

## 2. Invariantes (restricciones honestas)

- INV1 — **subir NO es filePath**: el shape real de `subir` es
  `{proyecto, archivo:{nombre, contenido(base64)}, source?}` (index.js L267).
  `procesar` sí exige `filePath` en disco, pero es la fábrica (utilización-
  sistema cuando lo dispara el pipeline; cara manual = `reprocesar`).
- INV2 — **actualizar es UPDATE SQL libre**: `{proyecto, id, datos}` → `campos`
  directo al SET de la tabla facturas (facturas-db L370). La UI NO inventa
  campos: solo columnas reales del schema (proveedor_*, factura_*, *_imponible,
  tipo_iva, cuota_*, total_factura, estado, estado_pago, notas...).
- INV3 — **reprocesar depende del disco**: 404 si `path_original` ya no existe.
  El error se NOMBRA en su fila.
- INV4 — **exportar selecciona SOLO `estado='procesada'`** y marca exportadas
  (estado='exportada', semana_export). Corregir después de exportar = cifra
  errónea en asesoría → el confirmador lo señala.
- INV5 — **los importes son EUROS float** (columnas REAL: base_imponible,
  total_factura...). La UI edita € → envía € float. Sin céntimos (R6 resuelto:
  no hay conversión; se anota).
- INV6 — **duales estados de circuito**: pendiente → procesando → procesada →
  exportada, o error. El 409 duplicate (ALREADY_EXISTS por file_hash) es
  dictamen legítimo de subir, no un crash.
- INV7 — **id es string UUID** (facturas-db CREATE TABLE: `id TEXT PRIMARY KEY`),
  NO number como en el store viejo del frontend.

## 3. Señales pareadas (verificadas en index.js)

| Declaración | Señal de confirmación | Granularidad |
|---|---|---|
| `subir` | `factura.recibida` (aceptada) → `factura.procesada` (OK, con factura_id+duplicate) o `factura.error {code, message}` | 1-3 eventos en tándem |
| `actualizar` | SIN señal propia: es RPC directo a la DB (`local.facturas-db.actualizar` — index.js L383-401 no publica). El panel refresca por dictamen de la respuesta. | 0 eventos |
| `reprocesar` | `factura.error` / `factura.procesada` (el pipeline interno publica; invoice-pipeline L160/334/808) | 1-2 eventos |
| `exportar` | `factura.exportada {project_id, total, archivo}` (index.js L460) | 1 evento |
| fallos | `factura.error` — el error nombrado EN SU FILA | 1 evento |

DUALIDAD (veredicto del árbitro):
- JEFE (4): `subir` · `actualizar` · `reprocesar` · `exportar`
- NEUTRO (5): `listar` · `obtener` · `estadisticas` · `pipeline-metrics` · `health`(si existiera)
- UTILIZACIÓN (fuera del panel del jefe): `factura.entrada` ES utilización del
  sistema (llega sola desde comedor/proveedor/telegram —gesto del chat, no del
  jefe—). `procesar` es la FÁBRICA: si el pipeline la dispara automáticamente es
  utilización-sistema; su cara manual es `reprocesar` → el panel del jefe NO
  expone `procesar` como gesto (solo hay que dispararlo a mano si ya existe un
  archivo en disco, caso raro; queda anotado en el blueprint como utilidad).

## 4. Composición de la vista del jefe

```
1. INFORMARSE   cinta-estado: n recibidas(pendiente) · n procesadas · n error ·
                n exportadas (estadisticas) + cinta secundaria pipeline v2
2. SELECCIONAR  la pila de facturas (listar) con ESTADO VISIBLE por fila —
                la fila ES el ref para los gestos
3. DECLARAR     subir (editor-bloque) · actualizar (editor-bloque de campos
                extraíbles) · reprocesar (confirmador) · exportar (confirmador)
```

+ principios: frecuencia→jerarquía (corregir es lo diario; exportar es ritual),
la señal manda (nunca recarga; el store re-lee al recibir la señal, con
debounce que absorbe el tándem recibida→procesada), el informe distingue lo
declarado (dictamen de respuesta) de lo derivado por el sistema (cinta).

## 5. Formas UI asignadas

| Hoja | Forma | RPC | Señal |
|---|---|---|---|
| H1 subir factura | editor-bloque (ruta/base64 + origen + nota canal) | `subir {archivo{nombre,contenido}, source}` | factura.recibida → procesada/error |
| H2 corregir datos | editor-bloque (whitelist de columnas reales) | `actualizar {id, datos}` | — (RPC directo; refetch por dictamen) |
| H3 reprocesar | confirmador-nombrado | `reprocesar {id}` | factura.procesada / factura.error |
| H4 exportar | confirmador-nombrado (gruesa) | `exportar {semana?}` | factura.exportada |
| H5 cinta por estados | cinta-estado | `estadisticas` | factura.procesada + error |
| H6 pila de facturas | lista con estado por fila | `listar {estado?, limit}` | (misma señal que cinta) |
| H7 salud del pipeline | cinta secundaria | `pipeline-metrics` | — |

## 6. Huecos [ABIERTO] (decisiones del dueño — nombrados, no suplidos)

- [ABIERTO] política de subida desde el panel: ¿pegar ruta del disco del server,
  o file-picker que lea el archivo y lo mande base64? (el shape soporta ambos;
  el chat/telegram ya cubre el canal natural).
- [ABIERTO] qué campos corrige el jefe vs qué corrige la asesoría (estado_pago /
  categoria / notas hoy son libres).
- [ABIERTO] cadencia del export: ¿semanal fija (semana ISO) o on-demand?
- [ABIERTO] qué estados intermedios se consideran "parados" y merecen reproceso
  automático (hoy el panel solo nombra el error en su fila).

## 7. Fuera del árbol del jefe

- RECEPCIÓN (utilización-sistema): `factura.entrada` desde telegram/gmail/comedor —
  the pipeline la acoge y publica `factura.recibida` sin gesto humano.
- FÁBRICA: `procesar {filePath}` — el motor de IA/OCR; el pipeline es su
  despertador automático. Cara manual equivalente = `reprocesar`.
- NOTIFICACIÓN: `telegram.send_message.request` — canal de salida al chat que la
  mandó, no es un gesto del jefe.

## 8. Nota para el panel (dictámenes en pantalla)

La respuesta de `subir` ya trae el dictamen del pipeline (estructura extraída,
duplicate flag, métricas de duración) — la cinta NO los recalcula: los muestra
como confirmation en el toast/fila. El 404 "no configurado" de lecturas antes
de la primera factura es estado legítimo (cinta en ceros). `estadisticas`
devuelve 0s limpios sin Initialized schema — la cinta arranca en cero, no vacía.