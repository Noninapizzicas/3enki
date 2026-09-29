---
name: deduplicacion-hecho
description: >
  Skill FULL del módulo REFLEJO `deduplicacion-hecho` de la vertical contabilidad de
  Enki. Aplica la CLAVE NATURAL del hecho (M3) para NO duplicar: idempotencia
  determinista del libro — 'un hecho = un asiento'. Sin clave natural no afirma nada
  (es_nuevo:null con motivo) en vez de asumir 'nuevo' (asumir nuevo es duplicar).
  Úsala para operar, depurar o extender el reflejo, o para entender su contrato de
  eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites dictaminar si un hecho es nuevo o ya visto (RPC
    deduplicacion-hecho.es_nuevo.request).
  - Cuando depures por qué no hay veredicto (400 INVALID_INPUT si falta hecho o
    project_id, o es_nuevo:null cuando no hay clave natural).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    invariantes de pureza (no asume nuevo, compara con las claves vistas).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo deduplicacion-hecho.
tags: [enki, modulo, reflejo, contabilidad, deduplicacion-hecho]
---

# deduplicacion-hecho — REFLEJO STATELESS de la idempotencia del hecho

## Qué hace el módulo

`deduplicacion-hecho` es un **REFLEJO STATELESS** (A7, hoja del plan): aplica la
**CLAVE NATURAL** del hecho/documento (`clave-natural`, M3) → **no duplica**. Es la
cara de entrada del **cerrojo anti-bucle** («un cierre = un asiento»): un hecho ya
visto no se vuelve a tratar.

Invariantes:
- **Sin clave natural NO hay veredicto**: `es_nuevo:null` con `motivo` — no se
  **asume** nuevo (asumir «nuevo» es como duplicar) ni se asume duplicado. La clave la
  da M3.
- **Es PURO y sin estado**: pregunta la clave a M3 **por evento** y la compara con las
  claves que el emisor **declara** (`claves_vistas`). Quien **RECUERDA** los hechos ya
  vistos es el custodio del diario, no este reflejo.
- **Determinista**: mismo hecho + misma clave registrada → mismo veredicto, siempre.
- **Sin evento de dominio propio**: su valor **ES** el veredicto, y el contrato cierra
  con su par `*.failed`. Sin `PosPersistencia` y sin `project.activated`: no es
  custodio.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `deduplicacion-hecho.es_nuevo.request` | `onEsNuevoRequest` | RPC reflejo (puro): {project_id, hecho, clave?, claves_vistas?} → {es_nuevo, clave, clave_origen:'declarada'\|'clave-natural', vistas_comparadas, motivo, disponible}. Obtiene la clave natural de M3 por evento (o usa la declarada) y la compara con las claves vistas; sin clave natural → es_nuevo:null (no se asume nuevo). Responde por deduplicacion-hecho.es_nuevo.response; hecho/project_id ausente → deduplicacion-hecho.es_nuevo.failed. |
| `contabilidad.hecho_normalizado` | `onHechoNormalizado` | Fire-and-forget (A7): normalizador-hecho (A2) publica un hecho en forma asentable → {project_id, hecho, clave_natural, correlation_id}. Misma proyeccion que el RPC: calcula/recibe la clave natural y dictamina es_nuevo; hecho invalido → deduplicacion-hecho.es_nuevo.failed. Cierra el circulo del flujo de entrada. |

### Publishes

| Evento | Descripción |
|---|---|
| `deduplicacion-hecho.es_nuevo.response` | Respuesta RPC correlada de deduplicacion-hecho.es_nuevo.request → {request_id, status:200, data:{es_nuevo, clave, clave_origen, composicion, vistas_comparadas, motivo, disponible}}. Emitida por el helper _atender. |
| `deduplicacion-hecho.es_nuevo.failed` | Par de fallo determinista (A7): hecho ausente/invalido o project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de deduplicacion-hecho.es_nuevo.request y de contabilidad.hecho_normalizado. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `deduplicacion-hecho.es_nuevo.failed` cierra el círculo de
> `deduplicacion-hecho.es_nuevo.request` (por `onEsNuevoRequest` cuando `_es_nuevo`
> devuelve status ≠ 200) **y** de `contabilidad.hecho_normalizado`, porque ambos usan
> la misma proyección `_es_nuevo`.

> Nota: `deduplicacion-hecho.es_nuevo.request` es el único RPC y su único par de fallo
> es `deduplicacion-hecho.es_nuevo.failed`; el módulo **no** emite un
> `es_nuevo.response` de dominio en el fire-and-forget (el handler
> `onHechoNormalizado` no responde).

## Reglas de negocio

1. **La clave natural primero, declarada o de M3**: `_es_nuevo` usa
   `input.clave` si viene no vacía (`clave_origen:'declarada'`); si no, la pide a
   `clave-natural.calcular.request` (`timeout_ms:4000`) y la marca
   `clave_origen:'clave-natural'`, guardando la `composicion` que devuelva M3.
   **No se inventa la clave.**
2. **Sin clave natural → no se afirma nada**: `es_nuevo:null`, `clave:null`,
   `clave_origen:null`, `disponible:false`, motivo «sin clave natural no hay veredicto:
   no se asume nuevo (asumir nuevo es duplicar)». **Nunca** se devuelve `true` ni
   `false` por defecto.
