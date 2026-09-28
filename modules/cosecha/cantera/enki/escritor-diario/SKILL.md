---
name: escritor-diario
description: >
  Skill FULL del módulo CUSTODIO `escritor-diario` de la vertical contabilidad de Enki
  (B2, hoja del plan). EL CORAZÓN DEL LIBRO: EL ÚNICO ESCRITOR DEL DIARIO. Tres cerrojos
  duros ANTES de escribir: (1) M2 single-writer por parcela — el rol autorizado es
  ADMISION; cualquier otro → 409 ERROR_DOS_ESCRITORES. (2) PARTIDA DOBLE — sum(debe) =
  sum(haber): un descuadre es un ERROR, no un estado → se RECHAZA antes de escribir con
  409 DESCUADRE y se publica contabilidad.asiento_rechazado; NUNCA se escribe un asiento
  que no cuadra. (3) IDEMPOTENCIA por clave natural (M3) — si la clave ya está asentada →
  409 ERROR_DUPLICADO: un hecho = un asiento, reprocesar NO duplica; la clave la da
  clave-natural (M3) por EVENTO cuando el payload no la trae, y si ese RPC no responde NO
  se asienta (503 DEPENDENCIA_NO_DISPONIBLE). Diario APPEND-ONLY (borrable:false).
  Persiste por proyecto vía PosPersistencia. Úsala para operar, depurar o extender el
  custodio, o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites asentar un asiento (RPC contabilidad.asiento.asentar.request), el
    asiento de apertura (contabilidad.asiento.apertura.request), el de cierre
    (contabilidad.asiento.cierre.request) o un ajuste (contabilidad.asiento.ajustar.request
    lo invoca asiento-ajuste B5).
  - Cuando depures por qué se rechaza un asiento (409 ERROR_DOS_ESCRITORES si el rol no es
    ADMISION, 409 DESCUADRE si no cuadra, 409 ERROR_DUPLICADO si la clave ya está asentada,
    422 PRECONDITION_FAILED/INVALID_INPUT, 503 DEPENDENCIA_NO_DISPONIBLE si clave-natural no
    responde).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), los tres
    cerrojos en orden y por qué el diario es append-only.
  - Cuando vayas a escribir/ampliar el test unitario del custodio escritor-diario.
tags: [enki, modulo, custodio, persistencia, contabilidad, escritor-diario, partida-doble, cerrojo]
---

# escritor-diario — CUSTODIO · EL ÚNICO ESCRITOR DEL DIARIO

## Qué hace el módulo

`escritor-diario` es un **CUSTODIO CON PERSISTENCIA** (B2, hoja del plan): **EL CORAZÓN
DEL LIBRO**. Es **el ÚNICO ESCRITOR DEL DIARIO** (M2 `single-writer` por parcela). Antes
de escribir aplica **tres cerrojos duros, en orden**:

1. **GUARD DE UN SOLO ESCRITOR (M2)** — el rol autorizado de la parcela es **`ADMISION`**
   (`ROL_ESCRITOR_DIARIO`), la única puerta del hecho. Cualquier otro rol → **`409
   ERROR_DOS_ESCRITORES`**. *Dos escritores sobre el libro = corrupción esperando turno.*
2. **PARTIDA DOBLE** — la invariante más dura del dominio: **`sum(debe) = sum(haber)`**.
   Un **descuadre es un ERROR, no un estado**: se **RECHAZA antes de escribir** con **`409
   DESCUADRE`** y se publica `contabilidad.asiento_rechazado` (el hecho se declara, **NO se
   asienta**). **Nunca se escribe un asiento que no cuadra.**
3. **IDEMPOTENCIA por clave natural (M3)** — si la **clave ya está asentada** → **`409
   ERROR_DUPLICADO`**: *un hecho = un asiento*, reprocesar **NO duplica**. La clave la da
   `clave-natural` (M3) por **EVENTO** (`contabilidad.clave.calcular.request`) cuando el
   payload no la trae; si ese RPC **no responde** → **`503 DEPENDENCIA_NO_DISPONIBLE`**
   (*sin clave no se asegura idempotencia → NO se asienta*).

