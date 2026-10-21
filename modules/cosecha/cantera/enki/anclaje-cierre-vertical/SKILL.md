---
name: anclaje-cierre-vertical
description: >-
  Skill FULL del módulo CUSTODIO CON PERSISTENCIA `anclaje-cierre-vertical` de la vertical
  contabilidad (Enki). La PARCELA declarable POR VERTICAL de QUÉ ES "un cierre" y CÓMO se
  identifica. UN escritor. Un cierre no se adivina: cada vertical declara su anclaje (campo/valor
  que marca el cierre y/o componentes de su clave natural). SIN anclaje declarado, `anclar`
  devuelve `es_cierre:false` y `abierto` (el sistema pregunta; NO estima) y SUBE una petición
  best-effort a cola-declaraciones-criterio. `anclar` calcula la clave natural de la señal
  (clave-natural M3, por EVENTO). Publica contabilidad.anclaje_cierre_declarado. Persiste por proyecto.
when-to-use: >-
  - Cuando necesites declarar qué es "un cierre" para una vertical, o contrastar una señal
    (RPC anclaje-cierre-vertical.declarar.request / .anclar.request).
  - Cuando depures por qué `es_cierre:false` con `anclaje_declarado:false` (sin anclaje), o por qué
    se rechaza (403 si el rol no es ANCLAJE_CIERRE).
  - Cuando quieras entender su contrato de eventos y su hecho contabilidad.anclaje_cierre_declarado.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, custodio, persistencia, contabilidad, entrada, cierre, anclaje, vertical]
---

# anclaje-cierre-vertical — CUSTODIO del anclaje de cierre por vertical

## Qué hace el módulo

`anclaje-cierre-vertical` es un **CUSTODIO CON PERSISTENCIA** (A14, hoja del plan). Es la
**PARCELA declarable POR VERTICAL** de **QUÉ ES "un cierre"** y **CÓMO se identifica**. UN
escritor. Un cierre **no se adivina**: cada vertical declara su anclaje (qué hecho/qué campo/qué
clave marca el cierre). Sin anclaje declarado, el sistema **PREGUNTA** y **NO inventa** un criterio
de cierre.

- **`anclar`** — PREGUNTA: dada una señal de cierre, ¿es un cierre según el anclaje declarado?
  Calcula la clave natural de la señal (`clave-natural` M3, por EVENTO) y la contrasta con el
  anclaje de la vertical. Deriva; no muta.
- **`declarar`** — ORDEN: la vertical declara su anclaje de cierre (qué es y cómo se identifica).

Invariantes:
- **SIN ANCLAJE DECLARADO no hay cierre**: `anclar` devuelve `es_cierre:false` y `abierto` (no se
  estima); y **sube** una petición best-effort a la cola declarativa (`cola-declaraciones-criterio`).
- **Dato ausente = desconocido**: sin vertical o sin señal NO se declara nada.
- **No se borra**: re-declarar **APPENDEA** al historial; el anclaje vigente es el último declarado.
- **UN escritor por parcela** (guard rol `ANCLAJE_CIERRE`; segundo escritor → 403).

Persiste por proyecto con **PosPersistencia** (storage `/contabilidad/anclaje-cierre-vertical`,
archivo `anclaje-cierre-vertical.json`), restaura en `project.activated` y vuelca en `onUnload`.

