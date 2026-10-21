---
name: puerto-evento-vertical
description: >-
  Skill FULL del módulo PUENTE STATELESS `puerto-evento-vertical` de la vertical contabilidad
  (Enki). LA PUERTA de entrada del dominio: la vertical MANDA y contabilidad se ADAPTA. `abrir`
  (ORDEN) declara el canal por el que una vertical mandará hechos (y su contrato de hecho mínimo,
  si lo trae); `recibir` (ORDEN) admite UN hecho crudo ya emitido y ANUNCIA el hecho de dominio
  `contabilidad.hecho_recibido` para arrancar la cadena de entrada. El hecho entra CRUDO: la
  puerta admite, NO normaliza (eso es A2). Dato ausente = desconocido. STATELESS.
when-to-use: >-
  - Cuando necesites abrir el canal de una vertical o recibir un hecho crudo ya emitido
    (RPC puerto-evento-vertical.abrir.request / .recibir.request).
  - Cuando depures por qué no arranca la cadena de entrada (no se emitió
    contabilidad.hecho_recibido), o por qué se rechaza (400 INVALID_INPUT por falta de hecho/vertical).
  - Cuando quieras entender su contrato de eventos (subscribes/publishes) y el hecho
    contabilidad.hecho_recibido que emite.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, puente, stateless, contabilidad, entrada, puerta, hecho, vertical]
---

# puerto-evento-vertical — PUENTE de la puerta de entrada

## Qué hace el módulo

`puerto-evento-vertical` es un **PUENTE** (A1, hoja del plan), stateless. **LA PUERTA**: la
vertical **MANDA** y contabilidad se **ADAPTA**. Por aquí entra el **HECHO CRUDO** ya emitido
por una vertical de operación (una venta, una entrega, un cobro real…). Contabilidad NO produce
esos hechos: los **RECIBE**. Es la cara de entrada del dominio, el punto donde la operación
observada se convierte en materia prima del libro.

- **`abrir`** — la vertical DECLARA el canal por el que mandará hechos (y, si lo trae, su
  `contrato` de hecho mínimo). Abre la puerta; **no inventa** contrato.
- **`recibir`** — llega UN hecho crudo ya emitido. Se admite **TAL CUAL** (lo adapta el
  normalizador A2, no esta puerta) y se **ANUNCIA** el hecho de dominio
  `contabilidad.hecho_recibido` para que la cadena de entrada arranque.

**Invariante**: dato ausente = desconocido. Sin hecho no hay nada que recibir (no se fabrica);
el contrato que no venga queda declarado en `abierto`, nunca estimado. **STATELESS**: sin
PosPersistencia (no guarda estado; el hecho de dominio y su anotación los hacen otros).

Ambas RPC son **CLASE ORDEN** → llevan `ui_handlers` (`workspace_module`, `barra_modulos`).

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `puerto-evento-vertical.abrir.request` | `onAbrirRequest` | RPC puente (**ORDEN**, panel): `{project_id, vertical, contrato?}` → `{project_id, vertical, gate_abierta, contrato, contrato_declarado, abierto}`. Declara el canal de entrada de una vertical; no inventa el contrato. Responde por `.abrir.response`. |
| `puerto-evento-vertical.recibir.request` | `onRecibirRequest` | RPC puente (**ORDEN**, panel): `{project_id, hecho, vertical?, tipo?, recibido_en?}` → `{project_id, hecho, vertical, tipo_hecho, recibido, adaptado:false, abierto}`. Admite el hecho crudo y publica `contabilidad.hecho_recibido`. El hecho entra sin normalizar. Responde por `.recibir.response`. |

### Publishes

| Evento | Cuándo |
|---|---|
| `contabilidad.hecho_recibido` | Fire-and-forget (A1): la puerta admitió un hecho crudo de una vertical → `{project_id, hecho, origen, vertical, recibido_en}`. **Arranca la cadena de entrada.** Lo consumen normalizador-hecho (A2), deduplicacion-hecho (A6), completitud-cobertura (A12), contrapartida-asistida (A5), hecho-rectificativo (A13), declaracion-fuente-faltante (A16), escritor-diario (B2), ajuste-inventario, variacion-stock-valorada, cruce-factura-recepcion, etiquetado-analitico, motor-avisos, panel-proceso-contable, historial-proceso-contable, tasa-cobertura-entrada, sello-cobertura. |
| `puerto-evento-vertical.abrir.response` | Respuesta RPC correlada de la op `abrir`. |
| `puerto-evento-vertical.abrir.failed` | Fallo determinista: falta `project_id` o `vertical`. |
| `puerto-evento-vertical.recibir.response` | Respuesta RPC correlada de la op `recibir`. |
| `puerto-evento-vertical.recibir.failed` | Fallo determinista: falta `project_id` o `hecho`. |

> En `onRecibirRequest` se publica `contabilidad.hecho_recibido` si status 200; si no,
> `.recibir.failed`. En `onAbrirRequest` solo `.abrir.failed` si status ≠ 200.
> **Frontera:** la escucha de `contabilidad.hecho_recibido` NO se declara aquí — esta puerta la
> EMITE (la consumen los demás).

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `abrir` | **ORDEN** (panel) | `{project_id, vertical\|origen, contrato?}` | `{project_id, tipo, vertical, gate_abierta:true, contrato, contrato_declarado, abierto}` | 400 `INVALID_INPUT` (`project_id`/`vertical`) |
| `recibir` | **ORDEN** (panel) | `{project_id, hecho\|evento, vertical?, tipo?, recibido_en?}` | `{project_id, tipo_puerto, hecho, vertical, tipo_hecho, origen, recibido_en, recibido:true, adaptado:false, abierto}` | 400 `INVALID_INPUT` (`project_id`/`hecho`) |

