---
name: cierre-ejercicio
description: >
  Skill FULL del módulo CUSTODIO `cierre-ejercicio` de la vertical contabilidad de Enki
  (C4·C5, hoja del plan). EL CIERRE EN DOS NIVELES (decisión del dueño): NIVEL 1 · LA
  JORNADA cierra la caja — consume el hecho CIERRE_JORNADA ya admitido por la puerta
  (A1, contabilidad LEE la operación, no la ejecuta; clave natural (proyecto, jornada)).
  NIVEL 2 · EL MES cierra la contabilidad — ajustes, periodificación, amortizaciones,
  IVA devengado/soportado y regularización; clave natural (proyecto, ejercicio, mes).
  IRREVERSIBLE SALVO AJUSTE: un cierre NO se reabre — esIrreversible() lo declara
  (reabrible:false); si hay que corregir se corrige SUMANDO (B5, asiento-ajuste) y el
  cierre original queda en la traza. Un cierre = un asiento, y la IDEMPOTENCIA cuelga de
  la CLAVE NATURAL DE DOS NIVELES: reprocesar la misma jornada o el mismo mes NO duplica
  → 409 ERROR_PERIODO_YA_CERRADO con reabrible:false y la vía de corrección declarada.
  C5 (AperturaEjercicio) es la cara determinista: los saldos de apertura SON los de
  cierre, NUNCA inventados (sin cierre anterior → 422 SIN_CIERRE_ANTERIOR, asumido:false).
  Persiste por proyecto vía PosPersistencia. Úsala para operar, depurar o extender el
  custodio, o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites cerrar un periodo en su nivel (RPC contabilidad.cierre.cerrar.request)
    o consultar el estado de un cierre (contabilidad.cierre.estado.request).
  - Cuando depures por qué se rechaza el cierre (409 ERROR_DOS_ESCRITORES si el rol no es
    CIERRE/SISTEMA, 409 ERROR_PERIODO_YA_CERRADO si el periodo ya está cerrado y el cierre es
    IRREVERSIBLE, 409 DESCUADRE si un ajuste no cuadra, 422 si falta jornada o ejercicio+mes,
    503 si el libro B2 no confirma el asiento de cierre).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), por qué el cierre
    es irreversible salvo ajuste y por qué los saldos de apertura son los de cierre, nunca
    inventados.
  - Cuando vayas a escribir/ampliar el test unitario del custodio cierre-ejercicio.
tags: [enki, modulo, custodio, persistencia, contabilidad, cierre-ejercicio, cierre, irreversible]
---

# cierre-ejercicio — CUSTODIO del cierre en dos niveles

## Qué hace el módulo

`cierre-ejercicio` es un **CUSTODIO CON PERSISTENCIA** (C4·C5, hoja del plan): **EL CIERRE,
EN DOS NIVELES** (decisión del dueño):

- **NIVEL 1 · LA JORNADA cierra la caja.** Consume el hecho **CIERRE_JORNADA** ya admitido
  por la puerta (A1): contabilidad **LEE la operación, no la ejecuta**. Clave natural:
  **`(proyecto, jornada)`**. El cierre de caja diario de la OPERACION **no se toca**: entra
  como hecho observado (`observa_la_operacion:true`, `ejecuta_la_caja:false`).
- **NIVEL 2 · EL MES cierra la contabilidad.** Ajustes, periodificación, amortizaciones,
  IVA devengado/soportado y regularización. Clave natural: **`(proyecto, ejercicio, mes)`**.

**IRREVERSIBLE SALVO AJUSTE**: un cierre **NO se reabre**. `_esIrreversible()` lo declara
(`reabrible:false`, `salvo:'AJUSTE_POSTERIOR (B5): el ajuste SUMA, no reabre'`). Si hay que
corregir, se corrige **SUMANDO** (B5 `asiento-ajuste`): el cierre original queda en la
traza. **Un cierre = un asiento**, y la **IDEMPOTENCIA cuelga de la CLAVE NATURAL DE DOS
NIVELES**: reprocesar la misma jornada o el mismo mes **NO duplica** — devuelve **`409
ERROR_PERIODO_YA_CERRADO`** (`reabrible:false`,
`correccion:'AJUSTE_POSTERIOR_B5 (el ajuste SUMA, no reabre)'`).

