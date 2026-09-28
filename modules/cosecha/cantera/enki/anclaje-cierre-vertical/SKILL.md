---
name: anclaje-cierre-vertical
description: >
  Skill FULL del módulo CUSTODIO `anclaje-cierre-vertical` de la vertical contabilidad
  de Enki (A14, hoja del plan). Declara POR FUENTE qué es un CIERRE y cómo se
  identifica, y ancla la CLAVE NATURAL del hecho de cierre (la unidad que el cerrojo
  de idempotencia M3 necesita). Su contenido pende de `unidad_de_cierre` (M4,
  [ABIERTO], declarable por el dueño): si la fuente no la declara, la clave queda
  INCOMPLETA y el hecho va a cola-revisión; JAMÁS se inventa una unidad. Un solo
  escritor (DUENO; second-writer rechazado con PERMISSION_DENIED). Persiste por
  proyecto vía PosPersistencia. Úsala para operar, depurar o extender el custodio.
when-to-use: >
  - Cuando necesites declarar qué es un cierre y cómo se identifica por vertical
    (RPC contabilidad.anclaje.declarar.request) o anclar la clave natural de un hecho
    de cierre (contabilidad.anclaje.anclar.request).
  - Cuando depures por qué una declaración se rechaza (PERMISSION_DENIED si el rol no
    es DUENO, INVALID_INPUT en payload), por qué anclar devuelve 404 (la vertical no
    declaró su unidad) o 422 (el hecho no trae el identificador declarado).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y la regla
    "la unidad de cierre NO se inventa: la clave queda incompleta y va a cola".
  - Cuando vayas a escribir/ampliar el test unitario del custodio anclaje-cierre-vertical.
tags: [enki, modulo, custodio, persistencia, contabilidad, anclaje-cierre-vertical, clave-natural]
---

# anclaje-cierre-vertical — CUSTODIO del anclaje de cierre por fuente

## Qué hace el módulo

`anclaje-cierre-vertical` es un **CUSTODIO CON PERSISTENCIA** (A14, hoja del plan): el
dueño del store que **declara por fuente qué es un cierre y cómo se identifica**, y que
**ancla la clave natural** del hecho de cierre — la unidad que el cerrojo de
idempotencia M3 (`clave-natural`) necesita para no duplicar asientos.

La pieza clave del dominio aquí es **la ley entra como DATO**: el contenido del anclaje
pende de `unidad_de_cierre` (M4, marcado `[ABIERTO]` y **declarable por el dueño**).
Si la fuente **no declara** su unidad de cierre, la clave queda **INCOMPLETA** y el
hecho va a `cola-revision`; **JAMÁS se inventa una unidad**. Esa es la invariante
contable **Cero estimación** aplicada al anclaje.

Un **solo escritor**: el **DUENO** declara (guard en `_declarar`); `_anclar` es una
**proyección PURA** de lectura (no muta). Persiste por proyecto con **PosPersistencia**
(storage `/contabilidad/anclaje-cierre-vertical/*.json`), restaura en
`project.activated` y vuelca en `onUnload`. Emite `contabilidad.anclaje_declarado` en
éxito y sus pares de fallo deterministas.

