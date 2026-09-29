---
name: calendario-fiscal
description: >
  Skill FULL del módulo CUSTODIO `calendario-fiscal` de la vertical contabilidad de
  Enki. Parcela de PLAZOS declarables por ejercicio — qué obligación vence cuándo, con
  una ventana de aviso también declarable; el sistema AVISA del vencimiento y NUNCA
  cablea fechas ni plazos. Un solo escritor y sin sobrescritura; persiste por proyecto
  con PosPersistencia. Úsala para operar, depurar o extender el custodio, o para
  entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites los próximos vencimientos de un ejercicio (RPC
    calendario-fiscal.proximos.request) o declarar los plazos del ejercicio (RPC
    calendario-fiscal.declarar.request).
  - Cuando depures por qué una declaración se rechaza (403 PERMISSION_DENIED si el rol no
    es DECLARANTE_PLAZOS_FISCALES, 400 INVALID_INPUT si falta project_id o ejercicio), o
    por qué no se dispara aviso proactivo (`ventana_dias` sin declarar).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    invariantes del custodio (un solo escritor, la ley entra como dato, no se inventan
    fechas, append-only, persistencia por proyecto).
  - Cuando vayas a escribir/ampliar el test unitario del custodio calendario-fiscal.
tags: [enki, modulo, custodio, contabilidad, calendario-fiscal]
---

# calendario-fiscal — CUSTODIO CON PERSISTENCIA de los plazos declarables

## Qué hace el módulo

`calendario-fiscal` es un **CUSTODIO CON PERSISTENCIA** (D6, hoja del plan): la parcela
de **PLAZOS DECLARABLES por ejercicio** — **qué obligación vence cuándo**. Desde aquí se
dispara el **AVISO PROACTIVO de vencimiento** (lo consume `motor-avisos`). **NO presenta
nada: el sistema AVISA; el ASESOR presenta y firma.**

**LA LEY ENTRA COMO DATO** (invariante 5): el módulo **NO cablea NINGUNA fecha, NINGÚN
plazo, NINGUNA periodicidad ni NINGÚN festivo** — los plazos son `ParametroDeclarable`
(los declara el negocio/asesor, por ejercicio) porque **CAMBIAN** (prórrogas, festivos,
domiciliación). Tampoco se cablea la **VENTANA de aviso** (`ventana_dias`): es
declarable; **sin ventana declarada NO se dispara aviso proactivo** (no se inventa un
umbral).

Invariantes:

- **Invariante 7 — dato ausente = desconocido**: sin plazos declarados para un ejercicio,
  `proximos` devuelve lista vacía con `declarado:false` y el `motivo` — **NUNCA una lista
  de fechas de memoria**.
- **Invariante 3 — nada se sobrescribe en silencio**: re-declarar **APPENDEA** al
  historial (plazo vigente + fecha + autor).
- **UN SOLO ESCRITOR**: el declarante de plazos (rol `DECLARANTE_PLAZOS_FISCALES`: dueño o
  asesor); cualquier otro rol es rechazado (`403`) y **no espera ni hace cola**.
- **El ejercicio es DATO obligatorio**.
- El cálculo de días hasta el vencimiento es **puro sobre datos DECLARADOS** (fecha de
  referencia `hoy` + fecha del plazo); **no hay tabla legal**.

Persiste por proyecto con **PosPersistencia** (storage
`/contabilidad/calendario-fiscal/calendario-fiscal.json`), restaura en `project.activated`
y vuelca en `onUnload`. Proyecciones `_proximos` (lectura, no muta) y `_declarar`
(escritura, guard). Publica `contabilidad.vencimiento_fiscal` por cada vencimiento dentro
de la ventana declarada.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `calendario-fiscal.proximos.request` | `onProximosRequest` | RPC custodio (lectura, NO muta): {project_id, ejercicio, hoy} → {declarado, ventana_dias, total, proximos:[{...plazo declarado, fecha}], dentro_de_ventana, aviso_proactivo, motivo?}. Devuelve los plazos DECLARADOS ordenados por fecha; sin plazos declarados → declarado:false con lista vacia y motivo (invariante 7: no se inventan fechas). La ventana de aviso es DATO declarable; si hay vencimientos dentro de la ventana declarada, publica contabilidad.vencimiento_fiscal por cada uno (aviso proactivo). Responde por calendario-fiscal.proximos.response; fallo (project_id ausente) → calendario-fiscal.proximos.failed. |
| `calendario-fiscal.declarar.request` | `onDeclararRequest` | RPC custodio (escritura, UN escritor): {project_id, rol:'DECLARANTE_PLAZOS_FISCALES', ejercicio, plazos:[{fecha, ...}], ventana_dias?} → {ejercicio, calendario, declarado, total_plazos, ventana_declarada}. Declara los plazos como DATO (se guardan tal cual, sin tabla legal) y la ventana de aviso como DATO (sin declarar → null). Guard Rol=DECLARANTE_PLAZOS_FISCALES (segundo escritor → 403). Re-declarar APPENDEA al historial (no se sobrescribe). Responde por calendario-fiscal.declarar.response; fallo → calendario-fiscal.declarar.failed. |
| `project.activated` | `onProjectActivated` | Restaura el calendario fiscal del proyecto activado desde el storage (PosPersistencia). |

