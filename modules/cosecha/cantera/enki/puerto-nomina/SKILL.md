---
name: puerto-nomina
description: >
  Skill FULL del módulo PUENTE `puerto-nomina` de la vertical contabilidad de Enki
  (G4, hoja del plan). Origen DECLARABLE del dato de nómina: el sistema NO calcula
  nómina por defecto, la RECIBE. Calcular es capacidad OPCIONAL y declarable (G5,
  pieza [ABIERTO] en cola-declaraciones-criterio); mientras el dueño no la declare,
  este puente solo conecta con la fuente de personal y admite los recibos YA emitidos.
  Es un PUERTO ABIERTO: si el origen no existe, SE CREA (jamás se asume ni se fuerza
  a la fuente). Stateless: sin PosPersistencia ni project.activated. Úsala para operar,
  depurar o extender el puente, o para entender su contrato de eventos y sus reglas.
when-to-use: >
  - Cuando necesites recibir un recibo de nómina de una fuente de personal
    (RPC contabilidad.nomina.recibir.request).
  - Cuando necesites conectar/declarar un origen de nómina (toolConectar/_conectar,
    solo el DUENO) — puerto abierto: si el origen no existe, se crea.
  - Cuando depures por qué no se admite un recibo (INVALID_INPUT si falta
    project_id/hecho_nomina/origen/empleado, PERMISSION_DENIED si el rol no es DUENO)
    o por qué capacidad_calculo sale false.
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), la
    invariante "el sistema RECIBE, no calcula" y el puerto abierto.
  - Cuando vayas a escribir/ampliar el test unitario del puente puerto-nomina.
tags: [enki, modulo, puente, contabilidad, puerto-nomina, nomina, puerto-abierto]
---

# puerto-nomina — PUENTE del origen declarable del dato de nómina

## Qué hace el módulo

`puerto-nomina` es un **PUENTE STATELESS** (G4, hoja del plan): el **origen
DECLARABLE del dato de nómina**. La invariante rectora del dominio es que **el
sistema NO calcula nómina por defecto: la RECIBE**. Calcular es una **capacidad
OPCIONAL y declarable** (G5, pieza `[ABIERTO]` en `cola-declaraciones-criterio`);
mientras el dueño no declare "el negocio calcula nómina", este puente **solo
conecta con la fuente de personal** (asesoría, sistema de personal, fichero
normalizado o carga manual) y **admite los recibos YA emitidos** por ella.

Es un **PUERTO ABIERTO**: si el origen no está conectado, **SE CREA** al vuelo con
lo que la fuente trae (un adaptador por origen, puesto en el sitio de despliegue).
Si **falta el origen**, se dice **`INVALID_INPUT`** y el puente **jamás asume ni
fuerza** a la fuente.

Es **stateless**: sin PosPersistencia ni `project.activated` — el catálogo de
orígenes conectados vive en **memoria del propio puerto** (`this._origenes`), porque
es **configuración del adaptador**, no una parcela que persistir. La dependencia con
`recibo-nomina` (G1) es **por EVENTO, nunca por `require` cruzado**. Emite
`contabilidad.nomina_recibida` en éxito y su par determinista en fallo.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.nomina.recibir.request` | `onRecibirRequest` | RPC puente: {project_id, origen, hecho_nomina:{empleado, periodo, bruto, neto}} → {project_id, origen, empleado, periodo, bruto, neto, recibo, calculado_por_sistema:false, capacidad_calculo}. El recibo LLEGA hecho por la fuente; el puerto NO calcula nomina. Si el origen no esta conectado se conecta al vuelo (puerto abierto: si falta, se crea). Publica contabilidad.nomina_recibida y responde por contabilidad.nomina.recibir.response; si falta project_id/origen/empleado → contabilidad.nomina.recibir.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.nomina_recibida` | Fire-and-forget (G4): un recibo de nomina llego por el puerto con su origen → {project_id, origen, empleado, periodo, bruto, neto, recibo}. Lo consume recibo-nomina (G1) para formar el asiento de personal y su desglose. |
| `contabilidad.nomina.recibir.failed` | Par de fallo determinista: recibir sin origen/empleado o con hecho de nomina invalido. Cierra el circulo de contabilidad.nomina.recibir.request. |
| `contabilidad.nomina_recibida.failed` | Par de fallo del evento de dominio contabilidad.nomina_recibida: la emision del hecho de dominio no se completo. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `contabilidad.nomina.recibir.failed` cierra el círculo de
> `contabilidad.nomina.recibir.request` cuando `_recibir` devuelve `status ≠ 200`.

