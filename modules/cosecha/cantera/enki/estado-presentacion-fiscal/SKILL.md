---
name: estado-presentacion-fiscal
description: >
  Skill FULL del módulo CUSTODIO `estado-presentacion-fiscal` de la vertical contabilidad
  de Enki. LA MÁQUINA DE ESTADOS CON DUEÑO del ciclo de vida de cada obligación fiscal:
  en qué punto está cada modelo (pendiente → generada → presentada → justificada, con
  `atrasada` como desvío observable) — estados y transiciones DECLARABLES, un solo escritor
  (GESTOR_PRESENTACION_FISCAL), append-only al historial. El sistema GENERA y REGISTRA el
  estado; NO presenta y NO firma. Úsala para operar, depurar o extender el custodio, o para
  entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites mover el estado de una obligación fiscal (RPC
    estado-presentacion-fiscal.avanzar.request) o consultar en qué punto está (RPC
    estado-presentacion-fiscal.estado.request).
  - Cuando depures por qué un avance se rechaza (403 PERMISSION_DENIED si el rol no es
    GESTOR_PRESENTACION_FISCAL, 400 INVALID_INPUT si falta obligación/estado, 422
    ESTADO_NO_DECLARABLE o 422 TRANSICION_NO_DECLARADA) o por qué la lectura sale
    `registrada:false`.
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    invariantes del custodio (un solo escritor, estados/transiciones como DATO, el ciclo no
    se salta, el historial se apendea, persistencia por proyecto).
  - Cuando vayas a escribir/ampliar el test unitario del custodio estado-presentacion-fiscal.
tags: [enki, modulo, custodio, contabilidad, estado-presentacion-fiscal]
---

# estado-presentacion-fiscal — CUSTODIO CON PERSISTENCIA del ciclo de vida fiscal

## Qué hace el módulo

`estado-presentacion-fiscal` es un **CUSTODIO CON PERSISTENCIA** (D12, hoja del plan):
**LA MÁQUINA DE ESTADOS CON DUEÑO** del ciclo de vida de cada obligación fiscal. Sin
este custodio, `calendario-fiscal` (D6) **avisa de los plazos** pero **nadie sabe en qué
punto está cada modelo**. Aquí vive ese punto, y **solo lo mueve un escritor**.

El sistema **GENERA y REGISTRA** el estado; **NO presenta y NO firma**. Los estados
`presentada` / `justificada` se registran porque el **ASESOR los declara** (vienen del
acuse D13): este módulo **NO los infiere**, **NO los da por hechos** y **NO firma nada**.
Cada avance devuelve `presentado_por_sistema:false`.

**LA LEY ENTRA COMO DATO** (invariante 5): los **ESTADOS** y las **TRANSICIONES** son
**DECLARABLES**. El ciclo por defecto es el vocabulario del dominio declarado en el
diseño OOP (`pendiente → generada → presentada → justificada`, con `atrasada` como
desvío observable); si el negocio/asesor declara otro ciclo (`estados_declarables`,
`transiciones`), **ese manda**. **NO se cablea ningún plazo, periodicidad, ejercicio,
fecha ni umbral**: el estado es un **dato que el escritor declara**, no un cálculo legal.

Es un **CUSTODIO con estado**: **UN SOLO ESCRITOR**, el gestor de presentación (rol
`GESTOR_PRESENTACION_FISCAL`). Cualquier otro rol es **rechazado (`403`) sin espera ni
cola**. Cada avance **APPENDEA al historial** de la obligación: el estado anterior **no
se reescribe** (invariante 3).

Persiste por proyecto con **PosPersistencia** (storage
`/contabilidad/estado-presentacion-fiscal/estado-presentacion-fiscal.json`), restaura en
`project.activated` y vuelca en `onUnload`. Proyecciones `_avanzar` (escritura) y
`_estado` (lectura). Publica `contabilidad.obligacion_avanzada`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `estado-presentacion-fiscal.avanzar.request` | `onAvanzarRequest` | RPC custodio (escritura, UN escritor): {project_id, rol, obligacion, estado, estados_declarables?, transiciones?, motivo?, documento?} → {obligacion, estado_anterior, estado, historial_avances, presentado_por_sistema:false}. Mueve la maquina de estados de una obligacion. GUARD de rol: solo GESTOR_PRESENTACION_FISCAL (403 si otro). El estado nuevo debe estar entre los declarados (422 ESTADO_NO_DECLARABLE) y, si la obligacion ya existe, la transicion debe estar declarada (422 TRANSICION_NO_DECLARADA). APPEND-ONLY al historial. Exito → publica contabilidad.obligacion_avanzada y responde por estado-presentacion-fiscal.avanzar.response; fallo → estado-presentacion-fiscal.avanzar.failed. |
| `estado-presentacion-fiscal.estado.request` | `onEstadoRequest` | RPC custodio (lectura, NO muta): {project_id, obligacion?} → {obligacion, registrada, estado, historial} o, sin obligacion, {total, obligaciones:[{obligacion, estado, actualizada_en}], estados_declarados}. Sin registro no se inventa estado (registrada:false + motivo). Responde por estado-presentacion-fiscal.estado.response; fallo (project_id ausente) → estado-presentacion-fiscal.estado.failed. |
| `project.activated` | `onProjectActivated` | Ciclo de vida: restaura el estado persistido del proyecto activado via PosPersistencia.restaurar(project_id). El custodio persiste, por eso se suscribe obligatoriamente a la activacion. |

