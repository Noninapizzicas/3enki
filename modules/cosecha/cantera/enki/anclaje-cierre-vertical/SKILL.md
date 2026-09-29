---
name: anclaje-cierre-vertical
description: >
  Skill FULL del módulo CUSTODIO `anclaje-cierre-vertical` de la vertical
  contabilidad de Enki. Ancla el cierre de cada vertical — el día cierra la caja
  (proyecto, jornada) y el mes cierra la contabilidad (proyecto, ejercicio, mes);
  un solo escritor (DECLARANTE_ANCLAJE) y la unidad de cierre se declara, no se
  estima. Persiste por proyecto con PosPersistencia. Úsala para operar, depurar o
  extender el custodio, o para entender su contrato de eventos y sus reglas de
  negocio.
when-to-use: >
  - Cuando necesites anclar (leer) el cierre de una vertical
    (RPC anclaje-cierre-vertical.anclar.request) o declarar su unidad de cierre
    (RPC anclaje-cierre-vertical.declarar.request).
  - Cuando depures por qué un cierre sale `anclado:false` o por qué la clave sale
    `clave:null, clave_disponible:false` (400 INVALID_INPUT si falta
    project_id/vertical/unidad_de_cierre/campos_clave, 403 PERMISSION_DENIED si el
    rol no es DECLARANTE_ANCLAJE).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    reglas de negocio (la unidad se declara, append-only, clave derivada, un solo
    escritor, persistencia por proyecto).
  - Cuando vayas a escribir/ampliar el test unitario del custodio
    anclaje-cierre-vertical.
tags: [enki, modulo, custodio, contabilidad, anclaje-cierre-vertical]
---

# anclaje-cierre-vertical — CUSTODIO CON PERSISTENCIA del anclaje de cierre

## Qué hace el módulo

`anclaje-cierre-vertical` es un **CUSTODIO CON PERSISTENCIA** (A14, hoja del plan):
**la parcela declarable por vertical** de **QUÉ es "un cierre"** y **CÓMO se
identifica**. Su puerto es construible; su **CONTENIDO** pende de `unidad_de_cierre`
(dato del **DUEÑO**, vía `cola-declaraciones-criterio` K9). Un cierre se **ANCLA** a
su clave:

- `(proyecto, jornada)` → el **DÍA** cierra la **CAJA**.
- `(proyecto, ejercicio, mes)` → el **MES** cierra la **CONTABILIDAD**.

**Invariante 7/13 — la unidad de cierre se DECLARA, no se estima**: sin definición
declarada para una vertical, `anclar` devuelve `anclado:false` — el puerto existe,
pero no se inventa la clave de un cierre que el dueño no definió; sin periodo no se
compone una clave fabricada (`clave:null`, `clave_disponible:false`).

**UN SOLO ESCRITOR** de la parcela: el declarante (rol `DECLARANTE_ANCLAJE`);
cualquier otro rol es rechazado (segundo escritor → `403`). **No se sobrescribe**:
re-declarar APPENDEA versión nueva (historial) y fecha la vigente.

Persiste por proyecto con **PosPersistencia** (storage
`/contabilidad/anclaje-cierre-vertical/anclaje-cierre-vertical.json`), restaura en
`project.activated` y vuelca en `onUnload`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `anclaje-cierre-vertical.anclar.request` | `onAnclarRequest` | RPC custodio (lectura, NO muta): {project_id, vertical, periodo?} → {anclado:true, anclaje:{unidad_de_cierre, campos_clave, version, declarado_por, declarado_en}, clave, clave_disponible} o {anclado:false, motivo} si la vertical no declaro su unidad de cierre. La clave se deriva: (proyecto, jornada) para caja, (proyecto, ejercicio, mes) para contabilidad. Responde por anclaje-cierre-vertical.anclar.response; project_id o vertical ausente → anclaje-cierre-vertical.anclar.failed. |
| `anclaje-cierre-vertical.declarar.request` | `onDeclararRequest` | RPC custodio (escritura, UN escritor): {project_id, rol:'DECLARANTE_ANCLAJE', vertical, unidad_de_cierre, campos_clave?} → {anclaje:{vertical, unidad_de_cierre, campos_clave, version, declarado_por, declarado_en}, anclado, sobrescritura}. Guard Rol=DECLARANTE_ANCLAJE (segundo escritor → 403). Append-only: re-declarar apila version nueva en el historial. Exito → publica contabilidad.cierre_anclado y responde por anclaje-cierre-vertical.declarar.response; invalido → anclaje-cierre-vertical.declarar.failed. |
| `project.activated` | `onProjectActivated` | Restaura los anclajes de cierre del proyecto activado desde el storage (PosPersistencia). |

