---
name: perfil-administrativo
description: >
  Skill FULL del módulo CUSTODIO `perfil-administrativo` de la vertical contabilidad
  de Enki. Parcela DECLARABLE de qué administraciones y qué obligaciones aplican al
  negocio: territorio + régimen + obligaciones, por negocio y ejercicio — LA FUENTE de
  los parámetros que las demás hojas fiscales LEEN; la ley entra como dato y nada se
  asume por defecto. Un solo escritor y sin sobrescritura; persiste por proyecto con
  PosPersistencia. Úsala para operar, depurar o extender el custodio, o para entender
  su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites leer las obligaciones declaradas de un ejercicio (RPC
    perfil-administrativo.obligaciones.request) o declarar territorio/régimen/
    obligaciones (RPC perfil-administrativo.declarar.request).
  - Cuando depures por qué una declaración se rechaza (403 PERMISSION_DENIED si el rol no
    es DECLARANTE_PERFIL_FISCAL, 400 INVALID_INPUT si falta project_id o ejercicio), o por
    qué la lectura sale `declarado:false`.
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    invariantes del custodio (un solo escritor, la ley entra como dato, nada se asume,
    append-only, persistencia por proyecto).
  - Cuando vayas a escribir/ampliar el test unitario del custodio perfil-administrativo.
tags: [enki, modulo, custodio, contabilidad, perfil-administrativo]
---

# perfil-administrativo — CUSTODIO CON PERSISTENCIA de la parcela fiscal declarada

## Qué hace el módulo

`perfil-administrativo` es un **CUSTODIO CON PERSISTENCIA** (D15, hoja del plan): la
parcela **DECLARABLE** de **qué administraciones y qué obligaciones aplican a este
negocio** — **TERRITORIO**, **RÉGIMEN** (tipo de impuesto indirecto y tipo de impuesto
sobre la renta) y **OBLIGACIONES** (cada una con su modelo y su cadencia declarados).

**ES LA FUENTE** de los parámetros territoriales/régimen que las demás hojas fiscales
**LEEN**: aquí **no se decide nada, se GUARDA lo que el declarante dice**.

**LA LEY ENTRA COMO DATO** (invariante 5): el módulo **NO cablea ningún territorio**
(ni `'comun'` por omisión), **ningún régimen, ningún tipo de impuesto, ningún modelo ni
ningún plazo** — guarda cadenas y estructuras **tal como se declaran**; **el código no
enumera los valores posibles**.

Invariantes:

- **Invariante 7 — dato ausente = desconocido**: sin perfil declarado para un ejercicio,
  la lectura devuelve `declarado:false` con `territorio`/`regimen` a `null` y `motivo`
  declarado — **JAMÁS se asume un régimen ni un territorio «común» por defecto**.
- **Invariante 3 — nada se sobrescribe en silencio**: re-declarar un ejercicio
  **APPENDEA** al historial (valor vigente + fecha + autor).
- **UN SOLO ESCRITOR**: el declarante fiscal (rol `DECLARANTE_PERFIL_FISCAL`: dueño o
  asesor) declara; cualquier otro rol es rechazado (`403`) y **no espera ni hace cola**.
- **El ejercicio es DATO obligatorio** (sin él no se sabe la anualidad).

Se distingue de `parametros-fiscales` (D11, tipos y bases) y de
`cola-declaraciones-criterio` (K9, criterios): aquí **solo territorio + régimen +
obligaciones**. Persiste por proyecto con **PosPersistencia** (storage
`/contabilidad/perfil-administrativo/perfil-administrativo.json`), restaura en
`project.activated` y vuelca en `onUnload`. Proyecciones `_obligaciones` (lectura, no
muta) y `_declarar` (escritura, guard). Publica `contabilidad.perfil_fiscal_declarado`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `perfil-administrativo.obligaciones.request` | `onObligacionesRequest` | RPC custodio (lectura, NO muta): {project_id, ejercicio} → {declarado, territorio, regimen, administraciones, obligaciones, declarado_en?}. Devuelve lo DECLARADO para ese ejercicio; sin perfil declarado → declarado:false con territorio/regimen a null y motivo (invariante 7: no se asume). Responde por perfil-administrativo.obligaciones.response; fallo (project_id ausente) → perfil-administrativo.obligaciones.failed. |
| `perfil-administrativo.declarar.request` | `onDeclararRequest` | RPC custodio (escritura, UN escritor): {project_id, rol:'DECLARANTE_PERFIL_FISCAL', ejercicio, territorio?, regimen?, administraciones?, obligaciones?} → {ejercicio, perfil, declarado, territorio_declarado, regimen_declarado}. Declara territorio + regimen + obligaciones como DATO (territorio/regimen ausentes → null, sin default). Guard Rol=DECLARANTE_PERFIL_FISCAL (segundo escritor → 403). Re-declarar APPENDEA al historial (no se sobrescribe). Exito → publica contabilidad.perfil_fiscal_declarado y responde por perfil-administrativo.declarar.response; fallo → perfil-administrativo.declarar.failed. |
| `project.activated` | `onProjectActivated` | Restaura el perfil administrativo del proyecto activado desde el storage (PosPersistencia). |

