---
name: presupuesto
description: >
  Skill FULL del módulo CUSTODIO `presupuesto` de la vertical contabilidad de Enki
  (J3 + J4 + J9, hoja del plan). DONDE EL JEFE FIJA LOS OBJETIVOS. Tres clases en una
  parcela: J3 `_declarar(rol, dimension, cifra)` — la cifra OBJETIVO por dimensión es una
  DECLARACIÓN, NO una inferencia (nunca se estima de la historia); J4 `_calcular(real,
  presupuesto)` + `_dispararSiExcede` — desviación real vs objetivo con el UMBRAL
  DECLARADO, que dispara aviso a motor-avisos (K2); J9 `_comparar(a, b)` — comparador de
  periodos que REUTILIZA objetivo y desviación sin duplicarlos. GUARD DE UN SOLO ESCRITOR:
  solo el JEFE declara (otro rol → 409 ERROR_DOS_ESCRITORES); un rol distinto puede LEER.
  SIN UMBRAL DECLARADO la desviación se CALCULA igual pero NO se dispara aviso
  (UMBRAL_NO_DECLARADO); el objetivo no declarado queda ABIERTO, jamás se asume. Persiste
  por proyecto con PosPersistencia. Úsala para operar, depurar o extender el custodio, o
  para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando el JEFE fije la cifra objetivo de una dimensión (RPC
    contabilidad.presupuesto.declarar.request), cuando haya que medir la desviación real vs
    objetivo (contabilidad.desviacion.calcular.request) o comparar periodos
    (contabilidad.periodos.comparar.request).
  - Cuando depures por qué se rechaza (409 ERROR_DOS_ESCRITORES si el rol no es JEFE, 400
    INVALID_INPUT si falta project_id/dimension/cifra, 422 TIPO_COMPARACION_NO_VALIDO o 422
    COMPARACION_INCOMPLETA) o por qué no se dispara el aviso (UMBRAL_NO_DECLARADO si no hay
    umbral declarado; 503 si K2 no responde).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), la invariante
    «la cifra objetivo es una declaración, no una inferencia» y la reutilización J3/J4 en J9.
  - Cuando vayas a escribir/ampliar el test unitario del custodio presupuesto.
tags: [enki, modulo, custodio, persistencia, contabilidad, presupuesto, jefe, desviacion]
---

# presupuesto — CUSTODIO donde el JEFE fija los objetivos

## Qué hace el módulo

`presupuesto` es un **CUSTODIO CON PERSISTENCIA** (J3 + J4 + J9, hoja del plan): **DONDE EL
JEFE FIJA LOS OBJETIVOS**. Tres clases en una parcela:

- **J3 Presupuesto** — la cifra **OBJETIVO** por dimensión, **DECLARADA** (no inferida).
- **J4 Desviación** — **real vs presupuesto** con el **UMBRAL DECLARADO**; dispara señal a
  K2 si se sale.
- **J9 ComparadorPeriodos** — ejercicio vs ejercicio, mes vs mes, real vs presupuesto —
  **REUTILIZA** ambos, **NO los duplica**.

**LA CIFRA OBJETIVO ES UNA DECLARACIÓN, NO UNA INFERENCIA**: el presupuesto no se «estima»
a partir de la historia. **El JEFE lo declara.** **GUARD de un solo escritor** (M2/J3): solo
`JEFE` declara la cifra objetivo; cualquier otro rol se rechaza con **`409
ERROR_DOS_ESCRITORES`**. Un rol distinto **puede LEER** (objetivo/comparar), nunca escribir.

**EL UMBRAL DE DESVIACIÓN ES DECLARABLE**: sin umbral declarado la desviación **se CALCULA
igual** (es real vs objetivo) pero **NO se dispara aviso** — se declara
**`UMBRAL_NO_DECLARADO`**. **Jamás se asume un umbral.** El objetivo no declarado queda
**`ABIERTO`** (`estado:'ABIERTO'`, `objetivo:null`): **no se asume**.

