---
name: clave-natural
description: >-
  Skill FULL del módulo REFLEJO STATELESS `clave-natural` de la vertical contabilidad (Enki).
  Idempotencia determinista: reprocesar NO duplica ("un cierre = un asiento"). Calcula la CLAVE
  NATURAL de un hecho/documento a partir de sus COMPONENTES DECLARADOS y decide si dos elementos
  COINCIDEN. Determinista: mismas componentes + mismos valores → misma clave. Sin `componentes`
  declaradas se usan todos los campos salvo los VOLÁTILES; jamás se cablea un subconjunto de
  dominio. Normalización MECÁNICA (trim/espacios/case), no de negocio. Ambas RPC son PREGUNTA.
  Cuando falta el criterio de componentes, sube una petición best-effort a cola-declaraciones-criterio.
when-to-use: >-
  - Cuando necesites calcular la clave natural de un hecho o decidir si dos elementos coinciden
    (RPC clave-natural.calcular.request / .coincide.request).
  - Cuando depures por qué devuelve 422 SIN_COMPONENTES o por qué `componentes_declarados:false`.
  - Cuando quieras entender su contrato de eventos: es reflejo puro, no publica hecho.
  - Cuando vayas a escribir/ampliar su test unitario (la hoja dice: "un test lo afirma").
tags: [enki, modulo, reflejo, stateless, contabilidad, libro, idempotencia, clave-natural, anti-duplicado]
---

# clave-natural — REFLEJO de la idempotencia determinista

## Qué hace el módulo

`clave-natural` es un **REFLEJO STATELESS** (M3, hoja del plan). Garantiza **idempotencia
determinista**: reprocesar NO duplica ("un cierre = un asiento"). Calcula la **CLAVE NATURAL**
de un hecho/documento a partir de sus **COMPONENTES DECLARADOS**, y decide si dos elementos
**COINCIDEN** (misma clave). Es el único criterio de "es lo mismo" del dominio.

Invariantes:
- **DETERMINISTA**: mismos componentes + mismos valores → misma clave.
- **Componentes declarables** (`componentes: [...]`). Si no se declaran, se usan TODOS los campos
  del elemento **salvo los VOLÁTILES** (`en, timestamp, ts, request_id, correlation_id, autor,
  actor, rol, _version`): jamás se inventa un subconjunto de dominio cableado.
- **Normaliza MECÁNICAMENTE** (trim/colapsa espacios/minúsculas), no por política de negocio.
- **Sin elementos → no hay clave** (dato ausente = desconocido), no una clave vacía que colisione.

**Cuando falta el criterio de componentes** (`componentes_declarados === false`), el handler sube
una **petición best-effort** a `cola-declaraciones-criterio.fijar.request` (vía `_rpc`, **sin
suplantar al JEFE** — no manda rol). Ambas RPC son **PREGUNTA** → sin panel.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `clave-natural.calcular.request` | `onCalcularRequest` | RPC reflejo (**PREGUNTA**, por el bus): `{project_id?, elemento, componentes?}` → `{project_id, clave, componentes, partes, componentes_declarados, determinista}`. Mismos componentes + valores → misma clave. Sin elemento → `INVALID_INPUT`. Responde por `.calcular.response`. |
| `clave-natural.coincide.request` | `onCoincideRequest` | RPC reflejo (**PREGUNTA**, por el bus): `{project_id?, a, b, componentes?}` → `{project_id, coincide, clave_a, clave_b, es_duplicado}`. Compara las claves naturales de dos elementos. Responde por `.coincide.response`. |

> **Nota de deriva (R3):** el plan declara escucha de `contabilidad.anclaje_cierre_declarado`,
> pero el `module.json` real **solo** declara los dos RPC. Ningún módulo del repo lo emite aún
> (`anclaje-cierre-vertical` es de un grupo posterior); declararlo daría cadena colgada.
> **Sí sube** (no publica hecho, sino petición) `cola-declaraciones-criterio.fijar.request`
> cuando falta el criterio de componentes.

### Publishes

| Evento | Cuándo |
|---|---|
| `clave-natural.calcular.response` | Respuesta RPC correlada de la op `calcular`. |
| `clave-natural.calcular.failed` | Fallo determinista: falta el elemento o no hay componentes (422 `SIN_COMPONENTES`). |
| `clave-natural.coincide.response` | Respuesta RPC correlada de la op `coincide`. |
| `clave-natural.coincide.failed` | Fallo determinista: faltan `a` o `b`. |

> **No publica hecho de dominio**: reflejo puro (no escribe) → no hay `contabilidad.*` que
> anunciar (R2, `ui_handlers: []`).

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `calcular` | **PREGUNTA** (bus) | `{project_id?, elemento\|hecho\|documento, componentes?}` | `{project_id, clave, componentes, partes, componentes_declarados, determinista:true, abierto}` | 422 `SIN_COMPONENTES`; 400 `INVALID_INPUT` (`elemento`) |
| `coincide` | **PREGUNTA** (bus) | `{project_id?, a\|uno, b\|otro, componentes?}` | `{project_id, coincide, clave, clave_a, clave_b, componentes, es_duplicado}` | 400 `INVALID_INPUT` (`a`/`b`) |

