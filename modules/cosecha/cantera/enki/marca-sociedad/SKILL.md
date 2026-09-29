---
name: marca-sociedad
description: >
  Skill FULL del módulo REFLEJO `marca-sociedad` de la vertical contabilidad de Enki.
  LA MARCA DE SOCIEDAD: etiqueta cada ASIENTO con la SOCIEDAD a la que pertenece — la BASE de
  todo el grupo multi-sociedad. MECÁNICO, CERO JUICIO: el reflejo NO decide la sociedad, la
  DICE el asiento; sin sociedad declarada el asiento queda SIN_MARCA y `[ABIERTO]`, nunca con
  una sociedad inventada. Sin estado (índice en memoria). Úsala para operar, depurar o extender
  el reflejo, o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites etiquetar un asiento con su sociedad (RPC
    marca-sociedad.marcar.request).
  - Cuando depures por qué el asiento queda `sin_marca:true` y `abierto:true` (no hay sociedad
    declarada: nunca se inventa una por defecto) o por qué falta `project_id` (400
    INVALID_INPUT).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las invariantes del
    reflejo (determinista, mecánico sin juicio, dato ausente = desconocido, no escribe el
    asiento, índice en memoria).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo marca-sociedad.
tags: [enki, modulo, reflejo, contabilidad, marca-sociedad]
---

# marca-sociedad — REFLEJO de la marca de sociedad del asiento

## Qué hace el módulo

`marca-sociedad` es un **REFLEJO STATELESS** (I1, hoja del plan): **LA MARCA DE SOCIEDAD** —
etiqueta cada **ASIENTO** con la **SOCIEDAD** a la que pertenece. Es la **BASE de todo el grupo
multi-sociedad**: sin la marca, ni las eliminaciones intercompany (I2) ni la consolidación (I3)
saben qué partida es de quién.

Atributos del diseño: `sociedad:Sociedad`.

- **MECÁNICO, CERO JUICIO**: el reflejo **NO decide** a qué sociedad pertenece un asiento — lo
  **DICE** el asiento (o la petición). Aquí solo se **pega la etiqueta** y se **declara la
  pertenencia**.
- **Sin sociedad declarada**, el asiento queda **`SIN_MARCA`** y `[ABIERTO]` (`marca:null`,
  `sin_marca:true`, `abierto:true`): **jamás se inventa una sociedad por defecto** (una sociedad
  inventada contamina el grupo entero y falsea la consolidación).
- **Escucha `contabilidad.asiento_registrado`** (lo publica el diario/`escritor-diario`)
  fire-and-forget para mantener **en memoria** un **índice de marcas por proyecto** — lo que
  después beberán I2/I3 **por su puerta** (por EVENTO), nunca por require cruzado.

Invariantes:

- **DETERMINISTA**: mismo asiento + misma sociedad → misma marca (una sola respuesta correcta).
- **Dato ausente = desconocido**: sin sociedad declarada → `marca:null`, `sin_marca:true`,
  `abierto:true`. **Nada se estima.**
- **NO escribe el asiento ni lo persiste**: el asiento es del diario; este reflejo solo lo
  **ETIQUETA** y recuerda la etiqueta en memoria.

Sin `PosPersistencia` y sin `project.activated`: no es custodio. Proyección única `_marcar`.
Publica `contabilidad.sociedad_marcada`. Cierra el círculo de error con
`marca-sociedad.marcar.failed`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `marca-sociedad.marcar.request` | `onMarcarRequest` | RPC reflejo (etiquetado puro, determinista): {project_id, asiento\|id_asiento, sociedad?, zona?, periodo?} → {id_asiento, asiento etiquetado, marca:{sociedad, sociedad_id, zona, periodo}, sin_marca, abierto, faltan, motivo}. La sociedad es un DATO declarado (string u objeto); sin ella el asiento queda sin marcar — no se inventa ninguna sociedad por defecto (contaminaria el grupo). Recuerda la marca en un indice en memoria por proyecto. Responde por marca-sociedad.marcar.response; project_id ausente → marca-sociedad.marcar.failed. |
| `contabilidad.asiento_registrado` | `onAsientoRegistrado` | Fire-and-forget: el diario registra un asiento → el reflejo lo ETIQUETA con su sociedad (si el evento la trae) y recuerda la marca; si quedo marcado publica contabilidad.sociedad_marcada. Alimenta el indice en memoria que beberan eliminacion-intercompany (I2) y consolidacion (I3). |

### Publishes

