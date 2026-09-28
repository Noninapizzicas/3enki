---
name: registro-verifactu
description: >
  Skill FULL del módulo CUSTODIO APPEND-ONLY ENCADENADO `registro-verifactu` de la
  vertical contabilidad de Enki (D8, hoja del plan). REGISTRO INTERNO Y NO ALTERABLE DE LA
  FACTURACIÓN: la invariante del asiento (que no se borra) aplicada a Verifactu (RD
  1007/2023). Cada registro lleva la HUELLA (hash sha256) del registro ANTERIOR → CADENA;
  los registros NO SE BORRAN ni se REESCRIBEN (borrable:false, reescribible:false): SOLO
  CRECE. verificarCadena() recalcula la cadena ENTERA y declara 409 ERROR_CADENA_ROTA si un
  solo eslabón no cuadra — la PRUEBA de que nada se tocó. UN SOLO ESCRITOR: EMISION_FACTURA
  (otro rol → 409 ERROR_DOS_ESCRITORES; intento de borrar/reescribir → 409
  ERROR_REGISTRO_INMUTABLE). Anota la huella SIN que nadie la pida cuando O1 emite una
  factura. Persiste por proyecto vía PosPersistencia. Úsala para operar, depurar o extender
  el custodio, o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites anotar la huella encadenada de una factura (RPC
    contabilidad.registro.anotar.request) o verificar la cadena entera
    (contabilidad.registro.verificar.request).
  - Cuando depures por qué se rechaza (409 ERROR_DOS_ESCRITORES si el rol no es
    EMISION_FACTURA, 409 ERROR_CADENA_ROTA si un eslabón no cuadra, 409
    ERROR_REGISTRO_INMUTABLE ante un intento de mutación, 400 INVALID_INPUT).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), el
    encadenamiento por huella y por qué el registro es la prueba de que nada se tocó.
  - Cuando vayas a escribir/ampliar el test unitario del custodio registro-verifactu.
tags: [enki, modulo, custodio, persistencia, contabilidad, registro-verifactu, append-only, encadenado, inmutable]
---

# registro-verifactu — CUSTODIO APPEND-ONLY ENCADENADO · la prueba de que nada se tocó

## Qué hace el módulo

`registro-verifactu` es un **CUSTODIO APPEND-ONLY ENCADENADO CON PERSISTENCIA** (D8, hoja
del plan): **REGISTRO INTERNO Y NO ALTERABLE DE LA FACTURACIÓN**. Es la **invariante del
asiento** (que no se borra) **aplicada a Verifactu** (RD 1007/2023):

- **cada registro lleva la HUELLA** (`hash` sha256) **del registro ANTERIOR** → **cadena**;
- los registros **NO SE BORRAN** ni se **REESCRIBEN** (`borrable:false`,
  `reescribible:false`): **solo crece**;
- `_verificarCadena()` **recalcula la cadena ENTERA** y declara **`409 ERROR_CADENA_ROTA`**
  si un solo eslabón no cuadra — **la prueba de que nada se tocó**.

**Tres cosas distintas, NUNCA una**: la **EMISIÓN** de la factura (O1
`emision-factura-venta`), el **FORMATO** estructurado (D9 `factura-electronica`) y este
**REGISTRO** (D8); **aquí no se emite ni se formatea: se ANOTA la huella**.

**UN SOLO ESCRITOR** de la parcela: **`EMISION_FACTURA`** (el emisor O1) — cualquier otro
rol → **`409 ERROR_DOS_ESCRITORES`**; un intento de **BORRAR o REESCRIBIR** se rechaza con
**`409 ERROR_REGISTRO_INMUTABLE`**.

**Fire-and-forget**: `contabilidad.factura_emitida` (O1 publica cada factura) → **se anota
su huella SIN que nadie la pida** (*la factura NACE registrada*). Persiste por proyecto con
**PosPersistencia** (storage `/contabilidad/registro-verifactu/registro-verifactu.json`),
restaura en `project.activated` y vuelca en `onUnload`. Reanotar la **misma** factura es
**idempotente**: devuelve el registro original sin reescribirlo (`reusado:true`).

