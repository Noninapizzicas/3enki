---
name: clave-natural
description: >
  Skill FULL del módulo REFLEJO `clave-natural` de la vertical contabilidad de Enki.
  El CERROJO ANTI-BUCLE: da la clave natural de un hecho o de un cierre de forma
  DETERMINISTA para que reprocesar NO duplique ('un cierre = un asiento'); la
  composición es declarable y los campos declarados que no llegan se listan en
  `abierto` (nada se estima). Úsala para operar, depurar o extender el reflejo, o para
  entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites calcular la clave natural de un hecho/cierre (RPC
    clave-natural.calcular.request) o comparar dos sujetos por su clave (RPC
    clave-natural.coincide.request).
  - Cuando depures por qué no hay clave (400 INVALID_INPUT si el hecho/cierre falta o
    es inválido, o `completa:false` con `abierto` no vacío).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    invariantes de pureza (misma entrada → misma clave, cero reloj, cero estado).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo clave-natural.
tags: [enki, modulo, reflejo, contabilidad, clave-natural]
---

# clave-natural — REFLEJO STATELESS del cerrojo anti-bucle

## Qué hace el módulo

`clave-natural` es un **REFLEJO STATELESS** (M3, hoja del plan): el **CERROJO
ANTI-BUCLE** de la contabilidad. Da la **clave natural** de un hecho o de un cierre de
forma **DETERMINISTA** para que reprocesar **NO duplique** («un cierre = un asiento»).

Es la base de la idempotencia de todo el libro: `deduplicacion-hecho` (A7) la aplica y
el escritor del diario (B2) la usa como llave del asiento.

La composición de la clave es **DECLARABLE** (`composicion`: `campos` + `normalizacion`
+ `separador` + `prefijo`). Sin declararla se usa una composición por defecto sobre los
campos presentes (`vertical, tipo, tercero, fecha, importe, referencia`) y se declara
`composicion_declarada:false` — **nunca se cablea una forma legal**.

Invariantes:
- **Misma entrada → misma clave. SIEMPRE.** Cero azar, cero estado, cero reloj.
- **`calcular` es PURO**: calcular dos veces el mismo hecho da la misma clave.
- **`coincide` es simétrica y determinista**: a y b con la misma clave natural **SON**
  el mismo hecho (`es_mismo_hecho:true`).
- Los campos declarados que **NO** llegan no desaparecen en silencio: se listan en
  `abierto` y la clave se marca `completa:false` (**nada se estima**).
- **No escribe ni recuerda**: quien recuerda es `deduplicacion-hecho` (A7). Sin
  `PosPersistencia` y sin `project.activated`: no es custodio.
- **Sin evento de dominio**: su valor **ES** la respuesta.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `clave-natural.calcular.request` | `onCalcularRequest` | RPC reflejo (puro): {project_id, hecho\|cierre, composicion?:{campos, normalizacion, separador, prefijo}} → {clave, sello, composicion, composicion_declarada, completa, abierto}. Calcula la clave natural de forma determinista (misma entrada → misma clave); los campos declarados que no llegan se listan en `abierto` y completa queda false. Responde por clave-natural.calcular.response; sujeto ausente → clave-natural.calcular.failed. |
| `clave-natural.coincide.request` | `onCoincideRequest` | RPC reflejo (puro): {project_id, a, b, composicion?} → {coinciden, es_mismo_hecho, clave_a, clave_b, sello_a, sello_b, completa, abierto}. Compara dos sujetos por su clave natural: misma clave → ES el mismo hecho (idempotencia por clave natural). Responde por clave-natural.coincide.response; a o b ausente → clave-natural.coincide.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `clave-natural.calcular.response` | Respuesta RPC correlada de clave-natural.calcular.request → {request_id, status:200, data:{clave, sello, composicion, composicion_declarada, completa, abierto}}. Emitida por el helper _atender. |
| `clave-natural.calcular.failed` | Par de fallo determinista (M3): hecho/cierre ausente o invalido → {status, error:{code, message, details?}}. Cierra el circulo de clave-natural.calcular.request. |
| `clave-natural.coincide.response` | Respuesta RPC correlada de clave-natural.coincide.request → {request_id, status:200, data:{coinciden, es_mismo_hecho, clave_a, clave_b, sello_a, sello_b, completa, abierto}}. Emitida por el helper _atender. |
| `clave-natural.coincide.failed` | Par de fallo determinista (M3): a o b ausente/invalido → {status, error:{code, message, details?}}. Cierra el circulo de clave-natural.coincide.request. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `clave-natural.calcular.failed` cierra `clave-natural.calcular.request` (lo
> publica `onCalcularRequest` cuando `_calcular` devuelve status ≠ 200) y
> `clave-natural.coincide.failed` cierra `clave-natural.coincide.request`.

## Reglas de negocio

1. **Composición DECLARABLE**: `composicion = {campos:[...], normalizacion, separador,
   prefijo}`. Campos declarados se normalizan a lista no vacía; sin declarar (o lista
   vacía) → `CAMPOS_DEFECTO = ['vertical','tipo','tercero','fecha','importe',
   'referencia']`. `composicion_declarada` refleja si vino un objeto `composicion`.
2. **El orden ES la identidad**: cambiar el orden de `campos` cambia la clave.
3. **Sujeto polimórfico**: `_calcular` acepta `input.hecho || input.cierre ||
   input.sujeto || input.h`. Ausente/no objeto → `400 INVALID_INPUT`
   (`field:'hecho'`).