### Publishes

| Evento | Descripción |
|---|---|
| `anclaje-cierre-vertical.anclar.response` | Respuesta RPC correlada de anclaje-cierre-vertical.anclar.request → {request_id, status:200, data:{anclado, anclaje, clave, clave_disponible} \| {anclado:false, motivo}}. Emitida por el helper _atender. |
| `anclaje-cierre-vertical.anclar.failed` | Par de fallo determinista (A14): project_id o vertical ausente → {status, error:{code, message, details?}}. Cierra el circulo de anclaje-cierre-vertical.anclar.request. |
| `anclaje-cierre-vertical.declarar.response` | Respuesta RPC correlada de anclaje-cierre-vertical.declarar.request → {request_id, status:200, data:{anclaje, anclado, sobrescritura}}. Emitida por el helper _atender. |
| `anclaje-cierre-vertical.declarar.failed` | Par de fallo determinista (A14): rol != DECLARANTE_ANCLAJE (segundo escritor), vertical/unidad_de_cierre/campos_clave ausentes → {status, error:{code, message, details?}}. Cierra el circulo de anclaje-cierre-vertical.declarar.request. |
| `contabilidad.cierre_anclado` | Fire-and-forget (A14): el cierre de una vertical quedo anclado a su unidad declarada → {project_id, anclaje, vertical, unidad_de_cierre, correlation_id}. Lo LEEN los cerrojos de cierre (C4 cierre-ejercicio, tesoreria) y el bucle de declaracion (K9). |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `anclaje-cierre-vertical.anclar.failed` cierra `anclar.request` y
> `anclaje-cierre-vertical.declarar.failed` cierra `declarar.request`, cada uno
> cuando su proyección devuelve status ≠ 200.

> Nota de honestidad (cruce con `index.js`): el caso **sin unidad declarada**
> devuelve `200 {anclado:false, motivo}` — **no** publica el evento de dominio ni el
> par de fallo (el handler solo publica `contabilidad.cierre_anclado` si status 200
> de `_declarar`, y `declarar.failed` si no). `anclar` es lectura: nunca publica
> `contabilidad.cierre_anclado`.

> Nota: el módulo expone `anclajeDe(pid, vertical)` como **lectura directa** para
> otras hojas del mismo proceso (no muta) — no es un evento del bus, no figura en
> `module.json`.

## Reglas de negocio

1. **La unidad de cierre se DECLARA**: una definición es
   `{unidad_de_cierre, campos_clave}`, declarada, no cableada. Sin definición para
   la vertical → `_anclar` devuelve `200 {anclado:false, anclaje:null,
   motivo:'la vertical no ha declarado su unidad de cierre (dato del dueno, pendiente)'}`.
2. **Un solo escritor (guard de rol)**: `_declarar` exige
   `input.rol === 'DECLARANTE_ANCLAJE'` (constante `ROL_ESCRITOR`). Cualquier otro
   rol → `403 PERMISSION_DENIED` con
   `{rol_esperado:'DECLARANTE_ANCLAJE', rol_recibido:<rol>}`. `_anclar` no pasa por
   el guard (es lectura).
3. **Unidades conocidas y su clave**: `CLAVES_POR_UNIDAD = { JORNADA:['jornada'],
   MES:['ejercicio','mes'] }`. Si `unidad_de_cierre` (normalizada a MAYÚSCULAS) está
   en el mapa, `campos_clave` se toma de ahí (aunque llegue otro `campos_clave`); si
   es una unidad desconocida, se usan los `campos_clave` declarados en el input.