### Publishes

| Evento | Descripción |
|---|---|
| `perfil-administrativo.obligaciones.response` | Respuesta RPC correlada de perfil-administrativo.obligaciones.request → {request_id, status:200, data:{declarado, territorio, regimen, administraciones, obligaciones}}. Emitida por el helper _atender. |
| `perfil-administrativo.obligaciones.failed` | Par de fallo determinista (D15): project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de perfil-administrativo.obligaciones.request. |
| `perfil-administrativo.declarar.response` | Respuesta RPC correlada de perfil-administrativo.declarar.request → {request_id, status:200, data:{ejercicio, perfil, declarado, territorio_declarado, regimen_declarado}}. Emitida por el helper _atender. |
| `perfil-administrativo.declarar.failed` | Par de fallo determinista (D15): rol != DECLARANTE_PERFIL_FISCAL (segundo escritor), project_id o ejercicio ausente → {status, error:{code, message, details?}}. Cierra el circulo de perfil-administrativo.declarar.request. |
| `contabilidad.perfil_fiscal_declarado` | Fire-and-forget (D15): quedo declarado el perfil fiscal (territorio + regimen + obligaciones) de un ejercicio → {project_id, ejercicio, territorio, regimen, obligaciones, correlation_id}. Lo LEEN las hojas fiscales (calendario-fiscal D6 y las demas de la capa fiscal) para tomar sus parametros territoriales/regimen declarados. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `perfil-administrativo.obligaciones.failed` cierra el círculo de
> `perfil-administrativo.obligaciones.request` y `perfil-administrativo.declarar.failed`
> cierra el de `perfil-administrativo.declarar.request`, cada uno cuando su proyección
> devuelve status ≠ 200.

> Nota: el módulo expone `perfilDe(pid, ejercicio)` como **lectura directa** para otras
> hojas del mismo proceso (no muta) — no es un evento del bus, no figura en `module.json`.

## Reglas de negocio

1. **Un solo escritor (guard de rol)**: `_declarar` exige
   `input.rol === 'DECLARANTE_PERFIL_FISCAL'` (constante `ROL_ESCRITOR`). Cualquier otro
   rol → `403 PERMISSION_DENIED` con `{rol_esperado:'DECLARANTE_PERFIL_FISCAL',
   rol_recibido:<rol>}`. Second-writer rechazado; **no espera ni hace cola**.
2. **El ejercicio es DATO obligatorio**: `input.ejercicio` ausente/vacío →
   `400 INVALID_INPUT` (`field:'ejercicio'`); se normaliza con `String(...).trim()`.
3. **La ley entra como DATO**: `territorio` (`_texto`) y `regimen` (`_regimen`) se
   guardan como cadenas **tal cual**; `regimen` admite objeto (se copian sus claves con
   `_texto`) o cadena. **El código no enumera territorios, regímenes ni tipos de
   impuesto.** Ausentes → `null` (**no se rellena con default**).
4. **Administraciones y obligaciones se guardan tal cual**: `_listaObjs(raw)` copia cada
   objeto con **sus propias claves**, sin inventar campos legales. No array → `[]`.
5. **Sin perfil declarado NO se asume (invariante 7)**: `_obligaciones` sin perfil para
   el ejercicio → `200` con `declarado:false`, `territorio:null`, `regimen:null`,
   `administraciones:null`, `obligaciones:null` y
   `motivo:'no hay perfil administrativo declarado para este ejercicio (invariante 7: no se asume)'`.
