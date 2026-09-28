---
name: estado-presentacion-fiscal
description: >
  Skill FULL del módulo CUSTODIO `estado-presentacion-fiscal` de la vertical contabilidad
  de Enki (D12, hoja del plan). EL CICLO DE VIDA DE CADA OBLIGACION FISCAL: PENDIENTE →
  GENERADA → PRESENTADA → JUSTIFICADA, y ATRASADA cuando el plazo declarado pasa sin
  presentarse. EL SISTEMA PREPARA, EL ASESOR PRESENTA — invariante cableada en el GUARD:
  el rol SISTEMA puede llevar la obligación hasta GENERADA (prepara el modelo) pero NO
  puede marcarla PRESENTADA ni JUSTIFICADA → 409 ERROR_EL_SISTEMA_NO_PRESENTA (salvo que se
  DECLARE lo contrario: presenta_por_sistema:true + declarado:true). El avance es MONOTONO:
  no se retrocede (409 ERROR_TRANSICION_NO_MONOTONA) y un estado final no vuelve al ciclo —
  lo que hay que corregir DESPUÉS de presentar es una RECTIFICACION (D14), no un retroceso.
  El sistema NO presenta: el estado REFLEJA lo que pasó (preparado_por / presentado_por /
  justificante / historial). Persiste por proyecto vía PosPersistencia. Úsala para operar,
  depurar o extender el custodio, o para entender su contrato de eventos.
when-to-use: >
  - Cuando necesites avanzar una obligación en su ciclo (RPC
    contabilidad.obligacion.avanzar.request) o consultar su estado (contabilidad.obligacion.estado.request).
  - Cuando depures por qué se rechaza (409 ERROR_DOS_ESCRITORES si el rol no es SISTEMA/ASESOR,
    409 ERROR_EL_SISTEMA_NO_PRESENTA si SISTEMA intenta PRESENTAR, 409 ERROR_TRANSICION_NO_MONOTONA
    si retrocede o toca un estado final, 422 ESTADO_NO_VALIDO si el estado sale del ciclo).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), el ciclo de vida en
    orden, la monotonía y por qué el sistema no se auto-presenta.
  - Cuando vayas a escribir/ampliar el test unitario del custodio estado-presentacion-fiscal.
tags: [enki, modulo, custodio, persistencia, contabilidad, estado-presentacion-fiscal, obligacion, monotono]
---

# estado-presentacion-fiscal — CUSTODIO del ciclo de vida de la obligación fiscal

## Qué hace el módulo

`estado-presentacion-fiscal` es un **CUSTODIO CON PERSISTENCIA** (D12, hoja del plan): **EL
CICLO DE VIDA DE CADA OBLIGACION FISCAL**:

```
PENDIENTE → GENERADA → PRESENTADA → JUSTIFICADA
```

y, cuando el plazo declarado pasa sin llegar a PRESENTADA, **`ATRASADA`**. Sin este estado,
el calendario (D6) avisa pero **NADIE SABE EN QUE PUNTO está cada modelo**.

**EL SISTEMA PREPARA, EL ASESOR PRESENTA — invariante dura, cableada en el GUARD**: el rol
`SISTEMA` puede llevar la obligación hasta **GENERADA** (el sistema prepara el modelo), pero
**NO puede marcarla PRESENTADA ni JUSTIFICADA** — eso es del `ASESOR`. Un sistema que se
auto-presenta es un sistema que **miente sobre lo que hizo**. La única excepción es una
**declaración explícita**: `presenta_por_sistema:true` **y** `declarado:true` (lo que permite
`perfil-administrativo`). Sin ella → **`409 ERROR_EL_SISTEMA_NO_PRESENTA`**.

