---
name: marca-sociedad
description: >-
  Skill FULL del módulo REFLEJO STATELESS `marca-sociedad` de la vertical contabilidad (Enki).
  Etiqueta cada asiento con su SOCIEDAD: apone la marca DECLARADA a la cabeza y a cada renglón
  del asiento. Mecánico, cero juicio: NO decide a qué sociedad pertenece un asiento. Sirve a la
  consolidación (eliminacion-intercompany I2 y consolidacion I3 operan por sociedad). Dato
  ausente = desconocido: sin sociedad declarada NO se marca con un default → se declara
  `sin_marca` y queda en `abierto`. RPC `marcar` es CLASE PREGUNTA (por el bus, sin panel).
when-to-use: >-
  - Cuando necesites marcar un asiento con su sociedad declarada (RPC marca-sociedad.marcar.request).
  - Cuando depures por qué un asiento vuelve con `marcado:false, sin_marca:true` (no se declaró
    sociedad) o por qué se rechaza (400 INVALID_INPUT por falta de `asiento`).
  - Cuando quieras entender su contrato de eventos: es reflejo puro, no publica hecho.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, reflejo, stateless, contabilidad, analitica, sociedad, consolidacion, marca]
---

# marca-sociedad — REFLEJO que etiqueta el asiento con su sociedad

## Qué hace el módulo

`marca-sociedad` es un **REFLEJO STATELESS** (I1, hoja del plan). Etiqueta cada asiento con su
**SOCIEDAD**. Es **mecánico, cero juicio**: NO decide a qué sociedad pertenece un asiento (eso
lo declara quien lo emite / el criterio del jefe) — solo **apone** la marca declarada y la
**propaga** a la cabeza del asiento y a cada renglón.

Sirve a la **consolidación**: cada asiento queda identificado con la sociedad que lo origina,
de modo que `eliminacion-intercompany` (I2) y `consolidacion` (I3) puedan operar por sociedad
sin ambigüedad.

**Dato ausente = desconocido**: sin `sociedad` declarada NO se inventa una (no se marca con un
default) → `200` con `marcado:false, sin_marca:true` y `abierto.sociedad` declarado. Su RPC
`marcar` es **CLASE PREGUNTA** → sin panel; su cara es el bus.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `marca-sociedad.marcar.request` | `onMarcarRequest` | RPC reflejo (**PREGUNTA**, por el bus): `{project_id, asiento, sociedad?}` → `{project_id, asiento, sociedad, marcado, sin_marca, abierto}`. Apone la sociedad declarada a la cabeza y a los renglones; sin sociedad → `marcado:false` (no se inventa). Responde por `.marcar.response`. |

### Publishes

| Evento | Cuándo |
|---|---|
| `marca-sociedad.marcar.response` | Respuesta RPC correlada de la op `marcar`. |
| `marca-sociedad.marcar.failed` | Fallo determinista: falta `project_id` o `asiento`. |

> **No publica hecho de dominio**: reflejo puro (apone la marca, no escribe estado) → no hay
> `contabilidad.*` que anunciar (R2). El handler publica `.marcar.failed` solo si
> `status !== 200`.

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `marcar` | **PREGUNTA** (bus) | `{project_id, asiento\|a, sociedad?\|sociedad_id?}` | `{project_id, tipo:'marca-sociedad', asiento, sociedad, marcado, sin_marca, abierto}` | 400 `INVALID_INPUT` (`project_id`/`asiento`) |

## Reglas de negocio (lo que el código IMPONE)

1. **Sin `project_id`** → `_invalid('project_id')`; **sin `asiento`**/`a` objeto →
   `_invalid('asiento')` (400).
2. **Sociedad declarada** (`_sociedad`): de `input.sociedad` o `input.sociedad_id`, trim. Vacía
   o ausente → `null`.
3. **Sin sociedad → NO se marca con default**: devuelve 200 con `sociedad:null, marcado:false,
   sin_marca:true`, `abierto.sociedad:'el asiento no declara sociedad: se marca el hueco, no se
   inventa una'`. El asiento se devuelve igualmente (`_conMarca(asiento, null)`).
4. **Con sociedad → marca mecánica** (`_conMarca`): copia el asiento aplanado
   (`{...asiento, sociedad}`) y propaga la marca a cada renglón de `renglones` (o `lineas` si
   no hay `renglones`). Los items no-objeto se dejan tal cual.
5. **`en_dudoso:false`** en la salida (campo declarado).
6. **Determinista y sin estado**: no guarda nada, no persiste.

## Cómo se usa (RPC)

### Marcar con sociedad

```json
{
  "project_id": "e57a318a-...",
  "asiento": { "id": "a1", "renglones": [ { "cuenta": "430", "importe": 100 }, { "cuenta": "700", "importe": -100 } ] },
  "sociedad": "SOCIEDAD-A"
}
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "tipo": "marca-sociedad", "asiento": { "id": "a1", "sociedad": "SOCIEDAD-A", "renglones": [ { "cuenta": "430", "importe": 100, "sociedad": "SOCIEDAD-A" }, { "cuenta": "700", "importe": -100, "sociedad": "SOCIEDAD-A" } ] }, "sociedad": "SOCIEDAD-A", "marcado": true, "sin_marca": false, "en_dudoso": false, "abierto": { "sociedad": null } }
```

### Sin sociedad → hueco declarado

```json
{ "project_id": "e57a318a-...", "asiento": { "id": "a1" } }
```
Respuesta `200`: `marcado:false, sin_marca:true, sociedad:null`, `abierto.sociedad` declarado.

### Fallo — asiento inválido

```json
{ "project_id": "e57a318a-...", "asiento": "texto" }
```
Respuesta `400` + `marca-sociedad.marcar.failed` (`INVALID_INPUT`, field `asiento`).

## Errores y qué significan

| Código | Cuándo |
|---|---|
| `400 INVALID_INPUT` (`project_id`) | falta `project_id`. |
| `400 INVALID_INPUT` (`asiento`) | no viene asiento objeto (`asiento`/`a`). |
| `500 UNKNOWN_ERROR` | excepción dentro de `_atender`. |

## Relación con otras piezas

- **Depende de:** — (raíz; nadie). Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` +
  `project-manager`.
- **De quién depende:** ninguna. La sociedad llega declarada en la petición.
- **Quién la usa:** `eliminacion-intercompany` (I2) y `consolidacion` (I3), que operan por
  sociedad; la marca es lo que hace posible saber que dos partidas se cruzan.
- **Deps por EVENTO, nunca import.**

## Verificación

1. Ficheros en disco: `modules/contabilidad-analitica/marca-sociedad/module.json` + `index.js`.
2. Smoke: `marcar` con sociedad → 200, marca en cabeza y renglones.
3. Sin sociedad → `sin_marca:true`, `abierto.sociedad` declarado.
4. `asiento` inválido → `.marcar.failed`.
5. `grep -E '"event"' module.json` (solo `marcar.request`).

## Notas de implementación

- Clase `MarcaSociedad extends ModuloHibridoReflejo`; `name = 'marca-sociedad'`,
  `version = 'reflejo-0.1.0'`. **Sin store propio** (stateless).
- `onMarcarRequest` delega en `_atender(e,'marcar','marca-sociedad.marcar.response', ...)` y
  publica `.marcar.failed` si `status !== 200`.
- Proyección `_marcar`; helpers `_conMarca`, `_sociedad`; tool `toolMarcar`.
  `_invalid`/`_errorResponse` de `modulo-hibrido-reflejo`.