El diario es **APPEND-ONLY** (`borrable:false` en cada asiento). Persiste por proyecto con
**PosPersistencia** (storage `/contabilidad/escritor-diario/escritor-diario.json`), restaura
en `project.activated` y vuelca en `onUnload`. **Fire-and-forget**:
`contabilidad.contrapartida_propuesta` (A6.1) → **compone** los apuntes desde el hecho + la
contrapartida recibida (no hay orquestador) y los asienta; sin apuntes ni
`(cuenta + contraparte + importe)` → **`422 CONTRAPARTIDA_INCOMPLETA`** (*no se inventa el
asiento*).

> **NO REUTILIZA**: no existe diario de partida doble en el inventario.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.asiento.asentar.request` | `onAsentarRequest` | RPC custodio (EL escritor del diario): {project_id, rol:'ADMISION', asiento:{tipo?, apuntes:[{cuenta, debe, haber}], clave_natural?, hecho?, fecha_operacion?, fecha_valor?, periodo?}, clave_natural?, unidad_de_cierre?} → {project_id, asiento, clave_natural, cuadrado:true, debe, haber, idempotente:true}. Cerrojos: rol distinto de ADMISION → 409 ERROR_DOS_ESCRITORES; sum(debe)!=sum(haber) → 409 DESCUADRE (RECHAZA antes de escribir y publica contabilidad.asiento_rechazado); clave ya asentada → 409 ERROR_DUPLICADO (un hecho = un asiento). Exito publica contabilidad.asiento_asentado y responde por contabilidad.asiento.asentar.response; errores por contabilidad.asiento.asentar.failed. |
| `contabilidad.asiento.apertura.request` | `onAperturaRequest` | RPC custodio: {project_id, rol:'ADMISION', apertura:{apuntes}, periodo?} → {project_id, asiento, clave_natural, tipo:'APERTURA'}. Misma ley de partida doble. La apertura solo admite un asiento por proyecto (409 ERROR_DUPLICADO si ya existe). Exito publica contabilidad.asiento_asentado y responde por contabilidad.asiento.apertura.response; error → contabilidad.asiento.apertura.failed. |
| `contabilidad.asiento.cierre.request` | `onCierreRequest` | RPC custodio: {project_id, rol:'ADMISION', cierre:{apuntes}, periodo?} → {project_id, asiento, clave_natural, tipo:'CIERRE'}. Misma ley de partida doble; un cierre por periodo (409 ERROR_DUPLICADO). Exito publica contabilidad.asiento_asentado y responde por contabilidad.asiento.cierre.response; error → contabilidad.asiento.cierre.failed. |
| `contabilidad.asiento.ajustar.request` | `onAjustarRequest` | RPC custodio: {project_id, rol:'ADMISION', asiento:{apuntes}, clave_natural?} → asiento de AJUSTE asentado. Pasa por la MISMA ley (partida doble + idempotencia + single-writer). El ajuste SUMA: nunca modifica ni borra un asiento existente. Responde por contabilidad.asiento.ajustar.response y publica contabilidad.asiento_asentado; error → contabilidad.asiento.ajustar.failed. Lo invoca asiento-ajuste (B5). |
| `contabilidad.contrapartida_propuesta` | `onContrapartidaPropuesta` | Fire-and-forget (A6.1 → B2): resolucion-contrapartida propuso la contrapartida de un hecho → {project_id, propuesta:{cuenta, cuenta_contrapartida\|apuntes, importe, periodo}, hecho}. El diario COMPONE los apuntes desde el hecho + la contrapartida (proyeccion interna; no hay orquestador) y los asienta. Si la contrapartida no trae apuntes ni (cuenta+contraparte+importe) → 422 CONTRAPARTIDA_INCOMPLETA: no se inventa el asiento. Exito publica contabilidad.asiento_asentado; descuadre → contabilidad.asiento_rechazado. |
| `project.activated` | `onProjectActivated` | Restaura el diario del proyecto activado desde el storage (PosPersistencia): el diario es POR PROYECTO y APPEND-ONLY. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.asiento_asentado` | Fire-and-forget (B2): un asiento quedo ASENTADO en el diario (partida doble cuadrada, no duplicado) → {project_id, asiento:{id, tipo, apuntes, debe, haber, clave_natural, borrable:false}, clave_natural, cuadrado:true}. Lo consumen mayor-balanza (B3), traza-asiento (B4), estados-contables (C1/C2) y aviso-cuadre (C6). |
| `contabilidad.asiento_rechazado` | Fire-and-forget (B2): un asiento fue RECHAZADO por descuadre (409 DESCUADRE) → {status, error:{code:'DESCUADRE', details:{debe, haber, diferencia, asentado:false}}}. El hecho se declara, NO se asienta: un descuadre es un ERROR, no un estado. |
| `contabilidad.asiento.asentar.failed` | Par de fallo determinista: asentar con rol != ADMISION (409 ERROR_DOS_ESCRITORES), menos de dos apuntes o apunte malformado (422), clave duplicada (409 ERROR_DUPLICADO) o clave-natural (M3) no disponible (503 DEPENDENCIA_NO_DISPONIBLE). Cierra el circulo de contabilidad.asiento.asentar.request. |
| `contabilidad.asiento.apertura.failed` | Par de fallo determinista: apertura sin apuntes validos, con descuadre o ya existente (409 ERROR_DUPLICADO). Cierra el circulo de contabilidad.asiento.apertura.request. |
| `contabilidad.asiento.cierre.failed` | Par de fallo determinista: cierre sin apuntes validos, con descuadre o de un periodo ya cerrado (409 ERROR_DUPLICADO). Cierra el circulo de contabilidad.asiento.cierre.request. |
| `contabilidad.asiento.ajustar.failed` | Par de fallo determinista: ajuste sin apuntes validos, con descuadre, duplicado o rol no autorizado. Cierra el circulo de contabilidad.asiento.ajustar.request. |
| `contabilidad.asiento_asentado.failed` | Par de fallo del evento de dominio contabilidad.asiento_asentado: la emision del hecho de dominio no se completo. |
| `contabilidad.asiento_rechazado.failed` | Par de fallo del evento de dominio contabilidad.asiento_rechazado: la emision del rechazo no se completo. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> `contabilidad.asiento.asentar.failed` cierra `contabilidad.asiento.asentar.request`;
> `contabilidad.asiento.apertura.failed` cierra `contabilidad.asiento.apertura.request`;
> `contabilidad.asiento.cierre.failed` cierra `contabilidad.asiento.cierre.request`;
> `contabilidad.asiento.ajustar.failed` cierra `contabilidad.asiento.ajustar.request`.