> Nota: no está en module.json pero sí lo emite index.js en `onRecibirRequest` —
> `contabilidad.nomina_recibida` (éxito) y `contabilidad.nomina.recibir.failed`
> (fallo) se publican **dentro del handler**, además de la response de `_atender`.

> Nota: `contabilidad.nomina.recibir.response` la emite `_atender` (el par response
> del RPC) y **NO está declarada en `publishes`**.

> Nota: **`contabilidad.nomina_recibida.failed` está declarada en `publishes` pero
> no se emite en `index.js`** — el puente solo publica su par de fallo del RPC, no
> el par del evento de dominio. Sé honesto con esto al extenderlo.

> Nota: **`_conectar` (tools `toolConectar`) es una proyección pura + Tool pero NO
> tiene evento RPC en `module.json`**: se invoca como tool o desde el sitio de
> despliegue (y desde `_recibir`, que lo llama al vuelo si el origen falta).

> Nota: el comentario `_doc` del manifest menciona una señal `NO_DECLARADO` que
> **el código real no devuelve**: `_conectar` responde `400 INVALID_INPUT origen`
> cuando falta el origen. Documenta el código, no el comentario.

## Reglas de negocio

1. **El sistema RECIBE la nómina, no la calcula (invariante G4/G5)**: `_recibir`
   devuelve siempre **`calculado_por_sistema:false`** y una nota
   `'el sistema RECIBE la nomina; calcular es capacidad opcional (G5 declarable)'`.
   `capacidad_calculo` refleja el flag declarado del origen (`estadoOrigen.calcula`,
   por defecto `false`).
2. **Puerto ABIERTO — si el origen no existe, SE CREA**: si `origen` no está en
   `this._origenes`, `_recibir` llama a `_conectar` al vuelo y solo sigue si
   devuelve `200`. Nunca se fuerza a la fuente ni se asume el origen.
3. **Un solo declarante del origen**: `_conectar` exige `rol === 'DUENO'`
   (constante `ROL_DECLARANTE`); el default es `DUENO` si no se aporta rol. Cualquier
   otro → **`403 PERMISSION_DENIED`** con
   `{ status:403, error:{ code:'PERMISSION_DENIED', message:'solo el DUENO declara el origen de la nomina', details:{ rol_esperado:'DUENO', rol_recibido:<rol> } } }`.
4. **El origen se normaliza a mayúsculas**: `origen` = `String(...).toUpperCase()`.
   Los orígenes base conocidos son `ORIGENES_BASE = {ASESORIA, SISTEMA_PERSONAL,
   FICHERO_NORMALIZADO, MANUAL}`; un origen fuera de la base se marca
   `conocido:false` pero **se admite igual** (puerto abierto).
5. **Validaciones deterministas**: falta `project_id` → `400 INVALID_INPUT project_id`;
   `hecho_nomina` (o `recibo`) ausente/no objeto → `400 INVALID_INPUT hecho_nomina`;
   falta `origen` → `400 INVALID_INPUT origen`; falta el empleado (`recibo.empleado`
   o `recibo.id_empleado`) → `400 INVALID_INPUT hecho_nomina.empleado`. Shape:
   `{ status:400, error:{ code:'INVALID_INPUT', message:'<campo> requerido', details:{ field:<campo> } } }`.
6. **El recibo llega hecho y se acepta tal cual**: se admiten alias de campos —
   `bruto` (`?? total_devengado`) y `neto` (`?? liquido`), redondeados a 2
   decimales con `_round`; si no son finitos → `null`. El `periodo` es opcional.
7. **La ley entra como DATO**: el origen y la capacidad de cálculo son
   **declarables**, no constantes cableadas; el catálogo de orígenes es
   configuración del adaptador.
8. **HTTP exacto**: éxito `200`; payload inválido → `400`; rol no-DUENO → `403`;
   excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPC que responde en `contabilidad.nomina.recibir.response`.

### 1. `recibir` — admitir un recibo de nómina de una fuente