## Reglas de negocio (lo que el código IMPONE)

1. **`abrir`**: sin `project_id` → `_invalid('project_id')`; sin `vertical` (ni `origen`) →
   `_invalid('vertical')`. Devuelve `gate_abierta:true`.
2. **`abrir` no inventa contrato**: `contrato` solo si viene objeto; `contrato_declarado =
   Boolean(contrato)`. Si falta → `abierto.contrato` declarado (lo fija `contrato-hecho-minimo`
   A15, no esta puerta).
3. **`recibir`**: sin `project_id` → `_invalid('project_id')`; `hecho` es obligatorio (acepta
   también `input.evento`) → si es `undefined/null` → `_invalid('hecho')`.
4. **El hecho entra CRUDO**: se devuelve `hecho` tal cual llega; `adaptado:false`. **NO** se
   normaliza (eso es A2). La vertical manda y contabilidad se adapta: la puerta no reescribe.
5. **`vertical`/`origen` y `tipo_hecho`**: declarados. `vertical` de `input.vertical` o
   `input.origen`; `tipo` de `input.tipo` o `hecho.tipo`. Ausentes → `null` (no se adivinan).
6. **`abierto.vertical`** declarado si el hecho no declara su vertical (se recibe igual; la
   puerta no inventa el emisor).
7. **`recibido_en`**: `input.recibido_en` o `new Date().toISOString()`.

## Cómo se usa (RPCs)

### 1. Abrir el canal de una vertical

```json
{ "project_id": "e57a318a-...", "vertical": "pizzepos", "contrato": { "campos_minimos": ["tipo","importe","fecha"] } }
```
Respuesta `200`: `{vertical:'pizzepos', gate_abierta:true, contrato:{...}, contrato_declarado:true, abierto:{contrato:null}}`.

### 2. Recibir un hecho crudo → arranca la cadena

```json
{ "project_id": "e57a318a-...", "vertical": "pizzepos", "tipo": "venta", "hecho": { "tipo": "venta", "total": 42.5, "fecha": "2026-10-01" }, "correlation_id": "abc-5" }
```
Respuesta `200` + `contabilidad.hecho_recibido`:
```json
{ "project_id": "e57a318a-...", "tipo_puerto": "puerto-evento-vertical", "hecho": { "tipo": "venta", "total": 42.5, "fecha": "2026-10-01" }, "vertical": "pizzepos", "tipo_hecho": "venta", "origen": "pizzepos", "recibido_en": "2026-10-01T...", "recibido": true, "adaptado": false, "abierto": { "vertical": null } }
```

### Fallo — sin hecho

```json
{ "project_id": "e57a318a-...", "vertical": "pizzepos" }
```
Respuesta `400` + `puerto-evento-vertical.recibir.failed` (`INVALID_INPUT`, field `hecho`).

## Errores y qué significan

| Código | Cuándo |
|---|---|
| `400 INVALID_INPUT` (`project_id`) | falta `project_id`. |
| `400 INVALID_INPUT` (`vertical`) | en `abrir`, sin vertical/origen. |
| `400 INVALID_INPUT` (`hecho`) | en `recibir`, sin hecho/evento. |
| `500 UNKNOWN_ERROR` | excepción dentro de `_atender`. |

## Relación con otras piezas

- **Depende de:** — (raíz; nadie). Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` +
  `project-manager`.
- **De quién depende por evento:** ninguno. Los hechos vienen de FUERA del repo (otra vertical).
- **Quién la consume por evento:** toda la cadena de entrada — normalizador-hecho (A2),
  deduplicacion-hecho (A6), completitud-cobertura (A12), contrapartida-asistida (A5),
  hecho-rectificativo (A13), declaracion-fuente-faltante (A16), escritor-diario (B2),
  ajuste-inventario, variacion-stock-valorada, cruce-factura-recepcion, etiquetado-analitico,
  motor-avisos, panel-proceso-contable, historial-proceso-contable, tasa-cobertura-entrada,
  sello-cobertura.
- **Deps por EVENTO, nunca import.**

## Verificación

1. Ficheros en disco: `modules/contabilidad-entrada/puerto-evento-vertical/module.json` + `index.js`.
2. Smoke: `recibir` con hecho → 200 + `contabilidad.hecho_recibido`.
3. Sin `hecho` → 400 + `.recibir.failed`; sin `vertical` en `abrir` → 400 + `.abrir.failed`.
4. `abrir` sin contrato → `contrato_declarado:false`, `abierto.contrato` declarado.
5. `grep -E '"event"' module.json`.

## Notas de implementación

- Clase `PuertoEventoVertical extends ModuloHibridoReflejo`; `name = 'puerto-evento-vertical'`,
  `version = 'reflejo-0.1.0'`. **Sin store propio** (stateless).
- Handlers `onAbrirRequest`/`onRecibirRequest` delegan en `_atender`; solo `recibir` publica el
  hecho de dominio.
- Proyecciones `_abrir`/`_recibir`; tools `toolAbrir`/`toolRecibir`.
  `_invalid`/`_errorResponse` de `modulo-hibrido-reflejo`.