**Dos caras:** `anclar` es **PREGUNTA** (bus); `declarar` es **ORDEN** (`system_panel`).

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `anclaje-cierre-vertical.anclar.request` | `onAnclarRequest` | RPC custodio (**PREGUNTA**, por el bus): `{project_id, vertical, senal}` → `{project_id, vertical, es_cierre, anclaje_declarado, clave_senal}`. Contrasta la señal con el anclaje declarado. Sin anclaje → `es_cierre:false, abierto:true`. Responde por `.anclar.response`. |
| `anclaje-cierre-vertical.declarar.request` | `onDeclararRequest` | RPC custodio (**ORDEN**, panel): `{project_id, rol:'ANCLAJE_CIERRE', vertical, anclaje{campo?, valor?, componentes?, descripcion?}}` → `{project_id, vertical, anclaje, declarado}`. Guard de escritor. Publica `contabilidad.anclaje_cierre_declarado`. Responde por `.declarar.response`. |
| `contabilidad.criterio_fijado` | `onCriterioFijado` | **Fire-and-forget** (lo emite `cola-declaraciones-criterio` K9): el JEFE fijó un criterio → si la clave casa `/cierre\|anclaje/i`, se toma constancia en la parcela (refresca `updated_at`). **No responde.** |
| `project.activated` | `onProjectActivated` | Restaura los anclajes de cierre del proyecto activado desde el storage. |

> **Sube por evento:** `clave-natural.calcular.request` (M3) en `anclar` (best-effort, para derivar
> la clave de la señal) y `cola-declaraciones-criterio.fijar.request` (K9) cuando falta el anclaje
> (`clave:'unidad_de_cierre'`, `origen:'anclaje-cierre-vertical'`). Nunca import.

### Publishes

| Evento | Cuándo |
|---|---|
| `contabilidad.anclaje_cierre_declarado` | Fire-and-forget (A14): una vertical declaró su anclaje de cierre → `{project_id, vertical, anclaje, declarado:true}`. Lo consumen los módulos que necesitan saber qué es "un cierre" por vertical. |
| `anclaje-cierre-vertical.anclar.response` / `.anclar.failed` | RPC `anclar`. |
| `anclaje-cierre-vertical.declarar.response` / `.declarar.failed` | RPC `declarar`. |

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `anclar` | **PREGUNTA** (bus) | `{project_id, vertical, senal\|hecho\|cierre}` | `{project_id, vertical, senal, es_cierre, anclaje_declarado, anclaje, clave_senal, criterio_declarado_por?, abierto}` | 400 `INVALID_INPUT` (`project_id`/`vertical`/`senal`) |
| `declarar` | **ORDEN** (panel) | `{project_id, rol:'ANCLAJE_CIERRE', vertical, anclaje\|a}` | `{project_id, vertical, anclaje, declarado:true, total_verticales, abierto}` | 403 `PERMISSION_DENIED`; 400 `INVALID_INPUT` |

## Reglas de negocio (lo que el código IMPONE)

1. **`_anclar`**: sin `project_id` → `_invalid('project_id')`; sin `vertical` →
   `_invalid('vertical')`; sin `senal` → `_invalid('senal')`.
2. **Sin anclaje** → `es_cierre:false, anclaje_declarado:false, anclaje:null, clave_senal:null`,
   `abierto.anclaje:'... no ha declarado su anclaje de cierre: el sistema pregunta, no decide'`. Y
   el handler **sube** la petición a la cola de criterios.
3. **Clave de la señal**: `_rpc('clave-natural.calcular.request', {project_id, elemento:senal,
   componentes: anclaje.componentes || undefined})`; `clave_senal` = `claveResp.data.clave` o `null`.
4. **`_coincideAnclaje`**: 
   - si el anclaje tiene `campo`: coincide si el valor en la señal es no nulo (cuando `valor` no se
     declaró) o si `String(actual) === String(anclaje.valor)`;
   - si el anclaje declara `clave` y hay `clave_senal`: coincide = coincide **o** claves iguales.
5. **`_declarar`**: guard de escritor (`ANCLAJE_CIERRE`). Anclaje objeto obligatorio. Campos:
   `campo, valor, componentes[], descripcion` (solo se actualiza lo declarado; se conserva lo previo).
6. **No se borra**: cada declaración hace `push` a `historial` con `{campo, valor, componentes, en}`.
7. **`abierto`** en `declarar`: `campo` declarado si falta, `componentes` declarado si faltan.
8. **`onCriterioFijado`**: solo actúa si la clave casa `/cierre|anclaje/i`; envuelto en `try/catch`.

## Cómo se usa (RPC)