```json
{
  "project_id": "e57a318a-...",
  "origen": "asesoria",
  "hecho_nomina": {
    "empleado": "EMP-001",
    "periodo": "2026-09",
    "bruto": 2000,
    "neto": 1540.5
  },
  "correlation_id": "abc-123"
}
```
Respuesta `200` (el origen se normaliza a MAYÚSCULAS y se conecta al vuelo si faltaba):
```json
{
  "project_id": "e57a318a-...",
  "origen": "ASESORIA",
  "empleado": "EMP-001",
  "periodo": "2026-09",
  "bruto": 2000,
  "neto": 1540.5,
  "recibo": { "empleado": "EMP-001", "periodo": "2026-09", "bruto": 2000, "neto": 1540.5 },
  "calculado_por_sistema": false,
  "capacidad_calculo": false,
  "nota": "el sistema RECIBE la nomina; calcular es capacidad opcional (G5 declarable)"
}
```
Emite `contabilidad.nomina_recibida` (res.data + `correlation_id`).

### 2. `conectar` — declarar un origen (proyección pura + Tool, sin RPC declarada)

`toolConectar` → `_conectar`. Si el origen no existe, **se crea**.
```json
{ "project_id": "e57a318a-...", "origen": "SISTEMA_PERSONAL", "rol": "DUENO", "tipo": "API" }
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "origen": "SISTEMA_PERSONAL",
  "creado": false,
  "conocido": true,
  "capacidad": { "origen": "SISTEMA_PERSONAL", "tipo": "API", "calcula": false, "conocido": true, "declarado_en": "2026-09-28T...", "declarado_por": "DUENO" }
}
```

### Fallo — rol no-DUENO al conectar

```json
{ "project_id": "e57a318a-...", "origen": "ASESORIA", "rol": "OPERADOR" }
```
Respuesta `403`:
```json
{ "status": 403, "error": { "code": "PERMISSION_DENIED", "message": "solo el DUENO declara el origen de la nomina", "details": { "rol_esperado": "DUENO", "rol_recibido": "OPERADOR" } } }
```

### Fallo — recibo sin empleado

```json
{ "project_id": "e57a318a-...", "origen": "ASESORIA", "hecho_nomina": { "periodo": "2026-09" } }
```
Respuesta `400` + `contabilidad.nomina.recibir.failed`:
```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "hecho_nomina.empleado requerido", "details": { "field": "hecho_nomina.empleado" } } }
```

## Tests

El test vive en `tests/unit/puerto-nomina.test.js`. Cubre:

- `recibir` con `origen` conocido y recibo completo → `200` con
  `calculado_por_sistema:false` y `capacidad_calculo:false` (por defecto), emite
  `contabilidad.nomina_recibida`.
- `recibir` con un origen **no conectado** → se conecta al vuelo (puerto abierto) y
  el recibo se admite igual.
- `recibir` sin `project_id`/`hecho_nomina`/`origen`/`empleado` → `400 INVALID_INPUT`
  + `contabilidad.nomina.recibir.failed`.
- `conectar` con `rol:'DUENO'` → `200 {creado, conocido, capacidad}`; la segunda vez
  `creado:false`.
- `conectar` con rol distinto de `DUENO` → `403 PERMISSION_DENIED`.
- El puente es **stateless**: sin `project.activated` ni persistencia.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/puerto-nomina
node --test tests/unit/puerto-nomina.test.js
```

## Notas de implementación

- Clase `PuertoNomina extends ModuloHibridoReflejo`; `name = 'puerto-nomina'`,
  `version = 'reflejo-0.1.0'`. **Sin store persistente** (puente stateless): el
  catálogo vive en `this._origenes = new Map()` (origen → `{origen, tipo, calcula,
  conocido, declarado_en, declarado_por}`).
- Constantes: `ORIGENES_BASE` (Set `ASESORIA`, `SISTEMA_PERSONAL`,
  `FICHERO_NORMALIZADO`, `MANUAL`), `ROL_DECLARANTE = 'DUENO'`.
- `onRecibirRequest` delega en
  `_atender(e, 'recibir', 'contabilidad.nomina.recibir.response', fn)`; el handler
  emite `contabilidad.nomina_recibida` (éxito) o `contabilidad.nomina.recibir.failed`
  (fallo) dentro de la proyección, propagando `correlation_id`.
- Proyecciones puras: `_recibir` (admite el recibo hecho; **no calcula**),
  `_conectar` (crea/actualiza el origen; guard de rol DUENO). `_invalid` (→ 400
  INVALID_INPUT `{field}`), `_errorResponse` y `_round` vienen de la base.
- Tools: `toolRecibir` → `_recibir`, `toolConectar` → `_conectar`.
- DEP hacia delante: `contabilidad.nomina_recibida` lo consume `recibo-nomina` (G1)
  para formar el asiento de personal. Capacidad de cálculo declarable por G5 en
  `cola-declaraciones-criterio` (K9).