**CUSTODIO (patrón real)**: store en memoria (`presupuestos` por dimensión/periodo/concepto +
`secuencia` append-only de declaraciones) con **PosPersistencia** (storage
`/contabilidad/presupuesto/presupuesto.json`); restaura en `project.activated` y vuelca en
`onUnload`. La desviación se **DISPARA** a motor-avisos (**K2**) por **EVENTO**
`contabilidad.aviso.solicitar.request` (tipo `AVISO_SANGRIA`, familia `ANALITICA`,
destinatario `DUENO`), **NUNCA por `require` cruzado**; si K2 no responde se publica
`contabilidad.aviso.solicitar.failed` y **NUNCA se fabrica el aviso**. El real puede
derivarse de `estados-contables` (C2) por EVENTO `contabilidad.estado.resultado.request`
(contrato **TOLERANTE**).

> **NO REUTILIZA**: `marketing-budget` es presupuesto de marketing y declara «custodia
> contable» solo de nombre: contabilidad lo **LEE**, no lo absorbe (solape registrado).

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.presupuesto.declarar.request` | `onDeclararRequest` | RPC custodio (J3): {project_id, rol:'JEFE', dimension\|centro, cifra\|importe, periodo?, concepto?, umbral?, moneda?} → {project_id, presupuesto:{clave, dimension, periodo, cifra, umbral, declarado_por:'JEFE', inferida:false}, clave, creado, declaracion_no_inferencia:true}. La cifra OBJETIVO se DECLARA, no se infiere de la historia. Cerrojo: rol fuera de JEFE → 409 ERROR_DOS_ESCRITORES. Re-declarar la misma clave SUMA al historial (redeclarado:true); el historial nunca se borra. Publica contabilidad.presupuesto_declarado y responde por contabilidad.presupuesto.declarar.response; error → contabilidad.presupuesto.declarar.failed. |
| `contabilidad.desviacion.calcular.request` | `onDesviacionRequest` | RPC custodio (J4): {project_id, real?\|valor_real?, presupuesto?\|objetivo?, umbral?\|umbral_pct?, periodo?, dimension?} → {project_id, real, objetivo, desviacion, desviacion_pct, signo:'POR_ENCIMA'\|'POR_DEBAJO'\|'EN_OBJETIVO', umbral, umbral_declarado, excede, senal:'EXCEDE_UMBRAL'\|'DENTRO_DE_UMBRAL'\|'UMBRAL_NO_DECLARADO', senal_k2}. Si falta el real/objetivo se REUTILIZA el objetivo declarado (J3) y, si hace falta, el resultado derivado (C2) por EVENTO contabilidad.estado.resultado.request. Sin umbral declarado la desviacion se calcula pero NO se dispara (UMBRAL_NO_DECLARADO). Si excede el umbral declarado, se DISPARA la señal a motor-avisos (K2) por EVENTO contabilidad.aviso.solicitar.request (tipo AVISO_SANGRIA, familia ANALITICA, destinatario DUENO); si K2 no responde → contabilidad.aviso.solicitar.failed (el aviso NO se fabrica). Exito publica contabilidad.desviacion_calculada y responde por contabilidad.desviacion.calcular.response; error → contabilidad.desviacion.calcular.failed. |
| `contabilidad.periodos.comparar.request` | `onCompararRequest` | RPC custodio (J9): {project_id, tipo:'EJERCICIO_VS_EJERCICIO'\|'MES_VS_MES'\|'REAL_VS_PRESUPUESTO', a?\|b?\|real?\|objetivo?\|periodo_a?, periodo_b?, dimension?, umbral?} → {project_id, tipo, a, b, delta, delta_pct, desviacion, fuente_objetivo, reutiliza_j3_j4:true, no_duplica:true}. Compara REUTILIZANDO el objetivo (J3) y la desviacion (J4): NO los duplica. Tipo fuera del catalogo declarable → 422 TIPO_COMPARACION_NO_VALIDO; sin los dos lados → 422 COMPARACION_INCOMPLETA (no se inventa el delta). Exito publica contabilidad.comparacion_calculada y responde por contabilidad.periodos.comparar.response; error → contabilidad.periodos.comparar.failed. |
| `project.activated` | `onProjectActivated` | Restaura del storage (PosPersistencia) los objetivos declarados del proyecto activado: presupuestos por dimension/periodo/concepto y su secuencia de declaraciones son POR PROYECTO y no se borran. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.presupuesto_declarado` | Fire-and-forget (J3): la cifra OBJETIVO de una dimension quedo DECLARADA por el JEFE (un solo escritor) → {project_id, presupuesto:{clave, dimension, periodo, cifra, umbral, inferida:false}, clave, creado, redeclarado}. Es una declaracion, no una inferencia: el sistema no estima el objetivo. Lo consumen la desviacion (J4) y el cuadro de mando contable (J8). |
| `contabilidad.desviacion_calculada` | Fire-and-forget (J4): la desviacion real-vs-objetivo quedo calculada → {project_id, real, objetivo, desviacion, desviacion_pct, signo, umbral, umbral_declarado, excede, senal, senal_k2}. Cálculo determinista; el aviso a K2 solo se dispara si excede el UMBRAL DECLARADO. Lo consumen el cuadro de mando contable (J8) y el comparador de periodos (J9). |
| `contabilidad.comparacion_calculada` | Fire-and-forget (J9): la comparacion entre periodos quedo calculada → {project_id, tipo, a, b, delta, delta_pct, desviacion, fuente_objetivo, reutiliza_j3_j4:true}. REUTILIZA el objetivo (J3) y la desviacion (J4) sin duplicarlos. Lo consumen el cuadro de mando contable (J8) y el informe rico (K3). |
| `contabilidad.presupuesto.declarar.failed` | Par de fallo determinista: declarar sin project_id/dimension/cifra (400) o con rol fuera de JEFE (409 ERROR_DOS_ESCRITORES: la cifra objetivo tiene UN escritor). Cierra el circulo de contabilidad.presupuesto.declarar.request. |
| `contabilidad.desviacion.calcular.failed` | Par de fallo determinista: desviacion sin project_id (400) o sin poder determinar real y objetivo (ni payload, ni J3 declarado, ni C2 disponible). Cierra el circulo de contabilidad.desviacion.calcular.request. |
| `contabilidad.periodos.comparar.failed` | Par de fallo determinista: comparar sin project_id (400), con tipo fuera del catalogo declarable (422 TIPO_COMPARACION_NO_VALIDO) o sin los dos lados (422 COMPARACION_INCOMPLETA: no se inventa el delta). Cierra el circulo de contabilidad.periodos.comparar.request. |
| `contabilidad.presupuesto_declarado.failed` | Par de fallo del evento de dominio contabilidad.presupuesto_declarado: la emision del hecho de dominio no se completo. |
| `contabilidad.desviacion_calculada.failed` | Par de fallo del evento de dominio contabilidad.desviacion_calculada: la emision del hecho de dominio no se completo. |
| `contabilidad.comparacion_calculada.failed` | Par de fallo del evento de dominio contabilidad.comparacion_calculada: la emision del hecho de dominio no se completo. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> `contabilidad.presupuesto.declarar.failed` cierra `contabilidad.presupuesto.declarar.request`;
> `contabilidad.desviacion.calcular.failed` cierra `contabilidad.desviacion.calcular.request`;
> `contabilidad.periodos.comparar.failed` cierra `contabilidad.periodos.comparar.request`.

