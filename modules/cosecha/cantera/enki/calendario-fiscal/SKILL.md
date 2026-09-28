---
name: calendario-fiscal
description: >
  Skill FULL del módulo CUSTODIO `calendario-fiscal` de la vertical contabilidad de Enki
  (D6, hoja del plan). LOS PLAZOS DECLARABLES POR EJERCICIO — y son declarables PORQUE
  CAMBIAN: prórrogas, festivos, domiciliación, cambios de criterio. Aquí NUNCA se fija
  una fecha de memoria: cada plazo (modelo, ejercicio, periodo, hasta cuándo) entra
  DECLARADO por ASESOR o DUENO; si un plazo no está declarado NO EXISTE para el sistema
  (no se estima, no se supone) y declarar sin lista de plazos o sin fecha límite → 422 /
  asumido:false. Las circunstancias que CAMBIAN el plazo (prórroga, festivo,
  domiciliación) viajan declaradas dentro del plazo, no se infieren. DISPARA AVISO
  PROACTIVO: al pedir los próximos se pide el aviso al motor de avisos (K2) por EVENTO
  (contabilidad.aviso.solicitar.request con tipo 'AVISO_PLAZO'); el aviso es lo único que
  K2 produce — el aviso NO cambia el plazo, y si K2 no contesta se publica
  contabilidad.plazo_proximo.failed (503) y el plazo queda declarado igualmente. El 'hoy'
  lo DICE quien pregunta (AAAA-MM-DD): el módulo NO construye fechas por su cuenta ni lee
  el reloj del sistema. Persiste por proyecto vía PosPersistencia. Úsala para operar,
  depurar o extender el custodio, o para entender su contrato de eventos.
when-to-use: >
  - Cuando necesites declarar los plazos de un ejercicio (RPC
    contabilidad.calendario.declarar.request) o pedir los próximos/atrasados
    (contabilidad.calendario.proximos.request).
  - Cuando depures por qué se rechaza (409 ERROR_DOS_ESCRITORES si el rol no es ASESOR/DUENO,
    422 SIN_PLAZOS_DECLARADOS si no hay lista de plazos, 422 si falta la fecha límite o tiene
    forma inválida o falta el 'hoy', 503 si motor-avisos K2 no responde).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), por qué ninguna
    fecha está cableada, cómo viajan las prórrogas/festivos/domiciliación y por qué el módulo
    no lee el reloj del sistema.
  - Cuando vayas a escribir/ampliar el test unitario del custodio calendario-fiscal.
tags: [enki, modulo, custodio, persistencia, contabilidad, calendario-fiscal, plazos, declarable]
---

# calendario-fiscal — CUSTODIO de los plazos declarables

## Qué hace el módulo

`calendario-fiscal` es un **CUSTODIO CON PERSISTENCIA** (D6, hoja del plan): **LOS PLAZOS
DECLARABLES POR EJERCICIO**. Y son declarables **PORQUE CAMBIAN**: prórrogas, festivos,
domiciliación, cambios de criterio.

**AQUI NUNCA SE FIJA UNA FECHA DE MEMORIA (invariante dura)**: cada plazo (qué modelo, qué
ejercicio, qué periodo, hasta cuándo) entra **DECLARADO** por **`ASESOR`** o **`DUENO`**. Si
un plazo no está declarado, **NO EXISTE para el sistema** — no se estima, no se supone.
Declarar sin lista de plazos → **`422 SIN_PLAZOS_DECLARADOS`** (`asumido:false`); un plazo
sin fecha límite → **`422`**; una fecha con forma inválida (no `AAAA-MM-DD`) → **`422
INVALID_INPUT`**. Toda respuesta de declaración lleva `fecha_de_memoria:false`,
`ley_cableada:false`.

**Las circunstancias que CAMBIAN el plazo** (prórroga, festivo, domiciliación) **viajan
declaradas dentro del plazo**, no se infieren; se arrastran al aviso.