### Publishes

| Evento | Descripción |
|---|---|
| `calendario-fiscal.proximos.response` | Respuesta RPC correlada de calendario-fiscal.proximos.request → {request_id, status:200, data:{declarado, ventana_dias, total, proximos, dentro_de_ventana, aviso_proactivo}}. Emitida por el helper _atender. |
| `calendario-fiscal.proximos.failed` | Par de fallo determinista (D6): project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de calendario-fiscal.proximos.request. |
| `calendario-fiscal.declarar.response` | Respuesta RPC correlada de calendario-fiscal.declarar.request → {request_id, status:200, data:{ejercicio, calendario, declarado, total_plazos, ventana_declarada}}. Emitida por el helper _atender. |
| `calendario-fiscal.declarar.failed` | Par de fallo determinista (D6): rol != DECLARANTE_PLAZOS_FISCALES (segundo escritor), project_id o ejercicio ausente → {status, error:{code, message, details?}}. Cierra el circulo de calendario-fiscal.declarar.request. |
| `contabilidad.vencimiento_fiscal` | Fire-and-forget (D6): un vencimiento fiscal declarado cae dentro de la ventana de aviso declarada → {project_id, ejercicio, vencimiento, hoy, correlation_id}. Lo consume motor-avisos (que produce el aviso al negocio/asesor). El sistema AVISA; no presenta. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `calendario-fiscal.proximos.failed` cierra el círculo de
> `calendario-fiscal.proximos.request` y `calendario-fiscal.declarar.failed` cierra el de
> `calendario-fiscal.declarar.request`, cada uno cuando su proyección devuelve status ≠ 200.

> Nota de honestidad (cruce con `index.js`): `onProximosRequest` publica
> `contabilidad.vencimiento_fiscal` **una vez por cada elemento de `dentro_de_ventana`**
> cuando `_proximos` devuelve `200`; si `ventana_dias` está sin declarar, la lista va
> vacía y **no se publica ningún aviso** (**no se inventa un umbral**).

> Nota: el módulo expone `plazosDe(pid, ejercicio)` como **lectura directa** para otras
> hojas del mismo proceso (no muta) — no es un evento del bus, no figura en `module.json`.

## Reglas de negocio

1. **Un solo escritor (guard de rol)**: `_declarar` exige
   `input.rol === 'DECLARANTE_PLAZOS_FISCALES'` (constante `ROL_ESCRITOR`). Cualquier otro
   rol → `403 PERMISSION_DENIED` con `{rol_esperado:'DECLARANTE_PLAZOS_FISCALES',
   rol_recibido:<rol>}`. Second-writer rechazado; **no espera ni hace cola**.
2. **El ejercicio es DATO obligatorio**: `input.ejercicio` ausente/vacío →
   `400 INVALID_INPUT` (`field:'ejercicio'`); se normaliza con `String(...).trim()`.
3. **Los plazos se guardan TAL CUAL, sin tabla legal**: `plazos` es un array de objetos
   con `fecha` no nula; **cada objeto se copia con sus propias claves** (`modelo`, `fecha`,
   `nota`, …) y `fecha` se normaliza a String. **NO se valida contra ninguna tabla legal:
   no existe.**
4. **La ventana de aviso es DATO declarable**: `ventana_dias = Number(input.ventana_dias)`
   si es finito, si no `null`. **Sin ventana declarada no se dispara aviso proactivo.**
5. **Sin plazos declarados NO se inventan fechas (invariante 7)**: `_proximos` sin
   calendario para el ejercicio → `200` con `declarado:false`, `ventana_dias:null`,
   `total:0`, `proximos:[]`, `dentro_de_ventana:[]` y
   `motivo:'no hay plazos declarados para este ejercicio (la ley entra como dato, no se cablea)'`.
6. **Lectura honesta cuando hay plazos**: `declarado:true` con `ventana_dias`,
   `total` (número de plazos) y `proximos` **ordenados de forma determinista por fecha**
   (`localeCompare` sobre el texto de la fecha declarada); el resto de campos se copian
   tal cual.