3. **Solo cuentan las claves VISTAS que el emisor declara**: `_vistas(claves_vistas)`
   acepta un array de claves o un objeto mapa (`Object.keys`), deduplica y normaliza a
   String. **La clave natural del propio hecho NO cuenta como vista**: que el hecho
   traiga su clave no prueba que ya se haya tratado (asumirlo impediría procesar
   cualquier hecho nuevo).
4. **Veredicto determinista**: `duplicado = vistas.includes(clave)`; `es_nuevo =
   !duplicado`. Mismo hecho + misma clave registrada → mismo veredicto, siempre.
   `vistas_comparadas` = número de claves vistas consideradas.
5. **Motivo explícito (auditable)**: duplicado → «la clave natural ya consta: un hecho
   = un asiento, no se reprocesa»; nuevo → «la clave natural no consta: el hecho es
   nuevo».
6. **`disponible`**: `true` cuando hay clave y veredicto; `false` cuando no hay clave.
7. **Es puro**: no escribe, no persiste, no recuerda. Quien recuerda es el custodio del
   diario.
8. **Validaciones deterministas**: `hecho` ausente/no objeto → `400 INVALID_INPUT`
   (`field:'hecho'`); `project_id` ausente → `400 INVALID_INPUT`
   (`field:'project_id'`).
9. **Fire-and-forget sin `project_id`**: `onHechoNormalizado` devuelve `null` sin
   publicar nada si falta `project_id`.
10. **HTTP exacto**: éxito `200` (con veredicto o con `es_nuevo:null`); hecho/project_id
    inválidos → `400`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `deduplicacion-hecho.es_nuevo.response`.

### 1. `es_nuevo` — ¿es nuevo o ya visto?

```json
{
  "project_id": "e57a318a-...",
  "hecho": { "vertical": "pizzepos", "tipo": "venta", "referencia": "A-1" },
  "claves_vistas": ["pz|PIZZEPOS|VENTA|B12345678|2026-09-01|121.00"],
  "correlation_id": "abc-123"
}
```

Respuesta `200` (con la clave de M3 y comparación):
```json
{
  "project_id": "e57a318a-...",
  "es_nuevo": true,
  "clave": "|PIZZEPOS|VENTA|||A1",
  "clave_origen": "clave-natural",
  "composicion": { "campos": ["vertical", "tipo", "tercero", "fecha", "importe", "referencia"], "normalizacion": "defecto", "separador": "|", "prefijo": "" },
  "vistas_comparadas": 1,
  "motivo": "la clave natural no consta: el hecho es nuevo",
  "disponible": true
}
```

Con `clave` declarada → `clave_origen:'declarada'`. Si la clave está en
`claves_vistas` → `es_nuevo:false` con motivo «un hecho = un asiento, no se reprocesa».

### 2. Sin clave natural — no hay veredicto

Si M3 no responde, Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "es_nuevo": null, "clave": null, "clave_origen": null, "motivo": "sin clave natural no hay veredicto: no se asume nuevo (asumir nuevo es duplicar)", "disponible": false }
```

### 3. Fire-and-forget — reacción a `contabilidad.hecho_normalizado`

`onHechoNormalizado` toma `d.hecho`, `d.clave_natural` como clave y `d.claves_vistas`,
y llama a `_es_nuevo`. Si falta `project_id` devuelve `null` sin publicar.

### 4. Fallo — falta el hecho

```json
{ "project_id": "e57a318a-..." }
```

Respuesta `400` + `deduplicacion-hecho.es_nuevo.failed`:
```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "hecho requerido", "details": { "field": "hecho" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/deduplicacion-hecho.test.js`.
Cubre:

- `es_nuevo` con `clave` declarada no vista → `es_nuevo:true`,
  `clave_origen:'declarada'`.
- `es_nuevo` con la clave ya en `claves_vistas` → `es_nuevo:false` con motivo.
- Sin `clave` y M3 disponible → `clave_origen:'clave-natural'` con `composicion`.
- Sin clave natural (M3 no responde) → `es_nuevo:null`, `disponible:false` (no asume
  nuevo).
- `claves_vistas` como array y como mapa → `vistas_comparadas` correcto.
- `hecho`/`project_id` ausente → `400 INVALID_INPUT` +
  `deduplicacion-hecho.es_nuevo.failed`.
- `onHechoNormalizado` sin `project_id` → `null`; con payload válido dictamina.
- `toolEsNuevo` devuelve la misma proyección que `_es_nuevo`.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `DeduplicacionHecho extends ModuloHibridoReflejo`; `name =
  'deduplicacion-hecho'`, `version = 'reflejo-0.1.0'`. Sin `PosPersistencia`, sin
  store, sin `onProjectActivated` (REFLEJO stateless).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-entrada/deduplicacion-hecho/`).
- `onEsNuevoRequest` usa `this._atender(e, 'es_nuevo',
  'deduplicacion-hecho.es_nuevo.response', async (d) => {...})` y publica el par
  `failed` si `status !== 200`. `onHechoNormalizado` **no** usa `_atender`: llama
  directamente a `_es_nuevo` (no hay response) y sale antes si falta `project_id`.
- Proyección única `_es_nuevo(input)` → `{status, data}`, `async` porque consulta M3
  por evento; helper `_vistas(claves)`. Tool directa `toolEsNuevo`.
- `_invalid` / `_errorResponse` vienen de `modulo-hibrido-reflejo`.
- DEP: lo dispara `contabilidad.hecho_normalizado` (emitido por `normalizador-hecho`
  A2); se apoya en `clave-natural` (M3) por evento. Quien recuerda las claves vistas es
  el custodio del diario.