**C5 (AperturaEjercicio) es la cara determinista**: los saldos de apertura **SON los del
cierre anterior, NUNCA inventados** (sin cierre anterior → **`422 SIN_CIERRE_ANTERIOR`**,
`asumido:false`).

**Un solo escritor**: el rol del cierre es **`CIERRE`** (más **`SISTEMA`** para el cierre
automático de jornada). Cualquier otro → **`409 ERROR_DOS_ESCRITORES`**.

**AQUÍ NO SE ESCRIBE EL DIARIO**: el cierre de NIVEL 2 con ajustes se **ASIENTA** por
**EVENTO** (`contabilidad.asiento.cierre.request` con rol `ADMISION`) — **B2
(`escritor-diario`) es el ÚNICO escritor**. **Si B2 no confirma NO se declara el cierre
realizado**: se **revierte** el registro (`delete d.cierres[clave]`, se filtra la secuencia)
y se publica **`503 DEPENDENCIA_NO_DISPONIBLE`** (`accion:'NO_DECLARAR_CIERRE_SIN_ASIENTO'`).

Persiste por proyecto con **PosPersistencia** (storage
`/contabilidad/cierre-ejercicio/cierre-ejercicio.json`), restaura en `project.activated` y
vuelca en `onUnload`. La dependencia con `escritor-diario` (B2), `mayor-balanza` (B3),
`periodificacion` (C3), `inmovilizado` (F2) y `cola-declaraciones-criterio` (K9) es **por
EVENTO, NUNCA por `require` cruzado**.

> **NO REUTILIZA**: el cierre de caja diario de la OPERACION no se toca: entra como hecho
> observado. El cierre contable con ajustes no existe en el inventario.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response + fire-and-forget + ciclo de vida)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.cierre.cerrar.request` | `onCerrarRequest` | RPC custodio: {project_id, rol:'CIERRE'\|'SISTEMA', nivel:1\|2, jornada? (nivel 1) \| ejercicio+mes (nivel 2), ajustes:[{apuntes:[{cuenta,debe,haber}]}], cierre?/periodificacion?/amortizaciones?/iva_devengado?/iva_soportado?/regularizacion?} → {project_id, cierre:{clave_natural, nivel, unidad_de_cierre, irreversible:true, reabrible:false, asiento_cierre}, un_cierre_un_asiento:true}. Cerrojos: rol fuera de CIERRE/SISTEMA → 409 ERROR_DOS_ESCRITORES; periodo ya cerrado → 409 ERROR_PERIODO_YA_CERRADO (el cierre es IRREVERSIBLE salvo ajuste posterior B5); ajuste descuadrado → 409 DESCUADRE; sin jornada / sin ejercicio+mes → 422. El cierre de nivel 2 con ajustes se envia al libro (B2) por EVENTO: si B2 no confirma no se declara el cierre. Exito publica contabilidad.cierre_realizado y responde por contabilidad.cierre.cerrar.response; error → contabilidad.cierre.cerrar.failed. |
| `contabilidad.cierre.estado.request` | `onEstadoRequest` | RPC custodio de lectura: {project_id, nivel?, jornada?\|ejercicio+mes?\|clave_natural?} → {project_id, clave_natural, cerrado, estado:'CERRADO'\|'ABIERTO', cierre, irreversible, reabrible:false}. Sin clave devuelve el resumen (los dos niveles, ultimo de cada uno, la forma de cada clave natural). Responde por contabilidad.cierre.estado.response; si falta project_id → contabilidad.cierre.estado.failed. |
| `contabilidad.hecho_admitido` | `onHechoAdmitido` | Fire-and-forget (A1 → C4): puerto-evento-vertical admitio un hecho → si el tipo es CIERRE_JORNADA se cierra el NIVEL 1 (la jornada cierra la caja) sin que nadie lo pida, con rol SISTEMA y clave natural (proyecto, jornada). El cierre de caja de la OPERACION no se ejecuta aqui: se OBSERVA. Exito publica contabilidad.cierre_realizado; si el periodo ya estaba cerrado → contabilidad.cierre_realizado.failed (no se finge un cierre nuevo). |
| `project.activated` | `onProjectActivated` | Restaura del storage (PosPersistencia) los cierres de los DOS niveles del proyecto activado: los cierres son POR PROYECTO, irreversibles y no borrables. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.cierre_realizado` | Fire-and-forget (C4): un periodo quedo CERRADO en su nivel → {project_id, cierre:{clave_natural, nivel:1\|2, unidad_de_cierre:'JORNADA'\|'MES', jornada\|ejercicio+mes, saldos, ajustes, importes, asiento_cierre, irreversible:true, reabrible:false}, un_cierre_un_asiento:true, idempotente_por}. Lo consumen inmovilizado (F2, que dispara la amortizacion) y aviso-cuadre (C6). Nivel 1 no dispara amortizacion. |
| `contabilidad.apertura_generada` | Fire-and-forget (C5): la apertura del ejercicio siguiente quedo generada DESDE el cierre anterior → {project_id, cierre_origen, apuntes, debe, haber, cuadra, saldos_de_cierre:true, inventados:false}. Los saldos de apertura SON los de cierre: nunca se inventan saldos de arranque. |
| `contabilidad.cierre.cerrar.failed` | Par de fallo determinista: cerrar sin project_id, con rol fuera de CIERRE/SISTEMA (409 ERROR_DOS_ESCRITORES), con el periodo YA CERRADO (409 ERROR_PERIODO_YA_CERRADO — IRREVERSIBLE salvo ajuste), con ajuste descuadrado (409 DESCUADRE), sin jornada ni ejercicio+mes (422), o con el libro (B2) sin confirmar el asiento de cierre (503). Cierra el circulo de contabilidad.cierre.cerrar.request. |
| `contabilidad.cierre.estado.failed` | Par de fallo determinista: estado sin project_id. Cierra el circulo de contabilidad.cierre.estado.request. |
| `contabilidad.cierre_realizado.failed` | Par de fallo del evento de dominio contabilidad.cierre_realizado: el periodo ya estaba cerrado (409 ERROR_PERIODO_YA_CERRADO, reabrible:false) o el libro (B2) no confirmo el asiento de cierre. El cierre NO se reabre: se corrige sumando (B5). |
| `contabilidad.apertura_generada.failed` | Par de fallo del evento de dominio contabilidad.apertura_generada: no hay cierre anterior del que abrir (422 SIN_CIERRE_ANTERIOR) o la emision del hecho de dominio no se completo. Nunca se inventan saldos de arranque. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> `contabilidad.cierre.cerrar.failed` cierra `contabilidad.cierre.cerrar.request`;
> `contabilidad.cierre.estado.failed` cierra `contabilidad.cierre.estado.request`.