> Nota: no está en module.json pero sí lo emite index.js — `_atender` publica
> `contabilidad.asiento.asentar.response`, `contabilidad.asiento.apertura.response`,
> `contabilidad.asiento.cierre.response` y `contabilidad.asiento.ajustar.response` (los
> pares response de los RPC); **NO están declaradas en `publishes`**.

> Nota: declarado en module.json pero NO emitido por index.js (patrón de la vertical: el par
> de fallo real es `<op>.failed`) — `contabilidad.asiento_asentado.failed` y
> `contabilidad.asiento_rechazado.failed` son pares de fallo de eventos de DOMINIO; el
> custodio solo publica los pares `*.failed` de sus RPC (y en descuadre publica además
> `contabilidad.asiento_rechazado`).

> Nota: no está en module.json pero sí lo emite index.js — `onAsentarRequest` y
> `onContrapartidaPropuesta` publican **`contabilidad.asiento.asentar.failed`** por dos vías
> (el par de fallo del RPC y el fallo del flujo de contrapartida); en descuadre publican
> **`contabilidad.asiento_rechazado`** además del par `*.failed`.

## Reglas de negocio

1. **Un solo escritor del diario (M2 · cerrojo 1)**: `_verificarEscritorUnico` exige rol
   `ADMISION` (`ROL_ESCRITOR_DIARIO`, normalizado a mayúsculas). Cualquier otro → **`409
   ERROR_DOS_ESCRITORES`** con `{ message:'el diario tiene UN escritor: solo ADMISION
   asienta', details:{ escritor_vigente:'ADMISION', rol_intentado:<rol>,
   simbolico:'ERROR_DOS_ESCRITORES' } }`. Se aplica también a apertura, cierre y ajuste.