7. **El aviso proactivo se declara, no se asume**: `aviso_proactivo = ventana_dias !== null`;
   sin ventana → `motivo:'sin ventana_dias declarada no se dispara aviso proactivo'`.
8. **Dentro de ventana es cálculo puro sobre datos declarados**: `_diasHasta(hoy, fecha)`
   usa `Date.parse(\`${hoy}T00:00:00Z\`)` y `Date.parse(\`${fecha}T00:00:00Z\`)` y devuelve
   el número de días redondeado; `dentro_de_ventana` filtra los plazos con
   `0 <= dias <= ventana`. **No hay tabla de festivos ni plazos legales.**
9. **Nada se sobrescribe (invariante 3)**: re-declarar el mismo ejercicio **APPENDEA** al
   `historial` (`{ejercicio, plazos:<n>, ventana_dias, por, en}`) y actualiza el valor
   vigente con su fecha; el calendario conserva `vigente_desde` (la fecha anterior, o
   ahora) y sella `declarado_en` con `new Date().toISOString()`.
10. **La respuesta declara qué se declaró**: `total_plazos` (número) y
    `ventana_declarada: ventana_dias !== null` — **si no vino, no se finge**.
11. **Fallo determinista**: `_proximos` y `_declarar` toman `input.project_id ||
    this.project_id`; ausente → `400 INVALID_INPUT` (`field:'project_id'`).
12. **La lectura no muta**: `_proximos` **no** crea el store si no existe; solo lee.
    `plazosDe(pid, ejercicio)` es lectura directa para otras hojas.
13. **Fire-and-forget al declarar**: `onDeclararRequest` publica **solo** el par
    `calendario-fiscal.declarar.failed` si `_declarar` devuelve ≠ 200; en éxito **no**
    publica evento de dominio (el aviso de vencimiento sale por la lectura `proximos`).
14. **Persistencia**: `PosPersistencia` con `marcarDirty(pid)` en cada escritura;
    `project.activated` → `restaurar(project_id)` (reconstruye `por_ejercicio` desde
    `calendarios`); `onUnload` → `flush()` + `detener()`.
15. **HTTP exacto**: éxito `200`; rol inválido → `403`; `project_id`/`ejercicio`
    ausentes → `400`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `calendario-fiscal.proximos.response` y
`calendario-fiscal.declarar.response`; emite `contabilidad.vencimiento_fiscal`.

### 1. `declarar` — el declarante fija los plazos del ejercicio

```json
{
  "project_id": "e57a318a-...",
  "rol": "DECLARANTE_PLAZOS_FISCALES",
  "ejercicio": "2026",
  "plazos": [
    { "modelo": "303", "fecha": "2026-10-20", "periodo": "3T" },
    { "modelo": "303", "fecha": "2027-01-20", "periodo": "4T" },
    { "modelo": "390", "fecha": "2027-01-30" }
  ],
  "ventana_dias": 15,
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "ejercicio": "2026",
  "declarado": true,
  "total_plazos": 3,
  "ventana_declarada": true,
  "calendario": {
    "plazos": [
      { "modelo": "303", "fecha": "2026-10-20", "periodo": "3T" },
      { "modelo": "303", "fecha": "2027-01-20", "periodo": "4T" },
      { "modelo": "390", "fecha": "2027-01-30" }
    ],
    "ventana_dias": 15,
    "declarado_por": "DECLARANTE_PLAZOS_FISCALES",
    "declarado_en": "2026-09-25T...",
    "vigente_desde": "2026-09-25T..."
  }
}
```

Sin `ventana_dias` → `ventana_dias:null`, `ventana_declarada:false` (**no se inventa
umbral**).

### 2. `proximos` — qué vence y cuándo (no muta)

```json
{ "project_id": "e57a318a-...", "ejercicio": "2026", "hoy": "2026-10-10" }
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "ejercicio": "2026",
  "hoy": "2026-10-10",
  "declarado": true,
  "ventana_dias": 15,
  "total": 3,
  "proximos": [
    { "modelo": "303", "fecha": "2026-10-20", "periodo": "3T" },
    { "modelo": "303", "fecha": "2027-01-20", "periodo": "4T" },
    { "modelo": "390", "fecha": "2027-01-30" }
  ],
  "dentro_de_ventana": [ { "modelo": "303", "fecha": "2026-10-20", "periodo": "3T" } ],
  "aviso_proactivo": true,
  "motivo": null
}
```

Emite `contabilidad.vencimiento_fiscal` **una vez por cada vencimiento dentro de la
ventana** (lo consume `motor-avisos`):

```json
{ "project_id": "e57a318a-...", "ejercicio": "2026", "vencimiento": { "modelo": "303", "fecha": "2026-10-20", "periodo": "3T" }, "hoy": "2026-10-10", "correlation_id": "abc-123" }
```

