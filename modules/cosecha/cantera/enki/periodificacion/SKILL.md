---
name: periodificacion
description: >
  Skill FULL del módulo REFLEJO `periodificacion` de la vertical contabilidad de Enki.
  Imputa cada hecho a su PERIODO con el CRITERIO DECLARADO (devengo vs caja) y CONSERVA
  fecha operación y fecha valor — no elige en silencio (sin criterio → `elegido:false`).
  Úsala para operar, depurar o extender el reflejo, o para entender su contrato de
  eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites imputar un hecho a su periodo (RPC
    periodificacion.imputar.request).
  - Cuando depures por qué no se elige periodo (`elegido:false`, `periodo:null`,
    `abierto:['criterio']`) o por qué falta `project_id`/`hecho` (400 INVALID_INPUT).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    invariantes de la imputación (criterios declarables, conserva ambas fechas, no muta
    el hecho).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo periodificacion.
tags: [enki, modulo, reflejo, contabilidad, periodificacion]
---

# periodificacion — REFLEJO STATELESS del criterio de imputación

## Qué hace el módulo

`periodificacion` es un **REFLEJO STATELESS** (C3, hoja del plan): imputa cada hecho a
su **PERIODO** con el **CRITERIO DECLARADO** (**devengo** vs **caja**). Los criterios son
**PARÁMETROS DECLARABLES**, no constantes cableadas: `DEVENGO → fecha_operacion`,
`CAJA → fecha_valor`; se puede declarar un `campo_fecha` a mano.

**SIN criterio declarado NO se elige** — se devuelve `elegido:false`, `periodo:null` y
`abierto:['criterio']` (**devengo vs caja es una DECISIÓN, no un default silencioso**).

Invariante (C3): **CONSERVA SIEMPRE la fecha de operación y la fecha valor**; **no elige
por su cuenta**. La unidad de cierre (`mes`|`anio`|`dia`) es declarable (defecto `mes`).

Determinista: mismo hecho + mismo criterio → mismo periodo. **No muta el hecho**. Sin
`PosPersistencia` ni `project.activated` (reflejo puro). Proyección `_imputar`. Par de
fallo `periodificacion.imputar.failed`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `periodificacion.imputar.request` | `onImputarRequest` | RPC reflejo (cálculo puro): {project_id, hecho:{fecha_operacion?, fecha_valor?, ...}, criterio?:'DEVENGO'\|'CAJA', campo_fecha?, unidad_cierre?:'mes'\|'anio'\|'dia'} → {project_id, fecha_operacion, fecha_valor, criterio, campo_fecha, unidad_cierre, elegido, fecha_imputada, periodo, abierto, motivo}. ConserVA ambas fechas; sin criterio declarado no elige (`elegido:false`, `abierto:['criterio']`). Responde por periodificacion.imputar.response; fallo (project_id/hecho ausente) → periodificacion.imputar.failed. |
| `contabilidad.asiento_registrado` | `onAsientoRegistrado` | Fire-and-forget (B2 → C3): el diario registró un asiento → se refleja el hecho en el espejo en memoria (idempotente por clave natural/numero), para poder imputarlo por su clave. No muta el libro ni decide. |

### Publishes

| Evento | Descripción |
|---|---|
| `periodificacion.imputar.response` | Respuesta RPC correlada de periodificacion.imputar.request → {request_id, status:200, data:{fecha_operacion, fecha_valor, criterio, elegido, fecha_imputada, periodo, abierto, motivo}}. Emitida por el helper _atender. |
| `periodificacion.imputar.failed` | Par de fallo determinista (C3): project_id ausente o hecho no resoluble (400) → {status, error:{code, message, details?}}. Cierra el círculo de periodificacion.imputar.request. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `periodificacion.imputar.failed` cierra el círculo de
> `periodificacion.imputar.request` cuando `_imputar` devuelve status ≠ 200
> (`project_id` o `hecho` ausente).

> Nota de honestidad (cruce con `index.js`): `onAsientoRegistrado` (fire-and-forget)
> **devuelve `null` siempre** y **no publica ningún evento**: solo refleja la muestra del
> hecho en el espejo (idempotente por `clave_natural`/`numero`) para poder imputarlo
> después por su clave. Si el payload no trae `project_id`/`asiento`/clave, devuelve
> `null` sin tocar el espejo.