6. **Lectura honesta cuando hay perfil**: `declarado:true` con `territorio`/`regimen`
   (o `null` si no se declararon), `administraciones`/`obligaciones` (arrays o `[]`) y
   `declarado_en`.
7. **Nada se sobrescribe (invariante 3)**: re-declarar el mismo ejercicio **APPENDEA**
   al `historial` (`{ejercicio, territorio, regimen, administraciones:<n>,
   obligaciones:<n>, por, en}`) y actualiza el valor vigente con su fecha; el perfil
   conserva `vigente_desde` (la fecha de la declaración anterior, o ahora) y sella
   `declarado_en` con `new Date().toISOString()`.
8. **La respuesta declara qué se declaró**: `territorio_declarado: terreno !== null` y
   `regimen_declarado: regimen !== null` — **si un valor no vino, no se finge**.
9. **Fallo determinista**: `_obligaciones` y `_declarar` toman `input.project_id ||
   this.project_id`; ausente → `400 INVALID_INPUT` (`field:'project_id'`).
10. **La lectura no muta**: `_obligaciones` **no** crea el store si no existe; solo lee
    (`this._perfiles.get(pid)`). `perfilDe(pid, ejercicio)` es lectura directa para otras
    hojas.
11. **Fire-and-forget al declarar**: `onDeclararRequest` publica
    `contabilidad.perfil_fiscal_declarado` **solo si `_declarar` devuelve `200`**; si no,
    el par `perfil-administrativo.declarar.failed`.
12. **Persistencia**: `PosPersistencia` con `marcarDirty(pid)` en cada escritura;
    `project.activated` → `restaurar(project_id)` (reconstruye `por_ejercicio` desde
    `perfiles`); `onUnload` → `flush()` + `detener()`.
13. **HTTP exacto**: éxito `200`; rol inválido → `403`; `project_id`/`ejercicio`
    ausentes → `400`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `perfil-administrativo.obligaciones.response` y
`perfil-administrativo.declarar.response`; emite `contabilidad.perfil_fiscal_declarado`.

### 1. `declarar` — el declarante fiscal fija territorio/régimen/obligaciones

```json
{
  "project_id": "e57a318a-...",
  "rol": "DECLARANTE_PERFIL_FISCAL",
  "ejercicio": "2026",
  "territorio": "comun",
  "regimen": { "indirecto": "IVA", "renta": "IS" },
  "administraciones": [ { "nombre": "AEAT", "territorio": "comun" } ],
  "obligaciones": [
    { "modelo": "303", "cadencia": "trimestral" },
    { "modelo": "390", "cadencia": "anual" }
  ],
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "ejercicio": "2026",
  "declarado": true,
  "territorio_declarado": true,
  "regimen_declarado": true,
  "perfil": {
    "territorio": "comun",
    "regimen": { "indirecto": "IVA", "renta": "IS" },
    "administraciones": [ { "nombre": "AEAT", "territorio": "comun" } ],
    "obligaciones": [ { "modelo": "303", "cadencia": "trimestral" }, { "modelo": "390", "cadencia": "anual" } ],
    "declarado_por": "DECLARANTE_PERFIL_FISCAL",
    "declarado_en": "2026-09-25T...",
    "vigente_desde": "2026-09-25T..."
  }
}
```

Emite `contabilidad.perfil_fiscal_declarado`:

```json
{ "project_id": "e57a318a-...", "ejercicio": "2026", "territorio": "comun", "regimen": { "indirecto": "IVA", "renta": "IS" }, "obligaciones": [ { "...": "..." } ], "correlation_id": "abc-123" }
```

### 2. `obligaciones` — leer lo declarado (no muta)

```json
{ "project_id": "e57a318a-...", "ejercicio": "2026" }
```

Respuesta `200` (con perfil):
```json
{ "project_id": "e57a318a-...", "ejercicio": "2026", "declarado": true, "territorio": "comun", "regimen": { "indirecto": "IVA", "renta": "IS" }, "administraciones": [ { "..." : "..." } ], "obligaciones": [ { "..." : "..." } ], "declarado_en": "2026-09-25T..." }
```