**El avance es MONOTONO**: no se retrocede (`idxDestino < idxActual` → **`409
ERROR_TRANSICION_NO_MONOTONA`**), y un **estado final** (`JUSTIFICADA`, `ATRASADA`) no vuelve
al ciclo → también **`409 ERROR_TRANSICION_NO_MONOTONA`**. **Lo que hay que corregir DESPUÉS
de presentar es una RECTIFICACION (D14), no un retroceso de estado** (`correccion:
'RECTIFICACION_D14 (no un retroceso de estado)'`).

**El sistema NO presenta: el estado REFLEJA lo que pasó** (`preparado_por`, `presentado_por`,
`justificante`, `historial`), no lo que el sistema hizo. Toda respuesta lleva
`el_sistema_presenta:false` y `monotono:true`.

**Un solo escritor**: `SISTEMA` o `ASESOR`; cualquier otro → **`409 ERROR_DOS_ESCRITORES`**.

Persiste por proyecto con **PosPersistencia** (storage
`/contabilidad/estado-presentacion-fiscal/estado-presentacion-fiscal.json`), restaura en
`project.activated` y vuelca en `onUnload`. La dependencia con `perfil-administrativo` (D15,
QUÉ obligaciones aplican) y `calendario-fiscal` (D6, CUÁNDO vencen) es **por EVENTO, NUNCA por
`require` cruzado**.

> **NO REUTILIZA**: no existe estado de obligación fiscal en el inventario.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response + ciclo de vida)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.obligacion.avanzar.request` | `onAvanzarRequest` | RPC custodio: {project_id, rol:'SISTEMA'\|'ASESOR', obligacion, estado:'PENDIENTE'\|'GENERADA'\|'PRESENTADA'\|'JUSTIFICADA'\|'ATRASADA', justificante?, motivo?, quien?, cuando?, presenta_por_sistema?, declarado?} → {project_id, obligacion, estado, estado_anterior, lo_preparo, lo_presento, monotono:true, el_sistema_presenta:false}. Cerrojos: rol fuera de SISTEMA/ASESOR → 409 ERROR_DOS_ESCRITORES; SISTEMA intentando PRESENTADA/JUSTIFICADA → 409 ERROR_EL_SISTEMA_NO_PRESENTA (el sistema PREPARA, el asesor PRESENTA — salvo declaracion explicita); retroceso de estado → 409 ERROR_TRANSICION_NO_MONOTONA (la correccion posterior es RECTIFICACION D14); estado fuera del ciclo → 422. Publica contabilidad.obligacion_avanzada y responde por contabilidad.obligacion.avanzar.response; error → contabilidad.obligacion.avanzar.failed. |
| `contabilidad.obligacion.estado.request` | `onEstadoRequest` | RPC custodio de lectura: {project_id, obligacion?} → {project_id, obligacion, existe, estado, paso_actual, ciclo, final, preparado_por, presentado_por, justificante, historial} — o el resumen con todas las obligaciones si no se indica una. Una obligacion no declarada se DICE (existe:false, asumido:false): no se asume un progreso. Responde por contabilidad.obligacion.estado.response; si falta project_id → contabilidad.obligacion.estado.failed. |
| `project.activated` | `onProjectActivated` | Restaura del storage (PosPersistencia) el estado de las obligaciones del proyecto activado: el ciclo de vida es POR PROYECTO y queda trazado en el historial de transiciones. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.obligacion_avanzada` | Fire-and-forget (D12): la obligacion fiscal avanzo en su ciclo de vida → {project_id, obligacion:{obligacion, modelo, periodo, ejercicio, estado, historial, preparado_por, presentado_por, justificante}, estado, estado_anterior, lo_preparo, lo_presento, monotono:true, el_sistema_presenta:false}. Refleja lo que paso: el sistema NO presenta. |
| `contabilidad.obligacion.avanzar.failed` | Par de fallo determinista: avanzar sin project_id/obligacion/estado, con rol fuera de SISTEMA/ASESOR (409 ERROR_DOS_ESCRITORES), con SISTEMA intentando PRESENTAR (409 ERROR_EL_SISTEMA_NO_PRESENTA), con retroceso (409 ERROR_TRANSICION_NO_MONOTONA) o con estado fuera del ciclo (422). Cierra el circulo de contabilidad.obligacion.avanzar.request. |
| `contabilidad.obligacion.estado.failed` | Par de fallo determinista: estado sin project_id. Cierra el circulo de contabilidad.obligacion.estado.request. |
| `contabilidad.obligacion_avanzada.failed` | Par de fallo del evento de dominio contabilidad.obligacion_avanzada: la emision del hecho de dominio no se completo. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> `contabilidad.obligacion.avanzar.failed` cierra
> `contabilidad.obligacion.avanzar.request`; `contabilidad.obligacion.estado.failed` cierra
> `contabilidad.obligacion.estado.request`.