4. **Clave derivada, nunca fabricada**: `_claveDe(pid, def, periodo)`:
   - `JORNADA` → `` `${pid}|${jornada}` `` si `periodo.jornada` presente, si no `null`.
   - `MES` → `` `${pid}|${ejercicio}|${mes}` `` si ambos presentes, si no `null`.
   - unidad desconocida → `` [pid, ...campos].join('|') `` si todos los
     `campos_clave` llegan, si no `null`.
   `clave_disponible = clave != null`.
5. **Append-only, versionado**: `_declarar` calcula `version = previo ?
   previo.version + 1 : 1`, apila `{unidad_de_cierre, campos_clave, version, por, en}`
   en `historial` y fecha `declarado_en`/`actualizado_en`. `sobrescritura` es `true`
   si ya existía anclaje para esa vertical.
6. **Unidad normalizada**: `unidad_de_cierre` se normaliza a
   `String(...).toUpperCase().trim()`; vacía → `400 INVALID_INPUT`
   (`field:'unidad_de_cierre'`).
7. **Clave del store**: `Map<vertical, DefinicionCierre>` por proyecto; la vertical
   se normaliza con `String(vertical).trim()`.
8. **La lectura no muta**: `_anclar` obtiene o crea la parcela (`_obtenerOCrear`) y
   devuelve la definición vigente sin tocarla.
9. **`project_id` con fallback**: `input.project_id || this.project_id`.
10. **Validaciones deterministas**: `project_id` ausente → `400 INVALID_INPUT`
    (`field:'project_id'`); `vertical` vacía → `400 INVALID_INPUT`
    (`field:'vertical'`); `campos_clave` no derivables ni declarados → `400
    INVALID_INPUT` (`field:'campos_clave'`).
11. **Persistencia**: `PosPersistencia` con `marcarDirty(pid)` en cada escritura;
    restaura en `project.activated`; `flush()` + `detener()` en `onUnload`.
12. **HTTP exacto**: éxito `200`; rol inválido → `403`; campos inválidos → `400`;
    excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `anclaje-cierre-vertical.anclar.response` y
`anclaje-cierre-vertical.declarar.response`.

### 1. `declarar` — declarar qué es un cierre (solo DECLARANTE_ANCLAJE)

```json
{
  "project_id": "e57a318a-...",
  "rol": "DECLARANTE_ANCLAJE",
  "vertical": "pizzepos",
  "unidad_de_cierre": "JORNADA",
  "correlation_id": "abc-123"
}
```
Respuesta `200` (campos_clave derivados del mapa `JORNADA → ['jornada']`):
```json
{
  "project_id": "e57a318a-...",
  "anclaje": { "vertical": "pizzepos", "unidad_de_cierre": "JORNADA", "campos_clave": ["jornada"], "version": 1, "declarado_por": "DECLARANTE_ANCLAJE", "declarado_en": "2026-09-25T..." },
  "anclado": true,
  "sobrescritura": false
}
```
Emite `contabilidad.cierre_anclado`:
```json
{ "project_id": "e57a318a-...", "anclaje": { "...": "..." }, "vertical": "pizzepos", "unidad_de_cierre": "JORNADA", "correlation_id": "abc-123" }
```

### 2. `anclar` — derivar la clave del cierre (no muta)

Sin periodo (el puerto existe, la clave aún no):
```json
{ "project_id": "e57a318a-...", "vertical": "pizzepos" }
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "vertical": "pizzepos",
  "anclado": true,
  "anclaje": { "vertical": "pizzepos", "unidad_de_cierre": "JORNADA", "campos_clave": ["jornada"], "version": 1, "declarado_por": "DECLARANTE_ANCLAJE", "declarado_en": "2026-09-25T..." },
  "clave": null,
  "clave_disponible": false
}
```
Con periodo:
```json
{ "project_id": "e57a318a-...", "vertical": "pizzepos", "periodo": { "jornada": "2026-09-25" } }
```
Respuesta `200` con `clave:"e57a318a-...|2026-09-25"`, `clave_disponible:true`.
Para una vertical MES: `periodo:{ejercicio:2026, mes:9}` → `clave:"...|2026|9"`.

### 3. `anclar` sin unidad declarada

```json
{ "project_id": "e57a318a-...", "vertical": "otra-vertical" }
```
Respuesta `200` con `anclado:false`, `anclaje:null`, `motivo`.