| Evento | Descripción |
|---|---|
| `marca-sociedad.marcar.response` | Respuesta RPC correlada de marca-sociedad.marcar.request → {request_id, status:200, data:{marca, sin_marca, abierto, faltan}}. Emitida por el helper _atender. |
| `marca-sociedad.marcar.failed` | Par de fallo determinista (I1): project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de marca-sociedad.marcar.request. |
| `contabilidad.sociedad_marcada` | Fire-and-forget (I1): un asiento quedo etiquetado con su sociedad → {project_id, id_asiento, sociedad, correlation_id}. Lo consumen las hojas del grupo (eliminacion-intercompany I2, consolidacion I3) para saber a que sociedad pertenece cada partida. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `marca-sociedad.marcar.failed` cierra el círculo de `marca-sociedad.marcar.request`
> cuando `_marcar` devuelve status ≠ 200 (el único camino: `400 INVALID_INPUT` por `project_id`
> ausente).

> Nota de honestidad (cruce con `index.js`): `onAsientoRegistrado` publica
> `contabilidad.sociedad_marcada` **solo si `_marcar` devuelve `200` Y `!res.data.sin_marca`**
> (el asiento quedó efectivamente marcado). Un asiento sin sociedad declarada **no** emite el
> evento de pertenencia: se queda sin marcar, sin contaminar el grupo. El `correlation_id` se
> propaga desde el evento entrante.

> Nota: el módulo expone `marcasDe(pid)` como **lectura directa** para otras hojas del mismo
> proceso (no muta) — no es un evento del bus, no figura en `module.json`. Tampoco figuran
> `_sociedad`, `_recordar` ni `_marcar` internos.

## Reglas de negocio

1. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente →
   `400 INVALID_INPUT` (`field:'project_id'`). Único error duro.
2. **El asiento**: `input.asiento` (objeto) o `input` si no. **`id_asiento`** =
   `asiento.id_asiento` o `asiento.id` (string) o `null`. **Puede ser `null`** (el asiento sin id
   se marca igual, pero no se recuerda en el índice).
3. **La SOCIEDAD se resuelve en `_sociedad`**: `input.sociedad` o `asiento.sociedad`; ausente/
   vacía → `null`; string → `String(...)`; objeto → se copia **tal cual**. **Es DATO declarado:
   no se interpreta ni se adivina.**
4. **`zona`** (zona de consolidación): `input.zona` o `asiento.zona` o `sociedad.zona`, string o
   `null`. Ausente → `null` (**no se estima**). **`periodo`**: `input.periodo` o
   `asiento.periodo` o `null`.
5. **SIN SOCIEDAD DECLARADA** → `200` con `marca:null`, `sin_marca:true`, `abierto:true`,
   `faltan:['sociedad']` y `motivo:'no se marca el asiento: no hay sociedad declarada (una
   sociedad por defecto contaminaria el grupo)'`. **Nunca se inventa una sociedad.**
6. **La MARCA** (con sociedad): `{sociedad, sociedad_id, zona, periodo, marcado_en}` donde
   `sociedad_id` = `sociedad.id ?? sociedad.nombre` (objeto) o la sociedad string; `marcado_en` =
   `new Date().toISOString()`.
7. **Se RECUERDA la marca** (`_recordar`) en el índice en memoria `this._marcas`
   (`project_id → Map<id_asiento, Marca>`) solo si hay `id_asiento`. **Es memoria viva para
   I2/I3 por evento; no es persistencia.**
8. **El asiento ETIQUETADO** se devuelve con su marca pegada: `{...asiento, sociedad:
   marca.sociedad_id, zona: marca.zona, periodo: marca.periodo}`. **Mecánico, cero juicio.**
9. **Respuesta de éxito**: `{project_id, id_asiento, asiento, marca, sin_marca:false,
   abierto:false, faltan:[], motivo:null}`.
10. **El handler fire-and-forget** (`onAsientoRegistrado`): exige `project_id`; toma
    `d.asiento || d`, `d.sociedad` y `d.correlation_id`; si el asiento quedó marcado publica
    `contabilidad.sociedad_marcada` con `{project_id, id_asiento, sociedad: marca.sociedad,
    correlation_id}`.
11. **NO escribe el asiento ni lo persiste**: stateless. Sin `PosPersistencia`, sin
    `onProjectActivated`.
12. **HTTP exacto**: éxito `200` (marcado o `sin_marca`); `project_id` ausente → `400`; excepción
    en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `marca-sociedad.marcar.response` y emite `contabilidad.sociedad_marcada`.

### 1. `marcar` — el asiento declara su sociedad

