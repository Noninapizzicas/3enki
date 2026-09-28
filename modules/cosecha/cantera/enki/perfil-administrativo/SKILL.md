---
name: perfil-administrativo
description: >
  Skill FULL del módulo CUSTODIO `perfil-administrativo` de la vertical contabilidad de
  Enki (D15, hoja del plan). QUÉ administraciones y obligaciones aplican al negocio. El
  TERRITORIO (COMUN / FORAL / CANARIAS / CEUTA_MELILLA) y el RÉGIMEN (IVA/IGIC/IPSI como
  impuesto indirecto; IS o IRPF como sujeto) son DATOS DECLARABLES por negocio y por
  ejercicio: LA LEY NUNCA SE CABLEA EN EL CÓDIGO. Sin territorio declarado → 422
  TERRITORIO_NO_DECLARADO; sin perfil declarado → 404 PERFIL_NO_DECLARADO. Perfil
  administrativo != parámetros fiscales (aquí solo se declara QUÉ aplica, no cuánto). UN
  SOLO ESCRITOR de la parcela: DUENO o ASESOR (otro rol → 409 ERROR_DOS_ESCRITORES). Las
  obligaciones son DECLARABLES y ampliables (ley_cableada:false). Persiste por proyecto
  vía PosPersistencia. Úsala para operar, depurar o extender el custodio, o para entender
  su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites declarar el perfil administrativo de una sociedad (RPC
    contabilidad.perfil.declarar.request) o consultar qué obligaciones aplican
    (contabilidad.perfil.aplicables.request; lo consumen liquidacion-iva D1,
    retenciones-is-irpf D4/D5 y calendario-fiscal D6).
  - Cuando depures por qué se rechaza (409 ERROR_DOS_ESCRITORES si el rol no es
    DUENO/ASESOR, 422 TERRITORIO_NO_DECLARADO si falta territorio, 422
    TERRITORIO_NO_VALIDO/IMPUESTO_NO_VALIDO/SUJETO_NO_VALIDO, 404 PERFIL_NO_DECLARADO).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), por qué la ley
    es un DATO declarable y cómo se derivan las obligaciones.
  - Cuando vayas a escribir/ampliar el test unitario del custodio perfil-administrativo.
tags: [enki, modulo, custodio, persistencia, contabilidad, perfil-administrativo, fiscal, declarable]
---

# perfil-administrativo — CUSTODIO del perfil administrativo declarable

## Qué hace el módulo

`perfil-administrativo` es un **CUSTODIO CON PERSISTENCIA** (D15, hoja del plan): **QUÉ
administraciones y obligaciones aplican al negocio**. El **TERRITORIO** (`COMUN` /
`FORAL` / `CANARIAS` / `CEUTA_MELILLA`) y el **RÉGIMEN** (`IVA`/`IGIC`/`IPSI` como
**impuesto indirecto**; `IS` o `IRPF` como **sujeto**) son **DATOS DECLARABLES por negocio
y ejercicio**: **LA LEY NUNCA SE CABLEA EN EL CÓDIGO**. Cambia la ley → se **DECLARA** el
perfil; el sistema **NO asume territorio** (los cuatro son posibles y el sistema no elige):
sin territorio declarado → **`422 TERRITORIO_NO_DECLARADO`**; sin perfil declarado →
**`404 PERFIL_NO_DECLARADO`**.

**Perfil administrativo != parámetros fiscales** (D11 = tipos y bases): aquí solo se declara
**QUÉ** aplica, no **cuánto**. **UN SOLO ESCRITOR** de la parcela: **`DUENO` o `ASESOR`**
(cualquier otro rol → **`409 ERROR_DOS_ESCRITORES`**).

El mapa territorio→impuesto indirecto y las obligaciones derivadas son **DECLARABLES y
ampliables** (`impuesto_indirecto` y `obligaciones` explícitas **sobreescriben**; los
identificadores de obligación son **DATOS, no leyes cableadas**: `ley_cableada:false`
siempre).

Persiste por proyecto con **PosPersistencia** (storage
`/contabilidad/perfil-administrativo/perfil-administrativo.json`), restaura en
`project.activated` y vuelca en `onUnload`. La **secuencia append-only de declaraciones**
existe para **auditar qué se declaró y cuándo**.