### Publishes

| Evento | Descripción |
|---|---|
| `estado-presentacion-fiscal.avanzar.response` | Respuesta RPC correlada de estado-presentacion-fiscal.avanzar.request → {request_id, status:200, data:{obligacion, estado_anterior, estado, historial_avances, presentado_por_sistema:false}}. Emitida por el helper _atender. |
| `estado-presentacion-fiscal.avanzar.failed` | Par de fallo determinista (D12): rol no autorizado (403), obligacion/estado ausente (400), estado no declarable (422) o transicion no declarada (422) → {status, error:{code, message, details?}}. Cierra el circulo de estado-presentacion-fiscal.avanzar.request. |
| `estado-presentacion-fiscal.estado.response` | Respuesta RPC correlada de estado-presentacion-fiscal.estado.request → {request_id, status:200, data:{registrada, estado, historial} \| {total, obligaciones, estados_declarados}}. Emitida por el helper _atender. |
| `estado-presentacion-fiscal.estado.failed` | Par de fallo determinista (D12): project_id ausente → {status, error:{code, message}}. Cierra el circulo de estado-presentacion-fiscal.estado.request. |
| `contabilidad.obligacion_avanzada` | Fire-and-forget (D12): una obligacion fiscal cambio de estado → {project_id, obligacion, estado_anterior, estado, avances, correlation_id}. Lo consume el panel/proceso contable para saber en que punto esta cada modelo. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `estado-presentacion-fiscal.avanzar.failed` cierra el círculo de
> `estado-presentacion-fiscal.avanzar.request` cuando `_avanzar` devuelve status ≠ 200
> (`400`/`403`/`422`); `estado-presentacion-fiscal.estado.failed` cierra el de
> `estado-presentacion-fiscal.estado.request` cuando `_estado` devuelve status ≠ 200.

> Nota de honestidad (cruce con `index.js`): `onEstadoRequest` publica
> `estado-presentacion-fiscal.estado.failed` **solo si `_estado` devuelve status ≠ 200**
> — es decir, **solo cuando falta `project_id`**. Una obligación **sin registro NO es un
> fallo**: devuelve `200` con `registrada:false` + `motivo` y **no** publica nada.

> Nota de honestidad (cruce con `index.js`): `onAvanzarRequest` publica
> `contabilidad.obligacion_avanzada` **solo si `_avanzar` devuelve `200`**; la rama `else`
> publica `estado-presentacion-fiscal.avanzar.failed`. La proyección `_avanzar` es
> **síncrona** aunque el handler sea `async`.

> Nota: el módulo expone `estadoDe(pid, obligacion)` como **lectura directa** para otras
> hojas del mismo proceso (no muta) — no es un evento del bus, no figura en `module.json`.

## Reglas de negocio

1. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente →
   `400 INVALID_INPUT` (`field:'project_id'`).
2. **GUARD de escritor**: `input.rol !== 'GESTOR_PRESENTACION_FISCAL'` →
   `403 PERMISSION_DENIED` con `{rol_esperado, rol_recibido}`. Solo un escritor mueve la
   máquina de estados; los demás **no esperan ni hacen cola**.
3. **La obligación es obligatoria**: `String(input.obligacion).trim()`; vacía →
   `400 INVALID_INPUT` (`field:'obligacion'`).
4. **El estado es obligatorio**: `estado` (o su alias `estado_nuevo`); ausente → `400
   INVALID_INPUT` (`field:'estado'`).