**DISPARA AVISO PROACTIVO**: al pedir los próximos, por cada plazo próximo o atrasado se
**PIDE el aviso al motor de avisos (K2)** por **EVENTO** (`contabilidad.aviso.solicitar.request`
con `tipo:'AVISO_PLAZO'`, `contexto` con modelo/periodo/ejercicio/hasta/prórroga/festivo/
domiciliación/`origen_fecha:'DECLARADA'`). **El aviso es lo único que K2 produce — el aviso NO
cambia el plazo**; si K2 no contesta se publica `contabilidad.plazo_proximo.failed` (**503
DEPENDENCIA_NO_DISPONIBLE**) y el plazo queda declarado igualmente.

**El 'hoy' lo DICE quien pregunta** (`AAAA-MM-DD`): el módulo **NO construye fechas por su
cuenta ni lee el reloj del sistema** (proximos sin hoy → **`422`**).

**Un solo escritor**: solo `ASESOR`/`DUENO` declaran plazos; cualquier otro rol → **`409
ERROR_DOS_ESCRITORES`**.

Persiste por proyecto con **PosPersistencia** (storage
`/contabilidad/calendario-fiscal/calendario-fiscal.json`), restaura en `project.activated` y
vuelca en `onUnload`. La dependencia con `perfil-administrativo` (D15) y `motor-avisos` (K2)
es **por EVENTO, NUNCA por `require` cruzado** (de D15 se LEEN las obligaciones que aplican,
sin asumirlas).

> **NO REUTILIZA**: el calendario fiscal con plazos declarables no existe en el inventario.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response + ciclo de vida)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.calendario.declarar.request` | `onDeclararRequest` | RPC custodio: {project_id, rol:'ASESOR'\|'DUENO', ejercicio, plazos:[{modelo, periodo?, hasta (AAAA-MM-DD), prorroga?, festivo?, domiciliacion?, via?, descripcion?, destinatario?}], antelacion_dias?} → {project_id, ejercicio, plazos:[{clave, modelo, periodo, hasta, declarada:true, origen_fecha, prorroga, festivo, domiciliacion}], n_plazos, antelacion_dias, fecha_de_memoria:false, ley_cableada:false}. Los plazos CAMBIAN: se declaran (no hay ninguna fecha cableada). Cerrojos: rol fuera de ASESOR/DUENO → 409 ERROR_DOS_ESCRITORES; sin lista de plazos → 422 SIN_PLAZOS_DECLARADOS; sin fecha limite declarada o con forma invalida → 422. Publica contabilidad.plazo_declarado y responde por contabilidad.calendario.declarar.response; error → contabilidad.calendario.declarar.failed. |
| `contabilidad.calendario.proximos.request` | `onProximosRequest` | RPC custodio: {project_id, hoy (AAAA-MM-DD), antelacion_dias?, ejercicio?} → {project_id, hoy, antelacion_dias, plazos:[{modelo, periodo, hasta, dias_restantes, vencido, estado:'PROXIMO'\|'VENCE_HOY'\|'ATRASADO'}], n_plazos, n_atrasados}. El 'hoy' lo DICE quien pregunta: sin el → 422 (el modulo no fija fechas de memoria) y no lee el reloj del sistema. Por cada plazo proximo o atrasado se DISPARA el aviso proactivo: publica contabilidad.plazo_proximo y PIDE el aviso a motor-avisos (K2) por contabilidad.aviso.solicitar.request; si K2 no contesta → contabilidad.plazo_proximo.failed (503) sin que el plazo cambie. Responde por contabilidad.calendario.proximos.response; error → contabilidad.calendario.proximos.failed. |
| `project.activated` | `onProjectActivated` | Restaura del storage (PosPersistencia) el calendario declarado del proyecto activado: los plazos de cada ejercicio son POR PROYECTO y se declaran, no se cablean. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.plazo_declarado` | Fire-and-forget (D6): los plazos de un ejercicio quedaron DECLARADOS → {project_id, ejercicio, plazos:[{clave, modelo, periodo, hasta, declarada:true, origen_fecha, prorroga, festivo, domiciliacion}], n_plazos, antelacion_dias, fecha_de_memoria:false}. La ley entra como DATO: ninguna fecha esta cableada. |
| `contabilidad.plazo_proximo` | Fire-and-forget (D6): un plazo declarado se ACERCA (o esta atrasado) → {project_id, tipo:'AVISO_PLAZO', modelo, periodo, ejercicio, hasta, dias_restantes, estado, destinatario, prioridad, prorroga, festivo, domiciliacion, contexto}. Dispara el aviso proactivo; el aviso NO cambia el plazo. |
| `contabilidad.calendario.declarar.failed` | Par de fallo determinista: declarar sin project_id/ejercicio, con rol fuera de ASESOR/DUENO (409 ERROR_DOS_ESCRITORES), sin plazos (422 SIN_PLAZOS_DECLARADOS) o con una fecha limite ausente o mal formada (422). Cierra el circulo de contabilidad.calendario.declarar.request. |
| `contabilidad.calendario.proximos.failed` | Par de fallo determinista: proximos sin project_id o sin el 'hoy' declarado (422 — el modulo no fija fechas de memoria). Cierra el circulo de contabilidad.calendario.proximos.request. |
| `contabilidad.plazo_declarado.failed` | Par de fallo del evento de dominio contabilidad.plazo_declarado: la emision del hecho de dominio no se completo, o el disparo del aviso de un plazo no se pudo armar. |
| `contabilidad.plazo_proximo.failed` | Par de fallo determinista/tolerante: motor-avisos (K2) no respondio la peticion de aviso del plazo → 503 DEPENDENCIA_NO_DISPONIBLE. El plazo queda DECLARADO igualmente; NO se fabrica un aviso que K2 no produjo. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> `contabilidad.calendario.declarar.failed` cierra
> `contabilidad.calendario.declarar.request`; `contabilidad.calendario.proximos.failed` cierra
> `contabilidad.calendario.proximos.request`.

