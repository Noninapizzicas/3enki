---
name: presupuesto
description: >
  Skill FULL del módulo CUSTODIO `presupuesto` de la vertical contabilidad de Enki.
  DONDE EL JEFE FIJA LOS OBJETIVOS: una cifra objetivo por dimensión analítica y por
  periodo, como DECLARACIÓN (nunca inferencia) — sin valor declarado queda `[ABIERTO]`, un
  solo escritor (JEFE_PRESUPUESTO) y todo apilado en historial. Persiste por proyecto con
  PosPersistencia. Úsala para operar, depurar o extender el custodio, o para entender su
  contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites fijar el objetivo de una dimensión (RPC presupuesto.fijar.request) o
    leer lo declarado (RPC presupuesto.objetivo.request).
  - Cuando depures por qué una fijación se rechaza (403 PERMISSION_DENIED si el rol no es
    JEFE_PRESUPUESTO, 400 INVALID_INPUT si falta project_id/dimension/periodo) o por qué el
    objetivo sale `valor:null` con `estado:'ABIERTO'`.
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las invariantes
    del custodio (el JEFE decide y declara, un solo escritor, historial sin sobrescritura,
    persistencia por proyecto).
  - Cuando vayas a escribir/ampliar el test unitario del custodio presupuesto.
tags: [enki, modulo, custodio, contabilidad, presupuesto]
---

# presupuesto — CUSTODIO CON PERSISTENCIA de los objetivos del jefe

## Qué hace el módulo

`presupuesto` es un **CUSTODIO CON PERSISTENCIA** (J3, hoja del plan): **DONDE EL JEFE FIJA
LOS OBJETIVOS**. Este módulo es la **DECLARACIÓN del futuro económico**: una cifra objetivo
por **dimensión analítica** (centro, línea, producto) y por **periodo**.

**NO es una inferencia**: el sistema **NUNCA inventa un objetivo**. Un presupuesto sin cifra
declarada **NO existe** — queda `[ABIERTO]`, con su objetivo en `null` y declarado el hueco.
**Jamás** se rellena con lo real del periodo anterior ni con un `0`: eso sería **decidir por
el jefe** (invariante: **el JEFE DECIDE Y DECLARA**).

Atributos del diseño: `objetivos:Map<Dimension,Cuantía>`.
Métodos: `fijar(d, v)`, `objetivo(d, periodo):Cuantía`. Regla: **cifra objetivo por
dimensión declarable. UN escritor.**

**UN SOLO ESCRITOR**: solo el JEFE (rol `JEFE_PRESUPUESTO`) fija objetivos; cualquier otro
rol es rechazado (**segundo escritor → 403**). `objetivo` es **LECTURA**: no muta nada.

**EL UMBRAL DE AVISO TAMBIÉN ES DECLARABLE**: el jefe declara, junto al objetivo, el umbral a
partir del cual una desviación debe avisar (`umbral`). No se cablea ningún porcentaje:
ausente → `null` y declarado (J4 lo leerá y **no avisará sin umbral declarado**).

**LOS OBJETIVOS SON DATOS APILADOS**: fijar de nuevo la misma `(dimensión, periodo)` **NO
borra** el objetivo anterior — se **apila** en su historial y el vigente queda declarado con
su fecha y autor (`fijado_por`/`fijado_en`). **Jamás se sobrescribe en silencio** (la traza
de lo que el jefe fijó es la fuente de verdad).

Invariantes:

- **El JEFE DECIDE Y DECLARA**: el sistema no infiere objetivos; ausente → `[ABIERTO]`.
- **LEY/PARÁMETRO COMO DATO**: la cifra, el periodo y el umbral son entrada; **cero
  constantes**.
- **Dato ausente = desconocido**: `objetivo` sin valor declarado → `valor:null` y
  `abierto:true`.
- **Un solo escritor por parcela** (guard `JEFE_PRESUPUESTO`).
- **Persiste por proyecto** con `PosPersistencia` (`/contabilidad/presupuesto/presupuesto.json`),
  **restaura** en `project.activated` y **vuelca** en `onUnload`.