5. **Los estados son DECLARABLES**: `_estadosDe(input)` toma `estados_declarables` si es
   un array no vacío; si no, manda el vocabulario del dominio
   `['pendiente','generada','presentada','justificada'] + 'atrasada'`. Un estado que no
   esté entre los declarados → `422 ESTADO_NO_DECLARABLE` con
   `{estado, estados_declarables}`.
6. **El ciclo no se salta**: si la obligación **ya existe**, la transición
   (`estado_anterior → estado_nuevo`) debe estar declarada en `transiciones`; si no →
   `422 TRANSICION_NO_DECLARADA` con `{desde, hasta, transiciones_declarables}`. Si la
   obligación **nace aquí**, el escritor **DECLARA el punto de partida** y no se valida
   transición.
7. **Las transiciones son DECLARABLES**: `_transicionesDe(input, estados)` usa las
   `transiciones` declaradas; sin declaración las **deriva del ORDEN** de los estados
   (cadena `ciclo[i] → ciclo[i+1]`) y, si `atrasada` está en la lista, añade
   `cualquiera → atrasada` y `atrasada → ciclo[0]`.
8. **APPEND-ONLY (invariante 3)**: cada avance **apila** una entrada en `obl.historial`
   (`{estado_anterior, estado, por, en, motivo, documento}`) y una en `c.historial`
   global; `obl.estados` acumula los estados por los que pasó. El estado anterior **no se
   reescribe**.
9. **Sellos**: `ahora = new Date().toISOString()`; `creada_en` al nacer; `actualizada_en`
   en cada avance; `motivo` y `documento` entran tal cual (o `null`, **no se inventan**).
10. **El sistema REGISTRA, no presenta**: la respuesta lleva
    `presentado_por_sistema:false` — la presentación la declara el asesor (vía el acuse D13).
11. **Lectura honesta**: `_estado` con `obligacion` devuelve `{registrada, estado,
    historial, motivo}`; **sin registro no se inventa estado** (`registrada:false`,
    `estado:null`, `motivo`). Sin `obligacion` devuelve `{total, obligaciones, estados_declarados}`.
12. **Persistencia**: `PosPersistencia` con `marcarDirty(pid)` en cada escritura;
    `project.activated` → `restaurar(project_id)` (reconstruye el `Map` de obligaciones);
    `onUnload` → `flush()` + `detener()`.
13. **HTTP exacto**: éxito `200` (con o sin registro); `project_id`/`obligacion`/`estado`
    inválidos → `400`; rol ajeno → `403`; estado/transición no declarados → `422`;
    excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `estado-presentacion-fiscal.avanzar.response` y
`estado-presentacion-fiscal.estado.response`, y emite `contabilidad.obligacion_avanzada`.

### 1. `avanzar` — mover el estado de una obligación (append-only)

```json
{
  "project_id": "e57a318a-...",
  "rol": "GESTOR_PRESENTACION_FISCAL",
  "obligacion": "303-2026-2T",
  "estado": "presentada",
  "motivo": "acuse recibido del asesor",
  "documento": { "justificante": "N-2026-..." },
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "obligacion": "303-2026-2T",
  "estado_anterior": "generada",
  "estado": "presentada",
  "transiciones_declaradas": false,
  "historial_avances": 2,
  "presentado_por_sistema": false
}
```

Emite `contabilidad.obligacion_avanzada`:

```json
{ "project_id": "e57a318a-...", "obligacion": "303-2026-2T", "estado_anterior": "generada", "estado": "presentada", "avances": 2, "correlation_id": "abc-123" }
```

### 2. `estado` — en qué punto está cada obligación (no muta)

Con obligación:

```json
{ "project_id": "e57a318a-...", "obligacion": "303-2026-2T" }
```

Respuesta `200`:

```json
{ "project_id": "e57a318a-...", "obligacion": "303-2026-2T", "registrada": true, "estado": "presentada", "historial": [ { "estado_anterior": null, "estado": "generada", "por": "GESTOR_PRESENTACION_FISCAL", "en": "2026-09-25T...", "motivo": null, "documento": null } ], "motivo": null }
```

Sin obligación (listado):

```json
{ "project_id": "e57a318a-..." }
```

Respuesta `200`:

```json
{ "project_id": "e57a318a-...", "total": 1, "obligaciones": [ { "obligacion": "303-2026-2T", "estado": "presentada", "actualizada_en": "2026-09-25T..." } ], "estados_declarados": ["pendiente","generada","presentada","justificada","atrasada"] }
```

### 3. Fallo — rol no autorizado

```json
{ "project_id": "e57a318a-...", "rol": "OTRO_ROL", "obligacion": "303-2026-2T", "estado": "presentada" }
```