## Reglas de negocio (lo que el código IMPONE)

1. **Elemento obligatorio**: `_calcular` exige `elemento`/`hecho`/`documento` objeto → si no,
   `_invalid('elemento')`.
2. **Componentes** (`_componentes`): si `input.componentes` es array no vacío → se usan tal cual
   (`declarados:true`); si no, se usan `Object.keys(elemento)` **menos los VOLÁTILES** ordenados
   (`declarados:false`, `abierto.componentes` declarado).
3. **Sin componentes** (elemento sin campos y sin `componentes`) → `422 SIN_COMPONENTES`.
4. **Clave**: `partes = componentes.map(_norm)`; `clave = partes.join('|')`.
5. **Normalización mecánica** (`_norm`): `null/undefined` → `'\u0000'` (marcador de ausente que no
   colisiona con `''`); objeto → `JSON.stringify` con claves ordenadas; escalar → `trim`, colapsa
   espacios, minúsculas.
6. **`_coincide`**: exige `a`/`b` objeto (acepta `uno`/`otro`); calcula ambas claves y devuelve
   `coincide`, `clave` (solo si coincide), `es_duplicado = coincide`.
7. **`_subirPeticionCriterio`**: cuando `componentes_declarados:false`, hace `this._rpc(
   'cola-declaraciones-criterio.fijar.request', {project_id, clave:'clave_natural',
   origen:'clave-natural'}, {timeout_ms:2000})` en `try/catch` (best-effort; no cuelga si el bus
   no está).

## Cómo se usa (RPCs)

### 1. Calcular la clave natural

```json
{ "project_id": "e57a318a-...", "elemento": { "tipo": "cierre", "ejercicio": "2026", "sociedad": "A", "en": "2026-12-31T23:59" } }
```
Respuesta `200` (sin componentes declaradas → usa todos los no volátiles; `en` excluido):
```json
{ "project_id": "e57a318a-...", "clave": "2026|a|cierre", "componentes": ["ejercicio","sociedad","tipo"], "partes": ["2026","a","cierre"], "componentes_declarados": false, "determinista": true, "abierto": { "componentes": "no se declararon `componentes`: se usan todos los campos no volátiles" } }
```

### 2. Coinciden dos elementos

```json
{ "project_id": "e57a318a-...", "a": { "tipo": "cierre", "ejercicio": "2026" }, "b": { "tipo": "cierre", "ejercicio": "2026", "en": "otro" } }
```
Respuesta `200`: `{coincide:true, es_duplicado:true, clave_a:'2026|cierre', clave_b:'2026|cierre'}`.

### Fallo — elemento sin campos

```json
{ "project_id": "e57a318a-...", "elemento": {} }
```
Respuesta `422` + `clave-natural.calcular.failed` (`SIN_COMPONENTES`).

## Errores y qué significan

| Código | Cuándo |
|---|---|
| `422 SIN_COMPONENTES` | el elemento no tiene campos y no se declararon componentes. |
| `400 INVALID_INPUT` (`elemento` / `a` / `b`) | falta el cuerpo objeto. |
| `500 UNKNOWN_ERROR` | excepción dentro de `_atender`. |

## Relación con otras piezas

- **Depende de:** — (raíz; el plan dice `cola-declaraciones-criterio`, y el código **sí sube**
  petición best-effort a `cola-declaraciones-criterio.fijar.request`). Bases: `_shared` + filesystem.
- **Quién la usa:** `deduplicacion-hecho` (A6) y cualquier proceso que deba decidir "es lo mismo".
- **Deps por EVENTO, nunca import.**

## Verificación

1. Ficheros en disco: `modules/contabilidad-libro/clave-natural/module.json` + `index.js`.
2. Smoke: `calcular` mismo elemento dos veces → misma clave (determinismo).
3. Sin `componentes` → `componentes_declarados:false` y `abierto.componentes`.
4. Elemento vacío → `422 SIN_COMPONENTES` + `.calcular.failed`.
5. `coincide` → `es_duplicado:true` con elementos equivalentes.
6. `grep -E '"event"' module.json` (solo los dos `.request`).

## Notas de implementación

- Clase `ClaveNatural extends ModuloHibridoReflejo`; `name = 'clave-natural'`,
  `version = 'reflejo-0.1.0'`. **Sin store propio** (stateless). `VOLATILES` es un Set.
- Handlers `onCalcularRequest`/`onCoincideRequest` delegan en `_atender` y publican su `*.failed`
  si status ≠ 200; `calcular` además puede subir la petición de criterio.
- Proyecciones `_calcular`/`_coincide`; helpers `_componentes`, `_norm`, `_subirPeticionCriterio`;
  tools `toolCalcular`/`toolCoincide`.
