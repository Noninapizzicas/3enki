---
name: catalogo-capacidades
description: >
  Skill FULL del módulo CUSTODIO CON PERSISTENCIA `catalogo-capacidades` (D3) de la vertical
  nichos (Radar de Nichos). Es el catálogo persistente por proyecto de las CAPACIDADES
  (existentes y faltantes) para CONSTRUIR la solución del nicho; invariante D3 "lo que falta se
  crea". Un solo escritor (CONSTRUCTOR del ensamblador o DUEÑO); el ensamblador-solucion (D1)
  consulta por lectura. Úsala para operar, depurar o extender el catálogo de capacidades, o para
  entender su contrato de eventos, PosPersistencia y reglas de negocio.
when-to-use: >
  - Cuando necesites consultar las capacidades de un nicho (RPC nichos.capacidad.consultar.request).
  - Cuando el CONSTRUCTOR o DUEÑO deba declarar/crear una capacidad, o cuando depures por qué una
    declaración fue rechazada (rol inválido → 403, payload inválido → 400) o el estado del catálogo.
  - Cuando entiendas el patrón CUSTODIO con PosPersistencia (project.activated + snapshot/hidratar
    + storage /prisma/nichos/catalogo-capacidades.json) y la invariante D3 "lo que falta se crea".
  - Cuando vayas a escribir/ampliar el test unitario del custodio.
tags: [enki, modulo, custodio, persistencia, nichos, radar, construccion, capacidades, proyecto-3d]
---

# catalogo-capacidades — CUSTODIO CON PERSISTENCIA (D3) de la CONSTRUCCIÓN de la solución del Radar

## Qué hace el módulo

`catalogo-capacidades` es un **catálogo persistente por PROYECTO** de las capacidades
(las **existentes** y las **faltantes**) necesarias para **construir la SOLUCIÓN** del nicho.
Cada capacidad es `{ nombre, estado: 'existente'|'faltante', descripcion, creado_para, updated_at }`
dentro de un catálogo `{ esquema:'nichos-capacidades-v1', capacidades[], updated_at, declarado_por }`.

**Invariante D3: "lo que falta, se crea"** — el custodio JAMÁS deja un hueco muerto. El
`ensamblador-solucion` (D1) consulta (`_consultar` → CapacidadesDisponibles) y, cuando detecta
que falta algo, el custodio lo registra como **FALTANTE declarado**
(`nichos.capacidad.faltante_declarado`) para que el paso de construcción lo materialice.

Es un **CUSTODIO real** (patrón de `/perfil-limite-busqueda` y `/criterio-viabilidad`): **un solo
escritor** — el **CONSTRUCTOR** (ensamblador D1) o el **DUEÑO** — con guard de rol en
`_declararFaltante`; la lectura (`_consultar`) **no muta**; la escritura valida, normaliza y
**garantiza la invariante** (crea la capacidad faltante si no existía).

**Persiste por proyecto con PosPersistencia** (storage `/prisma/nichos/catalogo-capacidades.json`),
**restaura en `project.activated`** y vuelca en `onUnload`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `nichos.capacidad.consultar.request` | `onConsultarRequest` | RPC custodio: {project_id, nicho?} → {project_id, nicho, capacidades_disponibles, capacidades_faltantes, capacidades, cantidad}. Lee el catálogo de capacidades del proyecto (las existentes para construir y las faltantes declaradas). La lectura no muta. Lo consume el ensamblador-solucion (D1) antes de materializar la solución. |
| `nichos.capacidad.declarar.request` | `onDeclararRequest` | RPC custodio: {project_id, rol:'CONSTRUCTOR'\|'DUEÑO', capacidad, estado?:'existente'\|'faltante', descripcion?, nicho?} → {project_id, capacidad, catalogo, creado}. Guard de escritor (solo CONSTRUCTOR/DUEÑO; second-writer rechazado). INVARIANTE: si la capacidad falta, se crea (jamás deja hueco). Publica nichos.capacidad.faltante_declarado y responde por nichos.capacidad.declarar.response. Si el rol no es válido o el payload es inválido → nichos.capacidad.declarar.failed. |
| `project.activated` | `onProjectActivated` | Restaura el catálogo de capacidades del proyecto activado desde el storage (PosPersistencia). |

### Publishes