Respuesta `403` + `estado-presentacion-fiscal.avanzar.failed`:

```json
{ "status": 403, "error": { "code": "PERMISSION_DENIED", "message": "solo el gestor de presentacion (GESTOR_PRESENTACION_FISCAL) mueve el estado de la obligacion", "details": { "rol_esperado": "GESTOR_PRESENTACION_FISCAL", "rol_recibido": "OTRO_ROL" } } }
```

### 4. Fallo — se salta el ciclo (transición no declarada)

Obligación ya en `presentada`, petición a `pendiente` (retroceso no declarado):
Respuesta `422` + `estado-presentacion-fiscal.avanzar.failed`:

```json
{ "status": 422, "error": { "code": "TRANSICION_NO_DECLARADA", "message": "la transicion no esta declarada en el ciclo del negocio/asesor", "details": { "desde": "presentada", "hasta": "pendiente", "transiciones_declarables": [ { "desde": "pendiente", "hasta": "generada" }, { "desde": "generada", "hasta": "presentada" }, { "desde": "presentada", "hasta": "justificada" } ] } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/estado-presentacion-fiscal.test.js`. Cubre:

- `avanzar` con rol correcto → `200` con `estado_anterior`/`estado` y emite
  `contabilidad.obligacion_avanzada`.
- Rol distinto de `GESTOR_PRESENTACION_FISCAL` → `403 PERMISSION_DENIED` +
  `estado-presentacion-fiscal.avanzar.failed`.
- Estado no declarable → `422 ESTADO_NO_DECLARABLE`; obligación existente con transición
  no declarada → `422 TRANSICION_NO_DECLARADA`.
- `obligacion`/`estado` vacíos → `400 INVALID_INPUT`; `project_id` ausente → `400`.
- **Append-only**: dos avances encadenan el historial; el estado anterior no se reescribe.
- Ciclo declarable: `estados_declarables`/`transiciones` propios mandan sobre el vocabulario
  del dominio.
- `estado` con obligación sin registro → `200 {registrada:false, motivo}` (no inventa estado);
  sin obligación → `200 {total, obligaciones, estados_declarados}`.
- `project.activated` restaura obligaciones + historial; `estadoDe(pid, obligacion)` lee sin mutar.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `EstadoPresentacionFiscal extends ModuloHibridoReflejo`; `name =
  'estado-presentacion-fiscal'`, `version = 'reflejo-0.1.0'`. Store en memoria
  `this._estados` (`Map<project_id, {esquema, obligaciones: Map<clave, {obligacion, estado,
  estados[], historial[], creada_en, actualizada_en}>, historial[]}>`).
- Constantes: `ROL_ESCRITOR = 'GESTOR_PRESENTACION_FISCAL'`, `CICLO_POR_DEFECTO =
  ['pendiente','generada','presentada','justificada']`, `ESTADO_DESVIO = 'atrasada'`.
- **PosPersistencia**: `_persist = new PosPersistencia({modulo, file:
  'estado-presentacion-fiscal.json', dir: '/contabilidad/estado-presentacion-fiscal',
  snapshot, hidratar})` desde `modules/contabilidad-fiscal/estado-presentacion-fiscal/`
  (DOS niveles → `../../_shared/pos-persistencia`). `onProjectActivated` →
  `restaurar(project_id)`; `onUnload` → `flush()` + `detener()`; cada escritura
  `marcarDirty(pid)`.
- `onAvanzarRequest` usa `this._atender(e, 'avanzar',
  'estado-presentacion-fiscal.avanzar.response', async (d) => {...})`; dentro hace el
  cierre de círculo: en `200` publica `contabilidad.obligacion_avanzada`, si no
  `estado-presentacion-fiscal.avanzar.failed`. `onEstadoRequest` publica
  `estado-presentacion-fiscal.estado.failed` cuando `status !== 200`.
- Proyecciones `_avanzar(input)` (síncrona) y `_estado(input)`; helpers `_estadosDe`,
  `_transicionesDe`, `_obtenerOCrear`; lectura directa `estadoDe(pid, obligacion)`. Tools
  `toolAvanzar` / `toolEstado`.
- `_invalid` / `_errorResponse` vienen de `modulo-hibrido-reflejo`.
- DEP: lo alimenta el acuse D13 por evento (`contabilidad.acuse_ligado`); es la fuente que
  consulta `rectificacion-declaracion` (D14) por RPC para trazar el estado vigente. Convive
  con `calendario-fiscal` (D6), que avisa de los plazos mientras este custodio guarda el punto.