> **NO REUTILIZA**: la definición de cierre por vertical no existe en el inventario.
> El cierre de caja existente es de la OPERACIÓN (mono-negocio) y aquí llega como
> **HECHO observado**, no como definición reutilizable.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.anclaje.declarar.request` | `onDeclararRequest` | RPC custodio: {project_id, rol:'DUENO', vertical, definicion:{tipo, identificador, unidad_cierre}} → {project_id, vertical, definicion}. Guard de escritor: solo DUENO (second-writer rechazado). Publica contabilidad.anclaje_declarado y responde por contabilidad.anclaje.declarar.response; si el rol o el payload son invalidos → contabilidad.anclaje.declarar.failed. |
| `contabilidad.anclaje.anclar.request` | `onAnclarRequest` | RPC custodio: {project_id, vertical, hecho} → {project_id, vertical, clave_natural}. Proyeccion PURA: compone la clave desde el identificador declarado. 404 si la vertical no declaro su unidad; 422 si el hecho no trae el identificador (la unidad NO se inventa) → contabilidad.anclaje.anclar.failed. Lo consume clave-natural (M3). |
| `project.activated` | `onProjectActivated` | Restaura las unidades de cierre del proyecto activado desde el storage (PosPersistencia): la definicion de cierre es POR PROYECTO. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.anclaje_declarado` | Fire-and-forget (A14): una vertical declaro su unidad de cierre y como se identifica → {project_id, vertical, definicion}. Lo consume completitud-cobertura (A12) para saber que unidades de cierre se esperan del periodo. |
| `contabilidad.anclaje.declarar.failed` | Par de fallo determinista: declaracion rechazada (rol != DUENO) o payload invalido. Cierra el circulo de contabilidad.anclaje.declarar.request. |
| `contabilidad.anclaje.anclar.failed` | Par de fallo determinista: anclar sin unidad declarada (404) o hecho sin identificador de cierre (422): la clave queda incompleta y el hecho va a cola, la unidad NO se inventa. Cierra el circulo de contabilidad.anclaje.anclar.request. |
| `contabilidad.anclaje_declarado.failed` | Par de fallo del evento de dominio contabilidad.anclaje_declarado: la emision del hecho de dominio no se completo. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> `contabilidad.anclaje.declarar.failed` cierra el círculo de
> `contabilidad.anclaje.declarar.request`; `contabilidad.anclaje.anclar.failed` cierra
> `contabilidad.anclaje.anclar.request` (tanto en 404 como en 422).

> Nota: no está en module.json pero sí lo emite index.js en `onDeclararRequest` y
> `onAnclarRequest` — el par de fallo (`contabilidad.anclaje.declarar.failed` /
> `contabilidad.anclaje.anclar.failed`) se publica dentro del handler cuando
> `res.status !== 200`, además de la response de `_atender`.

## Reglas de negocio

1. **Un solo escritor (guard de rol)**: `_declarar` exige `rol === 'DUENO'`
   (constante `ROL_ESCRITOR`). Cualquier otro → `403 PERMISSION_DENIED` con
   `{ status:403, error:{ code:'PERMISSION_DENIED', message:'solo el DUENO declara la unidad de cierre', details:{ rol_esperado:'DUENO', rol_recibido:<rol> } } }`.
   Second-writer rechazado.
2. **Validaciones de payload deterministas**: falta `project_id` → `400 INVALID_INPUT
   project_id`; falta `vertical` → `400 INVALID_INPUT vertical`; `definicion` ausente
   o no objeto → `400 INVALID_INPUT definicion`. Shape
   `{ status:400, error:{ code:'INVALID_INPUT', message:'<campo> requerido', details:{ field:<campo> } } }`.
3. **La definición se normaliza con campos DECLARABLES**: `_declarar` guarda
   `{ tipo, identificador, unidad_cierre, declarado_por:'DUENO', declarado_en }`; los
   tres primeros son **datos declarados por el dueño** (nunca constantes legales
   cableadas), y los ausentes quedan `null`.
4. **Anclar sin unidad declarada → 404**: `_anclar` de una vertical sin definición
   devuelve `404 RESOURCE_NOT_FOUND` con `details.senal = 'unidad_de_cierre_no_declarada'`.
5. **El hecho sin identificador → 422 (la unidad NO se inventa)**: si el campo
   `unidad.identificador` no aparece en el hecho (o es `null`/`''`), `_anclar` devuelve
   `422 PRECONDITION_FAILED` `{ status:422, error:{ code:'PRECONDITION_FAILED', message:'el hecho no trae el identificador de cierre declarado', details:{ vertical, campo_esperado:<campo> } } }`.
   La clave queda **incompleta** → el hecho va a `cola-revision`. **Cero estimación**.
6. **Composición de la clave natural**: la clave es
   `` `${vertical}:${unidad_cierre || tipo || 'cierre'}:${valor}` `` — el
   `unidad_cierre` declarado manda; si no hay, cae a `tipo` y luego a la literal
   `'cierre'`. La clave ES determinista y sirve al cerrojo de idempotencia (M3).
7. **La lectura (`_anclar`) no muta**: es proyección pura; `_obtenerOCrear` solo crea
   el contenedor del proyecto si no existe.
8. **HTTP exacto**: éxito `200`; rol inválido → `403`; payload inválido → `400`; sin
   definición → `404`; hecho sin identificador → `422`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPCs que responden en `contabilidad.anclaje.declarar.response` y
`contabilidad.anclaje.anclar.response`.

### 1. `declarar` — declarar qué es un cierre por vertical (solo DUENO)