| Evento | Descripción |
|---|---|
| `nichos.capacidad.faltante_declarado` | Fire-and-forget (D3): se declaró/creó una capacidad (faltante o existente) en el catálogo del proyecto → {project_id, capacidad, catalogo, creado}. Lo consume el ensamblador-solucion (D1) y el paso de construcción para materializar lo que falta. |
| `nichos.capacidad.declarar.failed` | Par de fallo determinista (D3): escritura rechazada (rol != CONSTRUCTOR/DUEÑO) o payload inválido → {status, code, message, data}. Cierra el círculo de nichos.capacidad.declarar.request. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico. Aquí el único par
> posible es `nichos.capacidad.declarar.failed` (escritura rechazada por rol o payload inválido).

> **Nota: `nichos.capacidad.consultar.failed` NO existe** — el `leer` RPC (consultar) es una lectura
> que no muta y no tiene par de fallo de dominio propio (el guard de `project_id` responde 400 por el
> canal de la response vía `_invalid`).

> **Nota: no está en module.json pero sí lo emite `_atender` (modulo-hibrido-reflejo)**:
> ante una excepción inesperada en la proyección, se responde por el canal de la response con
> `{ status: 500, code: 'UNKNOWN_ERROR', mensaje: err.message }`.

## Reglas de negocio

1. **Un solo escritor del catálogo — CONSTRUCTOR o DUEÑO**: `_declararFaltante` exige
   `rol ∈ {CONSTRUCTOR, DUEÑO}` (`ROLES_ESCRITOR`). Si no → **`403 PERMISSION_DENIED`** +
   `nichos.capacidad.declarar.failed` con
   `{ status:403, code:'PERMISSION_DENIED', mensaje:'solo el CONSTRUCTOR o el DUEÑO pueden declarar capacidades', data:{ rol_esperado:'CONSTRUCTOR|DUEÑO', rol_recibido:<rol> } }`.
2. **INVARIANTE D3: lo que falta se crea**: si la capacidad no estaba registrada se `push` al
   catálogo (nunca deja hueco muerto) con `creado: true`; si ya existía (cualquier estado) solo
   se **actualiza** estado/descripción, **nunca se duplica** (`creado: false`). Default `estado`
   es `'faltante'` (solo se acepta `existente`|`faltante`).
3. **Lectura no muta**: `_consultar` solo filtra y devuelve; `consultarDisponibles(pid, nicho)` es
   el alias semántico para el ensamblador (D1).
4. **Payload sin `project_id`** → **`400 INVALID_INPUT`** + failed con
   `{ status:400, code:'INVALID_INPUT', mensaje:'project_id requerido', data:{ field:'project_id' } }`.
5. **Capacidad sin nombre** (`estrNoVacio` sobre `capacidad` o `nombre`) → `400 INVALID_INPUT`
   (`campo 'capacidad'`).
6. **Estado normalizado**: `input.estado` debe estar en `{existente, faltante}` (`ESTADOS`); si no
   o viene ausente → default `'faltante'`. `descripcion` por defecto
   `'capacidad declarada para construir la solucion'`. `creado_para` = `input.nicho` trimeado o null.
7. **Cierre de círculo de escritura**: éxito en `_declararFaltante` → el handler publica
   `nichos.capacidad.faltante_declarado` (capacidad + catalogo + `creado`); fallo → `nichos.capacidad.declarar.failed`.

## Cómo se usa (RPCs)

RPCs que responden en `nichos.capacidad.consultar.response` y `nichos.capacidad.declarar.response`:

### 1. `consultar` — leer el catálogo de capacidades de un nicho (no muta)

```json
{ "project_id": "e57a318a-...", "nicho": "salsa picante artesanal" }
```
Respuesta `200`:
```json
{
  "status": 200,
  "data": {
    "project_id": "e57a318a-...",
    "nicho": "salsa picante artesanal",
    "capacidades_disponibles": [
      { "nombre": "recetario", "estado": "existente", "descripcion": "formulacion y costeo", "creado_para": "salsa picante artesanal", "updated_at": "2026-09-25T10:00:00.000Z" }
    ],
    "capacidades_faltantes": [
      { "nombre": "distribucion", "estado": "faltante", "descripcion": "capacidad declarada para construir la solucion", "creado_para": "salsa picante artesanal", "updated_at": "2026-09-25T10:00:00.000Z" }
    ],
    "capacidades": [
      { "nombre": "recetario", "estado": "existente", "descripcion": "formulacion y costeo", "creado_para": "salsa picante artesanal", "updated_at": "2026-09-25T10:00:00.000Z" },
      { "nombre": "distribucion", "estado": "faltante", "descripcion": "capacidad declarada para construir la solucion", "creado_para": "salsa picante artesanal", "updated_at": "2026-09-25T10:00:00.000Z" }
    ],
    "cantidad": 2
  }
}
```

### 2. `declarar` — el CONSTRUCTOR/DUEÑO declara (y crea si falta) una capacidad