> Nota: no está en module.json pero sí lo emite index.js — `_atender` publica
> `contabilidad.cierre.cerrar.response` y `contabilidad.cierre.estado.response` (los pares
> response de los RPC); **NO están declaradas en `publishes`**.

> Nota: declarado en module.json pero NO emitido por index.js en el camino de éxito — el
> evento de DOMINIO `contabilidad.apertura_generada` **no se publica desde ningún handler
> de index.js** (`_generarApertura`/`_arrastrarSaldos` solo existen como tools, sin RPC ni
> emisión). Patrón de la vertical: el par de fallo real es `<op>.failed`.
> `contabilidad.cierre_realizado.failed` **sí** se emite como par del evento de dominio
> (en `onCerrarRequest` cuando el code es `ERROR_PERIODO_YA_CERRADO`, y en
> `onHechoAdmitido` cuando el cierre falla).

> Nota de sub-declaración: `_esIrreversible`, `_generarApertura` y `_arrastrarSaldos`
> **NO están expuestos por ningún RPC** — solo como tools (`toolEsIrreversible`,
> `toolGenerarApertura`, `toolArrastrarSaldos`). Por eso el flujo de C5 (apertura) no
> tiene RPC ni emisión de dominio en el contrato de eventos.

## Reglas de negocio

1. **DOS NIVELES, dos claves naturales**: `_claveNatural(pid, nivel, input)` —
   nivel 1 → `` `${pid}:jornada:${jornada}` `` (con `jornada` = `input.jornada || input.periodo`);
   nivel 2 → `` `${pid}:${ejercicio}:${mes}` ``. Sin la clave → **`422 PRECONDITION_FAILED`**
   con el mensaje que nombra la unidad (`'el cierre de NIVEL 1 exige la JORNADA...'` /
   `'el cierre de NIVEL 2 exige EJERCICIO y MES...'`). `nivel` distinto de 1 → se trata como
   **NIVEL 2** (`Number(input.nivel) === 1 ? 1 : 2`).