> Nota: no está en module.json pero sí lo emite index.js — `_atender` publica
> `contabilidad.calendario.declarar.response` y `contabilidad.calendario.proximos.response`
> (los pares response de los RPC); **NO están declaradas en `publishes`**. Además
> `onProximosRequest` publica **en éxito** `contabilidad.plazo_proximo` por plazo y, si el
> disparo no se arma, `contabilidad.plazo_declarado.failed`.

> Nota: declarado en module.json pero NO emitido por index.js en el camino natural —
> `contabilidad.plazo_declarado.failed` se declara como par del evento de DOMINIO, pero en
> `index.js` solo se publica cuando `_dispararAviso` devuelve `status !== 200` (dentro de
> `onProximosRequest`), no en la declaración. `contabilidad.plazo_proximo.failed` **sí** se
> emite (K2 mudo).

> Nota: no está en module.json pero sí lo emite index.js — el módulo publica por `_rpc`
> `contabilidad.aviso.solicitar.request` (dependencia por EVENTO hacia `motor-avisos` K2, no
> declarada como publisher — solo como `publishes` aparece `contabilidad.plazo_proximo`).

> Nota de sub-declaración: `_dispararAviso` **NO está expuesto por ningún RPC** — solo como
> tool `toolDispararAviso`. La declaración (D15, obligaciones que aplican) se LEE por EVENTO,
> no se asume.

## Reglas de negocio

1. **NINGUNA FECHA CABLEADA (invariante dura)**: los plazos se DECLARAN. Si un plazo no está
   declarado, no existe para el sistema. `fecha_de_memoria:false`, `ley_cableada:false` en
   toda respuesta.
2. **Un solo escritor (D6)**: `_verificarEscritorUnico` exige rol en **{ASESOR, DUENO}**
   (normalizado a mayúsculas). Cualquier otro → **`409 ERROR_DOS_ESCRITORES`**
   (`escritor_vigente:['ASESOR','DUENO']`).
3. **Declarar exige la lista de plazos**: `_declarar` — sin `plazos` (o array vacío) →
   **`422 PRECONDITION_FAILED`** con `{ejercicio, asumido:false, senal:'SIN_PLAZOS_DECLARADOS'}`.