> **NO REUTILIZA**: no existe perfil fiscal por sociedad en el inventario (fiscal = 0
> módulos).

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.perfil.declarar.request` | `onDeclararRequest` | RPC custodio: {project_id, rol:'DUENO'\|'ASESOR', sociedad, territorio:'COMUN'\|'FORAL'\|'CANARIAS'\|'CEUTA_MELILLA', impuesto_indirecto?:'IVA'\|'IGIC'\|'IPSI', sujeto?:'IS'\|'IRPF', regimen?, ejercicio?, obligaciones?:[]} → {project_id, sociedad, perfil:{territorio, impuesto_indirecto, sujeto, regimen, obligaciones, ley_cableada:false}, n_obligaciones}. La ley entra como DATO declarable; el sistema NO asume territorio. Cerrojos: rol distinto de DUENO/ASESOR → 409 ERROR_DOS_ESCRITORES; territorio ausente → 422 TERRITORIO_NO_DECLARADO; territorio/impuesto/sujeto fuera del catalogo declarable → 422. Exito publica contabilidad.perfil_declarado y responde por contabilidad.perfil.declarar.response; error → contabilidad.perfil.declarar.failed. |
| `contabilidad.perfil.aplicables.request` | `onAplicablesRequest` | RPC custodio: {project_id, sociedad} → {project_id, sociedad, territorio, impuesto_indirecto, sujeto, regimen, obligaciones:[IdObligacion], n_obligaciones, ley_cableada:false}. Proyeccion PURA de lectura: que obligaciones aplican segun territorio + regimen DECLARADOS. Si la sociedad no tiene perfil declarado → 404 PERFIL_NO_DECLARADO (el sistema no asume territorio). Responde por contabilidad.perfil.aplicables.response; error → contabilidad.perfil.aplicables.failed. |
| `project.activated` | `onProjectActivated` | Restaura del storage (PosPersistencia) los perfiles administrativos y el historial de declaraciones del proyecto activado. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.perfil_declarado` | Fire-and-forget (D15): una sociedad declaro su perfil administrativo (territorio + regimen) → {project_id, sociedad, perfil:{territorio, impuesto_indirecto, sujeto, obligaciones, ley_cableada:false}, n_obligaciones}. Lo consumen liquidacion-iva (D1), retenciones-is-irpf (D4/D5) y calendario-fiscal (D6) para saber QUE aplica antes de calcular CUANTO. |
| `contabilidad.perfil.declarar.failed` | Par de fallo determinista: declarar sin project_id/sociedad, con rol no autorizado (409 ERROR_DOS_ESCRITORES), sin territorio (422 TERRITORIO_NO_DECLARADO) o con territorio/impuesto/sujeto fuera del catalogo. Cierra el circulo de contabilidad.perfil.declarar.request. |
| `contabilidad.perfil.aplicables.failed` | Par de fallo determinista: aplicables sin project_id/sociedad, o sociedad sin perfil declarado (404 PERFIL_NO_DECLARADO). Cierra el circulo de contabilidad.perfil.aplicables.request. |
| `contabilidad.perfil_declarado.failed` | Par de fallo del evento de dominio contabilidad.perfil_declarado: la emision del hecho de dominio no se completo. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> `contabilidad.perfil.declarar.failed` cierra `contabilidad.perfil.declarar.request`;
> `contabilidad.perfil.aplicables.failed` cierra `contabilidad.perfil.aplicables.request`.

> Nota: no está en module.json pero sí lo emite index.js — `_atender` publica
> `contabilidad.perfil.declarar.response` y `contabilidad.perfil.aplicables.response` (los
> pares response de los RPC); **NO están declaradas en `publishes`**.

> Nota: declarado en module.json pero NO emitido por index.js (patrón de la vertical: el
> par de fallo real es `<op>.failed`) — `contabilidad.perfil_declarado.failed` es el par de
> fallo del evento de DOMINIO; el custodio solo publica los pares `*.failed` de sus RPC.

