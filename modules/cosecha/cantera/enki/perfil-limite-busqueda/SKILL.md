---
name: perfil-limite-busqueda
description: >
  Skill FULL del módulo CUSTODIO `perfil-limite-busqueda` de la vertical nichos
  (Radar de Nichos). Store por proyecto de los LÍMITES DECLARABLES del dueño para la
  BÚSQUEDA de nichos: alcance geográfico/mercado, exclusiones de partida, profundidad
  de barrido, límites de territorio/candidatos y reglas fijas. Un solo escritor (DUEÑO);
  el buscador consume por lectura. Persiste por proyecto vía PosPersistencia. Úsala
  para operar, depurar o extender el custodio, o para entender su contrato de eventos
  y sus reglas de negocio.
when-to-use: >
  - Cuando necesites declarar o leer los límites de búsqueda de nichos de un proyecto
    (RPC nichos.limite.declarar.request / nichos.limite.leer.request, rol DUEÑO).
  - Cuando depures por qué se rechaza una escritura (rol != DUEÑO, 403 PERMISSION_DENIED)
    o una declaración con payload inválido (400), o por qué no se persistió el perfil.
  - Cuando quieras entender el patrón CUSTODIO (guard de rol DUEÑO, PosPersistencia, store
    por proyecto) y su contrato de eventos.
  - Cuando vayas a escribir/ampliar el test unitario del custodio.
tags: [enki, modulo, custodio, nichos, radar, limites, busqueda, proyecto-3d]
---

# perfil-limite-busqueda — CUSTODIO de los límites de búsqueda del Radar

## Qué hace el módulo

`perfil-limite-busqueda` es un **CUSTODIO CON PERSISTENCIA** (B3): guarda los **LÍMITES
DECLARABLES del dueño** para la búsqueda de nichos — alcance (geografía/mercado), exclusiones
de partida, profundidad de barrido (1|2|3), tope de territorios/candidatos, cuota de consultas
por fuente y las **reglas fijas** que el dueño decide. Es el **store de configuración de
límites de búsqueda POR PROYECTO** que el buscador consume por lectura.

Es un **CUSTODIO** (patrón distinto del reflejo stateless): **un solo escritor — el DUEÑO** —
vía el **guard de rol** en `_declarar` (rol `DUEÑO`; second-writer rechazado con `403`). La
lectura (`_leer`) **no muta**. Persiste por proyecto con `PosPersistencia`
(`/prisma/nichos/perfil-limite-busqueda.json`), restaura en `project.activated` y vuelca en
`onUnload`.

Store en memoria: `this._limites` (Map `project_id` → objeto de límites, un único estado por
proyecto). Cuando un proyecto aun no tiene perfil, `_leer`/`_declarar` lo **crean bajo el molde**
`limitesVacios()` (valores `null`/`[]`), sin inventar límites.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `nichos.limite.leer.request` | `onLeerRequest` | RPC custodio: {project_id} → {project_id, limites}. Lee el perfil de límites de búsqueda del proyecto (alcance, exclusions_base, profundidad, max_territorios, max_candidatos, limite_consulta_fuente, reglas). La lectura no muta. Lo consume el buscador (sondeo-territorio/cola). |
| `nichos.limite.declarar.request` | `onDeclararRequest` | RPC custodio: {project_id, rol:'DUEÑO', limites:{...}} → {project_id, limites, declarado}. Guard Rol=DUEÑO (second-writer rechazado). Persiste el perfil, publica `nichos.limite.declarado` y responde por `nichos.limite.declarar.response`. Si no es DUEÑO o el payload es inválido → `nichos.limite.declarar.failed`. |
| `project.activated` | `onProjectActivated` | Restaura el perfil de límites del proyecto activado desde el storage (PosPersistencia). |

### Publishes