```json
{
  "project_id": "e57a318a-...",
  "rol": "DUENO",
  "vertical": "CIERRE_JORNADA",
  "definicion": { "tipo": "CIERRE_CAJA", "identificador": "fecha", "unidad_cierre": "jornada" },
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "vertical": "CIERRE_JORNADA",
  "definicion": { "tipo": "CIERRE_CAJA", "identificador": "fecha", "unidad_cierre": "jornada", "declarado_por": "DUENO", "declarado_en": "2026-09-28T..." }
}
```
Emite `contabilidad.anclaje_declarado` (res.data + correlation_id).

### 2. `anclar` — anclar la clave natural de un hecho (proyección pura)

```json
{
  "project_id": "e57a318a-...",
  "vertical": "CIERRE_JORNADA",
  "hecho": { "fecha": "2026-09-28", "total_caja": 1230.5 }
}
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "vertical": "CIERRE_JORNADA", "clave_natural": "CIERRE_JORNADA:jornada:2026-09-28" }
```

### Fallo — hecho sin identificador (422, la unidad no se inventa)

```json
{ "project_id": "e57a318a-...", "vertical": "CIERRE_JORNADA", "hecho": { "total_caja": 1230.5 } }
```
Respuesta `422` + `contabilidad.anclaje.anclar.failed`:
```json
{ "status": 422, "error": { "code": "PRECONDITION_FAILED", "message": "el hecho no trae el identificador de cierre declarado", "details": { "vertical": "CIERRE_JORNADA", "campo_esperado": "fecha" } } }
```

### Fallo — vertical que no declaró su unidad (404)

```json
{ "project_id": "e57a318a-...", "vertical": "VENTA", "hecho": { "id": "V-1" } }
```
Respuesta `404` + `contabilidad.anclaje.anclar.failed`:
```json
{ "status": 404, "error": { "code": "RESOURCE_NOT_FOUND", "message": "la vertical VENTA no declara su unidad de cierre", "details": { "vertical": "VENTA", "senal": "unidad_de_cierre_no_declarada" } } }
```

## Tests

El test vive en `tests/unit/anclaje-cierre-vertical.test.js`. Cubre:

- `declarar` con rol `DUENO` y definición válida → `200` y emite `contabilidad.anclaje_declarado`.
- `declarar` con rol distinto → `403 PERMISSION_DENIED` + `contabilidad.anclaje.declarar.failed`.
- `declarar` sin `project_id`/`vertical`/`definicion` → `400 INVALID_INPUT`.
- `anclar` con hecho que trae el identificador → `200 {clave_natural}` correcta.
- `anclar` sin unidad declarada → `404`; hecho sin identificador → `422` (la unidad NO
  se inventa) + `contabilidad.anclaje.anclar.failed`.
- `project.activated` restaura las unidades vía PosPersistencia.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/anclaje-cierre-vertical
node --test tests/unit/anclaje-cierre-vertical.test.js
```

## Notas de implementación

- Clase `AnclajeCierreVertical extends ModuloHibridoReflejo`; `name =
  'anclaje-cierre-vertical'`, `version = 'reflejo-0.1.0'`. Store en memoria
  `this._store` (Map project_id → `{ esquema:'contabilidad-anclaje-cierre-vertical-v1', unidades:{}, updated_at }`).
- **PosPersistencia**: `_persist = new PosPersistencia({ modulo, file:
  'anclaje-cierre-vertical.json', dir: '/contabilidad/anclaje-cierre-vertical',
  snapshot, hidratar })`. `onProjectActivated` → `restaurar(project_id)`; `onUnload` →
  `flush()` + `detener()`. Cada mutación marca `marcarDirty(pid)`.
- `onDeclararRequest`/`onAnclarRequest` delegan en
  `_atender(e, '<op>', 'contabilidad.anclaje.<op>.response', fn)`; emiten el evento de
  dominio o el par determinista dentro de la proyección, propagando `correlation_id`.
- Proyecciones puras: `_declarar` (escritura + guard) y `_anclar` (lectura; compone la
  clave). Helper `_obtenerOCrear(pid)`. `_invalid`/`_errorResponse` vienen de la base.
- Tools: `toolDeclarar` → `_declarar`, `toolAnclar` → `_anclar`.
- DEP hacia delante: lo consumen `clave-natural` (M3, cerrojo de idempotencia) y
  `completitud-cobertura` (A12, qué unidades de cierre se esperan del periodo).