```json
{
  "project_id": "e57a318a-...",
  "rol": "CONSTRUCTOR",
  "capacidad": "pasarela-pago",
  "estado": "faltante",
  "descripcion": "cobro online de pedidos",
  "nicho": "salsa picante artesanal"
}
```
Respuesta `200` + publica `nichos.capacidad.faltante_declarado`:
```json
{
  "status": 200,
  "data": {
    "project_id": "e57a318a-...",
    "capacidad": {
      "nombre": "pasarela-pago",
      "estado": "faltante",
      "descripcion": "cobro online de pedidos",
      "creado_para": "salsa picante artesanal",
      "updated_at": "2026-09-25T10:00:00.000Z"
    },
    "catalogo": {
      "esquema": "nichos-capacidades-v1",
      "capacidades": [
        { "nombre": "pasarela-pago", "estado": "faltante", "descripcion": "cobro online de pedidos", "creado_para": "salsa picante artesanal", "updated_at": "2026-09-25T10:00:00.000Z" }
      ],
      "updated_at": "2026-09-25T10:00:00.000Z",
      "declarado_por": "CONSTRUCTOR"
    },
    "creado": true
  }
}
```

### Fallo — escritura rechazada (rol no autorizado)

```json
{ "project_id": "e57a318a-...", "rol": "EDITOR", "capacidad": "pasarela-pago" }
```
Respuesta `403` + `nichos.capacidad.declarar.failed`:
```json
{ "status": 403, "code": "PERMISSION_DENIED", "mensaje": "solo el CONSTRUCTOR o el DUEÑO pueden declarar capacidades", "data": { "rol_esperado": "CONSTRUCTOR|DUEÑO", "rol_recibido": "EDITOR" } }
```

### Fallo — payload inválido (sin nombre de capacidad)

```json
{ "project_id": "e57a318a-...", "rol": "CONSTRUCTOR", "capacidad": "   " }
```
Respuesta `400` + `nichos.capacidad.declarar.failed`:
```json
{ "status": 400, "code": "INVALID_INPUT", "mensaje": "capacidad requerido", "data": { "field": "capacidad" } }
```

## Tests

El test vive en `tests/unit/catalogo-capacidades.test.js`. Cubre:

- `consultar` con `project_id` → `200` con las listas disponibles/faltantes y `cantidad`; sin
  `project_id` → `400 INVALID_INPUT`.
- `declarar` con rol CONSTRUCTOR/DUEÑO → `200`, crea la capacidad faltante (`creado:true`, invariante)
  y publica `nichos.capacidad.faltante_declarado`.
- `declarar` con rol != CONSTRUCTOR/DUEÑO → `403 PERMISSION_DENIED` + `nichos.capacidad.declarar.failed`.
- `declarar` con `capacidad` vacío → `400 INVALID_INPUT`.
- Invariante: declarar una capacidad ya existente actualiza estado/descripción sin duplicar
  (`creado:false`), incluyendo pasar de `faltante` a `existente` (y viceversa).
- PosPersistencia: `project.activated` restaura el catálogo desde el storage; `onUnload` vuelca.

Para ejecutarlo:

```bash
cd /home/admin/3enki/modules/nichos/catalogo-capacidades
node tests/unit/catalogo-capacidades.test.js
```

## Notas de implementación

- Clase `CatalogoCapacidades extends ModuloHibridoReflejo`; `name = 'catalogo-capacidades'`,
  `version = 'reflejo-0.1.0'`. Store en memoria: `this._catalogos = new Map()` (project_id → catálogo).
- **PosPersistencia**: `this._persist = new PosPersistencia({ modulo:this, file:'catalogo-capacidades.json',
  dir:'/prisma/nichos', snapshot, hidratar })`. `onProjectActivated` → `this._persist.restaurar(d.project_id)`;
  `onUnload` → `flush()` + `detener()`. `_obtenerOCrear`/`_declararFaltante` marcan `marcarDirty(pid)`.
- **Escritura de dominio**: `onDeclararRequest` publica `nichos.capacidad.faltante_declarado`
  (capacidad + catalogo + `creado` + `correlation_id`) o `nichos.capacidad.declarar.failed`.
- `_consultar` delega vía `_atender(e,'consultar','nichos.capacidad.consultar.response', d => this._consultar(d))`.
- `consultarDisponibles(pid, nicho)` es el alias semántico para el ensamblador (D1) (`toolConsultar`).
- DEP: `ensamblador-solucion` (D1) consulta este catálogo y, al detectar falta, dispara la declaración
  para que el paso de construcción materialice lo que falta (invariante D3).