> Nota: no está en module.json pero sí lo emite index.js — `_atender` publica
> `contabilidad.presupuesto.declarar.response`, `contabilidad.desviacion.calcular.response`
> y `contabilidad.periodos.comparar.response` (los pares response de los RPC); **NO están
> declaradas en `publishes`**.

> Nota: declarado en module.json pero NO emitido por index.js (patrón de la vertical: el
> par de fallo real es `<op>.failed`) — `contabilidad.presupuesto_declarado.failed`,
> `contabilidad.desviacion_calculada.failed` y `contabilidad.comparacion_calculada.failed`
> son los pares de fallo de los eventos de DOMINIO; el custodio solo publica los pares
> `*.failed` de sus RPC.

> Nota: no está en module.json pero sí lo emite index.js — `_desviacionConAviso` publica
> `contabilidad.aviso.solicitar.failed` (503 `DEPENDENCIA_NO_DISPONIBLE` si K2 no responde)
> y, si K2 responde, `contabilidad.aviso.enrutar.request` (reemisión con
> `origen_desviacion:'J4'`); **ninguna de las dos está declarada en `publishes`**.

> Nota: no está en module.json pero sí lo emite index.js — el módulo publica por `_rpc`
> `contabilidad.estado.resultado.request` (estados-contables C2) y
> `contabilidad.aviso.solicitar.request` (motor-avisos K2): dependencias por EVENTO no
> declaradas como publishers.