2. **IRREVERSIBLE SALVO AJUSTE (invariante dura)**: si `d.cierres[clave]` ya existe →
   **`409 ERROR_PERIODO_YA_CERRADO`** con `{clave_natural, simbolico, cierre_existente,
   reabrible:false, correccion:'AJUSTE_POSTERIOR_B5 (el ajuste SUMA, no reabre)'}`.
   **El cierre no se reabre: se corrige sumando.**
3. **Un solo escritor (C4)**: `_verificarEscritorUnico` exige rol en **{CIERRE, SISTEMA}**
   (normalizado a mayúsculas). Cualquier otro → **`409 ERROR_DOS_ESCRITORES`**
   (`escritor_vigente:['CIERRE','SISTEMA']`). Mensaje: *«el cierre tiene UN escritor: solo
   CIERRE cierra el periodo»*.
4. **Los ajustes del cierre deben cuadrar**: cada ajuste exige **≥ 2 apuntes** (partida
   doble) → si no, **`422 PRECONDITION_FAILED`**; y `|debe − haber| > EPS` →
   **`409 DESCUADRE`** (`{debe, haber, simbolico:'DESCUADRE'}`). Tolerancia `EPS = 0.005`.
5. **Un cierre = un asiento**: `_nivel2` compone `asiento_cierre` = suma de los apuntes de
   los ajustes declarados (`{tipo:'CIERRE', origen:'C4_NIVEL2', periodo:'<ejercicio>-<mes>',
   apuntes, debe, haber, borra_historia:false, suma:true}`), con `cuadrado` calculado. Solo
   si hay ≥ 2 apuntes; si no, `asiento_cierre:null`.
6. **NIVEL 1 observa, no ejecuta**: `_nivel1` consume el hecho CIERRE_JORNADA. La caja
   declarada (`hecho.caja_final` o `hecho.caja`) se copia o queda `null` **sin inventarla**
   (`caja_declarada:false`). `saldos:{}`, `asiento_cierre:null`, `observa_la_operacion:true`,
   `ejecuta_la_caja:false`.
7. **NIVEL 2 declara los hechos del tiempo**: `_nivel2` NO calcula amortización (F2) ni
   periodificación (C3); deja constancia de que se dispararon:
   `hechos_del_tiempo:[{tipo:'AMORTIZACION', dispara:'inmovilizado (F2)'},
   {tipo:'PERIODIFICACION', dispara:'periodificacion (C3)'}]` según lo declarado. Importes
   `iva_devengado`, `iva_soportado`, `regularizacion` (declarables) e `iva_liquidado =
   devengado − soportado` (o `null` si falta alguno). `saldos:{}`.
8. **El cierre no se declara sin su asiento**: `_cerrarConLibro` llama a `_cerrar`; si hay
   `asiento_cierre`, envía a B2 por **EVENTO** (`contabilidad.asiento.cierre.request`, rol
   `ADMISION`, `timeout_ms:5000`). Si B2 **no confirma** → **revierte** el registro (borra
   `d.cierres[clave]`, filtra `d.secuencia`) y devuelve **`503 DEPENDENCIA_NO_DISPONIBLE`**
   con `{dependencia:'escritor-diario', clave_natural,
   accion:'NO_DECLARAR_CIERRE_SIN_ASIENTO'}`. Nivel 1 (sin asiento) se registra igualmente.
9. **La apertura SON los saldos de cierre (C5)**: `_generarApertura` toma el cierre
   anterior (`input.cierre_anterior` o `d.cierres[clave_natural]` o `d.abierto.n2 || d.abierto.n1`);
   sin cierre → **`422 PRECONDITION_FAILED`** con `{senal:'SIN_CIERRE_ANTERIOR',
   asumido:false}`. Compone apuntes por saldo (positivo → debe; negativo → haber) con
   `saldos_de_cierre:true`, `inventados:false`. `_arrastrarSaldos` hace lo análogo
   (`arrastrado_del_cierre:true`, `inventados:false`).