> **NO REUTILIZA**: Verifactu no existe en el inventario (0 módulos); es requisito legal de
> la factura emitida.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.registro.anotar.request` | `onAnotarRequest` | RPC custodio: {project_id, rol:'EMISION_FACTURA', factura:{id_factura, serie?, numero?, fecha_emision?, nif?, total?}} → {project_id, registro:{secuencia, id_factura, huella, huella_anterior, encadenado:true, borrable:false}, n_registros}. Anota la huella ENCADENADA (hash del contenido + la huella del registro anterior) en la secuencia append-only. Cerrojos: rol != EMISION_FACTURA → 409 ERROR_DOS_ESCRITORES. Idempotente: la misma factura devuelve su registro original sin reescribirlo (reusado:true). Exito publica contabilidad.registro_verifactu_anotado y responde por contabilidad.registro.anotar.response; error → contabilidad.registro.anotar.failed. |
| `contabilidad.registro.verificar.request` | `onVerificarRequest` | RPC custodio: {project_id} → {project_id, ok:true, cadena_integra:true, n_registros, ultimo_hash}. Recalcula la CADENA ENTERA (encadenando cada registro con la huella del anterior) y comprueba que cuadra. Si un solo eslabon no cuadra → 409 ERROR_CADENA_ROTA con la secuencia y las huellas esperada/registrada. Es la prueba de que nada se toco. Responde por contabilidad.registro.verificar.response; error → contabilidad.registro.verificar.failed. |
| `contabilidad.factura_emitida` | `onFacturaEmitida` | Fire-and-forget (O1 → D8): el emisor emitio una factura → se ANOTA su huella encadenada SIN que nadie la pida: la factura NACE registrada. Exito publica contabilidad.registro_verifactu_anotado; si el payload es invalido → contabilidad.registro.anotar.failed. |
| `project.activated` | `onProjectActivated` | Restaura del storage (PosPersistencia) la cadena de registros del proyecto activado: el registro es POR PROYECTO y APPEND-ONLY. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.registro_verifactu_anotado` | Fire-and-forget (D8): una factura quedo ANOTADA en el registro Verifactu con su huella encadenada → {project_id, registro:{secuencia, id_factura, huella, huella_anterior, encadenado:true}, n_registros}. Lo consumen el cuadro de mando y la cara de cumplimiento fiscal. |
| `contabilidad.registro.anotar.failed` | Par de fallo determinista: anotar sin project_id/factura/clave, o con rol != EMISION_FACTURA (409 ERROR_DOS_ESCRITORES). Cierra el circulo de contabilidad.registro.anotar.request. |
| `contabilidad.registro.verificar.failed` | Par de fallo determinista: verificar sin project_id, o CADENA ROTA (409 ERROR_CADENA_ROTA). Cierra el circulo de contabilidad.registro.verificar.request. |
| `contabilidad.registro_verifactu_anotado.failed` | Par de fallo del evento de dominio contabilidad.registro_verifactu_anotado: la emision del hecho de dominio no se completo. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> `contabilidad.registro.anotar.failed` cierra `contabilidad.registro.anotar.request`;
> `contabilidad.registro.verificar.failed` cierra
> `contabilidad.registro.verificar.request`.

> Nota: no está en module.json pero sí lo emite index.js — `_atender` publica
> `contabilidad.registro.anotar.response` y `contabilidad.registro.verificar.response` (los
> pares response de los RPC); **NO están declaradas en `publishes`**. Además
> `onFacturaEmitida` (fire-and-forget) publica `contabilidad.registro_verifactu_anotado` o
> `contabilidad.registro.anotar.failed` según el `status` de `_anotar`.

> Nota: declarado en module.json pero NO emitido por index.js (patrón de la vertical: el
> par de fallo real es `<op>.failed`) — `contabilidad.registro_verifactu_anotado.failed` es
> el par de fallo del evento de DOMINIO; el custodio solo publica los pares `*.failed` de
> sus RPC (+ el de `onFacturaEmitida`).

> Nota de sub-declaración: `ERROR_REGISTRO_INMUTABLE` se emite únicamente desde
> `_rechazarMutacion`, que **NO está expuesto por ningún RPC** (solo como tool
> `toolRechazarMutacion`). El par `contabilidad.registro.anotar.failed` está declarado en
> `publishes` y su `description` menciona el cerrojo de escritor, pero el rechazo de
> mutación (`409 ERROR_REGISTRO_INMUTABLE`) se cierra por la vía de la tool, no por evento.

## Reglas de negocio