Sin plazos declarados → `200` con `declarado:false`, `total:0`, `proximos:[]` y el
`motivo` (**no se inventan fechas de memoria**). Sin `ventana_dias` → `aviso_proactivo:false`
y `dentro_de_ventana:[]`.

### 3. Fallo — rol inválido (segundo escritor)

```json
{ "project_id": "e57a318a-...", "rol": "OTRO", "ejercicio": "2026", "plazos": [] }
```

Respuesta `403` + `calendario-fiscal.declarar.failed`:

```json
{ "status": 403, "error": { "code": "PERMISSION_DENIED", "message": "solo el declarante de plazos (DECLARANTE_PLAZOS_FISCALES) declara el calendario fiscal", "details": { "rol_esperado": "DECLARANTE_PLAZOS_FISCALES", "rol_recibido": "OTRO" } } }
```

### 4. Fallo — falta el ejercicio

Respuesta `400 INVALID_INPUT` con `{field:'ejercicio'}` (**el ejercicio es DATO
obligatorio: los plazos son por anualidad**).

## Tests

El test unitario de la vertical vive en `tests/unit/calendario-fiscal.test.js`. Cubre:

- `declarar` con rol `DECLARANTE_PLAZOS_FISCALES` → `200 declarado:true`, `total_plazos` y
  `ventana_declarada`.
- `declarar` con otro rol → `403 PERMISSION_DENIED` + `calendario-fiscal.declarar.failed`.
- `declarar` sin `ejercicio` → `400 INVALID_INPUT`.
- Re-declarar el mismo ejercicio → **APPENDEA** al historial (nada se sobrescribe).
- `proximos` con ventana declarada → `dentro_de_ventana` con los vencimientos en rango y
  emite `contabilidad.vencimiento_fiscal` **por cada uno**.
- `proximos` sin plazos declarados → `declarado:false`, `proximos:[]`, motivo
  (**no se inventan fechas**).
- `proximos` sin `ventana_dias` → `aviso_proactivo:false`, `dentro_de_ventana:[]` y no se
  emite ningún aviso (**no se inventa umbral**).
- `proximos` sin `project_id` → `400 INVALID_INPUT` + `calendario-fiscal.proximos.failed`.
- `project.activated` restaura el calendario via PosPersistencia; `plazosDe(pid, ejercicio)`
  lee sin mutar.
- `toolProximos` / `toolDeclarar` devuelven la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `CalendarioFiscal extends ModuloHibridoReflejo`; `name = 'calendario-fiscal'`,
  `version = 'reflejo-0.1.0'`. Store en memoria `this._calendarios`
  (`Map<project_id, {esquema, por_ejercicio: Map<ejercicio, {plazos, ventana_dias, ...}>,
  historial: []}>`). Constante `ROL_ESCRITOR = 'DECLARANTE_PLAZOS_FISCALES'`.
- **PosPersistencia**: `_persist = new PosPersistencia({ modulo, file:
  'calendario-fiscal.json', dir: '/contabilidad/calendario-fiscal', snapshot, hidratar })`
  sobre `../../_shared/pos-persistencia` (DOS niveles). `onProjectActivated` →
  `restaurar(project_id)`; `onUnload` → `flush()` + `detener()`. Cada escritura marca
  `marcarDirty(pid)`.
- `onProximosRequest` → `_atender(e, 'proximos', 'calendario-fiscal.proximos.response',
  async (d) => {...})` y dentro, en `200`, publica `contabilidad.vencimiento_fiscal` por
  cada vencimiento de `dentro_de_ventana`; si no, el par `failed`. `onDeclararRequest` →
  `_atender(e, 'declarar', 'calendario-fiscal.declarar.response', ...)` y solo publica el
  par `failed` si status ≠ 200.
- Proyecciones `_proximos` (lectura, no muta) y `_declarar` (escritura + guard); helpers
  `_diasHasta`, `_cf` (comparación determinista por fecha declarada), `_obtenerOCrear`;
  lectura directa `plazosDe(pid, ejercicio)`. Tools `toolProximos` / `toolDeclarar`.
- `_invalid` / `_errorResponse` vienen de `modulo-hibrido-reflejo`.
- **DEP**: **LEE** territorio/régimen/obligaciones de `perfil-administrativo` (D15) para
  saber qué obligaciones tienen plazo; lo consume `motor-avisos` vía
  `contabilidad.vencimiento_fiscal`.
- **LA LEY COMO DATO**: los plazos, la periodicidad y la ventana de aviso son
  **declarables por negocio y ejercicio** (porque cambian: prórrogas, festivos,
  domiciliación); el módulo **NO** cablea fechas ni tabla legal. El sistema **AVISA**;
  **el asesor presenta y firma**.