10. **El estado resume o detalla**: `_estado` sin clave → `{cierres, n_cierres,
    ultimo_nivel1, ultimo_nivel2, irreversible:true, reabrible:false, dos_niveles:{nivel_1:
    '(proyecto, jornada)', nivel_2:'(proyecto, ejercicio, mes)'}}`. Con clave → `{clave_natural,
    cerrado, estado:'CERRADO'|'ABIERTO', cierre, irreversible, reabrible:false}`.
11. **Fire-and-forget del hecho admitido**: `onHechoAdmitido` solo actúa si
    `tipo === 'CIERRE_JORNADA'` (de `hecho.tipo` o `hecho.vertical`); cierra NIVEL 1 con rol
    `SISTEMA`, `jornada = hecho.jornada || hecho.fecha || hecho.clave_natural`. Sin
    `project_id` → `null`. Si el periodo ya estaba cerrado → **no se finge un cierre nuevo**:
    publica `contabilidad.cierre_realizado.failed`.
12. **El cierre es POR PROYECTO**: `store[pid]` con
    `{esquema:'contabilidad-cierre-ejercicio-v1', cierres:{<clave>:Cierre}, secuencia:[],
    abierto:{}, escritor:['CIERRE','SISTEMA']}`. Sin restaurar (`project.activated`) la
    idempotencia por clave natural no se puede garantizar.
13. **Validaciones deterministas**: falta `project_id` → `400 INVALID_INPUT project_id`;
    `_nivel1` sin `jornada` → `400 INVALID_INPUT jornada`; `_nivel2` sin `ejercicio`/`mes` →
    `400 INVALID_INPUT ejercicio|mes`. Shape: `{status:400, error:{code:'INVALID_INPUT',
    message:'<campo> requerido', details:{field:<campo>}}}`.