> Nota: no está en module.json pero sí lo emite index.js — `_atender` publica
> `contabilidad.obligacion.avanzar.response` y `contabilidad.obligacion.estado.response` (los
> pares response de los RPC); **NO están declaradas en `publishes`**.

> Nota: declarado en module.json pero NO emitido por index.js (patrón de la vertical: el par
> de fallo real es `<op>.failed`) — `contabilidad.obligacion_avanzada.failed` es el par del
> evento de DOMINIO; el custodio solo publica los pares `*.failed` de sus RPC.

> Nota de sub-declaración: `_estadoDe` **NO está expuesto por el RPC como tal** — el RPC usa
> `_estadoDePayload`, que reutiliza `_estadoDe` por obligación o devuelve el resumen de todas.
> La dependencia con D15/D6 se declara por EVENTO pero **no hay `_rpc` hacia ellos en
> `index.js`** (el estado no los consulta en el camino actual).

## Reglas de negocio

1. **EL CICLO, EN ORDEN (el avance es monotono)**: `CICLO = ['PENDIENTE','GENERADA',
   'PRESENTADA','JUSTIFICADA']`; `ATRASADA` es un **desenlace por plazo**, no un escalón del
   ciclo (y no está en `CICLO`). Estados finales: `FINALES = {JUSTIFICADA, ATRASADA}`.
2. **Estado fuera del ciclo → 422**: `destino !== 'ATRASADA' && !CICLO.includes(destino)` →
   **`422 ESTADO_NO_VALIDO`** (`ciclo:CICLO`, `fuera_de_ciclo:['ATRASADA']`).
3. **EL SISTEMA PREPARA, EL ASESOR PRESENTA (invariante dura)**: si `rol === 'SISTEMA'` y el
   destino es `PRESENTADA` o `JUSTIFICADA` → **`409 ERROR_EL_SISTEMA_NO_PRESENTA`** salvo
   `input.presenta_por_sistema === true && input.declarado === true`. El error lleva
   `{estado_intentado, rol, rol_que_presenta:'ASESOR', permitido_si_declarado:true,
   declarado:false, simbolico:'ERROR_EL_SISTEMA_NO_PRESENTA'}`.
4. **MONOTONO: no se retrocede**: `idxDestino < idxActual` → **`409
   ERROR_TRANSICION_NO_MONOTONA`** (`estado_actual, estado_intentado,
   correccion:'RECTIFICACION_D14 (no un retroceso de estado)', simbolico`).
5. **Un estado final no vuelve al ciclo**: si `FINALES.has(actual.estado)` y
   `destino !== 'ATRASADA'` → **`409 ERROR_TRANSICION_NO_MONOTONA`** (`'estado final: no
   vuelve al ciclo'`).
6. **Un solo escritor (D12)**: `_verificarEscritorUnico` exige rol en **{SISTEMA, ASESOR}**
   (normalizado a mayúsculas). Cualquier otro → **`409 ERROR_DOS_ESCRITORES`**
   (`escritor_vigente:['SISTEMA','ASESOR']`). Mensaje: *«el estado de presentacion tiene UN
   escritor: SISTEMA (prepara) o ASESOR (presenta)»*.