2. **Partida doble (cerrojo 2)**: `_sumas` acumula `debe`/`haber` con tolerancia `EPS =
   0.005`; si `Math.abs(debe - haber) > EPS` → **`409 DESCUADRE`** con
   `{ message:'el asiento NO cuadra: debe <x> != haber <y>', details:{ debe, haber,
   diferencia, simbolico:'DESCUADRE', asentado:false, nota:'un descuadre es un ERROR, no un
   estado: se rechaza ANTES de escribir' } }`. **El asiento NO se escribe**; se publica
   `contabilidad.asiento_rechazado`.
3. **Apuntes bien formados**: cada apunte lleva **debe O haber** (nunca ambos ni ninguno);
   ambos cero o ambos distintos de cero → **`422 INVALID_INPUT`** con
   `{ message:'cada apunte lleva debe O haber (nunca ambos ni ninguno)', details:{ apunte } }`.
   Sin `cuenta` → **`400 INVALID_INPUT apunte.cuenta`**. Menos de dos apuntes → **`422
   PRECONDITION_FAILED`** con `{ n_apuntes }`.
4. **Idempotencia por clave natural (M3 · cerrojo 3 — el más fino)**: `_claveDe` toma la
   clave de `input.clave_natural` o `asiento.clave_natural`; si no la trae, pide
   `contabilidad.clave.calcular.request` a `clave-natural` (M3) por EVENTO (timeout 4000ms).
   Si **no hay clave** (RPC falla o no responde) → **`503 DEPENDENCIA_NO_DISPONIBLE`** con
   `{ dependencia:'clave-natural', accion:'NO_ASENTAR_SIN_CLAVE' }`. Si la clave **ya está
   asentada** → **`409 ERROR_DUPLICADO`** con `{ clave_natural, simbolico:'ERROR_DUPLICADO',
   asentado:false, asiento_existente:<id> }`.
5. **Diario APPEND-ONLY**: `_registrar` crea el asiento con `id = '<pid>-A<n>'`,
   `asentado_por:'ADMISION'`, `asentado_en:<ISO>`, **`borrable:false`**; lo guarda en
   `d.asientos[clave]` y empuja un resumen a `d.diario`. **Un asiento nunca se borra ni se
   modifica**; la corrección SUMA (B5, `asiento-ajuste`).
6. **Apertura única por proyecto**: `_registrarApertura` rechaza si `d.apertura` ya existe
   → **`409 ERROR_DUPLICADO`** con `{ message:'el asiento de apertura ya existe: los saldos
   de apertura son los de cierre, nunca inventados' }`. La clave es
   `apertura:<pid>:<periodo|'ejercicio'>`. *Los saldos de apertura son los de cierre, nunca
   inventados.*
7. **Cierre único por periodo**: `_registrarCierre` usa la clave
   `cierre:<pid>:<periodo|'ejercicio'>`; si ya está en `d.asientos` → **`409
   ERROR_DUPLICADO`** (`'el cierre de ese periodo ya esta asentado'`).