| Evento | Descripción |
|---|---|
| `nichos.limite.declarado` | Fire-and-forget (B3): el DUEÑO declaró los límites de búsqueda → {project_id, limites, declarado:true}. Lo consumen el buscador (sondeo-territorio/cola-candidatos) para respetar los límites vigentes. |
| `nichos.limite.declarar.failed` | Par de fallo determinista (B3): escritura rechazada (rol != DUEÑO) o payload inválido → {status, code, message, data}. Cierra el círculo de nichos.limite.declarar.request. |

> **Regla de cierre de círculo**: el par de fallo canónico de la escritura es
> `nichos.limite.declarar.failed`, emitido por `onDeclararRequest` cuando `_declarar` devuelve
> un status distinto de 200 (403 PERMISSION_DENIED o 400 INVALID_INPUT). La **lectura** responde
> solo por `nichos.limite.leer.response` y no tiene par `*.failed` propio (falla con 400 en el
> response si falta `project_id`, sin emitir evento de dominio).

> **Nota: los `.response` (`nichos.limite.leer.response`, `nichos.limite.declarar.response`) no
> figuran como events en publishes de module.json**, pero index.js los usa como destino de respuesta
> en `_atender(...)`, como es el estándar del framework (todo flujo request responde su `.response`).

## Reglas de negocio

1. **CUSTODIO single-writer — guard de rol DUEÑO**: solo `rol: 'DUEÑO'` puede escribir.
   Si `input.rol !== ROL_DUENYO` ("DUEÑO") → `403 PERMISSION_DENIED` con
   `{ rol_esperado: 'DUEÑO', rol_recibido: input.rol }` + `nichos.limite.declarar.failed`.
2. **Lectura que no muta**: `_leer` devuelve `{ project_id, limites }` y no modifica
   (salvo `_obtenerOCrear` que crea el perfil vacío bajo molde si aún no existe). Sin
   `project_id` → `400 INVALID_INPUT` (a través de `_invalid('project_id')`).
3. **`project_id` obligatorio**: sin `project_id` (leer o declarar) → `400` (`_invalid('project_id')`).
   Declarar sin `limites` objeto → `400` (`_invalid('limites')`).
4. **Molde y normalización**: toda declaración se mergea conservadoramente sobre
   `limitesVacios()`, tomando los valores previos cuando el campo no viene. Validaciones:
   - `alcance` objeto: `geografia`/`mercado` se trimean (null si vacíos); si ambos quedan vacíos
     al declarar alcance → `400 INVALID_INPUT` (`limites.alcance`).
   - `exclusions_base` array de filtrables con `trim()`.
   - `profundidad` entero en `{1, 2, 3}` (`PROFUNDIDADES`); fuera → `400` (`limites.profundidad`).
   - `max_territorios`, `max_candidatos`, `limite_consulta_fuente`: enteros positivos
     (`numPos`) o null — se usa el previo si el campo no trae valor (`?? previo`).
   - `reglas` array: cada regla exige `tipo` ∈ {producto, audiencia, territorio, fuente,
     profundidad} (`TIPOS_REGLA`) y `valor` no vacío; regla malformada → se descarta, no rompe.
     `motivo` por defecto `` `límite fijo de ${tipo}` ``.
5. **Persistencia por proyecto (PosPersistencia)**: store `perfil-limite-busqueda.json` en
   `/prisma/nichos`; `marcarDirty(pid)` tras crear/declarar; `restaurar(project_id)` en
   `project.activated`; `flush()` en `onUnload`. La escritura deja `updated_at` ISO y
   `declarado_por: 'DUEÑO'`.

## Cómo se usa (RPCs)

RPCs request/response que responden en `*.response`. Leer → `nichos.limite.leer.request`,
declarar → `nichos.limite.declarar.request`.

### 1. `leer` — consultar el perfil de límites de un proyecto (no muta)

```json
{ "project_id": "e57a318a-..." }
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "limites": {
    "esquema": "nichos-limites-busqueda-v1",
    "alcance": null,
    "exclusions_base": [],
    "profundidad": null,
    "max_territorios": null,
    "max_candidatos": null,
    "limite_consulta_fuente": null,
    "reglas": [],
    "updated_at": null,
    "declarado_por": null
  }
}
```