```json
{
  "project_id": "e57a318a-...",
  "asiento": { "id_asiento": "A-2026-0001", "cuenta": "430", "importe": 1210, "sociedad": "HOLDING-NORTE" },
  "zona": "grupo-iberia",
  "periodo": "2026-09",
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...", "id_asiento": "A-2026-0001",
  "asiento": { "id_asiento": "A-2026-0001", "cuenta": "430", "importe": 1210, "sociedad": "HOLDING-NORTE", "zona": "grupo-iberia", "periodo": "2026-09" },
  "marca": { "sociedad": "HOLDING-NORTE", "sociedad_id": "HOLDING-NORTE", "zona": "grupo-iberia", "periodo": "2026-09", "marcado_en": "2026-09-30T..." },
  "sin_marca": false, "abierto": false, "faltan": [], "motivo": null
}
```

Emite `contabilidad.sociedad_marcada` (lo LEEN `eliminacion-intercompany` I2 y `consolidacion`
I3):

```json
{ "project_id": "e57a318a-...", "id_asiento": "A-2026-0001", "sociedad": "HOLDING-NORTE", "correlation_id": "abc-123" }
```

### 2. `marcar` — sin sociedad declarada → `SIN_MARCA` y `[ABIERTO]`

```json
{ "project_id": "e57a318a-...", "asiento": { "id_asiento": "A-2026-0002", "cuenta": "400", "importe": 500 } }
```

`200` con `marca:null`, `sin_marca:true`, `abierto:true`, `faltan:["sociedad"]`. **Nunca una
sociedad por defecto** (contaminaría el grupo entero).

### 3. `marcar` — sociedad declarada como objeto

Con `sociedad: { "id": "S-02", "nombre": "Filial Sur", "zona": "grupo-iberia" }` →
`sociedad_id:"S-02"` y `zona:"grupo-iberia"` (de la sociedad si no se declara aparte).

### 4. El diario registra un asiento — etiquetado automático

`contabilidad.asiento_registrado` con `sociedad` → `onAsientoRegistrado` etiqueta, recuerda la
marca y publica `contabilidad.sociedad_marcada`. **Sin sociedad en el evento: se queda sin
marcar y NO se publica** la pertenencia.

### 5. Fallo — falta `project_id`

Respuesta `400` + `marca-sociedad.marcar.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/marca-sociedad.test.js`. Cubre:

- `marcar` con sociedad declarada → `200 {sin_marca:false, abierto:false}` y marca
  `{sociedad, sociedad_id, zona, periodo, marcado_en}`.
- Sin sociedad → `sin_marca:true`, `abierto:true`, `faltan:['sociedad']` (**nunca una sociedad
  inventada**).
- Sociedad como objeto → `sociedad_id` derivado de `id`/`nombre`; `zona` heredada de la sociedad
  si no se declara aparte.
- `contabilidad.asiento_registrado` con sociedad → recuerda la marca y emite
  `contabilidad.sociedad_marcada`; **sin sociedad NO emite** la pertenencia.
- `marcasDe(pid)` lee el índice sin mutar; el índice es **memoria viva**, no persistencia.
- `project_id` ausente → `400 INVALID_INPUT` + `.marcar.failed`.
- **NO ESCRIBE el asiento**: ninguna llamada persiste ni muta (stateless).
- `toolMarcar` devuelve la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `MarcaSociedad extends ModuloHibridoReflejo`; `name = 'marca-sociedad'`,
  `version = 'reflejo-0.1.0'`. Índice `this._marcas = new Map()` (`project_id →
  Map<id_asiento, Marca>`). Sin `PosPersistencia`, sin `onProjectActivated`.
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-analitica/marca-sociedad/`).
- `onMarcarRequest` usa `this._atender(e, 'marcar', 'marca-sociedad.marcar.response',
  async (d) => {...})` con cierre de círculo (par `failed` si `status !== 200`).
- Proyección `_marcar(input)` (síncrona); helpers `_sociedad`, `_recordar`; lectura directa
  `marcasDe(pid)`. Tool `toolMarcar`.
- Handler fire-and-forget `onAsientoRegistrado` (`contabilidad.asiento_registrado`).
- `_invalid` vienen de `modulo-hibrido-reflejo`.
- DEP: **escucha** `contabilidad.asiento_registrado` (lo publica el diario/`escritor-diario`).
  Lo consumen `eliminacion-intercompany` (I2) y `consolidacion` (I3) vía
  `marca-sociedad.marcar.request` (por EVENTO) y `contabilidad.sociedad_marcada`.
- **MECÁNICO, CERO JUICIO**: la sociedad es un **DATO declarado** (por el asiento o la
  petición). **Jamás se inventa una sociedad por defecto**: sin sociedad → `SIN_MARCA` y
  `[ABIERTO]`.
