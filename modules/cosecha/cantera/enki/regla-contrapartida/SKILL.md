---
name: regla-contrapartida
description: >
  Skill FULL del módulo CUSTODIO `regla-contrapartida` de la vertical contabilidad de
  Enki (A6.2, hoja del plan). Repositorio de reglas DECLARADAS y APRENDIDAS ("este
  proveedor → esta cuenta"). Es el CORTE DURO del dominio: una regla DECLARADA actúa de
  inmediato sobre el volumen; una regla APRENDIDA entra HIDRATADA y queda
  RATIFICACION_PENDIENTE — NO actúa hasta ser ratificada (L10). Un solo escritor
  DUENO/ASESOR (second-writer rechazado). Persiste por proyecto vía PosPersistencia.
  Úsala para operar, depurar o extender el custodio, o para entender su contrato de
  eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites leer el repositorio de reglas (RPC contabilidad.regla.leer.request),
    declarar una regla (contabilidad.regla.declarar.request) o aportar aprendizaje
    (contabilidad.regla.aprender.request).
  - Cuando depures por qué declarar/aprender se rechaza (PERMISSION_DENIED si el rol no
    es DUENO/ASESOR, INVALID_INPUT si falta patron), por qué una regla aprendida NO
    actúa (está RATIFICACION_PENDIENTE) o por qué la ratificación falla.
  - Cuando quieras entender el contrato de eventos y el corte duro
    DECLARADA/RATIFICADA actúa vs RATIFICACION_PENDIENTE no actúa.
  - Cuando vayas a escribir/ampliar el test unitario del custodio regla-contrapartida.
tags: [enki, modulo, custodio, persistencia, contabilidad, regla-contrapartida, contrapartida, aprendizaje]
---

# regla-contrapartida — CUSTODIO del repositorio de reglas de contrapartida

## Qué hace el módulo

`regla-contrapartida` es un **CUSTODIO CON PERSISTENCIA** (A6.2, hoja del plan): el dueño
del repositorio de reglas **"este proveedor → esta cuenta"**, por proyecto. Es el
**CORTE DURO del dominio contable**: cuando una regla está activa, decide la
contrapartida sin ambigüedad; si ninguna cubre, el hecho queda `SIN_COBERTURA` y va a
`cola-revision`.

La distinción capital es entre **DECLARADA** (la pone el humano DUENO/ASESOR; **actúa de
inmediato**) y **APRENDIDA** (la aporta el bucle de aprendizaje hidratada; queda
`RATIFICACION_PENDIENTE` y **NO actúa hasta ser ratificada** por L10). Así el sistema
**no decide solo**: aprende, pero la firma humana sigue siendo del asesor. El bucle de
aprendizaje cierra aquí: **excepción resuelta → regla candidata → ratificación → menos
excepciones**.

Un **solo escritor**: DUENO/ASESOR (guard en `_declarar` y `_aprender`). `_leer` y
`_aplicar` son **proyecciones PURAS** de lectura. La ratificación llega por el evento
fire-and-forget `contabilidad.regla_ratificada` (L10 → A6.2). Persiste por proyecto con
**PosPersistencia** (storage `/contabilidad/regla-contrapartida/*.json`), restaura en
`project.activated` y vuelca en `onUnload`.

> **NO REUTILIZA**: repositorio de reglas contables por negocio. `reglas-aprendidas`
> (nichos) son umbrales de viabilidad, otro dominio (patrón tomado, no reutilizado).

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.regla.leer.request` | `onLeerRequest` | RPC custodio: {project_id, estado?} → {project_id, reglas:[ReglaDeclarada]}. Proyeccion PURA de lectura (no muta). Si el payload es invalido → contabilidad.regla.leer.failed. Lo consume resolucion-contrapartida (A6.1) para conocer el corte duro. |
| `contabilidad.regla.declarar.request` | `onDeclararRequest` | RPC custodio: {project_id, rol:'DUENO'\|'ASESOR', regla:{patron, contrapartida}} → {project_id, regla}. Guard de escritor: solo DUENO/ASESOR (second-writer rechazado). La regla nace DECLARADA y actua de inmediato. Publica contabilidad.regla_declarada y responde por contabilidad.regla.declarar.response; si el rol o el payload son invalidos → contabilidad.regla.declarar.failed. |
| `contabilidad.regla.aprender.request` | `onAprenderRequest` | RPC custodio: {project_id, rol:'DUENO'\|'ASESOR', regla:{patron, contrapartida}, evidencia} → {project_id, regla, actua:false}. El aprendizaje entra HIDRATADO y queda RATIFICACION_PENDIENTE: NO actua hasta ser ratificado. Publica contabilidad.regla_aprendida y responde por contabilidad.regla.aprender.response; si el rol o el payload son invalidos → contabilidad.regla.aprender.failed. Lo alimenta desatasco-entrada (P3). |
| `contabilidad.regla_ratificada` | `onReglaRatificada` | Fire-and-forget (L10 → A6.2): {project_id, regla_id} ratifica una regla APRENDIDA, que pasa a RATIFICADA y ya actua sobre el volumen. Si la regla no existe → contabilidad.regla_aprendida.failed. Puerta UNICA de ratificacion compartida con regla-movimiento-bancario (E8). |
| `project.activated` | `onProjectActivated` | Restaura el repositorio de reglas del proyecto activado desde el storage (PosPersistencia): las reglas son POR PROYECTO. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.regla_declarada` | Fire-and-forget (A6.2): una regla quedo declarada y actua sobre el volumen → {project_id, regla}. Lo consume resolucion-contrapartida (A6.1) como corte duro. |
| `contabilidad.regla_aprendida` | Fire-and-forget (A6.2): una regla quedo APRENDIDA y PENDIENTE de ratificacion (actua:false) → {project_id, regla, actua:false}. Cierra el bucle de aprendizaje; lo consume la puerta de ratificacion (L10). |
| `contabilidad.regla.leer.failed` | Par de fallo determinista: leer con payload invalido. Cierra el circulo de contabilidad.regla.leer.request. |
| `contabilidad.regla.declarar.failed` | Par de fallo determinista: declarar rechazado (rol != DUENO/ASESOR) o payload invalido. Cierra el circulo de contabilidad.regla.declarar.request. |
| `contabilidad.regla.aprender.failed` | Par de fallo determinista: aprender rechazado (rol != DUENO/ASESOR) o payload invalido. Cierra el circulo de contabilidad.regla.aprender.request. |
| `contabilidad.regla_declarada.failed` | Par de fallo del evento de dominio contabilidad.regla_declarada: la emision del hecho de dominio no se completo. |
| `contabilidad.regla_aprendida.failed` | Par de fallo del evento de dominio contabilidad.regla_aprendida: la emision no se completo, o la ratificacion (L10) apunto a una regla inexistente. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> `contabilidad.regla.leer.failed` cierra `leer.request`;
> `contabilidad.regla.declarar.failed` cierra `declarar.request`;
> `contabilidad.regla.aprender.failed` cierra `aprender.request`; y
> `contabilidad.regla_aprendida.failed` cierra el flujo de la ratificación fire-and-forget
> `contabilidad.regla_ratificada` (L10) cuando apunta a una regla inexistente.

> Nota: no está en module.json pero sí lo emite index.js — `onLeerRequest` publica
> `contabilidad.regla.leer.failed` dentro del handler cuando `res.status !== 200`;
> `onReglaRatificada` publica `contabilidad.regla_aprendida.failed` cuando `_ratificar`
> no devuelve `200`.

## Reglas de negocio

1. **Un solo escritor (guard de rol)**: `_declarar` y `_aprender` exigen
   `rol ∈ {DUENO, ASESOR}` (constante `ROLES_AUTORIZADOS`). Cualquier otro →
   `403 PERMISSION_DENIED` `{ message:'solo DUENO/ASESOR declara reglas' (o 'solo
   DUENO/ASESOR aporta aprendizaje'), details:{ roles_esperados:['DUENO','ASESOR'], rol_recibido:<rol> } }`.
   Second-writer rechazado.
2. **Estados cerrados de una regla**: `DECLARADA` (actúa ya), `RATIFICACION_PENDIENTE`
   (aprendida, NO actúa) y `RATIFICADA` (actúa). El corte duro son los estados que
   actúan: `_aplicar` solo considera `DECLARADA` y `RATIFICADA`.
3. **El asiento original no se borra; la corrección SUMA (append-only)**: el
   repositorio solo apila reglas en `d.reglas`; nunca reescribe una pasada. Nada se
   elimina.
4. **El sistema NO firma y NO decide**: `_aprender` nace con `actua:false`. La regla
   aprendida **no actúa** hasta que L10 la ratifica vía
   `contabilidad.regla_ratificada`. Aprender ≠ decidir.
5. **Validaciones de payload deterministas**: falta `project_id` → `400 project_id`;
   `regla` ausente/no objeto → `400 regla`; `regla.patron` ausente/no objeto →
   `400 regla.patron` (en `declarar` y en `aprender`). Shape
   `{ status:400, error:{ code:'INVALID_INPUT', message:'<campo> requerido', details:{ field:<campo> } } }`.
6. **Ratificar una regla inexistente → 404**: `_ratificar` busca por `regla_id`; si no
   existe → `404 RESOURCE_NOT_FOUND` `{ message:'regla <id> no hallada', details:{ regla_id } }`
   + `contabilidad.regla_aprendida.failed`. Si existe, pasa a `RATIFICADA`, marca
   `ratificada_en` y responde `{ estado:'RATIFICADA', actua:true }`.
7. **Aplicar es proyección PURA (corte duro)**: `_aplicar` recorre solo las reglas
   activas y devuelve la primera cuya `patron` coincida campo a campo con el hecho
   (`Object.keys(patron).every(k => hecho[k] === patron[k])`). Si ninguna cubre →
   `200 {cubierto:false, contrapartida:null, resultado:'SIN_COBERTURA'}` (que alimenta
   `cola-revision`). **Cero estimación**: sin regla no se inventa contrapartida.
8. **HTTP exacto**: éxito `200`; payload inválido → `400`; rol inválido → `403`; regla no
   hallada al ratificar → `404`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPCs que responden en `contabilidad.regla.leer.response`,
`contabilidad.regla.declarar.response` y `contabilidad.regla.aprender.response`.

### 1. `declarar` — declarar una regla (actúa ya)

```json
{
  "project_id": "e57a318a-...",
  "rol": "ASESOR",
  "regla": {
    "patron": { "proveedor": "ACME SL" },
    "contrapartida": { "cuenta_debe": "600", "cuenta_haber": "400" }
  },
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "regla": { "id": "e57a318a-...-r1", "patron": { "proveedor": "ACME SL" }, "contrapartida": { "cuenta_debe": "600", "cuenta_haber": "400" }, "estado": "DECLARADA", "declarado_por": "ASESOR", "declarado_en": "2026-09-28T..." }
}
```
Emite `contabilidad.regla_declarada` (res.data + correlation_id).

### 2. `aprender` — aportar una regla candidata (NO actúa)

```json
{
  "project_id": "e57a318a-...",
  "rol": "ASESOR",
  "regla": { "patron": { "concepto": "SUMINISTROS" }, "contrapartida": { "cuenta_debe": "628" } },
  "evidencia": { "excepcion_id": "e57a318a-...-ASESOR-x3" },
  "correlation_id": "abc-124"
}
```
Respuesta `200` (queda pendiente de ratificación):
```json
{
  "project_id": "e57a318a-...",
  "regla": { "id": "e57a318a-...-a2", "patron": { "concepto": "SUMINISTROS" }, "contrapartida": { "cuenta_debe": "628" }, "estado": "RATIFICACION_PENDIENTE", "evidencia": { "excepcion_id": "e57a318a-...-ASESOR-x3" }, "aportada_por": "ASESOR", "aportada_en": "2026-09-28T..." },
  "actua": false
}
```
Emite `contabilidad.regla_aprendida` (res.data + correlation_id).

### 3. `leer` — leer el repositorio (proyección pura, filtro opcional)

```json
{ "project_id": "e57a318a-...", "estado": "RATIFICACION_PENDIENTE" }
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "reglas": [ { "id": "e57a318a-...-a2", "estado": "RATIFICACION_PENDIENTE", "...": "..." } ] }
```

### 4. Fire-and-forget `contabilidad.regla_ratificada` — L10 ratifica (no es RPC)

```json
{ "project_id": "e57a318a-...", "regla_id": "e57a318a-...-a2" }
```
Respuesta interna `200`:
```json
{ "project_id": "e57a318a-...", "regla_id": "e57a318a-...-a2", "estado": "RATIFICADA", "actua": true }
```
Si la regla no existe → `404` + `contabilidad.regla_aprendida.failed`:
```json
{ "status": 404, "error": { "code": "RESOURCE_NOT_FOUND", "message": "regla e57a318a-...-a9 no hallada", "details": { "regla_id": "e57a318a-...-a9" } } }
```

### Fallo — rol inválido

```json
{ "project_id": "e57a318a-...", "rol": "OPERADOR", "regla": { "patron": {}, "contrapartida": {} } }
```
Respuesta `403` + `contabilidad.regla.declarar.failed`:
```json
{ "status": 403, "error": { "code": "PERMISSION_DENIED", "message": "solo DUENO/ASESOR declara reglas", "details": { "roles_esperados": ["DUENO", "ASESOR"], "rol_recibido": "OPERADOR" } } }
```

> Nota: `onReglaRatificada` si el payload no trae `project_id` ni `regla_id` devuelve
> `null` y no publica nada (guarda de entrada del fire-and-forget).

## Tests

El test vive en `tests/unit/regla-contrapartida.test.js`. Cubre:

- `declarar` con rol `ASESOR` → `200`, nace `DECLARADA`, emite `contabilidad.regla_declarada`.
- `declarar` con rol distinto → `403 PERMISSION_DENIED` + `contabilidad.regla.declarar.failed`;
  sin `patron` → `400 regla.patron`.
- `aprender` → `200 {actua:false}`, estado `RATIFICACION_PENDIENTE`, emite
  `contabilidad.regla_aprendida`.
- `onReglaRatificada` (fire-and-forget L10) ratifica → `RATIFICADA {actua:true}`; con
  `regla_id` inexistente → `404` + `contabilidad.regla_aprendida.failed`.
- `leer` (proyección pura, filtro por estado) → `200 {reglas}`.
- `_aplicar`: solo actúa con reglas `DECLARADA`/`RATIFICADA`; sin coincidencia →
  `SIN_COBERTURA`.
- `project.activated` restaura el repositorio vía PosPersistencia.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/regla-contrapartida
node --test tests/unit/regla-contrapartida.test.js
```

## Notas de implementación

- Clase `ReglaContrapartida extends ModuloHibridoReflejo`; `name =
  'regla-contrapartida'`, `version = 'reflejo-0.1.0'`. Store en memoria `this._store`
  (Map project_id → `{ esquema:'contabilidad-regla-contrapartida-v1', reglas:[], updated_at }`).
- **PosPersistencia**: `_persist = new PosPersistencia({ modulo, file:
  'regla-contrapartida.json', dir: '/contabilidad/regla-contrapartida', snapshot,
  hidratar })`. `onProjectActivated` → `restaurar(project_id)`; `onUnload` → `flush()` +
  `detener()`. Cada mutación marca `marcarDirty(pid)`.
- `onLeerRequest`/`onDeclararRequest`/`onAprenderRequest` delegan en
  `_atender(e, '<op>', 'contabilidad.regla.<op>.response', fn)`; emiten el evento de
  dominio o el par determinista dentro de la proyección. `onReglaRatificada` es
  fire-and-forget (no usa `_atender`) y usa el data del evento directamente.
- Proyecciones puras: `_leer` (lectura), `_declarar` (escritura + guard), `_aprender`
  (escritura + guard, estado pendiente), `_ratificar` (L10), `_aplicar` (corte duro,
  no muta). Helper `_obtenerOCrear(pid)`. `_invalid`/`_errorResponse` vienen de la base.
- Tools: `toolLeer`, `toolDeclarar`, `toolAprender`, `toolAplicar`.
- DEP hacia delante: lo consume `resolucion-contrapartida` (A6.1) como corte duro; lo
  alimenta `desatasco-entrada` (P3); la ratificación llega de L10 (puerta única de
  ratificación compartida con `regla-movimiento-bancario`, E8).