1. **APPEND-ONLY ENCADENADO (el cerrojo del módulo)**: `_anotar` calcula la huella con
   `_encadenar(factura, huellaAnterior)` — el `hash` sha256 de
   `JSON.stringify({ anterior, id_factura, serie, numero, fecha_emision, nif, total,
   clave_natural })` — y la guarda con `huella_anterior` = la huella del registro previo
   (`d.ultimo_hash`, o `'GENESIS'` si es el primero). **Cada eslabón incorpora el
   anterior.** `encadenado:true` siempre.
2. **IDEMPOTENCIA por clave**: `_claveDe(factura)` usa `id_factura || clave_natural ||
   numero`. Si la clave **ya consta** en `d.por_clave` → devuelve el **registro original**
   con `reusado:true`, `append_only:true` y `nota:'la factura ya consta en el registro: el
   registro NO se reescribe, solo crece'`. **No se reescribe.**
3. **Un solo escritor del registro (D8)**: `_verificarEscritorUnico` exige `rol ===
   'EMISION_FACTURA'` (normalizado a mayúsculas). Cualquier otro → **`409
   ERROR_DOS_ESCRITORES`** con `{ escritor_vigente:'EMISION_FACTURA', rol_intentado,
   simbolico:'ERROR_DOS_ESCRITORES' }`.
4. **Todo intento de borrado/reescritura se RECHAZA**: `_rechazarMutacion` devuelve **`409
   ERROR_REGISTRO_INMUTABLE`** con
   `{ simbolico:'ERROR_REGISTRO_INMUTABLE', operacion_intentada, nota:'la invariante del
   asiento aplicada a Verifactu (RD 1007/2023): cada registro lleva la huella del anterior' }`.
5. **El registro congela los datos fiscales**: `{ secuencia, id_factura, tipo:'ALTA',
   huella, huella_anterior, encadenado:true, factura:{ id_factura, serie, numero,
   fecha_emision, nif, total }, anotado_por:'EMISION_FACTURA', anotado_en, borrable:false,
   reescribible:false }`. **`borrable`/`reescribible` siempre `false`.**
6. **Secuencia monótona**: `secuencia = d.registros.length + 1`. La secuencia es la prueba
   de orden temporal.
7. **`verificarCadena()` recalcula la cadena ENTERA**: parte de `'GENESIS'`, y por cada
   registro comprueba que `r.huella_anterior === anterior` **y** `r.huella ===
   _encadenar(r.factura, anterior)`. Si algo no cuadra → **`409 ERROR_CADENA_ROTA`** con
   `{ secuencia, id_factura, huella_esperada_anterior, huella_anterior_registrada,
   huella_esperada, huella_registrada, simbolico, ok:false }`. Si cuadra → `{ ok:true,
   cadena_integra:true, n_registros, ultimo_hash, append_only:true, determinista:true }`.
   **Es la prueba de que nada se tocó.**
8. **La factura NACE registrada (fire-and-forget)**: `onFacturaEmitida` (O1 → D8) toma
   `factura_emitida || factura || d`, anota con rol `EMISION_FACTURA` y publica
   `contabilidad.registro_verifactu_anotado` (o `contabilidad.registro.anotar.failed`).
   Sin `project_id` retorna `null` sin publicar.
9. **`_listar` es lectura pura**: devuelve `{ registros, n_registros, ultimo_hash,
   append_only:true }` (solo como tool `toolListar`, sin RPC).
10. **El registro es POR PROYECTO**: `store[pid]` con
    `{ esquema:'contabilidad-registro-verifactu-v1', registros:[], por_clave:{},
    ultimo_hash:'GENESIS', escritor:'EMISION_FACTURA' }`. Sin restaurar (`project.activated`)
    la cadena no se puede garantizar.
11. **Validaciones deterministas**: falta `project_id` → `400 INVALID_INPUT project_id`;
    sin `factura`/`registro` (o no objeto) → `400 INVALID_INPUT factura`; sin clave
    (`id_factura`/`clave_natural`/`numero`) → `400 INVALID_INPUT factura.id_factura`. Shape:
    `{ status:400, error:{ code:'INVALID_INPUT', message:'<campo> requerido', details:{
    field:<campo> } } }`.