8. **Ajuste SUMA, nunca borra**: `onAjustarRequest` fuerza `tipo:'AJUSTE'` y `suma:true` y
   asienta por la MISMA ley. El ajuste **nunca modifica ni borra** un asiento existente.
9. **Composición desde contrapartida (A6.1)**: `_componerDesdeContrapartida` acepta apuntes
   explícitos (`propuesta.apuntes`) o, si no, compone
   `[{cuenta:cuentaHecho, debe:importe, haber:0},{cuenta:cuentaPropuesta, debe:0, haber:importe}]`.
   Sin `cuenta`, sin contraparte o sin importe > 0 → **`422 PRECONDITION_FAILED`** con
   `{ senal:'CONTRAPARTIDA_INCOMPLETA' }` (*no se inventa el asiento*). El asiento resultante
   es `tipo:'NORMAL'`, `origen:'CONTRAPARTIDA_A6.1'`.
10. **Validaciones deterministas**: falta `project_id` → `400 INVALID_INPUT project_id`;
    `asiento`/`apertura`/`cierre` ausente/no objeto → `400 INVALID_INPUT <campo>`. Shape:
    `{ status:400, error:{ code:'INVALID_INPUT', message:'<campo> requerido', details:{
    field:<campo> } } }`.
11. **El registro es POR PROYECTO**: `store[pid].asientos`, `store[pid].diario`. Sin
    restaurar (`project.activated`) no se puede garantizar la continuidad del diario.
12. **HTTP exacto**: éxito `200`; payload inválido → `400`; rol no-ADMISION / descuadre /
    duplicado → `409`; apuntes malformados / menos de dos → `422`; clave-natural no
    disponible → `503`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responden en `contabilidad.asiento.asentar.response`,
`contabilidad.asiento.apertura.response`, `contabilidad.asiento.cierre.response` y
`contabilidad.asiento.ajustar.response`.

### 1. `asentar` — asentar un asiento (partida doble cuadrada)

```json
{
  "project_id": "e57a318a-...",
  "rol": "ADMISION",
  "asiento": { "tipo": "NORMAL", "apuntes": [ { "cuenta": "430", "debe": 121, "haber": 0 }, { "cuenta": "700", "debe": 0, "haber": 100 }, { "cuenta": "477", "debe": 0, "haber": 21 } ], "fecha_operacion": "2026-09-12", "periodo": "2026-09" },
  "clave_natural": "e57a318a-...:VENTA:9f2c1a7b3e5d0c84",
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "asiento": { "id": "e57a318a-...-A1", "tipo": "NORMAL", "apuntes": [ { "cuenta": "430", "debe": 121, "haber": 0 }, { "cuenta": "700", "debe": 0, "haber": 100 }, { "cuenta": "477", "debe": 0, "haber": 21 } ], "debe": 121, "haber": 121, "clave_natural": "e57a318a-...:VENTA:9f2c1a7b3e5d0c84", "hecho": null, "asentado_por": "ADMISION", "asentado_en": "...", "borrable": false },
  "clave_natural": "e57a318a-...:VENTA:9f2c1a7b3e5d0c84",
  "cuadrado": true,
  "debe": 121,
  "haber": 121,
  "idempotente": true,
  "escritor": "ADMISION"
}
```
Emite `contabilidad.asiento_asentado` (res.data + `correlation_id`).

### 2. `apertura` / `cierre` — los asientos de cabecera del ejercicio

```json
{ "project_id": "e57a318a-...", "rol": "ADMISION", "apertura": { "apuntes": [ { "cuenta": "430", "debe": 5000, "haber": 0 }, { "cuenta": "100", "debe": 0, "haber": 5000 } ] }, "periodo": "2026" }
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "asiento": { "id": "e57a318a-...-A2", "tipo": "APERTURA", "clave_natural": "apertura:e57a318a-...:2026", "borrable": false }, "clave_natural": "apertura:e57a318a-...:2026", "tipo": "APERTURA" }
```
Emite `contabilidad.asiento_asentado`.