> Nota: la dependencia con `cola-declaraciones-criterio` (K9) que menciona el `_doc` es
> **conceptual** (el catálogo de territorios/obligaciones es declarable y ampliable): el
> `index.js` **no** emite ningún `*.request` por `_rpc`, por lo que no hay publicación no
> declarada que anotar.

## Reglas de negocio

1. **GUARD de un solo escritor (D15)**: `_verificarEscritorUnico` normaliza el rol a
   mayúsculas y exige que esté en `ROLES_AUTORIZADOS = {DUENO, ASESOR}`. Si no →
   **`409 ERROR_DOS_ESCRITORES`** con
   `{ escritor_vigente:['DUENO','ASESOR'], rol_intentado, simbolico:'ERROR_DOS_ESCRITORES' }`.
2. **Sin territorio NO hay perfil**: si `territorio` (payload o `perfil.territorio`) está
   vacío → **`422 TERRITORIO_NO_DECLARADO`** con
   `{ territorios_posibles:['COMUN','FORAL','CANARIAS','CEUTA_MELILLA'], asumido:false }`.
   *El sistema no asume uno.*
3. **Catálogos declarables cerrados por validación**: `TERRITORIOS = ['COMUN','FORAL',
   'CANARIAS','CEUTA_MELILLA']`, `IMPUESTOS_INDIRECTOS = ['IVA','IGIC','IPSI']`,
   `SUJETOS = ['IS','IRPF']`. Fuera de catálogo → `422 TERRITORIO_NO_VALIDO` /
   `422 IMPUESTO_NO_VALIDO` / `422 SUJETO_NO_VALIDO` (el sujeto solo se valida si viene).
   *Los catálogos son DATOS declarables, no leyes cableadas.*
4. **El impuesto indirecto por defecto es DECLARABLE, no ley**: si no se declara
   `impuesto_indirecto`, se usa `IMPUESTO_POR_TERRITORIO = { COMUN:'IVA', FORAL:'IVA',
   CANARIAS:'IGIC', CEUTA_MELILLA:'IPSI' }` — un **valor declarable inicial** que el
   dueño/asesor puede **sobreescribir** con `impuesto_indirecto` y con `obligaciones`
   explícitas.
5. **Derivación de obligaciones (`_derivarObligaciones`)**: parte de
   `INDDIRECTO_<impuesto>`, `RESUMEN_ANUAL_<impuesto>`, `LIBROS_REGISTRO`; añade
   `SUJETO_<sujeto>` si hay sujeto; añade `NORMATIVA_FORAL` si `territorio === 'FORAL'`,
   `REF_IGIC` si `CANARIAS`, `REF_IPSI` si `CEUTA_MELILLA`; y añade (en mayúsculas) cada
   obligación explícita de `obligaciones`. Los IDs son **DATOS**, no leyes. **`ley_cableada:false`
   siempre.**
6. **El perfil se guarda con su procedencia**: `{ sociedad, territorio,
   impuesto_indirecto, sujeto, regimen, ejercicio, obligaciones_declaradas,
   obligaciones, declarado_por, declarado_en, ley_cableada:false, nota:'territorio y
   regimen son DATOS DECLARABLES: la ley nunca se cablea en el codigo' }`. La respuesta
   añade `el_sistema_no_asume_territorio:true`.
7. **Secuencia append-only de declaraciones**: cada declaración se empuja a
   `d.declaraciones` con `{ sociedad, territorio, impuesto_indirecto, sujeto, ejercicio,
   declarado_en, secuencia }` — para **auditar qué se declaró y cuándo**.
8. **`aplicables` es lectura PURA**: `_aplicables` devuelve el perfil de la sociedad o
   **`404 PERFIL_NO_DECLARADO`** con `{ sociedad, accion:'DECLARAR_PERFIL', asumido:false }`.
   **El sistema no asume territorio.**
9. **Validaciones deterministas**: falta `project_id` → `400 INVALID_INPUT project_id`;
   sin `sociedad` → `400 INVALID_INPUT sociedad`. Shape: `{ status:400, error:{
   code:'INVALID_INPUT', message:'<campo> requerido', details:{ field:<campo> } } }`.