14. **HTTP exacto**: éxito `200`; payload inválido → `400`; ajuste descuadrado / segundo
    escritor / periodo ya cerrado → `409`; sin clave natural o apertura sin cierre anterior →
    `422`; B2 mudo → `503` (y el cierre se revierte); excepción en `_atender` → `500
    UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPCs que responden en `contabilidad.cierre.cerrar.response` y
`contabilidad.cierre.estado.response`.

### 1. `cerrar` — NIVEL 2 con ajustes (el mes cierra la contabilidad)

```json
{
  "project_id": "e57a318a-...",
  "rol": "CIERRE",
  "nivel": 2,
  "ejercicio": 2026,
  "mes": 9,
  "ajustes": [ { "apuntes": [ { "cuenta": "628", "debe": 100, "haber": 0 }, { "cuenta": "410", "debe": 0, "haber": 100 } ] } ],
  "iva_devengado": 210,
  "iva_soportado": 100,
  "regularizacion": 0,
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "cierre": { "clave_natural": "e57a318a-...:2026:9", "nivel": 2, "unidad_de_cierre": "MES", "ejercicio": 2026, "mes": 9, "periodo": "2026-9", "saldos": {}, "ajustes": 1, "importes": { "iva_devengado": 210, "iva_soportado": 100, "regularizacion": 0, "iva_liquidado": 110 }, "hechos_del_tiempo": [], "asiento_cierre": { "tipo": "CIERRE", "origen": "C4_NIVEL2", "periodo": "2026-9", "apuntes": [ { "cuenta": "628", "debe": 100, "haber": 0 }, { "cuenta": "410", "debe": 0, "haber": 100 } ], "debe": 100, "haber": 100, "borra_historia": false, "suma": true }, "irreversible": true, "reabrible": false, "borrable": false, "cerrado_por": "CIERRE", "origen": "CIERRE" },
  "clave_natural": "e57a318a-...:2026:9",
  "nivel": 2,
  "irreversible": true,
  "reabrible": false,
  "un_cierre_un_asiento": true,
  "idempotente_por": "(proyecto, ejercicio, mes)"
}
```

Emite `contabilidad.cierre_realizado` (res.data + `correlation_id`) si B2 confirma el
asiento de cierre.

### 2. `cerrar` — NIVEL 1 (la jornada cierra la caja; solo se observa)

```json
{
  "project_id": "e57a318a-...",
  "rol": "CIERRE",
  "nivel": 1,
  "jornada": "2026-09-12",
  "cierre": { "tipo": "CIERRE_JORNADA", "caja_final": 830.5 },
  "correlation_id": "abc-123"
}
```

Respuesta `200` (sin asiento: se registra igualmente):

```json
{
  "project_id": "e57a318a-...",
  "cierre": { "clave_natural": "e57a318a-...:jornada:2026-09-12", "nivel": 1, "unidad_de_cierre": "JORNADA", "jornada": "2026-09-12", "periodo": "2026-09-12", "importes": { "caja_final": 830.5 }, "asiento_cierre": null, "irreversible": true, "reabrible": false, "cerrado_por": "CIERRE", "origen": "CIERRE" },
  "clave_natural": "e57a318a-...:jornada:2026-09-12",
  "nivel": 1,
  "irreversible": true,
  "reabrible": false,
  "un_cierre_un_asiento": true,
  "idempotente_por": "(proyecto, jornada)"
}
```

### 3. Fallo — periodo YA cerrado → 409 (irreversible salvo ajuste)

Reprocesar la MISMA clave → Respuesta `409` + `contabilidad.cierre_realizado.failed` +
`contabilidad.cierre.cerrar.failed`:

```json
{ "status": 409, "error": { "code": "ERROR_PERIODO_YA_CERRADO", "message": "el periodo e57a318a-...:2026:9 ya esta cerrado: el cierre es IRREVERSIBLE salvo ajuste posterior", "details": { "clave_natural": "e57a318a-...:2026:9", "simbolico": "ERROR_PERIODO_YA_CERRADO", "cierre_existente": { "...": "..." }, "reabrible": false, "correccion": "AJUSTE_POSTERIOR_B5 (el ajuste SUMA, no reabre)" } } }
```

### 4. Fallo — ajuste descuadrado → 409 DESCUADRE

```json
{ "project_id": "e57a318a-...", "rol": "CIERRE", "nivel": 2, "ejercicio": 2026, "mes": 9, "ajustes": [ { "apuntes": [ { "cuenta": "628", "debe": 100, "haber": 0 }, { "cuenta": "410", "debe": 0, "haber": 90 } ] } ] }
```

→ `409 DESCUADRE` + `contabilidad.cierre.cerrar.failed`.

### 5. Fallo — rol no autorizado → 409

```json
{ "project_id": "e57a318a-...", "rol": "OPERADOR", "nivel": 2, "ejercicio": 2026, "mes": 9 }
```

→ `409 ERROR_DOS_ESCRITORES` + `contabilidad.cierre.cerrar.failed`.

### 6. `estado` — resumen de los dos niveles

```json
{ "project_id": "e57a318a-..." }
```

Respuesta `200`:

```json
{ "project_id": "e57a318a-...", "cierres": [ "..." ], "n_cierres": 2, "ultimo_nivel1": { "...": "..." }, "ultimo_nivel2": { "...": "..." }, "irreversible": true, "reabrible": false, "dos_niveles": { "nivel_1": "(proyecto, jornada)", "nivel_2": "(proyecto, ejercicio, mes)" } }
```

### 7. Entrada fire-and-forget — hecho CIERRE_JORNADA (A1 → C4)

Entra `contabilidad.hecho_admitido` con `{project_id, hecho:{tipo:'CIERRE_JORNADA', caja_final, ...}}`
→ cierra el NIVEL 1 con rol SISTEMA y publica `contabilidad.cierre_realizado` (o
`contabilidad.cierre_realizado.failed` si ya estaba cerrado). Un hecho de otro tipo → `null`.

### 8. Tools (sin RPC en module.json)

`toolCerrar` → `_cerrar`; `toolEsIrreversible` → `_esIrreversible`; `toolGenerarApertura` →
`_generarApertura`; `toolArrastrarSaldos` → `_arrastrarSaldos`.

## Tests

El test viviría en `tests/unit/cierre-ejercicio.test.js`. Cubre:

- `cerrar` NIVEL 2 con ajustes → `200`, `irreversible:true`, `reabrible:false`,
  `un_cierre_un_asiento:true`, asiento de cierre = suma de ajustes; emite
  `contabilidad.cierre_realizado`.
- `cerrar` NIVEL 2 sin ajustes → `200`, `asiento_cierre:null`, cierre registrado igualmente.
- `cerrar` NIVEL 1 con `jornada` → clave `(proyecto, jornada)`, `asiento_cierre:null`,
  `observa_la_operacion:true`, caja copiada sin inventar.
- **IRREVERSIBLE**: reprocesar la misma clave → `409 ERROR_PERIODO_YA_CERRADO` con
  `reabrible:false` y `correccion:'AJUSTE_POSTERIOR_B5...'`; publica
  `contabilidad.cierre_realizado.failed` **y** `contabilidad.cierre.cerrar.failed`.
- **Ajuste descuadrado** → `409 DESCUADRE`; ajuste con <2 apuntes → `422 PRECONDITION_FAILED`.
- **Single-writer**: rol distinto de CIERRE/SISTEMA → `409 ERROR_DOS_ESCRITORES`.
- **Sin clave natural** (nivel 1 sin jornada; nivel 2 sin ejercicio/mes) → `422`.
- **B2 mudo** → `503 DEPENDENCIA_NO_DISPONIBLE` y el cierre **revierte** (no queda registrado).
- `estado` sin clave → resumen de ambos niveles; con clave → `CERRADO`/`ABIERTO`.
- **C5 apertura**: `toolGenerarApertura` sin cierre previo → `422 SIN_CIERRE_ANTERIOR`
  (`asumido:false`, `inventados:false`); con cierre → apuntes de los saldos de cierre.
- `onHechoAdmitido` con `tipo:'CIERRE_JORNADA'` cierra NIVEL 1 con rol SISTEMA; con otro
  tipo → `null`.
- `project.activated` restaura los cierres de ambos niveles vía PosPersistencia.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/cierre-ejercicio
node --test tests/unit/cierre-ejercicio.test.js
```