### 3. `ajustar` — asiento de AJUSTE (suma, nunca borra; lo invoca B5)

```json
{ "project_id": "e57a318a-...", "rol": "ADMISION", "asiento": { "apuntes": [ { "cuenta": "629", "debe": 50, "haber": 0 }, { "cuenta": "572", "debe": 0, "haber": 50 } ], "clave_natural": null }, "clave_natural": "e57a318a-...:AJUSTE:abc" }
```
Respuesta `200` (forzado `tipo:'AJUSTE'`, `suma:true`); emite `contabilidad.asiento_asentado`.

### 4. Fallo — descuadre → 409 (el asiento NO se escribe)

```json
{ "project_id": "e57a318a-...", "rol": "ADMISION", "asiento": { "apuntes": [ { "cuenta": "430", "debe": 100, "haber": 0 }, { "cuenta": "700", "debe": 0, "haber": 90 } ] }, "clave_natural": "k1" }
```
Respuesta `409` + `contabilidad.asiento_rechazado` + `contabilidad.asiento.asentar.failed`:
```json
{ "status": 409, "error": { "code": "DESCUADRE", "message": "el asiento NO cuadra: debe 100 != haber 90", "details": { "debe": 100, "haber": 90, "diferencia": 10, "simbolico": "DESCUADRE", "asentado": false, "nota": "un descuadre es un ERROR, no un estado: se rechaza ANTES de escribir" } } }
```

### 5. Fallo — rol no ADMISION → 409

```json
{ "project_id": "e57a318a-...", "rol": "OPERADOR", "asiento": { "apuntes": [ { "cuenta": "430", "debe": 10, "haber": 0 }, { "cuenta": "700", "debe": 0, "haber": 10 } ] } }
```
Respuesta `409` + `contabilidad.asiento.asentar.failed`:
```json
{ "status": 409, "error": { "code": "ERROR_DOS_ESCRITORES", "message": "el diario tiene UN escritor: solo ADMISION asienta", "details": { "escritor_vigente": "ADMISION", "rol_intentado": "OPERADOR", "simbolico": "ERROR_DOS_ESCRITORES" } } }
```

### 6. Fallo — clave duplicada / clave no disponible

- Repetir `asentar` con la misma `clave_natural` de un asiento ya asentado → `409
  ERROR_DUPLICADO` con `{ clave_natural, simbolico, asentado:false, asiento_existente }`.
- Sin clave en el payload y `clave-natural` (M3) no responde → `503
  DEPENDENCIA_NO_DISPONIBLE` con `{ dependencia:'clave-natural', accion:'NO_ASENTAR_SIN_CLAVE' }`.

### 7. Entrada fire-and-forget — contrapartida propuesta (A6.1)

Entra `contabilidad.contrapartida_propuesta`:
```json
{ "project_id": "e57a318a-...", "propuesta": { "cuenta": "700", "cuenta_contrapartida": "430", "importe": 100, "periodo": "2026-09" }, "hecho": { "id": "H-1" } }
```
El diario **compone** los apuntes y asienta; emite `contabilidad.asiento_asentado` (o
`contabilidad.asiento_rechazado` si descuadra, o `contabilidad.asiento.asentar.failed` si la
contrapartida es incompleta).

### 8. Tools (sin RPC en module.json)

`toolAsentar` → `_asentar`; `toolRegistrarApertura` → `_registrarApertura`;
`toolRegistrarCierre` → `_registrarCierre`; `toolComponerDesdeContrapartida` →
`_componerDesdeContrapartida`.

## Tests

El test vive en `tests/unit/escritor-diario.test.js`. Cubre:

- `asentar` con `rol:'ADMISION'` y apuntes cuadrados → `200`, `cuadrado:true`, `borrable:false`;
  emite `contabilidad.asiento_asentado`.