> Nota de sub-declaración: `_objetivo(dimension, periodo)` (la LECTURA del objetivo
> declarado, J3) **NO está expuesta por ningún RPC** — solo como tool `toolObjetivo`. La
> desviación y la comparación la usan internamente.

## Reglas de negocio

1. **La cifra OBJETIVO es DECLARACIÓN, no INFERENCIA**: `_declarar` construye la entrada con
   `inferida:false`, `ley_cableada:false`, `borrable:false`, `declarado_por:'JEFE'` y
   responde `declaracion_no_inferencia:true`. **El sistema no estima el objetivo de la
   historia.**
2. **GUARD de un solo escritor (M2/J3)**: `_verificarEscritorUnico(rol)` normaliza a
   mayúsculas y exige `rol === 'JEFE'`; si no, **`409 ERROR_DOS_ESCRITORES`** con el mensaje
   *«la cifra objetivo tiene UN escritor: solo el JEFE declara el presupuesto»* y
   `{ escritor_vigente:'JEFE', rol_intentado, simbolico:'ERROR_DOS_ESCRITORES', nota:'un rol
   distinto puede LEER (objetivo/comparar), nunca fijar el objetivo' }`.
3. **La clave es compuesta**: `_clave = '<pid>:<dimension>:<periodo|*>:<concepto|*>'`. El
   `creado` es `true` la primera vez; re-declarar la misma clave devuelve
   **`redeclarado:true`**.
4. **Historial APPEND-ONLY**: cada declaración se **SUMA** a `d.secuencia`
   (`{clave, dimension, periodo, cifra, declarado_en}`) manteniendo el histórico: **el
   historial nunca se borra**.
5. **El objetivo no declarado queda ABIERTO**: `_objetivo` devuelve `status:200` con
   `hallado:false`, `estado:'ABIERTO'`, `objetivo:null` y la nota *«el objetivo no declarado
   queda ABIERTO: no se asume»*; si existe, `hallado:true`, `estado:'DECLARADO'`.
6. **DETERMINISMO (J4)**: `_calcular` es cálculo puro — `desviacion = real − objetivo`;
   `desviacion_pct = (real − objetivo) / |objetivo|` redondeado a 4 decimales, o **`null` si
   `objetivo === 0`**; `signo` = `POR_ENCIMA` (>0) / `POR_DEBAJO` (<0) / `EN_OBJETIVO` (=0).
   La respuesta lleva `determinista:true`.
7. **EL UMBRAL ES DECLARABLE (invariante)**: hay **dos formas** de umbral — importe
   (`umbral`/`umbral_desviacion`) y proporción (`umbral_pct`/`umbral_proporcion`).
   `declarado = umbral !== null || umbralPct !== null`. `excede` = declarado **y**
   (`|desviacion| > umbral` **o** `|desviacion_pct| > umbralPct`). `senal` = declarado ?
   (`excede` ? `'EXCEDE_UMBRAL'` : `'DENTRO_DE_UMBRAL'`) : **`'UMBRAL_NO_DECLARADO'`**. La
   nota lo dice: *«sin umbral declarado: la desviacion se calcula, el aviso NO se dispara»*.
8. **El disparo a K2 (J4)**: `_dispararSiExcede` — sin `excede` devuelve `{disparar:false,
   motivo: umbral_declarado ? 'DENTRO_DE_UMBRAL' : 'UMBRAL_NO_DECLARADO'}`. Con `excede`
   devuelve `{disparar:true, tipo:'AVISO_SANGRIA', familia:'ANALITICA',
   destinatario:'DUENO', prioridad:'ALTA', motivo:'la desviacion supera el umbral
   declarado'}`.
9. **El aviso se PIDE por EVENTO, no se fabrica**: `_desviacionConAviso` hace `_rpc` a
   `contabilidad.aviso.solicitar.request` (timeout 4000ms) con `origen:'J4_DESVIACION'` y
   `contexto:{dimension, periodo, real, objetivo, desviacion, umbral}`; si K2 no responde →
   publica `contabilidad.aviso.solicitar.failed` (503, *«el aviso NO se fabrica»*); si
   responde → reemite `contabilidad.aviso.enrutar.request` con `origen_desviacion:'J4'`. La
   respuesta del RPC añade `senal_k2`.