Proyecciones `_fijar` (escritura + guard) y `_objetivo` (lectura, no muta). Publica
`contabilidad.presupuesto_fijado` en cada fijación (lo consume `desviacion` J4).

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `presupuesto.fijar.request` | `onFijarRequest` | RPC custodio (UN escritor): {project_id, rol:'JEFE_PRESUPUESTO', dimension, periodo, valor?, umbral?, moneda?, tipo_dimension?} → {project_id, objetivo:{clave:'<periodo>\|<dimension>', dimension, periodo, valor, umbral, estado:'DECLARADO'\|'ABIERTO', historial}, fijado:true, actualizado:false, abierto}. Declara la cifra objetivo (el JEFE decide y declara). Sin valor → estado ABIERTO con valor null (no se inventa objetivo); re-fijar apila en historial sin borrar. Rol distinto de JEFE_PRESUPUESTO → 403 PERMISSION_DENIED. Exito → publica contabilidad.presupuesto_fijado y responde por presupuesto.fijar.response; fallo → presupuesto.fijar.failed. |
| `presupuesto.objetivo.request` | `onObjetivoRequest` | RPC custodio (LECTURA, no muta): {project_id, dimension?, periodo?} → {project_id, periodo, dimension, objetivo:{clave, dimension, periodo, valor, umbral, estado}, declarado, abierto, faltan, motivo} o, sin dimension declarada, {objetivos:[...], declarados, abiertos}. Sin objetivo declarado devuelve valor null y abierto:true con faltan:['valor'] — el sistema pregunta, no decide. Responde por presupuesto.objetivo.response; fallo → presupuesto.objetivo.failed. |
| `project.activated` | `onProjectActivated` | Restaura la parcela de objetivos del proyecto activado desde el storage (PosPersistencia), para que los objetivos que el JEFE declaro sigan vivos tras un reinicio. |

### Publishes

| Evento | Descripción |
|---|---|
| `presupuesto.fijar.response` | Respuesta RPC correlada de presupuesto.fijar.request → {request_id, status:200, data:{objetivo, fijado, actualizado, abierto}}. Emitida por el helper _atender. |
| `presupuesto.fijar.failed` | Par de fallo determinista (J3): project_id/dimension/periodo ausente (INVALID_INPUT) o segundo escritor (PERMISSION_DENIED → 403) → {status, error:{code, message, details?}}. Cierra el circulo de presupuesto.fijar.request. |
| `presupuesto.objetivo.response` | Respuesta RPC correlada de presupuesto.objetivo.request → {request_id, status:200, data:{objetivo, declarado, abierto, faltan}}. Emitida por el helper _atender. |
| `presupuesto.objetivo.failed` | Par de fallo determinista (J3): project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de presupuesto.objetivo.request. |
| `contabilidad.presupuesto_fijado` | Fire-and-forget (J3): el JEFE declaro (o dejo abierto) un objetivo por dimension y periodo → {project_id, clave, dimension, periodo, valor, umbral, abierto, correlation_id}. Lo consume desviacion (J4) para medir real vs presupuesto — es la DECLARACION, no una inferencia. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `presupuesto.fijar.failed` cierra el círculo de `presupuesto.fijar.request`
> (rol distinto de `JEFE_PRESUPUESTO` `403`, o `project_id`/`dimension`/`periodo` ausente
> `400`) y `presupuesto.objetivo.failed` cierra el de `presupuesto.objetivo.request`
> (`project_id` ausente `400`).

> Nota de honestidad (cruce con `index.js`): `onFijarRequest` publica
> `contabilidad.presupuesto_fijado` **solo si `res.status === 200`** (con el payload
> `{project_id, objetivo, clave, dimension, periodo, valor, umbral, abierto, correlation_id}`);
> la rama `else` publica `presupuesto.fijar.failed`. `onObjetivoRequest` publica
> `presupuesto.objetivo.failed` solo si `status !== 200`. `onProjectActivated` **no** usa
> `_atender`: llama directo a `this._persist.restaurar(d.project_id)`.