- **Partida doble (cerrojo 2)**: un asiento descuadrado → `409 DESCUADRE` +
  `contabilidad.asiento_rechazado` + `*.asentar.failed`; **no** se registra en el diario.
- **Single-writer (cerrojo 1)**: rol distinto de `ADMISION` → `409 ERROR_DOS_ESCRITORES`.
- **Idempotencia (cerrojo 3)**: reasentar la misma clave → `409 ERROR_DUPLICADO`;
  con clave-natural (M3) no disponible → `503 DEPENDENCIA_NO_DISPONIBLE`.
- Apunte con debe Y haber, o ni uno ni otro → `422 INVALID_INPUT`; menos de dos apuntes →
  `422 PRECONDITION_FAILED`.
- `apertura` → `200` con clave `apertura:<pid>:<periodo>`; repetirla → `409 ERROR_DUPLICADO`.
- `cierre` por periodo → `200`; repetirlo → `409 ERROR_DUPLICADO`.
- `ajustar` fuerza `tipo:'AJUSTE'`/`suma:true` y pasa por la misma ley.
- Fire-and-forget `contabilidad.contrapartida_propuesta` → compone y asienta; contrapartida
  incompleta → `422 CONTRAPARTIDA_INCOMPLETA`.
- `project.activated` restaura el diario vía PosPersistencia.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/escritor-diario
node --test tests/unit/escritor-diario.test.js
```

## Notas de implementación

- Clase `EscritorDiario extends ModuloHibridoReflejo`; `name = 'escritor-diario'`,
  `version = 'reflejo-0.1.0'`. Store en memoria `this._store` (Map project_id →
  `{ esquema:'contabilidad-escritor-diario-v1', asientos:{ <clave>:Asiento }, diario:[],
  eventos:[], escritor:'ADMISION' }`).
- Constantes: `ROL_ESCRITOR_DIARIO = 'ADMISION'`, `CODE_DESCUADRE = 'DESCUADRE'`,
  `CODE_DUPLICADO = 'ERROR_DUPLICADO'`, `CODE_DOS_ESCRITORES = 'ERROR_DOS_ESCRITORES'`,
  `EPS = 0.005`.
- **PosPersistencia**: `_persist = new PosPersistencia({ modulo, file:
  'escritor-diario.json', dir: '/contabilidad/escritor-diario', snapshot, hidratar })`.
  `onProjectActivated` → `restaurar(project_id)`; `onUnload` → `flush()` + `detener()`.
  Cada mutación marca `marcarDirty(pid)`.
- `onAsentarRequest`/`onAperturaRequest`/`onCierreRequest`/`onAjustarRequest` delegan en
  `_atender(e, '<op>', 'contabilidad.asiento.<op>.response', fn)`; en descuadre
  `onAsentarRequest` publica `contabilidad.asiento_rechazado` **y** `*.asentar.failed`.
  `onContrapartidaPropuesta` es fire-and-forget (sin `_atender`) y publica según el juicio
  (asentado / rechazado / failed).
- Proyecciones puras: `_asentar` (async, tres cerrojos), `_registrarApertura`,
  `_registrarCierre`, `_componerDesdeContrapartida`, `_validarSinClave`, `_sumas`,
  `_claveDe` (async, EVENTO M3), `_registrar`, `_verificarEscritorUnico`, `_obtenerOCrear`.
  `_rpc`/`_invalid`/`_errorResponse` vienen de la base.
- Tools: `toolAsentar`, `toolRegistrarApertura`, `toolRegistrarCierre`,
  `toolComponerDesdeContrapartida`.
- DEP hacia delante: `contabilidad.asiento_asentado` lo consumen `mayor-balanza` (B3),
  `traza-asiento` (B4), `asiento-ajuste` (B5), `estados-contables` (C1/C2) y `aviso-cuadre`
  (C6). DEP por evento: `clave-natural` (M3) da la clave; `resolucion-contrapartida` (A6.1)
  publica `contabilidad.contrapartida_propuesta`.