12. **HTTP exacto**: éxito `200`; payload inválido → `400`; segundo escritor → `409`; cadena
    rota → `409`; intento de mutación → `409`; excepción en `_atender` → `500
    UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPCs que responden en `contabilidad.registro.anotar.response` y
`contabilidad.registro.verificar.response`.

### 1. `anotar` — anotar la huella encadenada de una factura

```json
{
  "project_id": "e57a318a-...",
  "rol": "EMISION_FACTURA",
  "factura": { "id_factura": "UNICA-1", "serie": "UNICA", "numero": 1, "fecha_emision": "2026-09-12", "nif": "B12345678", "total": 121 },
  "correlation_id": "abc-123"
}
```

Respuesta `200` (primer registro de la cadena):

```json
{
  "project_id": "e57a318a-...",
  "registro": { "secuencia": 1, "id_factura": "UNICA-1", "tipo": "ALTA", "huella": "9f2c1a...", "huella_anterior": "GENESIS", "encadenado": true, "factura": { "id_factura": "UNICA-1", "serie": "UNICA", "numero": 1, "fecha_emision": "2026-09-12", "nif": "B12345678", "total": 121 }, "anotado_por": "EMISION_FACTURA", "anotado_en": "...", "borrable": false, "reescribible": false },
  "huella": "9f2c1a...",
  "huella_anterior": "GENESIS",
  "encadenado": true,
  "reusado": false,
  "append_only": true,
  "n_registros": 1
}
```

Emite `contabilidad.registro_verifactu_anotado` (res.data + `correlation_id`).

### 2. `anotar` la MISMA factura — idempotente (reusado:true)

Misma `id_factura` → **NO se reescribe**:

```json
{ "project_id": "e57a318a-...", "registro": { "secuencia": 1, "id_factura": "UNICA-1", "huella": "9f2c1a...", "huella_anterior": "GENESIS", "encadenado": true }, "reusado": true, "append_only": true, "nota": "la factura ya consta en el registro: el registro NO se reescribe, solo crece" }
```

### 3. `verificar` — la prueba de que nada se tocó

```json
{ "project_id": "e57a318a-..." }
```

Respuesta `200` (cadena íntegra):

```json
{ "project_id": "e57a318a-...", "ok": true, "cadena_integra": true, "n_registros": 2, "ultimo_hash": "...", "append_only": true, "determinista": true, "nota": "la cadena entera recalcula e cuadra: nada se toco" }
```

### 4. Fallo — rol no EMISION_FACTURA → 409

```json
{ "project_id": "e57a318a-...", "rol": "OPERADOR", "factura": { "id_factura": "UNICA-1" } }
```

Respuesta `409` + `contabilidad.registro.anotar.failed`:

```json
{ "status": 409, "error": { "code": "ERROR_DOS_ESCRITORES", "message": "el registro Verifactu tiene UN escritor: solo EMISION_FACTURA anota", "details": { "escritor_vigente": "EMISION_FACTURA", "rol_intentado": "OPERADOR", "simbolico": "ERROR_DOS_ESCRITORES" } } }
```

### 5. Fallo — cadena rota → 409

Si un registro fue alterado y `verificar` recalcula la cadena → Respuesta `409` +
`contabilidad.registro.verificar.failed`:

```json
{ "status": 409, "error": { "code": "ERROR_CADENA_ROTA", "message": "la cadena se rompe en el registro 2: la huella no cuadra", "details": { "secuencia": 2, "id_factura": "UNICA-2", "huella_esperada_anterior": "...", "huella_anterior_registrada": "...", "huella_esperada": "...", "huella_registrada": "...", "simbolico": "ERROR_CADENA_ROTA", "ok": false } } }
```

### 6. Fallo — intento de mutación (tool, sin RPC)

`toolRechazarMutacion({ project_id, operacion:'BORRAR', ... })` → **`409
ERROR_REGISTRO_INMUTABLE`**:

```json
{ "status": 409, "error": { "code": "ERROR_REGISTRO_INMUTABLE", "message": "el registro Verifactu es APPEND-ONLY: no se reescribe ni se borra", "details": { "simbolico": "ERROR_REGISTRO_INMUTABLE", "operacion_intentada": "BORRAR", "nota": "la invariante del asiento aplicada a Verifactu (RD 1007/2023): cada registro lleva la huella del anterior" } } }
```

### 7. Entrada fire-and-forget — factura emitida (O1 → D8)

Entra `contabilidad.factura_emitida` con `{ project_id, factura_emitida:{...}, ... }` → se
anota su huella sin que nadie la pida y se publica `contabilidad.registro_verifactu_anotado`
(o `contabilidad.registro.anotar.failed`). Sin `project_id` → `null`.

### 8. Tools (sin RPC en module.json)

`toolAnotar` → `_anotar`; `toolEncadenar` → `_encadenar`; `toolVerificarCadena` →
`_verificarCadena`; `toolListar` → `_listar`; `toolRechazarMutacion` → `_rechazarMutacion`.

## Tests

El test viviría en `tests/unit/registro-verifactu.test.js`. Cubre:

- `anotar` con rol `EMISION_FACTURA` → `200`, `encadenado:true`,
  `huella_anterior:'GENESIS'`, `borrable:false`, `reescribible:false`, `secuencia:1`; emite
  `contabilidad.registro_verifactu_anotado`.
- **Encadenamiento**: el segundo registro lleva como `huella_anterior` la `huella` del
  primero.
- **Idempotencia**: reanotar la misma factura → `200` con `reusado:true` y el registro
  original (no se reescribe).
- **Single-writer**: rol distinto de `EMISION_FACTURA` → `409 ERROR_DOS_ESCRITORES`.
- **`verificar`**: cadena íntegra → `ok:true`; tras alterar un registro → `409
  ERROR_CADENA_ROTA` con las huellas esperada/registrada.
- `toolRechazarMutacion` → `409 ERROR_REGISTRO_INMUTABLE`.
- Fire-and-forget `contabilidad.factura_emitida` → anota sin que nadie la pida; sin
  `project_id` → `null`.
- Sin `project_id`/`factura`/clave → `400 INVALID_INPUT` + `contabilidad.registro.anotar.failed`.
- `project.activated` restaura la cadena vía PosPersistencia.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/registro-verifactu
node --test tests/unit/registro-verifactu.test.js
```