10. **REUTILIZACIÓN TOLERANTE (J4 y J9)**: si falta `real`/`objetivo`, `_desviacionConAviso`
    REUTILIZA el objetivo declarado (J3, `_objetivo`) y, si hace falta el real, lo
    **LEE** de estados-contables (C2) por `contabilidad.estado.resultado.request` →
    `data.resultado.resultado`. **Nunca se inventa la cifra.** `_comparar` reutiliza J3 para
    el objetivo (`fuente: 'J3_objetivo_declarado'`) y J4 para el delta
    (`reutiliza_j3_j4:true`, `no_duplica:true`).
11. **El CATÁLOGO de tipos de comparación es DECLARABLE** (J9): `TIPOS_COMPARACION =
    ['EJERCICIO_VS_EJERCICIO', 'MES_VS_MES', 'REAL_VS_PRESUPUESTO']` (por defecto
    `REAL_VS_PRESUPUESTO`, normalizado a mayúsculas). Tipo fuera → **`422
    TIPO_COMPARACION_NO_VALIDO`** con `tipos_posibles`.
12. **Sin los dos lados no hay delta**: `422 COMPARACION_INCOMPLETA` con
    `faltan:{real, objetivo}` y `reutiliza:'objetivo (J3) y desviacion (J4)'` — **no se
    inventa el delta**.
13. **Validaciones deterministas**: falta `project_id` → `400 INVALID_INPUT project_id`;
    falta `dimension` (declarar) → `400 INVALID_INPUT dimension`; `cifra` no numérica o
    ausente → `400 INVALID_INPUT cifra`; `real` no numérico (calcular) → `400 INVALID_INPUT
    real`; `presupuesto` no numérico → `400 INVALID_INPUT presupuesto`. Shape:
    `{ status:400, error:{ code:'INVALID_INPUT', message:'<campo> requerido', details:{
    field:<campo> } } }`.
14. **HTTP exacto**: éxito `200`; payload inválido → `400`; segundo escritor → `409`; tipo de
    comparación inválido / comparación incompleta → `422`; aviso no disparado por K2 → `503`
    en `contabilidad.aviso.solicitar.failed`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPCs que responden en `contabilidad.presupuesto.declarar.response`,
`contabilidad.desviacion.calcular.response` y `contabilidad.periodos.comparar.response`.

### 1. `declarar` — el JEFE fija el objetivo (J3, declaración)

```json
{
  "project_id": "e57a318a-...",
  "rol": "JEFE",
  "dimension": "CENTRO-NORTE",
  "cifra": 25000,
  "periodo": "2026-09",
  "umbral": 1500,
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "presupuesto": { "clave": "e57a318a-...:CENTRO-NORTE:2026-09:*", "dimension": "CENTRO-NORTE", "periodo": "2026-09", "concepto": null, "cifra": 25000, "umbral": 1500, "moneda": null, "declarado_por": "JEFE", "declarado_en": "2026-09-30T09:00:00.000Z", "inferida": false, "ley_cableada": false, "borrable": false },
  "clave": "e57a318a-...:CENTRO-NORTE:2026-09:*",
  "creado": true,
  "redeclarado": false,
  "declaracion_no_inferencia": true,
  "escritor": "JEFE"
}
```

Emite `contabilidad.presupuesto_declarado` (res.data + `correlation_id`).

### 2. `desviacion` — real vs objetivo con umbral declarado (J4)

```json
{
  "project_id": "e57a318a-...",
  "dimension": "CENTRO-NORTE",
  "periodo": "2026-09",
  "real": 26800,
  "correlation_id": "abc-123"
}
```

(se REUTILIZA el objetivo declarado `25000` y su umbral `1500`) → Respuesta `200`
(recortada):

```json
{
  "project_id": "e57a318a-...",
  "periodo": "2026-09",
  "dimension": "CENTRO-NORTE",
  "real": 26800,
  "objetivo": 25000,
  "desviacion": 1800,
  "desviacion_pct": 0.072,
  "signo": "POR_ENCIMA",
  "umbral": 1500,
  "umbral_pct": null,
  "umbral_declarado": true,
  "excede": true,
  "senal": "EXCEDE_UMBRAL",
  "senal_k2": { "disparar": true, "tipo": "AVISO_SANGRIA", "familia": "ANALITICA", "destinatario": "DUENO", "prioridad": "ALTA", "motivo": "la desviacion supera el umbral declarado", "umbral_declarado": true },
  "determinista": true,
  "nota": "real vs objetivo con el umbral declarado"
}
```