10. **El perfil es POR PROYECTO**: `store[pid]` con
    `{ esquema:'contabilidad-perfil-administrativo-v1', perfiles:{}, declaraciones:[],
    catalogo_obligaciones:{}, escritor:'DUENO/ASESOR' }`. Sin restaurar
    (`project.activated`) el perfil declarado no se puede garantizar.
11. **HTTP exacto**: éxito `200`; payload inválido → `400`; segundo escritor → `409`;
    territorio/catálogo → `422`; sin perfil → `404`; excepción en `_atender` →
    `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPCs que responden en `contabilidad.perfil.declarar.response` y
`contabilidad.perfil.aplicables.response`.

### 1. `declarar` — declarar el perfil de una sociedad

```json
{
  "project_id": "e57a318a-...",
  "rol": "ASESOR",
  "sociedad": "ACME SL",
  "territorio": "CANARIAS",
  "sujeto": "IS",
  "regimen": "GENERAL",
  "ejercicio": "2026",
  "obligaciones": ["MOD_420", "MOD_415"],
  "correlation_id": "abc-123"
}
```

Respuesta `200` (`impuesto_indirecto` derivado = `IGIC`):

```json
{
  "project_id": "e57a318a-...",
  "sociedad": "ACME SL",
  "perfil": { "sociedad": "ACME SL", "territorio": "CANARIAS", "impuesto_indirecto": "IGIC", "sujeto": "IS", "regimen": "GENERAL", "ejercicio": "2026", "obligaciones_declaradas": ["MOD_420","MOD_415"], "obligaciones": ["INDDIRECTO_IGIC","RESUMEN_ANUAL_IGIC","LIBROS_REGISTRO","SUJETO_IS","REF_IGIC","MOD_420","MOD_415"], "declarado_por": "ASESOR", "declarado_en": "...", "ley_cableada": false, "nota": "territorio y regimen son DATOS DECLARABLES: la ley nunca se cablea en el codigo" },
  "obligaciones": ["INDDIRECTO_IGIC","RESUMEN_ANUAL_IGIC","LIBROS_REGISTRO","SUJETO_IS","REF_IGIC","MOD_420","MOD_415"],
  "n_obligaciones": 7,
  "ley_cableada": false,
  "el_sistema_no_asume_territorio": true
}
```

Emite `contabilidad.perfil_declarado` (res.data + `correlation_id`).

### 2. `aplicables` — qué obligaciones aplican (lectura pura)

```json
{ "project_id": "e57a318a-...", "sociedad": "ACME SL" }
```

Respuesta `200`:

```json
{ "project_id": "e57a318a-...", "sociedad": "ACME SL", "territorio": "CANARIAS", "impuesto_indirecto": "IGIC", "sujeto": "IS", "regimen": "GENERAL", "ejercicio": "2026", "obligaciones": ["INDDIRECTO_IGIC","RESUMEN_ANUAL_IGIC","LIBROS_REGISTRO","SUJETO_IS","REF_IGIC","MOD_420","MOD_415"], "n_obligaciones": 7, "ley_cableada": false, "determinista": true }
```

### 3. Fallo — sin territorio → 422

```json
{ "project_id": "e57a318a-...", "rol": "DUENO", "sociedad": "ACME SL" }
```

Respuesta `422` + `contabilidad.perfil.declarar.failed`:

```json
{ "status": 422, "error": { "code": "TERRITORIO_NO_DECLARADO", "message": "el territorio es un DATO DECLARABLE (COMUN | FORAL | CANARIAS | CEUTA_MELILLA): el sistema no asume uno", "details": { "territorios_posibles": ["COMUN","FORAL","CANARIAS","CEUTA_MELILLA"], "asumido": false } } }
```

### 4. Fallo — rol no autorizado → 409

```json
{ "project_id": "e57a318a-...", "rol": "OPERADOR", "sociedad": "ACME SL", "territorio": "COMUN" }
```

Respuesta `409` + `contabilidad.perfil.declarar.failed`:

```json
{ "status": 409, "error": { "code": "ERROR_DOS_ESCRITORES", "message": "el perfil administrativo tiene UN escritor: solo DUENO/ASESOR declaran", "details": { "escritor_vigente": ["DUENO","ASESOR"], "rol_intentado": "OPERADOR", "simbolico": "ERROR_DOS_ESCRITORES" } } }
```

### 5. Fallo — sociedad sin perfil → 404

```json
{ "project_id": "e57a318a-...", "sociedad": "OTRA SL" }
```

Respuesta `404` + `contabilidad.perfil.aplicables.failed`:

```json
{ "status": 404, "error": { "code": "PERFIL_NO_DECLARADO", "message": "la sociedad OTRA SL no tiene perfil administrativo declarado: el sistema no asume territorio", "details": { "sociedad": "OTRA SL", "accion": "DECLARAR_PERFIL", "asumido": false } } }
```

### 6. Tools (sin RPC en module.json)

`toolDeclarar` → `_declarar`; `toolAplicables` → `_aplicables`.

## Tests

El test viviría en `tests/unit/perfil-administrativo.test.js`. Cubre:

- `declarar` con `rol:'DUENO'` y territorio válido → `200`, `ley_cableada:false`,
  obligaciones derivadas correctas, `el_sistema_no_asume_territorio:true`; emite
  `contabilidad.perfil_declarado`.
- **Sin territorio → `422 TERRITORIO_NO_DECLARADO`** (`asumido:false`); el sistema no
  elige territorio.
- Territorio/impuesto/sujeto fuera de catálogo → `422 TERRITORIO_NO_VALIDO` /
  `IMPUESTO_NO_VALIDO` / `SUJETO_NO_VALIDO`.
- **Single-writer**: rol distinto de DUENO/ASESOR → `409 ERROR_DOS_ESCRITORES`.
- El impuesto indirecto declarado **sobreescribe** el mapa por defecto (p.ej. `CANARIAS` +
  `impuesto_indirecto:'IVA'` → `IVA`, no `IGIC`); `obligaciones` explícitas se añaden.
- `aplicables` de sociedad declarada → `200` con sus obligaciones; sociedad sin perfil →
  `404 PERFIL_NO_DECLARADO`.
- La secuencia de declaraciones crece (`declaraciones[].secuencia`).
- `project.activated` restaura perfiles/historial vía PosPersistencia.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/perfil-administrativo
node --test tests/unit/perfil-administrativo.test.js
```