## Notas de implementación

- Clase `RegistroVerifactu extends ModuloHibridoReflejo`; `name = 'registro-verifactu'`,
  `version = 'reflejo-0.1.0'` (aunque es **custodio**: conserva el versionado reflejo, es el
  patrón real de la vertical). Store en memoria `this._store` (Map project_id →
  `{ esquema:'contabilidad-registro-verifactu-v1', registros:[], por_clave:{},
  ultimo_hash:'GENESIS', escritor:'EMISION_FACTURA' }`).
- Constantes: `ROL_ESCRITOR_REGISTRO = 'EMISION_FACTURA'`, `CODE_DOS_ESCRITORES =
  'ERROR_DOS_ESCRITORES'`, `CODE_REGISTRO_INMUTABLE = 'ERROR_REGISTRO_INMUTABLE'`,
  `CODE_CADENA_ROTA = 'ERROR_CADENA_ROTA'`, `HUELLA_GENESIS = 'GENESIS'`. Usa
  `require('crypto')` para el sha256.
- **PosPersistencia**: `_persist = new PosPersistencia({ modulo, file:
  'registro-verifactu.json', dir: '/contabilidad/registro-verifactu', snapshot, hidratar })`.
  `onProjectActivated` → `restaurar(project_id)`; `onUnload` → `flush()` + `detener()`. Cada
  mutación marca `marcarDirty(pid)`.
- `onAnotarRequest` publica `contabilidad.registro_verifactu_anotado` en éxito y
  `contabilidad.registro.anotar.failed` en fallo; `onVerificarRequest` publica solo el par
  de fallo si `status !== 200`. `onFacturaEmitida` es fire-and-forget (sin `_atender`).
- Proyecciones puras: `_anotar` (append-only + idempotente), `_verificarCadena`, `_listar`,
  `_rechazarMutacion`, `_encadenar`, `_contenidoRegistro`, `_claveDe`,
  `_verificarEscritorUnico` (+ `_obtenerOCrear`). `_invalid`, `_errorResponse` vienen de la
  base.
- Tools: `toolAnotar`, `toolEncadenar`, `toolVerificarCadena`, `toolListar`,
  `toolRechazarMutacion`.
- DEP hacia delante: `contabilidad.registro_verifactu_anotado` lo consumen el cuadro de
  mando y la cara de cumplimiento fiscal. DEP hacia atrás por evento: `emision-factura-venta`
  (O1) publica `contabilidad.factura_emitida`.