### 4. Fallo — rol inválido (segundo escritor)

```json
{ "project_id": "e57a318a-...", "rol": "OTRO", "vertical": "pizzepos", "unidad_de_cierre": "JORNADA" }
```
Respuesta `403` + `anclaje-cierre-vertical.declarar.failed`:
```json
{ "status": 403, "error": { "code": "PERMISSION_DENIED", "message": "solo el declarante (DECLARANTE_ANCLAJE) puede anclar el cierre de una vertical", "details": { "rol_esperado": "DECLARANTE_ANCLAJE", "rol_recibido": "OTRO" } } }
```

### 5. Fallo — falta la unidad de cierre

```json
{ "project_id": "e57a318a-...", "rol": "DECLARANTE_ANCLAJE", "vertical": "pizzepos" }
```
Respuesta `400` + `anclaje-cierre-vertical.declarar.failed`:
```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "unidad_de_cierre requerido", "details": { "field": "unidad_de_cierre" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/anclaje-cierre-vertical.test.js`.
Cubre:

- `declarar` con rol `DECLARANTE_ANCLAJE` y `JORNADA` → `200 {anclado:true}` con
  `campos_clave:['jornada']` y emite `contabilidad.cierre_anclado`.
- `declarar` una unidad desconocida con `campos_clave` declarados → se respetan.
- Re-declarar → `version` incrementa, `sobrescritura:true`, historial append-only.
- `declarar` con otro rol → `403 PERMISSION_DENIED` +
  `anclaje-cierre-vertical.declarar.failed`.
- `declarar` sin `unidad_de_cierre`/`campos_clave` → `400 INVALID_INPUT`.
- `anclar` `JORNADA` con/sin `periodo.jornada` → clave compuesta / `clave:null`,
  `clave_disponible` acorde.
- `anclar` `MES` con `{ejercicio, mes}` → `clave:"pid|ejercicio|mes"`.
- `anclar` sin unidad declarada → `200 {anclado:false}`, sin emitir evento.
- `anclar` sin `project_id`/`vertical` → `400 INVALID_INPUT` +
  `anclaje-cierre-vertical.anclar.failed`.
- `project.activated` restaura los anclajes via PosPersistencia;
  `anclajeDe(pid, vertical)` lee sin mutar.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `AnclajeCierreVertical extends ModuloHibridoReflejo`; `name =
  'anclaje-cierre-vertical'`, `version = 'reflejo-0.1.0'`. Store en memoria
  `this._parcelas` (`Map<project_id, {esquema, anclajes: Map<vertical, DefinicionCierre>}>`).
- **PosPersistencia**: `_persist = new PosPersistencia({ modulo, file:
  'anclaje-cierre-vertical.json', dir: '/contabilidad/anclaje-cierre-vertical',
  snapshot, hidratar })` desde `modules/contabilidad-entrada/anclaje-cierre-vertical/`
  (DOS niveles → `../../_shared/pos-persistencia`). `onProjectActivated` →
  `restaurar(project_id)`; `onUnload` → `flush()` + `detener()`.
- `onAnclarRequest` delega en `_atender(e, 'anclar',
  'anclaje-cierre-vertical.anclar.response', async (d) => {...})` (cierre de círculo:
  `anclar.failed` si status ≠ 200); `onDeclararRequest` en `_atender(e, 'declarar',
  'anclaje-cierre-vertical.declarar.response', ...)` y publica
  `contabilidad.cierre_anclado` si status 200.
- Proyecciones `_anclar` (lectura, no muta) y `_declarar` (escritura + guard);
  helper `_claveDe(pid, def, periodo)`, `_obtenerOCrear(pid)`. Lectura directa
  `anclajeDe(pid, vertical)`. Tools `toolAnclar` / `toolDeclarar`.
- `_invalid` / `_errorResponse` vienen de `modulo-hibrido-reflejo`.
- DEP: el CONTENIDO (`unidad_de_cierre`) pende del DUEÑO vía
  `cola-declaraciones-criterio` (K9); lo LEEN los cerrojos de cierre (C4
  `cierre-ejercicio`, tesorería) vía `contabilidad.cierre_anclado`.