Sin perfil → `200` con `declarado:false`, `territorio:null`, `regimen:null`,
`administraciones:null`, `obligaciones:null` y el `motivo` (**no se asume**).

### 3. Fallo — rol inválido (segundo escritor)

```json
{ "project_id": "e57a318a-...", "rol": "OTRO", "ejercicio": "2026" }
```

Respuesta `403` + `perfil-administrativo.declarar.failed`:

```json
{ "status": 403, "error": { "code": "PERMISSION_DENIED", "message": "solo el declarante fiscal (DECLARANTE_PERFIL_FISCAL) declara el perfil administrativo", "details": { "rol_esperado": "DECLARANTE_PERFIL_FISCAL", "rol_recibido": "OTRO" } } }
```

### 4. Fallo — falta el ejercicio

Respuesta `400 INVALID_INPUT` con `{field:'ejercicio'}` (**el ejercicio es DATO
obligatorio: sin él no se sabe la anualidad**).

## Tests

El test unitario de la vertical vive en `tests/unit/perfil-administrativo.test.js`. Cubre:

- `declarar` con rol `DECLARANTE_PERFIL_FISCAL` → `200 declarado:true` con
  `territorio_declarado`/`regimen_declarado` y emite `contabilidad.perfil_fiscal_declarado`.
- `declarar` con otro rol → `403 PERMISSION_DENIED` + `perfil-administrativo.declarar.failed`.
- `declarar` sin `ejercicio` → `400 INVALID_INPUT`.
- Re-declarar el mismo ejercicio → **APPENDEA** al historial (nada se sobrescribe) y
  conserva `vigente_desde`.
- `obligaciones` sin perfil declarado → `declarado:false`, `territorio:null`,
  `regimen:null`, motivo (**no se asume**).
- `obligaciones` sin `project_id` → `400 INVALID_INPUT` + `perfil-administrativo.obligaciones.failed`.
- `territorio`/`regimen` ausentes → quedan `null` en el perfil (sin default).
- `project.activated` restaura el perfil via PosPersistencia; `perfilDe(pid, ejercicio)`
  lee sin mutar.
- `toolObligaciones` / `toolDeclarar` devuelven la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `PerfilAdministrativo extends ModuloHibridoReflejo`; `name =
  'perfil-administrativo'`, `version = 'reflejo-0.1.0'`. Store en memoria
  `this._perfiles` (`Map<project_id, {esquema, por_ejercicio: Map<ejercicio, Perfil>,
  historial: []}>`). Constante `ROL_ESCRITOR = 'DECLARANTE_PERFIL_FISCAL'`.
- **PosPersistencia**: `_persist = new PosPersistencia({ modulo, file:
  'perfil-administrativo.json', dir: '/contabilidad/perfil-administrativo', snapshot,
  hidratar })` sobre `../../_shared/pos-persistencia` (DOS niveles). `onProjectActivated`
  → `restaurar(project_id)`; `onUnload` → `flush()` + `detener()`. Cada escritura marca
  `marcarDirty(pid)`.
- `onObligacionesRequest` → `_atender(e, 'obligaciones',
  'perfil-administrativo.obligaciones.response', ...)`; `onDeclararRequest` → `_atender(e,
  'declarar', 'perfil-administrativo.declarar.response', ...)` y dentro hace el cierre de
  círculo (evento de dominio en `200`, par `failed` si no).
- Proyecciones `_obligaciones` (lectura, no muta) y `_declarar` (escritura + guard);
  helpers `_texto`, `_regimen`, `_listaObjs`, `_obtenerOCrear`; lectura directa
  `perfilDe(pid, ejercicio)`. Tools `toolObligaciones` / `toolDeclarar`.
- `_invalid` / `_errorResponse` vienen de `modulo-hibrido-reflejo`.
- **DEP**: es **LA FUENTE** de los parámetros territoriales/régimen de la capa fiscal; lo
  LEEN `calendario-fiscal` (D6) y las demás hojas fiscales vía
  `contabilidad.perfil_fiscal_declarado` (o `perfil-administrativo.obligaciones.request`).
- **LA LEY COMO DATO**: territorio, régimen, administraciones y obligaciones son
  **declarables por negocio y ejercicio**; el código guarda cadenas **sin enumerar
  valores posibles** y **sin asumir ninguno por defecto**. El sistema **GUARDA**; el
  **asesor declara**.