7. **La obligación se crea al primer avance**: `_avanzar` si `d.obligaciones[id]` no existe,
   crea `{obligacion, modelo, periodo, ejercicio, sociedad, estado:'PENDIENTE', historial:[],
   preparado_por:null, presentado_por:null, justificante:null, creado_en}`.
8. **Cada transición queda trazada**: `{de, a, rol, quien (payload o rol), cuando (payload o
   ahora), justificante, motivo, declarado}` se empuja al `historial` de la obligación y a
   `d.transiciones`. Efectos laterales: `GENERADA` → `preparado_por=rol, preparado_en`;
   `PRESENTADA` → `presentado_por=rol, presentado_en`; `JUSTIFICADA` → `justificado_en`;
   `ATRASADA` → `atrasada_en`. El `justificante` se fija si viene en la transición.
9. **El sistema no presenta (toda respuesta lo declara)**: `_avanzar` y `_estadoDe` devuelven
   `el_sistema_presenta:false`; `_avanzar` además `monotono:true`, `lo_preparo`,
   `lo_presento`.
10. **Una obligación no declarada se DICE**: `_estadoDe` con obligación inexistente → `200`
    con `{existe:false, estado:'PENDIENTE', paso_actual:0, ciclo:CICLO, asumido:false}` —
    **no se asume un progreso**. `paso_actual` es el índice del estado en `CICLO` (o
    `CICLO.length` si no pertenece, p. ej. `ATRASADA`).
11. **El RPC de lectura resuelve resumen o detalle**: `_estadoDePayload` sin `obligacion` →
    `{obligaciones:[...], n_obligaciones, ciclo:CICLO, el_sistema_presenta:false}`; con
    `obligacion` → delega en `_estadoDe`.
12. **El ciclo es POR PROYECTO**: `store[pid]` con
    `{esquema:'contabilidad-estado-presentacion-fiscal-v1', obligaciones:{}, transiciones:[],
    escritor:['SISTEMA','ASESOR']}`. Sin restaurar (`project.activated`) el historial no se
    puede garantizar.
13. **Validaciones deterministas**: falta `project_id` → `400 INVALID_INPUT project_id`;
    sin `obligacion` → `400 INVALID_INPUT obligacion`; sin `estado` → `400 INVALID_INPUT
    estado`. Shape: `{status:400, error:{code:'INVALID_INPUT', message:'<campo> requerido',
    details:{field:<campo>}}}`.
14. **HTTP exacto**: éxito `200`; payload inválido → `400`; segundo escritor / sistema
    intentando presentar / retroceso / estado final → `409`; estado fuera del ciclo → `422`;
    excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPCs que responden en `contabilidad.obligacion.avanzar.response` y
`contabilidad.obligacion.estado.response`.

### 1. `avanzar` — el SISTEMA prepara (hasta GENERADA)

```json
{ "project_id": "e57a318a-...", "rol": "SISTEMA", "obligacion": "303-3T-2026", "modelo": "303", "periodo": "3T", "ejercicio": 2026, "estado": "GENERADA", "correlation_id": "abc-123" }
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "obligacion": { "obligacion": "303-3T-2026", "modelo": "303", "periodo": "3T", "ejercicio": 2026, "estado": "GENERADA", "historial": [ { "de": "PENDIENTE", "a": "GENERADA", "rol": "SISTEMA", "quien": "SISTEMA", "cuando": "..." } ], "preparado_por": "SISTEMA", "presentado_por": null, "justificante": null },
  "id_obligacion": "303-3T-2026",
  "estado": "GENERADA",
  "estado_anterior": "PENDIENTE",
  "presentado_por": null,
  "lo_preparo": "SISTEMA",
  "lo_presento": null,
  "monotono": true,
  "el_sistema_presenta": false
}
```