## Notas de implementación

- Clase `PerfilAdministrativo extends ModuloHibridoReflejo`; `name =
  'perfil-administrativo'`, `version = 'reflejo-0.1.0'` (aunque es **custodio**: conserva
  el versionado reflejo, es el patrón real de la vertical). Store en memoria `this._store`
  (Map project_id → `{ esquema, perfiles, declaraciones, catalogo_obligaciones,
  escritor }`).
- Constantes: `ROLES_AUTORIZADOS = {DUENO, ASESOR}`, `CODE_DOS_ESCRITORES =
  'ERROR_DOS_ESCRITORES'`, `TERRITORIOS`, `IMPUESTOS_INDIRECTOS`, `SUJETOS`,
  `IMPUESTO_POR_TERRITORIO`.
- **PosPersistencia**: `_persist = new PosPersistencia({ modulo, file:
  'perfil-administrativo.json', dir: '/contabilidad/perfil-administrativo', snapshot,
  hidratar })`. `onProjectActivated` → `restaurar(project_id)`; `onUnload` → `flush()` +
  `detener()`. Cada mutación marca `marcarDirty(pid)`.
- `onDeclararRequest` publica `contabilidad.perfil_declarado` en éxito y
  `contabilidad.perfil.declarar.failed` en fallo; `onAplicablesRequest` publica solo el par
  de fallo si `status !== 200`. Ambos delegan en `_atender(e, '<op>',
  'contabilidad.perfil.<op>.response', fn)`.
- Proyecciones puras: `_declarar`, `_aplicables`, `_derivarObligaciones`,
  `_verificarEscritorUnico` (+ `_obtenerOCrear`). `_invalid`, `_errorResponse` vienen de la
  base.
- Tools: `toolDeclarar`, `toolAplicables`.
- DEP hacia delante: `contabilidad.perfil_declarado` lo consumen `liquidacion-iva` (D1),
  `retenciones-is-irpf` (D4/D5) y `calendario-fiscal` (D6) para saber **QUÉ** aplica antes
  de calcular **cuánto**.