> Nota: no figura en `module.json` pero lo implementa `index.js`: `_imputar` acepta el
> alias `input.asiento` como sinónimo de `input.hecho`, y si no llega hecho pero sí
> `input.clave_natural`, lo busca en el espejo por esa clave.

## Reglas de negocio

1. **Fallo determinista de la forma**: `_imputar` toma `input.project_id ||
   this.project_id`; ausente → `400 INVALID_INPUT` (`field:'project_id'`). El hecho se
   toma de `input.hecho || input.asiento`; si no llega y hay `input.clave_natural`, se
   busca en el espejo; si sigue sin haber hecho objeto → `400 INVALID_INPUT`
   (`field:'hecho'`).
2. **Se CONSERVAN las dos fechas (invariante C3)**: `fecha_operacion =
   input.fecha_operacion ?? hecho.fecha_operacion ?? hecho.fecha ?? null`;
   `fecha_valor = input.fecha_valor ?? hecho.fecha_valor ?? hecho.fecha ?? null`. Las dos
   se devuelven **siempre**, aunque se elija una para imputar.
3. **Normalización de fecha**: `_fecha(v)` devuelve `null` si vacío; si `Date.parse(s)`
   es finito, la fecha ISO `YYYY-MM-DD`; si no, devuelve la cadena cruda (`s`). **No se
   estima** una fecha inválida.
4. **El criterio es DECLARABLE, no cableado**: `criterio` se normaliza a MAYÚSCULAS;
   `campo = criterio && CRITERIOS[criterio] ? CRITERIOS[criterio] : (input.campo_fecha ??
   null)`. `CRITERIOS = {DEVENGO:'fecha_operacion', CAJA:'fecha_valor'}`. Se puede
   declarar un `campo_fecha` a mano (punto 5).
5. **Sin criterio no se elige (ni se inventa)**: si `campo` queda `null` (criterio
   ausente/desconocido y sin `campo_fecha`), `elegido:false`, `fecha_imputada:null` y
   `periodo:null`. **Devengo vs caja es una decisión, no un default.**
6. **Selección de la fecha a imputar**: si `campo === 'fecha_operacion'` →
   `fecha_imputada = fecha_operacion`, `elegido = fecha_operacion != null`; si
   `campo === 'fecha_valor'` → `fecha_imputada = fecha_valor`, `elegido = fecha_valor !=
   null`. Si la fecha elegida es `null`, **no** se elige.
7. **Unidad de cierre declarable**: `unidad_cierre = input.unidad_cierre ?? 'mes'`;
   `_periodo(fecha, unidad)` devuelve `YYYY` para `anio`/`ejercicio`, `YYYY-MM-DD` para
   `dia` y `YYYY-MM` para `mes` (defecto).
8. **La salida declara el estado**: `abierto = elegido ? [] : ['criterio']` y
   `motivo = elegido ? 'imputado por <criterio>' : 'sin criterio declarado: no se elige
   (devengo vs caja es una decision, no un default)'`. **Lo no decidido se declara.**
9. **No muta el hecho**: la imputación es una proyección pura; el hecho (y su espejo) no
   se toca.
10. **Determinista**: misma entrada (hecho + criterio + unidad) → mismo `periodo`.
11. **El espejo es idempotente**: la clave es `asiento.clave_natural` o `asiento.numero`;
    la misma clave no se duplica; sin clave no se refleja.
12. **HTTP exacto**: éxito `200` (con `elegido` true o false); `project_id` ausente o
    hecho no resoluble → `400`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `periodificacion.imputar.response`.

### 1. `imputar` por DEVENGO

```json
{
  "project_id": "e57a318a-...",
  "hecho": { "clave_natural": "pizzepos:venta:2026-09-01:0001", "fecha_operacion": "2026-09-01", "fecha_valor": "2026-09-05" },
  "criterio": "DEVENGO",
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "clave_natural": "pizzepos:venta:2026-09-01:0001",
  "fecha_operacion": "2026-09-01",
  "fecha_valor": "2026-09-05",
  "criterio": "DEVENGO",
  "unidad_cierre": "mes",
  "campo_fecha": "fecha_operacion",
  "elegido": true,
  "fecha_imputada": "2026-09-01",
  "periodo": "2026-09",
  "abierto": [],
  "motivo": "imputado por DEVENGO"
}
```