## Notas de implementación

- Clase `CierreEjercicio extends ModuloHibridoReflejo`; `name = 'cierre-ejercicio'`,
  `version = 'reflejo-0.1.0'` (aunque es **custodio**: conserva el versionado reflejo, es el
  patrón real de la vertical). Store en memoria `this._store` (Map project_id →
  `{esquema:'contabilidad-cierre-ejercicio-v1', cierres:{}, secuencia:[], abierto:{},
  escritor:['CIERRE','SISTEMA']}`).
- Constantes: `ROLES_AUTORIZADOS = Set('CIERRE','SISTEMA')`, `CODE_DOS_ESCRITORES =
  'ERROR_DOS_ESCRITORES'`, `CODE_YA_CERRADO = 'ERROR_PERIODO_YA_CERRADO'`,
  `NIVEL_JORNADA = 1`, `NIVEL_MES = 2`, `ROL_ESCRITOR_DIARIO = 'ADMISION'`, `EPS = 0.005`.
- **PosPersistencia**: `_persist = new PosPersistencia({modulo, file:'cierre-ejercicio.json',
  dir:'/contabilidad/cierre-ejercicio', snapshot, hidratar})`. `onProjectActivated` →
  `restaurar(project_id)`; `onUnload` → `flush()` + `detener()`. Cada mutación marca
  `marcarDirty(pid)`.
- `onCerrarRequest` publica `contabilidad.cierre_realizado` en éxito; si el code es
  `ERROR_PERIODO_YA_CERRADO` publica **también** `contabilidad.cierre_realizado.failed` y el
  par `contabilidad.cierre.cerrar.failed`; en cualquier otro fallo, solo el par.
  `onEstadoRequest` solo publica el par de fallo. `onHechoAdmitido` es fire-and-forget (sin
  `_atender`).
- Proyecciones puras: `_cerrar`, `_esIrreversible`, `_nivel1`, `_nivel2`, `_cerrarConLibro`
  (async), `_estado`, `_generarApertura`, `_arrastrarSaldos`, `_claveNatural`,
  `_sumas`, `_num`, `_senalarAlDiario` (async), `_verificarEscritorUnico` (+
  `_obtenerOCrear`). `_atender`, `_rpc`, `_invalid` y `_errorResponse` vienen de la base.
- Tools: `toolCerrar`, `toolEsIrreversible`, `toolGenerarApertura`, `toolArrastrarSaldos`.
- DEP hacia delante: `contabilidad.cierre_realizado` lo consumen `inmovilizado` (F2, que
  dispara la amortización — solo nivel 2) y `aviso-cuadre` (C6). DEP hacia atrás por evento:
  `puerto-evento-vertical` (A1) publica `contabilidad.hecho_admitido`; `escritor-diario` (B2)
  es el ÚNICO escritor del diario (`contabilidad.asiento.cierre.request`).