### 2. `declarar` — el DUEÑO declara los límites (escritura)

```json
{
  "project_id": "e57a318a-...",
  "rol": "DUEÑO",
  "limites": {
    "alcance": { "geografia": "España", "mercado": "restauración" },
    "exclusions_base": ["moda rápida", "apuestas"],
    "profundidad": 2,
    "max_territorios": 5,
    "max_candidatos": 20,
    "limite_consulta_fuente": 100,
    "reglas": [ { "tipo": "producto", "valor": "tabaco", "motivo": "no negociar" } ]
  }
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "limites": { "...merge sobre el molde con los valores declarados, updated_at ISO, declarado_por: 'DUEÑO'" },
  "declarado": true
}
```
Emite `nichos.limite.declarado` con `{ project_id, limites, declarado: true, correlation_id }`.

### Fallo — escritor no autorizado

```json
{ "project_id": "e57a318a-...", "rol": "buscador", "limites": { "profundidad": 2 } }
```
Respuesta `403` + `nichos.limite.declarar.failed`:
```json
{ "status": 403, "error": { "code": "PERMISSION_DENIED", "message": "solo el DUEÑO puede declarar los límites de búsqueda" }, "rol_esperado": "DUEÑO", "rol_recibido": "buscador" }
```

### Fallo — payload inválido

Sin `project_id`/`limites` o `profundidad` fuera de {1,2,3} → `400 INVALID_INPUT` +
`nichos.limite.declarar.failed`.

## Tests

El test vive en `tests/unit/perfil-limite-busqueda.test.js`. Cubre:

- `leer` del proyecto → `200` con el perfil (crea el molde vacío si no existe); sin `project_id` → 400.
- `declarar` con rol `DUEÑO` → `200`, merge sobre el molde, emite `nichos.limite.declarado`;
  persiste (PosPersistencia) y restaure en `project.activated`.
- `declarar` con rol distinto → `403 PERMISSION_DENIED` + `nichos.limite.declarar.failed`.
- `declarar` con `profundidad` inválida (p. ej. 5) → `400`; regla malformada se descarta sin romper.
- `project.activated` restaura el perfil desde storage; `onUnload` hace flush.

Para ejecutarlo:

```bash
cd /home/admin/3enki/modules/nichos/perfil-limite-busqueda
node tests/unit/perfil-limite-busqueda.test.js
```

## Notas de implementación

- Clase `PerfilLimiteBusqueda extends ModuloHibridoReflejo`; `name = 'perfil-limite-busqueda'`,
  `version = 'reflejo-0.1.0'`. Es **CUSTODIO**: store `this._limites` (Map) + `PosPersistencia`.
- `PosPersistencia` con `file: 'perfil-limite-busqueda.json'`, `dir: '/prisma/nichos'`,
  `snapshot: (pid) => l ? { project_id: pid, limites: l } : null`, `hidratar: (pid, data)`.
- Roles: `ROL_DUENYO = 'DUEÑO'`. Conjuntos de dominio: `PROFUNDIDADES = {1,2,3}`,
  `TIPOS_REGLA = {producto, audiencia, territorio, fuente, profundidad}`.
- Handlers RPC delegan en `_atender(e, 'leer'|'declarar', 'nichos.limite.<accion>.response', fn)`.
- `onDeclararRequest` publica `nichos.limite.declarado` con `status === 200` y
  `nichos.limite.declarar.failed` si no. Incluye `correlation_id` en el evento de dominio.
- `toolLeer`/`toolDeclarar` exponen las proyecciones como tools.
- `_obtenerOCrear` materializa el molde (`limitesVacios()`) y marca dirty al primer acceso.
- Referencia: arquitectura/decisiones/propuestas/prisma.md y hoja B3 del plan-construccion.