4. **Cada plazo exige su fecha límite declarada**: si falta `hasta`/`fecha_limite`/`fecha` →
   **`422 PRECONDITION_FAILED`** (`asumido:false`); si no casa `/^\d{4}-\d{2}-\d{2}$/` →
   **`422 INVALID_INPUT`** (`fecha_recibida`). **La fecha es un DATO, jamás una constante legal.**
5. **La clave del plazo es `(ejercicio, modelo, periodo)`**: `clave = '<ejercicio>:<modelo>:<periodo>'`;
   `periodo` por defecto `'EJERCICIO'`; `modelo` por defecto `''`→ si queda vacío →
   `400 INVALID_INPUT plazo.modelo`.
6. **Circunstancias que CAMBIAN el plazo (se declaran, no se suponen)**: cada plazo guarda
   `prorroga`, `festivo`, `domiciliacion` (booleano declarado o `null`), `via`,
   `descripcion`, `destinatario` (por defecto `'ASESOR'`), `origen_fecha` (por defecto
   `'DECLARADA'`).
7. **El 'hoy' lo DICE quien pregunta (no hay reloj implícito)**: `_proximos` — sin `hoy`
   declarado o con forma inválida → **`422 PRECONDITION_FAILED`** con `{hoy_recibido,
   asumido:false}`. La aritmética es de texto (`Date.UTC` de la fecha declarada, dividida
   por 86400000), sin leer el reloj del sistema.
8. **Estados de un plazo**: `dias <= antelacion` (o atrasado) → entra en la lista;
   `estado = dias < 0 ? 'ATRASADO' : (dias === 0 ? 'VENCE_HOY' : 'PROXIMO')`;
   `vencido = dias < 0`, `proximo = dias >= 0`. La lista se ordena por `dias_restantes`
   ascendente. **Lo atrasado se declara, no se esconde.**
9. **Antelación declarable**: `antelacion_dias` (por defecto `DIAS_AVISO_DEFECTO = 15`),
   sobreescribible por declaración o por la propia petición de próximos.
10. **El aviso es proactivo y NO cambia el plazo**: `_dispararAviso` compone la señal con
    `tipo:'AVISO_PLAZO'`, `origen:'D6_CALENDARIO_FISCAL'`, `prioridad:'ALTA'` si `vencido` o
    `dias_restantes <= 3` (si no `'NORMAL'`), `motivo`, `contexto` (con `origen_fecha:'DECLARADA'`).
    Lleva `prorroga`/`festivo`/`domiciliacion` — **es lo que CAMBIA**.
11. **Contrato TOLERANTE con K2**: `_pedirAviso` hace `_rpc`
    (`contabilidad.aviso.solicitar.request`, `timeout_ms:4000`); si no responde o
    `status !== 200` → `contabilidad.plazo_proximo.failed` con **`503
    DEPENDENCIA_NO_DISPONIBLE`** y `details:{dependencia:'motor-avisos', modelo, hasta}`.
    **El plazo queda declarado: NO se fabrica el aviso.**
12. **Los plazos son POR PROYECTO**: `store[pid]` con
    `{esquema:'contabilidad-calendario-fiscal-v1', ejercicios:{}, declaraciones:[],
    antelacion_dias:15, escritor:['ASESOR','DUENO'], ley_cableada:false}`. Sin restaurar
    (`project.activated`) el calendario no se puede garantizar.
13. **Validaciones deterministas**: falta `project_id` → `400 INVALID_INPUT project_id`;
    sin `ejercicio` → `400 INVALID_INPUT ejercicio`; sin modelo de plazo → `400 INVALID_INPUT
    plazo.modelo`. Shape: `{status:400, error:{code:'INVALID_INPUT', message:'<campo>
    requerido', details:{field:<campo>}}}`.
14. **HTTP exacto**: éxito `200`; payload inválido → `400`; segundo escritor → `409`; sin
    plazos / sin fecha / sin 'hoy' → `422`; K2 mudo → `503` en `plazo_proximo.failed`;
    excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPCs que responden en `contabilidad.calendario.declarar.response` y
`contabilidad.calendario.proximos.response`.

### 1. `declarar` — los plazos entran declarados (nada cableado)