> Nota: el módulo expone `objetivosDe(pid)` como **lectura directa** para otras hojas del
> mismo proceso (no muta; devuelve `[...parcela.objetivos.values()]` o `[]`) — no es un
> evento del bus, no figura en `module.json`. Tampoco figuran `_guardEscritor`,
> `_obtenerOCrear`, `_clave` ni `_num` (utilidades internas).

## Reglas de negocio

1. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente →
   `400 INVALID_INPUT` (`field:'project_id'`).
2. **GUARD de escritor** (`_guardEscritor`): `_fijar` exige `input.rol ===
   'JEFE_PRESUPUESTO'` (constante `ROL_ESCRITOR`). Cualquier otro rol →
   `403 PERMISSION_DENIED` con `{rol_esperado:'JEFE_PRESUPUESTO', rol_recibido:<rol ??
   null>}` y el mensaje `'solo el JEFE (JEFE_PRESUPUESTO) fija los objetivos: el presupuesto
   es una DECLARACION, no una inferencia'`. **El segundo escritor no espera ni hace cola.**
3. **La dimensión es DATO obligatorio**: `_clave(input.dimension ?? input.centro ??
   input.linea ?? input.producto)`; `null` → `400 INVALID_INPUT` (`field:'dimension'`).
4. **El periodo es DATO obligatorio**: `String(input.periodo).trim()`; vacío →
   `400 INVALID_INPUT` (`field:'periodo'`).
5. **La clave**: `clave = \`${periodo}|${dimension}\`` — **un objetivo por dimensión Y
   periodo** (declarado).
6. **El VALOR objetivo es ParametroDeclarable**: `valor` (o `cifra`) normalizado con `_num`;
   ausente/vacío → `valor:null`, `estado:'ABIERTO'` (**no se estima**). Con valor →
   `estado:'DECLARADO'`, `fijado_por:'JEFE_PRESUPUESTO'`, `fijado_en:ahora`. Sin valor,
   `fijado_en` se conserva o se sella con `ahora`.
7. **El UMBRAL es declarable**: `_num(input.umbral)`; si no se declara en esta fijación se
   **conserva** el anterior (declaración parcial). `moneda` y `tipo_dimension` (o `tipo`) son
   declarables; ausentes → `null` en la creación.
8. **UPSERT sin borrado**: si ya existía el objetivo se **reusa el objeto** (conserva
   `registrado`/historial) → `actualizado:true`; nuevo → `actualizado:false`, `alta`
   implícita por el historial vacío. **Re-fijar NO borra**: se **appendea** a
   `objetivo.historial` un registro `{estado, valor, umbral, por:'JEFE_PRESUPUESTO', en:ahora}`.
9. **`abierto` de la respuesta**: `objetivo.estado === 'ABIERTO'` → `abierto:true`; el
   sistema pregunta, no decide.
10. **`_objetivo` (LECTURA, no muta)**:
    - **Sin dimensión declarada**: devuelve **todos** los objetivos del periodo (o de todos
      los periodos) en `objetivos:[]`, con `abiertos` y `declarados` contados; `objetivo:null`.
    - **Con dimensión y sin objetivo declarado**: `200` con
      `objetivo:{clave, dimension, periodo, valor:null, umbral:null, estado:'ABIERTO'}`,
      `declarado:false`, `abierto:true`, `faltan:['valor']` y `motivo:'el JEFE no ha declarado
      objetivo para esa dimension y periodo: el sistema no inventa objetivos'`.
    - **Con objetivo declarado**: `objetivo:{...o}` (copia), `declarado: o.estado !==
      'ABIERTO'`, `abierto: o.estado === 'ABIERTO'`, `faltan` vacío o `['valor']`.