4. **Normalización MECÁNICA (declarable)**: `normalizacion` ∈
   `{defecto, crudo, minusculas, mayusculas}`. Con `'defecto'`: campos de fecha a
   `YYYY-MM-DD` (`Date.parse` + ISO), campos de importe a 2 decimales (`Number` con
   `,`→`.`), identificadores en mayúsculas sin separadores
   (`/[\s.\-_/]/g`). **No aplica ninguna ley fiscal.**
5. **Valor compuesto no se aplasta**: un objeto (p. ej. `tercero:{nif,...}`) se
   serializa **canónicamente** (claves ordenadas `k=v` unidas por `&`; arrays por
   `,`) para que la clave siga siendo determinista — nunca `[object Object]`.
6. **Rutas con punto**: `_leerRuta(obj, 'a.b')` navega rutas anidadas; un tramo
   `null`/`undefined` da `undefined`.
7. **Dato ausente = desconocido**: un campo con valor `undefined`/`null`/`''` se
   empuja a `abierto`, aporta `''` a la clave, y deja `completa:false`. **No se
   estima, no se rellena.**
8. **Dos salidas de la clave**: `clave` legible (auditable, `prefijo + cuerpo` unido por
   el `separador`) y `sello` estable (hash **sha1** de la clave, primeros 16 hex) —
   para llaves de mapa, no para auditar.
9. **`coincide` = misma clave**: calcula la clave de `a` y de `b` con la **misma**
   composición; `coinciden = (clave_a === clave_b)` y `es_mismo_hecho` **es** ese
   mismo booleano. `completa` es la conjunción de ambas. `abierto` es la unión
   (sin duplicados) de los abiertos de ambos.
10. **Puro**: sin estado, sin reloj, sin azar, sin persistencia.
11. **Validaciones deterministas**: `a` ausente → `400 INVALID_INPUT` (`field:'a'`);
    `b` ausente → `400 INVALID_INPUT` (`field:'b'`).
12. **HTTP exacto**: éxito `200`; sujeto inválido → `400`; excepción en `_atender` →
    `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `clave-natural.calcular.response` y `clave-natural.coincide.response`.

### 1. `calcular` — la clave natural del hecho

```json
{
  "project_id": "e57a318a-...",
  "hecho": { "vertical": "pizzepos", "tipo": "venta", "tercero": "B12345678", "fecha": "2026-09-01T10:00:00Z", "importe": "121,00", "referencia": "A-1" },
  "composicion": { "campos": ["vertical", "tipo", "tercero", "fecha", "importe"], "normalizacion": "defecto", "separador": "|", "prefijo": "pz" },
  "correlation_id": "abc-123"
}
```

Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "clave": "pz|PIZZEPOS|VENTA|B12345678|2026-09-01|121.00",
  "sello": "9f2c1a3b4d5e6f70",
  "composicion": { "campos": ["vertical", "tipo", "tercero", "fecha", "importe"], "normalizacion": "defecto", "separador": "|", "prefijo": "pz" },
  "composicion_declarada": true,
  "completa": true,
  "abierto": []
}
```

Sin `composicion` → `composicion_declarada:false` y campos de defecto; un campo que no
llega aparece en `abierto` y deja `completa:false`.

### 2. `coincide` — ¿son el mismo hecho?

```json
{ "project_id": "e57a318a-...", "a": { "vertical": "pizzepos", "referencia": "A-1" }, "b": { "vertical": "pizzepos", "referencia": "A-1" } }
```

Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "coinciden": true, "es_mismo_hecho": true, "clave_a": "|PIZZEPOS|||A1", "clave_b": "|PIZZEPOS|||A1", "sello_a": "…", "sello_b": "…", "completa": true, "abierto": [] }
```

### 3. Fallo — sujeto ausente

```json
{ "project_id": "e57a318a-..." }
```

Respuesta `400` + `clave-natural.calcular.failed`:
```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "hecho requerido", "details": { "field": "hecho" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/clave-natural.test.js`. Cubre:

- `calcular` con composición declarada → clave determinista con `prefijo` y
  `separador`, `sello` estable, `composicion_declarada:true`.
- **Pureza**: dos llamadas con el mismo hecho → exactamente la misma `clave`.
- Sin `composicion` → `composicion_declarada:false` y campos de defecto.
- Campo declarado ausente → aparece en `abierto` y `completa:false`.
- `tercero` como objeto → se serializa canónicamente (no `[object Object]`).
- `coincide` con a y b iguales → `es_mismo_hecho:true`; distintos → `false`.
- Sujeto ausente → `400 INVALID_INPUT` + `clave-natural.calcular.failed`.
- `toolCalcular` / `toolCoincide` devuelven la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `ClaveNatural extends ModuloHibridoReflejo`; `name = 'clave-natural'`,
  `version = 'reflejo-0.1.0'`. Sin `PosPersistencia`, sin store, sin
  `onProjectActivated` (REFLEJO stateless).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-libro/clave-natural/`; es de la vertical **libro**).
- `onCalcularRequest` usa `this._atender(e, 'calcular',
  'clave-natural.calcular.response', async (d) => {...})` y publica el par `failed` si
  `status !== 200`; `onCoincideRequest` hace lo propio con `coincide`.
- Proyecciones puras `_calcular(input)` y `_coincide(input)`; helpers `_campos`,
  `_normaliza`, `_crudo`, `_sello` (sha1), `_leerRuta`. Tools `toolCalcular` /
  `toolCoincide`.
- `_invalid` / `_errorResponse` vienen de `modulo-hibrido-reflejo`.
- DEP: la aplica `deduplicacion-hecho` (A7) y la usa como llave el escritor del diario
  (B2). Se invoca por evento (`clave-natural.calcular.request`).