Emite `contabilidad.obligacion_avanzada` (res.data + `correlation_id`).

### 2. `avanzar` — el ASESOR presenta

```json
{ "project_id": "e57a318a-...", "rol": "ASESOR", "obligacion": "303-3T-2026", "estado": "PRESENTADA", "justificante": "JUST-303-3T", "quien": "asesor@gestoria.es" }
```

Respuesta `200`: `estado:'PRESENTADA'`, `presentado_por:'ASESOR'`, `justificante:'JUST-303-3T'`,
`monotono:true`, `el_sistema_presenta:false`.

### 3. Fallo — SISTEMA intenta PRESENTAR → 409

```json
{ "project_id": "e57a318a-...", "rol": "SISTEMA", "obligacion": "303-3T-2026", "estado": "PRESENTADA" }
```

Respuesta `409` + `contabilidad.obligacion.avanzar.failed`:

```json
{ "status": 409, "error": { "code": "ERROR_EL_SISTEMA_NO_PRESENTA", "message": "el sistema PREPARA, el asesor PRESENTA: SISTEMA no puede marcar una obligacion como PRESENTADA", "details": { "estado_intentado": "PRESENTADA", "rol": "SISTEMA", "rol_que_presenta": "ASESOR", "permitido_si_declarado": true, "declarado": false, "simbolico": "ERROR_EL_SISTEMA_NO_PRESENTA" } } }
```

### 4. Fallo — retroceso → 409 ERROR_TRANSICION_NO_MONOTONA

```json
{ "project_id": "e57a318a-...", "rol": "ASESOR", "obligacion": "303-3T-2026", "estado": "GENERADA" }
```

(estaba en `PRESENTADA`) → Respuesta `409` con
`correccion:'RECTIFICACION_D14 (no un retroceso de estado)'` + `contabilidad.obligacion.avanzar.failed`.

### 5. Fallo — estado fuera del ciclo → 422

```json
{ "project_id": "e57a318a-...", "rol": "ASESOR", "obligacion": "303-3T-2026", "estado": "ENVIADA" }
```

→ `422 ESTADO_NO_VALIDO` (`ciclo:CICLO`, `fuera_de_ciclo:['ATRASADA']`) +
`contabilidad.obligacion.avanzar.failed`.

### 6. `estado` — detalle de una obligación

```json
{ "project_id": "e57a318a-...", "obligacion": "303-3T-2026" }
```

Respuesta `200`:

```json
{ "project_id": "e57a318a-...", "obligacion": "303-3T-2026", "existe": true, "estado": "PRESENTADA", "paso_actual": 2, "ciclo": ["PENDIENTE", "GENERADA", "PRESENTADA", "JUSTIFICADA"], "final": false, "preparado_por": "SISTEMA", "presentado_por": "ASESOR", "justificante": "JUST-303-3T", "historial": [ "..." ], "el_sistema_presenta": false }
```

### 7. `estado` — resumen (sin obligación)

```json
{ "project_id": "e57a318a-..." }
```

→ `200` con `{obligaciones:[...], n_obligaciones, ciclo:CICLO, el_sistema_presenta:false}`.

### 8. Tools (sin RPC en module.json)

`toolAvanzar` → `_avanzar`; `toolEstadoDe` → `_estadoDe`.

## Tests

El test viviría en `tests/unit/estado-presentacion-fiscal.test.js`. Cubre:

- `avanzar` SISTEMA → `GENERADA` → `200`, `preparado_por:'SISTEMA'`,
  `el_sistema_presenta:false`, `monotono:true`; emite `contabilidad.obligacion_avanzada`.
- `avanzar` ASESOR → `PRESENTADA`/`JUSTIFICADA` → `200` con `presentado_por:'ASESOR'`.
- **Invariante dura**: SISTEMA intentando `PRESENTADA`/`JUSTIFICADA` → `409
  ERROR_EL_SISTEMA_NO_PRESENTA`; **con** `presenta_por_sistema:true + declarado:true` → `200`.