11. **La parcela** (`_obtenerOCrear`): `{esquema:'contabilidad-presupuesto-v1', objetivos:
    Map<clave, Objetivo>}`. Store `this._parcelas = Map<project_id, Parcela>`.
12. **`_clave(v)`**: `null`/`''` → `null`; objeto → `v.id ?? v.clave ?? v.nombre ?? v.centro
    ?? v.linea ?? v.producto` (recursivo); si no → `String(v)`. **La identidad de la
    dimensión es DATO declarado.**
13. **Persistencia (CUSTODIO)**: `PosPersistencia` con `file:'presupuesto.json'`,
    `dir:'/contabilidad/presupuesto'`, esquema `'contabilidad-presupuesto-v1'`; `snapshot`
    vuelca `[...objetivos.values()]`; `hidratar` reconstruye el `Map` por `clave` (o
    `${periodo}|${dimension}`). `project.activated` → `restaurar(project_id)`; `onUnload` →
    `flush()` + `detener()`. **`marcarDirty(pid)`** en cada escritura.
14. **HTTP exacto**: éxito `200`; rol inválido → `403 PERMISSION_DENIED`;
    `project_id`/`dimension`/`periodo` ausentes → `400 INVALID_INPUT`; excepción en
    `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `presupuesto.fijar.response` y `presupuesto.objetivo.response`; emite
`contabilidad.presupuesto_fijado`.

### 1. `fijar` — el JEFE declara el objetivo

```json
{
  "project_id": "e57a318a-...",
  "rol": "JEFE_PRESUPUESTO",
  "dimension": "C1",
  "periodo": "2026-09",
  "valor": 15000,
  "umbral": 1200,
  "moneda": "EUR",
  "tipo_dimension": "centro",
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "objetivo": {
    "clave": "2026-09|C1",
    "dimension": "C1",
    "periodo": "2026-09",
    "tipo_dimension": "centro",
    "valor": 15000,
    "umbral": 1200,
    "moneda": "EUR",
    "estado": "DECLARADO",
    "fijado_por": "JEFE_PRESUPUESTO",
    "fijado_en": "2026-09-30T...",
    "historial": [ { "estado": "DECLARADO", "valor": 15000, "umbral": 1200, "por": "JEFE_PRESUPUESTO", "en": "2026-09-30T..." } ]
  },
  "fijado": true,
  "actualizado": false,
  "abierto": false
}
```

Emite `contabilidad.presupuesto_fijado` (lo consume `desviacion` J4):

```json
{ "project_id": "e57a318a-...", "objetivo": { "...": "..." }, "clave": "2026-09|C1", "dimension": "C1", "periodo": "2026-09", "valor": 15000, "umbral": 1200, "abierto": false, "correlation_id": "abc-123" }
```

### 2. `fijar` — sin cifra declarada queda `[ABIERTO]` (no se inventa objetivo)

```json
{ "project_id": "e57a318a-...", "rol": "JEFE_PRESUPUESTO", "dimension": "C2", "periodo": "2026-09" }
```

`200` con `objetivo.valor:null`, `objetivo.estado:'ABIERTO'`, `abierto:true`. **El jefe aún
no ha declarado: el sistema pregunta, no decide.**

### 3. `fijar` — re-fijar apila en historial (nada se borra)

Misma `(dimension, periodo)` con `valor:16000` → `200 {actualizado:true}`; el `historial`
**crece** con el nuevo registro y se conserva el anterior. **Nunca se sobrescribe en
silencio.**

### 4. `objetivo` — leer lo declarado (no muta)

```json
{ "project_id": "e57a318a-...", "dimension": "C1", "periodo": "2026-09" }
```

Con objetivo → `200 {objetivo:{...}, declarado:true, abierto:false, faltan:[]}`. Sin
objetivo → `200 {objetivo:{... valor:null, estado:'ABIERTO'}, declarado:false, abierto:true,
faltan:['valor'], motivo:'el JEFE no ha declarado objetivo para esa dimension y periodo: el
sistema no inventa objetivos'}`. Sin `dimension` → la lista completa
`{objetivos:[...], declarados, abiertos}`.

### 5. Fallo — rol inválido (segundo escritor)

Respuesta `403` + `presupuesto.fijar.failed`:

```json
{ "status": 403, "error": { "code": "PERMISSION_DENIED", "message": "solo el JEFE (JEFE_PRESUPUESTO) fija los objetivos: el presupuesto es una DECLARACION, no una inferencia", "details": { "rol_esperado": "JEFE_PRESUPUESTO", "rol_recibido": "OTRO" } } }
```

### 6. Fallo — falta `project_id`, `dimension` o `periodo`

Respuesta `400 INVALID_INPUT` con `{field:'project_id'|'dimension'|'periodo'}` + el par
`failed`.

## Tests

El test unitario de la vertical vive en `tests/unit/presupuesto.test.js`. Cubre:

- `fijar` con rol `JEFE_PRESUPUESTO` → `200 {fijado:true}` con `estado:'DECLARADO'` y emite
  `contabilidad.presupuesto_fijado`.
- Otro rol → `403 PERMISSION_DENIED` + `presupuesto.fijar.failed`.
- Sin `valor` → `estado:'ABIERTO'`, `valor:null` (**el sistema no inventa objetivos**).
- Sin `dimension`/`periodo`/`project_id` → `400 INVALID_INPUT`.
- **Re-fijar la misma clave** → `actualizado:true` y el historial **crece** (nada se
  sobrescribe en silencio).
- `objetivo` sin objetivo declarado → `declarado:false`, `abierto:true`, `faltan:['valor']`
  con motivo; con objetivo → `declarado:true`.
- El umbral declarado se guarda; sin umbral → `null` (**J4 no avisará sin umbral**).
- `project.activated` restaura la parcela vía PosPersistencia; `objetivosDe(pid)` lee sin
  mutar.
- `toolFijar` / `toolObjetivo` devuelven la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `Presupuesto extends ModuloHibridoReflejo`; `name = 'presupuesto'`,
  `version = 'reflejo-0.1.0'`. Store en memoria `this._parcelas`
  (`Map<project_id, {esquema, objetivos: Map<clave, Objetivo>}>`). Esquema
  `'contabilidad-presupuesto-v1'`.
- Constante `ROL_ESCRITOR = 'JEFE_PRESUPUESTO'` (rol único escritor).
- Requiere `../../_shared/modulo-hibrido-reflejo` y `../../_shared/pos-persistencia` (DOS
  niveles desde `modules/contabilidad-analitica/presupuesto/`).
- **PosPersistencia**: `_persist = new PosPersistencia({modulo, file:'presupuesto.json',
  dir:'/contabilidad/presupuesto', snapshot, hidratar})`. `onProjectActivated` →
  `restaurar(project_id)`; `onUnload` → `flush()` + `detener()`; `marcarDirty(pid)` en cada
  escritura.
- `onFijarRequest` → `_atender(e, 'fijar', 'presupuesto.fijar.response', ...)` con cierre de
  círculo (evento de dominio en `200`, par `failed` si no); `onObjetivoRequest` →
  `_atender(e, 'objetivo', 'presupuesto.objetivo.response', ...)`.
- Proyecciones `_fijar` (escritura + GUARD) y `_objetivo` (lectura, no muta); helpers
  `_guardEscritor`, `_obtenerOCrear`; lectura directa `objetivosDe(pid)`. Tools `toolFijar` /
  `toolObjetivo`.
- `_invalid` / `_errorResponse` vienen de `modulo-hibrido-reflejo`.
- **DEP**: lo LEEN `desviacion` (J4) y `comparador-periodos` (J9) vía
  `presupuesto.objetivo.request` (o el evento `contabilidad.presupuesto_fijado`). Emite
  `contabilidad.presupuesto_fijado` en cada fijación.
- **EL JEFE DECIDE Y DECLARA**: el código **no inventa** ningún objetivo, ningún umbral ni
  ningún porcentaje; los guarda **tal como se declaran**.
