---
name: hecho-rectificativo
description: >
  Skill FULL del módulo PUENTE `hecho-rectificativo` de la vertical contabilidad de
  Enki (A13, hoja del plan). Plano 2 de los 4 planos de corrección: el hecho POSTERIOR
  que corrige o anula uno anterior casa con su ORIGINAL por CLAVE NATURAL (M3). NO
  BORRA: AÑADE — el original queda intacto y la corrección SUMA un asiento de ajuste
  (señal a B5, escritor-diario). Si el original no se halla → 404
  ERROR_ORIGINAL_NO_HALLADO; si el rectificativo no declara a qué original apunta →
  422 ORIGINAL_NO_DECLARADO (se declara, no se asume). Stateless. Úsala para operar,
  depurar o extender el puente, o para entender su contrato de eventos y sus reglas.
when-to-use: >
  - Cuando un hecho rectificativo deba casar con su original
    (RPC contabilidad.rectificativo.emparejar.request) y sumar un asiento de ajuste.
  - Cuando llegue un hecho admitido por evento (contabilidad.hecho_admitido de
    puerto-evento-vertical A1) y haya que cachearlo como posible ORIGINAL.
  - Cuando depures por qué no se empareja (404 ERROR_ORIGINAL_NO_HALLADO, 422
    ORIGINAL_NO_DECLARADO, 503 UPSTREAM_UNREACHABLE si clave-natural no responde,
    INVALID_INPUT si falta project_id/rectificativo/vertical).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), la regla
    "el original NO se borra, la corrección SUMA" y los signos CORRIGE/ANULA.
  - Cuando vayas a escribir/ampliar el test unitario del puente hecho-rectificativo.
tags: [enki, modulo, puente, contabilidad, hecho-rectificativo, rectificacion, append-only]
---

# hecho-rectificativo — PUENTE del plano de corrección no destructiva

## Qué hace el módulo

`hecho-rectificativo` es un **PUENTE STATELESS** (A13, hoja del plan): el **plano 2
de los 4 planos de corrección**. El **hecho POSTERIOR** que corrige o anula uno
anterior **casa con su ORIGINAL por CLAVE NATURAL** (M3).

La invariante rectora: **NO BORRA: AÑADE**. El **original queda intacto** y la
**corrección SUMA un asiento de ajuste** (señal a **B5**, `escritor-diario`). Es el
**espejo de B5 del lado del hecho**. Es la invariante **append-only** del dominio:
el asiento original no se borra, la corrección suma.

Es **stateless**: sin PosPersistencia ni `project.activated` — los hechos admitidos
que pueden ser **ORIGINAL** de un rectificativo se **cachean en memoria** del propio
puente (`this._admitidos`), alimentados **por EVENTO**
(`contabilidad.hecho_admitido` de `puerto-evento-vertical`), **nunca por `require`
cruzado**. Sin clave natural el hecho **no es localizable** y **no se cachea**.

Si el **original no se halla** → **`404 ERROR_ORIGINAL_NO_HALLADO`** (determinista).
Si el rectificativo **no declara a qué original apunta** → **`422 ORIGINAL_NO_DECLARADO`**
(*se DECLARA, no se asume* — caso de puerto ausente). La clave natural la da
`clave-natural` (M3) **por EVENTO**; si ese RPC no responde se publica el par de
fallo y **NUNCA se emite basura** (contrato TOLERANTE).

## Contrato de eventos (module.json real)