```json
{
  "project_id": "e57a318a-...",
  "rol": "ASESOR",
  "ejercicio": 2026,
  "antelacion_dias": 15,
  "plazos": [
    { "modelo": "303", "periodo": "3T", "hasta": "2026-10-20", "prorroga": null, "domiciliacion": true },
    { "modelo": "111", "periodo": "3T", "hasta": "2026-10-20" }
  ],
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "ejercicio": "2026",
  "plazos": [ { "clave": "2026:303:3T", "ejercicio": "2026", "modelo": "303", "periodo": "3T", "hasta": "2026-10-20", "declarada": true, "origen_fecha": "DECLARADA", "prorroga": null, "festivo": null, "domiciliacion": true, "destinatario": "ASESOR" }, { "clave": "2026:111:3T", "ejercicio": "2026", "modelo": "111", "periodo": "3T", "hasta": "2026-10-20", "declarada": true, "domiciliacion": null } ],
  "n_plazos": 2,
  "antelacion_dias": 15,
  "fecha_de_memoria": false,
  "ley_cableada": false
}
```

Emite `contabilidad.plazo_declarado` (res.data + `correlation_id`).

### 2. `proximos` — el 'hoy' lo dice quien pregunta

```json
{ "project_id": "e57a318a-...", "hoy": "2026-10-10", "antelacion_dias": 15 }
```

Respuesta `200` (10 días de antelación ≤ 15 → entra):

```json
{
  "project_id": "e57a318a-...",
  "hoy": "2026-10-10",
  "antelacion_dias": 15,
  "plazos": [ { "clave": "2026:303:3T", "modelo": "303", "periodo": "3T", "hasta": "2026-10-20", "dias_restantes": 10, "vencido": false, "proximo": true, "estado": "PROXIMO", "prorroga": null, "festivo": null, "domiciliacion": true } ],
  "n_plazos": 1,
  "n_atrasados": 0,
  "determinista": true,
  "lee_el_hoy_declarado": true
}
```

Por cada plazo se emite `contabilidad.plazo_proximo` y se PIDE el aviso a K2
(`contabilidad.aviso.solicitar.request`, `tipo:'AVISO_PLAZO'`).

### 3. Fallo — sin lista de plazos → 422 SIN_PLAZOS_DECLARADOS

```json
{ "project_id": "e57a318a-...", "rol": "ASESOR", "ejercicio": 2026 }
```

→ `422 PRECONDITION_FAILED` (`senal:'SIN_PLAZOS_DECLARADOS'`, `asumido:false`) +
`contabilidad.calendario.declarar.failed`.

### 4. Fallo — sin el 'hoy' declarado → 422

```json
{ "project_id": "e57a318a-..." }
```

→ `422 PRECONDITION_FAILED` (*«proximos exige el "hoy" declarado (AAAA-MM-DD): el modulo no
fija fechas de memoria»*, `hoy_recibido:null`, `asumido:false`) +
`contabilidad.calendario.proximos.failed`.

### 5. Fallo — rol no autorizado → 409

```json
{ "project_id": "e57a318a-...", "rol": "OPERADOR", "ejercicio": 2026, "plazos": [] }
```

→ `409 ERROR_DOS_ESCRITORES` + `contabilidad.calendario.declarar.failed`.

### 6. Fallo — K2 mudo → 503 (el plazo queda declarado)

Si `motor-avisos` no responde la petición del aviso del plazo, se publica
`contabilidad.plazo_proximo.failed`:

```json
{ "status": 503, "error": { "code": "DEPENDENCIA_NO_DISPONIBLE", "message": "motor-avisos (K2) no respondio: el plazo QUEDA declarado y su aviso emitido, no se fabrica el aviso", "details": { "dependencia": "motor-avisos", "modelo": "303", "hasta": "2026-10-20" } } }
```

### 7. Tools (sin RPC en module.json)

`toolDeclarar` → `_declarar`; `toolProximos` → `_proximos`; `toolDispararAviso` →
`_dispararAviso`.

## Tests

El test viviría en `tests/unit/calendario-fiscal.test.js`. Cubre:

- `declarar` con `rol:'ASESOR'` → `200`, `plazos` con su `clave` `(ejercicio, modelo,
  periodo)`, `fecha_de_memoria:false`, `ley_cableada:false`; emite
  `contabilidad.plazo_declarado`.
- **Sin plazos** → `422 SIN_PLAZOS_DECLARADOS`; plazo sin `hasta` → `422`; fecha mal formada
  → `422 INVALID_INPUT`.
- **Single-writer**: rol distinto de ASESOR/DUENO → `409 ERROR_DOS_ESCRITORES`.
- `proximos` con `hoy` → lista ordenada por `dias_restantes` con `estado` PROXIMO/VENCE_HOY/
  ATRASADO; **sin `hoy` → `422`** (el módulo no fija fechas de memoria).
- Por cada plazo próximo se emite `contabilidad.plazo_proximo` y se pide el aviso a K2 con
  `tipo:'AVISO_PLAZO'`, llevando `prorroga`/`festivo`/`domiciliacion`.
- **Contrato TOLERANTE K2**: K2 no responde → `contabilidad.plazo_proximo.failed` (503); el
  plazo queda declarado y **no** cambia.
- **Nada cableado**: declarar sin `prorroga`/`festivo`/`domiciliacion` los deja `null` (no se
  infieren).
- `project.activated` restaura el calendario vía PosPersistencia.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/calendario-fiscal
node --test tests/unit/calendario-fiscal.test.js
```

## Notas de implementación

- Clase `CalendarioFiscal extends ModuloHibridoReflejo`; `name = 'calendario-fiscal'`,
  `version = 'reflejo-0.1.0'` (aunque es **custodio**: conserva el versionado reflejo, es el
  patrón real de la vertical). Store en memoria `this._store` (Map project_id →
  `{esquema:'contabilidad-calendario-fiscal-v1', ejercicios:{}, declaraciones:[],
  antelacion_dias:15, escritor:['ASESOR','DUENO'], ley_cableada:false}`).
- Constantes: `ROLES_AUTORIZADOS = Set('ASESOR','DUENO')`, `CODE_DOS_ESCRITORES =
  'ERROR_DOS_ESCRITORES'`, `DIAS_AVISO_DEFECTO = 15`, `DESTINATARIO_DEFECTO = 'ASESOR'`,
  `RE_FECHA = /^\d{4}-\d{2}-\d{2}$/`.
- **PosPersistencia**: `_persist = new PosPersistencia({modulo, file:'calendario-fiscal.json',
  dir:'/contabilidad/calendario-fiscal', snapshot, hidratar})`. `onProjectActivated` →
  `restaurar(project_id)`; `onUnload` → `flush()` + `detener()`. Cada mutación marca
  `marcarDirty(pid)`.
- `onDeclararRequest` publica `contabilidad.plazo_declarado` en éxito o el par
  `contabilidad.calendario.declarar.failed` en fallo. `onProximosRequest` publica
  `contabilidad.plazo_proximo` por plazo (o `contabilidad.plazo_declarado.failed` si el
  disparo no se arma) y espera `_pedirAviso`; en fallo global publica
  `contabilidad.calendario.proximos.failed`. Ambos delegan en `_atender(e, '<op>',
  'contabilidad.calendario.<op>.response', fn)`.
- Proyecciones puras: `_declarar`, `_proximos`, `_dispararAviso`, `_pedirAviso` (async),
  `_diasHasta`, `_aMs`, `_verificarEscritorUnico` (+ `_obtenerOCrear`). `_atender`, `_rpc`,
  `_invalid` y `_errorResponse` vienen de la base.
- Tools: `toolDeclarar`, `toolProximos`, `toolDispararAviso`.
- DEP hacia delante: `contabilidad.plazo_declarado` y `contabilidad.plazo_proximo` trazan el
  calendario y disparan el aviso; `contabilidad.aviso.solicitar.request` es el PUERTO a K2
  `motor-avisos`. DEP hacia atrás por evento: `perfil-administrativo` (D15) aporta las
  obligaciones que aplican (por EVENTO, sin asumirlas).