Con `criterio:'CAJA'` se imputa por `fecha_valor` (misma forma, `campo_fecha:
'fecha_valor'`). Las **dos** fechas se conservan en la respuesta.

### 2. `imputar` sin criterio — no se elige

```json
{ "project_id": "e57a318a-...", "hecho": { "fecha_operacion": "2026-09-01", "fecha_valor": "2026-09-05" } }
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "fecha_operacion": "2026-09-01",
  "fecha_valor": "2026-09-05",
  "criterio": null,
  "unidad_cierre": "mes",
  "campo_fecha": null,
  "elegido": false,
  "fecha_imputada": null,
  "periodo": null,
  "abierto": ["criterio"],
  "motivo": "sin criterio declarado: no se elige (devengo vs caja es una decision, no un default)"
}
```

### 3. `imputar` con campo a mano y unidad de cierre

```json
{ "project_id": "e57a318a-...", "hecho": { "fecha_valor": "2026-09-05" }, "campo_fecha": "fecha_valor", "unidad_cierre": "anio" }
```

Respuesta `200` con `elegido:true`, `fecha_imputada:"2026-09-05"`, `periodo:"2026"`.

### 4. Fire-and-forget — reacción a `contabilidad.asiento_registrado`

`onAsientoRegistrado` refleja el hecho en el espejo (idempotente por clave) para poder
imputarlo después por `clave_natural`. **Devuelve `null`** y **no publica** evento.

### 5. Fallo — falta `project_id`

```json
{ "hecho": { "fecha_operacion": "2026-09-01" } }
```

Respuesta `400` + `periodificacion.imputar.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

Sin hecho resoluble → `400 INVALID_INPUT` (`field:'hecho'`).

## Tests

El test unitario de la vertical vive en `tests/unit/periodificacion.test.js`. Cubre:

- `imputar` con `criterio:'DEVENGO'` → `elegido:true`, `campo_fecha:'fecha_operacion'`,
  `periodo:'YYYY-MM'` y conserva ambas fechas.
- `imputar` con `criterio:'CAJA'` → imputa por `fecha_valor`.
- `imputar` sin criterio → `elegido:false`, `periodo:null`, `abierto:['criterio']` (no
  elige en silencio).
- `campo_fecha` declarado a mano → imputa por ese campo.
- `unidad_cierre:'anio'` → `periodo:'YYYY'`; `'dia'` → `YYYY-MM-DD`.
- Hecho tomado del espejo por `clave_natural` cuando no llega en el payload.
- `project_id` ausente o hecho no resoluble → `400 INVALID_INPUT` +
  `periodificacion.imputar.failed`.
- `onAsientoRegistrado` refleja y devuelve `null` sin publicar evento.
- `toolImputar` devuelve la misma proyección que `_imputar`.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `Periodificacion extends ModuloHibridoReflejo`; `name = 'periodificacion'`,
  `version = 'reflejo-0.1.0'`. Espejo en memoria `this._espejo`
  (`Map<project_id, Map<clave, hecho>>`). Sin `PosPersistencia`.
- Constantes: `CRITERIOS = {DEVENGO:'fecha_operacion', CAJA:'fecha_valor'}` y
  `UNIDAD_DEFECTO = 'mes'`.
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-libro/periodificacion/`).
- `onImputarRequest` usa `this._atender(e, 'imputar',
  'periodificacion.imputar.response', async (d) => {...})`; dentro publica
  `periodificacion.imputar.failed` si `status !== 200`. `onAsientoRegistrado` **no** usa
  `_atender` y devuelve `null`.
- Proyección `_imputar(input)` (síncrona: no consulta a nadie); helpers `_periodo`,
  `_fecha`, `_espejoDe`. Tool `toolImputar`.
- `_invalid` / `_errorResponse` vienen de `modulo-hibrido-reflejo`.
- DEP: lo alimenta `contabilidad.asiento_registrado` (B2). Los criterios entran como DATO
  declarable, nunca cableados.