### Subscribes (RPC request/response + fire-and-forget)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.rectificativo.emparejar.request` | `onEmparejarRequest` | RPC puente: {project_id, rectificativo:{vertical, tipo:'CORRIGE'\|'ANULA', total, hecho_original\|original}, original?} → {project_id, vertical, clave_rectificativo, clave_original, signo, ajuste:{signo, importe, ...}, borra:false, suma:true}. Casa el rectificativo con su ORIGINAL por clave natural (M3): el original NO se borra, la correccion SUMA un asiento de ajuste (B5). Si el original no se halla → 404 ERROR_ORIGINAL_NO_HALLADO; si no se declara a qué original apunta → 422 ORIGINAL_NO_DECLARADO; si clave-natural no responde (503 TOLERANTE) → no se emite. Exito publica contabilidad.hecho_rectificado y responde por contabilidad.rectificativo.emparejar.response; los errores → contabilidad.rectificativo.emparejar.failed. |
| `contabilidad.hecho_admitido` | `onHechoAdmitido` | Fire-and-forget (A1 → A13): puerto-evento-vertical admitio un hecho → {project_id, hecho, clave_natural}. Se cachea en memoria como posible ORIGINAL de un rectificativo posterior (dependencia por EVENTO, sin require cruzado). Sin clave natural no es localizable y no se cachea. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.hecho_rectificado` | Fire-and-forget (A13): un hecho rectificativo quedo emparejado con su original → {project_id, vertical, clave_rectificativo, clave_original, signo, ajuste, borra:false, suma:true, emision:{asiento_ajuste}}. El original queda intacto: la correccion SUMA un asiento de ajuste (senal a B5, escritor-diario). |
| `contabilidad.rectificativo.emparejar.failed` | Par de fallo determinista: emparejar con payload invalido, original no hallado (ERROR_ORIGINAL_NO_HALLADO), original no declarado (422) o clave-natural (M3) sin responder (503 TOLERANTE). Cierra el circulo de contabilidad.rectificativo.emparejar.request. |
| `contabilidad.hecho_rectificado.failed` | Par de fallo del evento de dominio contabilidad.hecho_rectificado: la emision del hecho de dominio no se completo. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `contabilidad.rectificativo.emparejar.failed` cierra el círculo de
> `contabilidad.rectificativo.emparejar.request`.

> Nota: no está en module.json pero sí lo emite index.js — `onEmparejarRequest`, en
> ÉXITO, además de publicar `contabilidad.hecho_rectificado`, **llama a `_emitir`** y
> **adjunta `emision`** (`{asiento_ajuste, original_intacto, borrado, suma,
> senal_libro:'B5'}` o `null`) al evento. En FALLO publica
> `contabilidad.rectificativo.emparejar.failed`.

> Nota: `contabilidad.rectificativo.emparejar.response` la emite `_atender` y **NO
> está declarada en `publishes`**.

> Nota: **`contabilidad.hecho_rectificado.failed` está declarada en `publishes` pero
> no se emite en `index.js`** — el puente solo publica el par de fallo del RPC.

> Nota: **`_emitir` (tools `toolEmitir`) es una proyección + Tool**; el flujo la llama
> desde `onEmparejarRequest` al emparejar con éxito. No tiene evento RPC propio.

> Nota: **`onHechoAdmitido` no publica ningún evento propio**: solo cachea el hecho
> admitido como posible ORIGINAL. Sin `clave_natural` (ni `hecho.clave_natural`) no se
> cachea (el hecho no es localizable).

## Reglas de negocio

1. **El original NO se borra: la corrección SUMA (append-only)**: la respuesta lleva
   siempre **`borra:false`, `suma:true`** y la regla
   `'la correccion NO borra el original: SUMA un asiento de ajuste (B5)'`. `_emitir`
   produce un asiento `{tipo:'AJUSTE', origen:'RECTIFICATIVO', destino:'B5_escritor_diario',
   borra_original:false}`. **Nunca** se elimina ni sobrescribe el original.
2. **Emparejar por CLAVE NATURAL (M3)**: `_emparejar` casa el rectificativo con su
   ORIGINAL por clave natural. La clave del rectificativo viene de
   `input.clave_natural`/`rect.clave_natural` o se **pide a clave-natural por `_rpc`**
   (timeout **4000 ms**).
3. **El original se busca por referencia o por documento**: `refOriginal` sale de
   `input.original_ref`, `input.original.clave_natural/clave`, `rect.hecho_original`,
   `rect.original` o `rect.clave_original`. `_buscarOriginal` lo resuelve en el caché
   por clave exacta y, **con tolerancia**, por `documento_origen`/`documento`.
4. **Original no declarado → 422 (se declara, no se asume)**: si no hay `original`
   **ni** `refOriginal` → **`422 PRECONDITION_FAILED`** con
   `{ message:'el rectificativo no declara el original al que apunta', details:{ vertical, senal:'ORIGINAL_NO_DECLARADO', accion:'se declara, no se asume' } }`.
   Es el caso de puerto ausente: **hay que declararlo**.
5. **Original no hallado → 404 determinista**: si hay `refOriginal` pero no se
   encuentra entre los admitidos → **`404 ERROR_ORIGINAL_NO_HALLADO`** con
   `{ message:'el original <ref> no se halla entre los hechos admitidos', details:{ vertical, original_ref, simbolico:'ERROR_ORIGINAL_NO_HALLADO' } }`
   (constante `CODE_ORIGINAL_NO_HALLADO`).
6. **Contrato TOLERANTE con clave-natural (M3)**: si el RPC a
   `contabilidad.clave.calcular.request` no responde o no devuelve clave →
   **`503 UPSTREAM_UNREACHABLE`** con
   `{ message:'clave-natural (M3) no devolvio la clave del rectificativo: no se asume', details:{ vertical, dependencia:'clave-natural', accion:'NO_EMITIR_PUBLICAR_FALLO' } }`.
   **Nunca se emite basura**.
7. **Signos CORRIGE / ANULA**: `_signo` normaliza `rect.tipo`/`rect.signo` a
   mayúsculas; `SIGNOS = {CORRIGE, ANULA}`; cualquier otra cosa cae a **`'CORRIGE'`**.
   El **importe del ajuste** (`_calcularAjuste`):
   - `ANULA` → **`-total_original`** (asiento que neutraliza el original).
   - `CORRIGE` → **`total_rectificativo − total_original`** (la diferencia); si solo
     hay total nuevo, ese total.
   Se redondea a 2 decimales; los totales se devuelven también normalizados.
8. **El caché de admitidos no persiste**: `this._admitidos` (Map `project_id` →
   `Map<clave_natural, hecho>`); es memoria del puente. Sin clave no hay original
   localizable → no se cachea.
9. **Validaciones deterministas**: falta `project_id` → `400 INVALID_INPUT project_id`;
   `rectificativo` (o `hecho`) ausente/no objeto → `400 INVALID_INPUT rectificativo`;
   sin vertical → `400 INVALID_INPUT rectificativo.vertical`. Shape:
   `{ status:400, error:{ code:'INVALID_INPUT', message:'<campo> requerido', details:{ field:<campo> } } }`.
10. **HTTP exacto**: éxito `200`; payload inválido → `400`; original no declarado →
    `422`; original no hallado → `404`; clave-natural sin responder → `503`;
    excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

El RPC responde en `contabilidad.rectificativo.emparejar.response`.

### 1. `emparejar` — casar el rectificativo con su original y sumar el ajuste

```json
{
  "project_id": "e57a318a-...",
  "rectificativo": {
    "vertical": "COMPRA",
    "tipo": "CORRIGE",
    "total": 100,
    "hecho_original": "e57a318a-...:COMPRA:9f2c1a7b3e5d0c84"
  },
  "correlation_id": "abc-123"
}
```
Respuesta `200` (el original está cacheado; CORRIGE: 100 − 121 = −21):
```json
{
  "project_id": "e57a318a-...",
  "vertical": "COMPRA",
  "clave_rectificativo": "e57a318a-...:COMPRA:1a2b3c4d5e6f7081",
  "clave_original": "e57a318a-...:COMPRA:9f2c1a7b3e5d0c84",
  "signo": "CORRIGE",
  "rectificativo": { "vertical": "COMPRA", "tipo": "CORRIGE", "total": 100, "clave_natural": "e57a318a-...:COMPRA:1a2b3c4d5e6f7081" },
  "original": { "clave_natural": "e57a318a-...:COMPRA:9f2c1a7b3e5d0c84", "resumen": { "total": 121 } },
  "ajuste": { "signo": "CORRIGE", "importe": -21, "total_original": 121, "total_rectificativo": 100, "clave_original": "e57a318a-...:COMPRA:9f2c1a7b3e5d0c84" },
  "borra": false,
  "suma": true,
  "regla": "la correccion NO borra el original: SUMA un asiento de ajuste (B5)"
}
```
Emite `contabilidad.hecho_rectificado` (res.data + `emision` + `correlation_id`),
donde `emision` es el asiento de ajuste:
```json
{ "project_id": "e57a318a-...", "asiento_ajuste": { "tipo": "AJUSTE", "origen": "RECTIFICATIVO", "signo": "CORRIGE", "importe": -21, "clave_rectificativo": "e57a318a-...:COMPRA:1a2b3c4d5e6f7081", "clave_original": "e57a318a-...:COMPRA:9f2c1a7b3e5d0c84", "destino": "B5_escritor_diario", "borra_original": false }, "original_intacto": true, "borrado": false, "suma": true, "senal_libro": "B5" }
```

### 2. `emparejar` con ANULA → neutraliza el original

Con `"tipo":"ANULA"`, `total_original:121` → `ajuste.importe = -121`
(asiento que neutraliza; el original queda intacto).

### 3. Fallo — original no declarado (422; se declara, no se asume)

El rectificativo no dice a qué original apunta:
Respuesta `422` + `contabilidad.rectificativo.emparejar.failed`:
```json
{ "status": 422, "error": { "code": "PRECONDITION_FAILED", "message": "el rectificativo no declara el original al que apunta", "details": { "vertical": "COMPRA", "senal": "ORIGINAL_NO_DECLARADO", "accion": "se declara, no se asume" } } }
```

### 4. Fallo — original no hallado (404 determinista)

`refOriginal` declarado pero no cacheado:
Respuesta `404` + `contabilidad.rectificativo.emparejar.failed`:
```json
{ "status": 404, "error": { "code": "ERROR_ORIGINAL_NO_HALLADO", "message": "el original e57a318a-...:COMPRA:zzz no se halla entre los hechos admitidos", "details": { "vertical": "COMPRA", "original_ref": "e57a318a-...:COMPRA:zzz", "simbolico": "ERROR_ORIGINAL_NO_HALLADO" } } }
```

### 5. Fallo — clave-natural no responde (503 TOLERANTE)

Si el rectificativo no trae clave y clave-natural no responde:
Respuesta `503` + `contabilidad.rectificativo.emparejar.failed`:
```json
{ "status": 503, "error": { "code": "UPSTREAM_UNREACHABLE", "message": "clave-natural (M3) no devolvio la clave del rectificativo: no se asume", "details": { "vertical": "COMPRA", "dependencia": "clave-natural", "accion": "NO_EMITIR_PUBLICAR_FALLO" } } }
```

### 6. Entrada por evento — cachear un posible original

`contabilidad.hecho_admitido` (de A1): `{project_id, hecho:{...}, clave_natural:'...'}`
→ se cachea como posible ORIGINAL. Sin clave → `null`, no se cachea.

## Tests

El test vive en `tests/unit/hecho-rectificativo.test.js`. Cubre:

- Cachear un original con `contabilidad.hecho_admitido` y `emparejar` un rectificativo
  que lo referencia → `200` con `signo`, `ajuste`, `borra:false`, `suma:true`; emite
  `contabilidad.hecho_rectificado` con `emision.asiento_ajuste` (`destino:
  'B5_escritor_diario'`, `borra_original:false`).
- `CORRIGE` → `importe = total_rectificativo − total_original`; `ANULA` →
  `importe = −total_original`. Otro `tipo` cae a `CORRIGE`.
- Rectificativo **sin** referencia al original → `422 ORIGINAL_NO_DECLARADO`.
- Referencia a un original **no cacheado** → `404 ERROR_ORIGINAL_NO_HALLADO`.
- Rectificativo sin clave y clave-natural sin responder → `503 UPSTREAM_UNREACHABLE`.
- `emparejar` sin `project_id`/`rectificativo`/`vertical` → `400 INVALID_INPUT`.
- El puente es **stateless**: sin `project.activated` ni persistencia.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/hecho-rectificativo
node --test tests/unit/hecho-rectificativo.test.js
```