### 1. Declarar el anclaje de cierre

```json
{ "project_id": "e57a318a-...", "rol": "ANCLAJE_CIERRE", "vertical": "pizzepos", "anclaje": { "campo": "tipo", "valor": "cierre_z", "componentes": ["ejercicio","sociedad"], "descripcion": "cierre Z de la caja del día" }, "correlation_id": "abc-19" }
```
Respuesta `200` + `contabilidad.anclaje_cierre_declarado`:
```json
{ "project_id": "e57a318a-...", "vertical": "pizzepos", "anclaje": { "vertical": "pizzepos", "campo": "tipo", "valor": "cierre_z", "componentes": ["ejercicio","sociedad"], "descripcion": "cierre Z de la caja del día", "declarado_por": "ANCLAJE_CIERRE", "declarado_en": "2026-10-01T...", "historial": [ { "campo": "tipo", "valor": "cierre_z", "componentes": ["ejercicio","sociedad"], "en": "2026-10-01T..." } ] }, "declarado": true, "total_verticales": 1, "abierto": { "campo": null, "componentes": null } }
```

### 2. Anclar una señal

```json
{ "project_id": "e57a318a-...", "vertical": "pizzepos", "senal": { "tipo": "cierre_z", "ejercicio": "2026", "sociedad": "A" } }
```
Respuesta `200`: `{es_cierre:true, anclaje_declarado:true, clave_senal:'2026|a|cierre_z', criterio_declarado_por:'ANCLAJE_CIERRE', abierto:{anclaje:null}}`.

### 3. Sin anclaje → [ABIERTO]

Respuesta `200`: `{es_cierre:false, anclaje_declarado:false, abierto:{anclaje:'...'}}` + sube petición
a `cola-declaraciones-criterio`.

## Errores y qué significan

| Código | Cuándo |
|---|---|
| `403 PERMISSION_DENIED` | `rol !== 'ANCLAJE_CIERRE'` en `declarar`. |
| `400 INVALID_INPUT` (`project_id`/`vertical`/`senal`/`anclaje`) | falta el campo. |
| `500 UNKNOWN_ERROR` | excepción dentro de `_atender`. |

## Relación con otras piezas

- **Depende de:** `clave-natural` (M3) — **sube** `clave-natural.calcular.request`; y
  `cola-declaraciones-criterio` (K9) — **sube** `.fijar.request` y **escucha**
  `contabilidad.criterio_fijado`.
- **De quién depende por evento:** `cola-declaraciones-criterio` (K9) emite
  `contabilidad.criterio_fijado`.
- **Quién la consume:** los módulos que necesitan saber qué es "un cierre" por vertical.
- **Deps por EVENTO, nunca import.**

## Verificación

1. Ficheros en disco: `modules/contabilidad-entrada/anclaje-cierre-vertical/module.json` + `index.js`.
2. Smoke: `declarar` con rol ANCLAJE_CIERRE → 200 + `contabilidad.anclaje_cierre_declarado`.
3. `anclar` con anclaje y señal que casa → `es_cierre:true`.
4. Sin anclaje → `es_cierre:false, abierto` + sube petición.
5. Rol inválido → 403 + `.declarar.failed`.
6. Gate `scripts/validate-hibridos.js`.

## Notas de implementación

- Clase `AnclajeCierreVertical extends ModuloHibridoReflejo`; `name = 'anclaje-cierre-vertical'`,
  `version = 'reflejo-0.1.0'`. Store `this._parcelas` (Map `pid → {esquema, verticales:
  Map<vertical, Anclaje>}`).
- **PosPersistencia**: `file:'anclaje-cierre-vertical.json'`,
  `dir:'/contabilidad/anclaje-cierre-vertical'`.
- Proyecciones `_anclar` (**async**) / `_declarar`; handler `onCriterioFijado`; helpers
  `_coincideAnclaje`, `_subirPeticionCriterio`; lectura `anclajesDe(pid)`; tools `toolAnclar`/
  `toolDeclarar`.