- **Monotonía**: retroceso → `409 ERROR_TRANSICION_NO_MONOTONA` (`correccion:
  'RECTIFICACION_D14...'`); estado final (`JUSTIFICADA`) intentando volver → `409`.
- **Estado fuera del ciclo** → `422 ESTADO_NO_VALIDO`.
- **Single-writer**: rol distinto de SISTEMA/ASESOR → `409 ERROR_DOS_ESCRITORES`.
- `estado` de una obligación existente → `existe:true`, `paso_actual`, `historial`;
  inexistente → `existe:false`, `asumido:false`.
- `estado` sin obligación → resumen con todas.
- Sin `project_id`/`obligacion`/`estado` → `400 INVALID_INPUT` + par `*.failed`.
- `project.activated` restaura obligaciones y transiciones vía PosPersistencia.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/estado-presentacion-fiscal
node --test tests/unit/estado-presentacion-fiscal.test.js
```

## Notas de implementación

- Clase `EstadoPresentacionFiscal extends ModuloHibridoReflejo`; `name =
  'estado-presentacion-fiscal'`, `version = 'reflejo-0.1.0'` (aunque es **custodio**:
  conserva el versionado reflejo, es el patrón real de la vertical). Store en memoria
  `this._store` (Map project_id → `{esquema:'contabilidad-estado-presentacion-fiscal-v1',
  obligaciones:{}, transiciones:[], escritor:['SISTEMA','ASESOR']}`).
- Constantes: `ROLES_AUTORIZADOS = Set('SISTEMA','ASESOR')`, `ROL_PRESENTA = 'ASESOR'`,
  `ROL_PREPARA = 'SISTEMA'`, `CODE_DOS_ESCRITORES = 'ERROR_DOS_ESCRITORES'`,
  `CODE_NO_PRESENTA = 'ERROR_EL_SISTEMA_NO_PRESENTA'`, `CODE_RETROCESO =
  'ERROR_TRANSICION_NO_MONOTONA'`, `CICLO = ['PENDIENTE','GENERADA','PRESENTADA',
  'JUSTIFICADA']`, `ESTADO_ATRASADO = 'ATRASADA'`, `FINALES = Set('JUSTIFICADA','ATRASADA')`.
- **PosPersistencia**: `_persist = new PosPersistencia({modulo,
  file:'estado-presentacion-fiscal.json', dir:'/contabilidad/estado-presentacion-fiscal',
  snapshot, hidratar})`. `onProjectActivated` → `restaurar(project_id)`; `onUnload` →
  `flush()` + `detener()`. Cada mutación marca `marcarDirty(pid)`.
- `onAvanzarRequest` delega en `_atender(e, 'avanzar',
  'contabilidad.obligacion.avanzar.response', fn)` y publica
  `contabilidad.obligacion_avanzada` en éxito o el par `*.failed`. `onEstadoRequest` usa
  `_estadoDePayload` y solo publica el par en fallo.
- Proyecciones puras: `_avanzar`, `_estadoDe`, `_estadoDePayload`, `_verificarEscritorUnico`
  (+ `_obtenerOCrear`). `_atender`, `_invalid` y `_errorResponse` vienen de la base.
- Tools: `toolAvanzar`, `toolEstadoDe`.
- DEP hacia delante: `contabilidad.obligacion_avanzada` traza el ciclo. DEP hacia atrás por
  evento: `perfil-administrativo` (D15, QUÉ obligaciones aplican) y `calendario-fiscal` (D6,
  CUÁNDO vencen) por EVENTO — aunque el camino RPC actual no los consulta directamente.
  Rectificacion-declaracion (D14) LEE este estado (`contabilidad.obligacion.estado.request`)
  para decidir si una declaración es rectificable.