## Notas de implementación

- Clase `HechoRectificativo extends ModuloHibridoReflejo`; `name =
  'hecho-rectificativo'`, `version = 'reflejo-0.1.0'`. **Sin store persistente**:
  caché en memoria `this._admitidos` (Map `project_id` → `Map<clave_natural, hecho>`).
- Constantes: `SIGNOS` (Set `CORRIGE`, `ANULA`),
  `CODE_ORIGINAL_NO_HALLADO = 'ERROR_ORIGINAL_NO_HALLADO'`.
- `onEmparejarRequest` delega en
  `_atender(e, 'emparejar', 'contabilidad.rectificativo.emparejar.response', fn)`;
  `onHechoAdmitido` es fire-and-forget (cachea el original; no publica evento propio).
- `_emparejar` es **async** (puede hacer `_rpc` a `contabilidad.clave.calcular.request`
  con `timeout_ms: 4000`). En éxito, el handler llama `_emitir` y adjunta `emision`.
- Proyecciones puras: `_emparejar` (casa por clave natural; signo CORRIGE|ANULA),
  `_emitir` (asiento de ajuste B5; nunca borrado), `_buscarOriginal`, `_signo`,
  `_calcularAjuste`. `_invalid`/`_errorResponse`/`_round` vienen de la base.
- Tools: `toolEmparejar` → `_emparejar`, `toolEmitir` → `_emitir`.
- DEP hacia delante: `contabilidad.hecho_rectificado` señala a B5 `escritor-diario`
  (espejo del lado del hecho). DEP hacia atrás por evento: A1
  `puerto-evento-vertical` (caché de originales); M3 `clave-natural` (clave del
  rectificativo).