Emite `contabilidad.desviacion_calculada` (res.data + `correlation_id`) y, al exceder, pide
el aviso a K2.

### 3. `comparar` — comparador de periodos (J9, reutiliza J3/J4)

```json
{
  "project_id": "e57a318a-...",
  "tipo": "REAL_VS_PRESUPUESTO",
  "dimension": "CENTRO-NORTE",
  "periodo_b": "2026-09",
  "real": 26800,
  "correlation_id": "abc-123"
}
```

Respuesta `200` (recortada):

```json
{
  "project_id": "e57a318a-...",
  "tipo": "REAL_VS_PRESUPUESTO",
  "a": 26800,
  "b": 25000,
  "delta": 1800,
  "delta_pct": 0.072,
  "desviacion": { "...": "resultado de J4 (mismo shape que la op desviacion)" },
  "fuente_objetivo": "J3_objetivo_declarado",
  "reutiliza_j3_j4": true,
  "no_duplica": true,
  "determinista": true
}
```

Emite `contabilidad.comparacion_calculada` (res.data + `correlation_id`).

### 4. Fallo — rol no JEFE → 409 (un solo escritor)

```json
{ "project_id": "e57a318a-...", "rol": "OPERADOR", "dimension": "CENTRO-NORTE", "cifra": 25000 }
```

Respuesta `409` + `contabilidad.presupuesto.declarar.failed`:

```json
{ "status": 409, "error": { "code": "ERROR_DOS_ESCRITORES", "message": "la cifra objetivo tiene UN escritor: solo el JEFE declara el presupuesto", "details": { "escritor_vigente": "JEFE", "rol_intentado": "OPERADOR", "simbolico": "ERROR_DOS_ESCRITORES", "nota": "un rol distinto puede LEER (objetivo/comparar), nunca fijar el objetivo" } } }
```

### 5. Fallo — sin umbral declarado (no es error: la desviación se calcula)

Sin `umbral` disponible → `200` con `senal:'UMBRAL_NO_DECLARADO'`, `excede:false` y
`senal_k2.disparar:false`; **el aviso NO se dispara**:

```json
{ "status": 200, "data": { "desviacion": 1800, "umbral_declarado": false, "excede": false, "senal": "UMBRAL_NO_DECLARADO", "senal_k2": { "disparar": false, "motivo": "UMBRAL_NO_DECLARADO", "umbral_declarado": false }, "nota": "sin umbral declarado: la desviacion se calcula, el aviso NO se dispara" } }
```

### 6. Fallo — tipo de comparación inválido / comparación incompleta

```json
{ "project_id": "e57a318a-...", "tipo": "TRIMESTRE_VS_TRIMESTRE" }
```

→ `422 TIPO_COMPARACION_NO_VALIDO` + `contabilidad.periodos.comparar.failed`:

```json
{ "status": 422, "error": { "code": "TIPO_COMPARACION_NO_VALIDO", "message": "tipo de comparacion TRIMESTRE_VS_TRIMESTRE fuera del catalogo declarable", "details": { "tipos_posibles": ["EJERCICIO_VS_EJERCICIO", "MES_VS_MES", "REAL_VS_PRESUPUESTO"] } } }
```

Sin los dos lados → `422 COMPARACION_INCOMPLETA` con `{ tipo, faltan:{real, objetivo},
reutiliza:'objetivo (J3) y desviacion (J4)' }`.

### 7. Fallo — K2 no responde (el aviso NO se fabrica)

Se publica `contabilidad.aviso.solicitar.failed` (no es la respuesta del RPC, que sigue
siendo `200`):

```json
{ "status": 503, "error": { "code": "DEPENDENCIA_NO_DISPONIBLE", "message": "motor-avisos (K2) no respondio: la desviacion excede el umbral pero el aviso NO se fabrica", "details": { "dependencia": "motor-avisos" } } }
```

### 8. Fallo — payload inválido

Sin `cifra` en `declarar` → `400 INVALID_INPUT cifra` + `contabilidad.presupuesto.declarar.failed`.

### 9. Tools (sin RPC en module.json)

`toolDeclarar` → `_declarar`; `toolObjetivo` → `_objetivo`; `toolCalcularDesviacion` →
`_calcular`; `toolComparar` → `_comparar`.

## Tests

El test vive en `tests/unit/presupuesto.test.js`. Cubre:

- `declarar` con `rol:'JEFE'` → `200`, `inferida:false`, `declaracion_no_inferencia:true`;
  emite `contabilidad.presupuesto_declarado`. Re-declarar → `redeclarado:true` y la
  `secuencia` crece (historial append-only, nunca se borra).
- **Single-writer**: rol distinto de `JEFE` → `409 ERROR_DOS_ESCRITORES`.
- `desviacion` con umbral declarado excedido → `excede:true`, `senal:'EXCEDE_UMBRAL'` y
  pide el aviso a K2 (`contabilidad.aviso.solicitar.request`); emite
  `contabilidad.desviacion_calculada`.
- **UMBRAL DECLARABLE**: sin umbral → `200`, `senal:'UMBRAL_NO_DECLARADO'`, `excede:false` y
  **NO** se dispara aviso (`senal_k2.disparar:false`).
- **Dependencia tolerante**: sin `real`/`objetivo` en payload, objetivo no declarado y C2
  mudo → fallo declarado (no se inventa la cifra); K2 mudo → `contabilidad.aviso.solicitar.failed`
  (503), sin fabricar el aviso.
- `comparar` REAL_VS_PRESUPUESTO reutilizando el objetivo declarado →
  `fuente_objetivo:'J3_objetivo_declarado'`, `reutiliza_j3_j4:true`, `no_duplica:true`; emite
  `contabilidad.comparacion_calculada`.
- Tipo fuera del catálogo → `422 TIPO_COMPARACION_NO_VALIDO`; sin los dos lados → `422
  COMPARACION_INCOMPLETA`.
- **El objetivo no declarado queda `ABIERTO`** (`hallado:false`, `objetivo:null`), nunca se
  asume.
- Sin `project_id`/`dimension`/`cifra` → `400 INVALID_INPUT` + par `*.failed`.
- `project.activated` restaura los objetivos vía PosPersistencia.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/presupuesto
node --test tests/unit/presupuesto.test.js
```

## Notas de implementación

- Clase `Presupuesto extends ModuloHibridoReflejo`; `name = 'presupuesto'`,
  `version = 'reflejo-0.1.0'` (aunque es **custodio**: conserva el versionado reflejo, es el
  patrón real de la vertical). Store en memoria `this._store` (Map project_id →
  `{ esquema:'contabilidad-presupuesto-v1', presupuestos:{}, secuencia:[], escritor:'JEFE' }`).
- Constantes: `ROL_ESCRITOR_PRESUPUESTO = 'JEFE'`, `CODE_DOS_ESCRITORES =
  'ERROR_DOS_ESCRITORES'`, `CODE_UMBRAL_NO_DECLARADO = 'UMBRAL_NO_DECLARADO'`,
  `CODE_DEPENDENCIA_NO_DISPONIBLE = 'DEPENDENCIA_NO_DISPONIBLE'`, `TIPOS_COMPARACION`
  (3 tipos).
- **PosPersistencia**: `_persist = new PosPersistencia({ modulo, file: 'presupuesto.json',
  dir: '/contabilidad/presupuesto', snapshot, hidratar })`. `onProjectActivated` →
  `restaurar(project_id)`; `onUnload` → `flush()` + `detener()`. Cada mutación marca
  `marcarDirty(pid)`.
- Los tres handlers delegan en `_atender(e, '<op>', 'contabilidad.<op>.response', fn)`;
  publican el evento de dominio si `status === 200` y el par `*.failed` si no.
- Proyecciones puras: `_declarar`, `_objetivo`, `_calcular`, `_dispararSiExcede`,
  `_comparar` (async), `_desviacionConAviso` (async) + helpers `_clave`, `_dimensionDe`,
  `_num` (+ `_verificarEscritorUnico`, `_obtenerOCrear`). `_rpc`/`_invalid`/
  `_errorResponse`/`_round` vienen de la base.
- Tools: `toolDeclarar`, `toolObjetivo`, `toolCalcularDesviacion`, `toolComparar`.
- DEP hacia delante: `contabilidad.presupuesto_declarado`, `contabilidad.desviacion_calculada`
  y `contabilidad.comparacion_calculada` los consumen `cuadro-mando-contable` (J8) y
  `informe-rico` (K3); la desviación dispara a K2 `motor-avisos`. DEP hacia atrás por
  EVENTO: `estados-contables` (C2) provee el resultado derivado.
