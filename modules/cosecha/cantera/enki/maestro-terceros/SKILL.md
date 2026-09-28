---
name: maestro-terceros
description: >
  Skill FULL del módulo CUSTODIO `maestro-terceros` de la vertical contabilidad de Enki
  (N1+N2 FUSIONADOS, hoja del plan). MAESTRO ÚNICO del tercero con ROLES: ficha funcional
  (N1) + identidad por NIF (N2) en la MISMA parcela. Un mismo tercero cliente y proveedor
  NO se duplica: es un maestro con dos facetas (roles: CLIENTE/PROVEEDOR/EMPLEADO/ACREEDOR/
  SOCIO). "Un proveedor escrito de tres formas = uno" (identidad por número fiscal). Un
  solo escritor DUENO/ASESOR para la ficha; la IDENTIDAD la gobierna SISTEMA. Persiste por
  proyecto vía PosPersistencia. Úsala para operar, depurar o extender el custodio.
when-to-use: >
  - Cuando necesites declarar/reusar una ficha de tercero
    (RPC contabilidad.tercero.declarar.request), leer su ficha
    (contabilidad.tercero.ficha.request), resolver su identidad por NIF
    (contabilidad.tercero.identificar.request) o su historial
    (contabilidad.tercero.historial.request).
  - Cuando depures por qué declarar se rechaza (PERMISSION_DENIED si el rol no es
    DUENO/ASESOR), por qué ficha/historial dan 404, o por qué identificar falla (rol o nif).
  - Cuando quieras entender el contrato de eventos, la no-duplicación por NIF y la
    separación de escritores (ficha = DUENO/ASESOR; identidad = SISTEMA).
  - Cuando vayas a escribir/ampliar el test unitario del custodio maestro-terceros.
tags: [enki, modulo, custodio, persistencia, contabilidad, maestro-terceros, identidad, nif, terceros]
---

# maestro-terceros — CUSTODIO del maestro único de terceros con roles

## Qué hace el módulo

`maestro-terceros` es un **CUSTODIO CON PERSISTENCIA** (N1+N2 fusionados, hoja del plan):
el dueño del **maestro único del tercero**, por proyecto. Fusiona en **la MISMA parcela**
la **ficha funcional** (N1: quién es comercialmente) y la **identidad por NIF** (N2: quién
es fiscalmente). Así resuelve el conflicto 1 del diseño: **un mismo tercero cliente y
proveedor NO se duplica** — es un maestro con **dos facetas** (roles:
`CLIENTE`/`PROVEEDOR`/`EMPLEADO`/`ACREEDOR`/`SOCIO`).

La regla dura es **"un proveedor escrito de tres formas = uno"**: la identidad se ancla en
el **número fiscal** (NIF, normalizado), de modo que las variantes de escritura del nombre
convergen a un único tercero.

Hay **dos escritores distintos** por diseño: la **ficha** la escribe **DUENO/ASESOR**
(guard en `_declarar`); la **identidad** (índice por NIF, `identificar`/`unificar`) la
gobierna **SISTEMA**. Dos escritores sobre la identidad producirían terceros
contradictorios, y eso está **prohibido**. Esa es la invariante **Un solo escritor por
parcela**.

Persiste por proyecto con **PosPersistencia** (storage `/contabilidad/maestro-terceros/*.json`),
restaura en `project.activated` y vuelca en `onUnload`. Emite `contabilidad.tercero_declarado`
y `contabilidad.tercero_identificado` en éxito, y sus pares de fallo deterministas.

> **NO REUTILIZA**: no existe maestro fiscal de terceros en el inventario (N1+N2 se funden
> en UNA parcela, decisión del dueño).

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.tercero.declarar.request` | `onDeclararRequest` | RPC custodio: {project_id, rol:'DUENO'\|'ASESOR', tercero:{nif, nombreFiscal, roles:[...], condiciones}} → {project_id, tercero, reusado}. Guard de escritor: solo DUENO/ASESOR (second-writer rechazado). Si el NIF ya existe, REUSA el tercero y anade el rol (cliente+proveedor NO duplica). Publica contabilidad.tercero_declarado y responde por contabilidad.tercero.declarar.response; si el rol o el payload son invalidos → contabilidad.tercero.declarar.failed. |
| `contabilidad.tercero.ficha.request` | `onFichaRequest` | RPC custodio: {project_id, id_tercero} → {project_id, tercero}. Proyeccion PURA de lectura (no muta). 404 si el tercero no existe → contabilidad.tercero.ficha.failed. Lo consume resolucion-contrapartida (A6.1). |
| `contabilidad.tercero.identificar.request` | `onIdentificarRequest` | RPC custodio: {project_id, nif, nombreFiscal, rol:'SISTEMA'} → {project_id, id_tercero, hallado, nif}. Faceta de IDENTIDAD (N2): indice por numero fiscal; 'un proveedor escrito de tres formas = uno'. La gobierna SISTEMA (o DUENO/ASESOR). Publica contabilidad.tercero_identificado y responde por contabilidad.tercero.identificar.response; si el rol o el nif son invalidos → contabilidad.tercero.identificar.failed. |
| `contabilidad.tercero.historial.request` | `onHistorialRequest` | RPC custodio: {project_id, id_tercero} → {project_id, id_tercero, historial:[IdAsiento\|IdDocumento]}. Proyeccion PURA de lectura (no muta). 404 si el tercero no existe → contabilidad.tercero.historial.failed. |
| `project.activated` | `onProjectActivated` | Restaura el maestro de terceros del proyecto activado desde el storage (PosPersistencia): el maestro es POR PROYECTO. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.tercero_declarado` | Fire-and-forget (N1): una ficha de tercero quedo declarada o reusada por NIF → {project_id, tercero, reusado}. Lo consume resolucion-contrapartida (A6.1) para dar identidad al tercero del hecho. |
| `contabilidad.tercero_identificado` | Fire-and-forget (N2): la identidad por NIF quedo resuelta (hallado o creado) → {project_id, id_tercero, hallado, nif}. Cierra la faceta de identidad del maestro. |
| `contabilidad.tercero.declarar.failed` | Par de fallo determinista: declarar rechazado (rol != DUENO/ASESOR) o payload invalido. Cierra el circulo de contabilidad.tercero.declarar.request. |
| `contabilidad.tercero.ficha.failed` | Par de fallo determinista: ficha de tercero inexistente (404) o payload invalido. Cierra el circulo de contabilidad.tercero.ficha.request. |
| `contabilidad.tercero.identificar.failed` | Par de fallo determinista: identificar sin nif, o rol no autorizado para la identidad. Cierra el circulo de contabilidad.tercero.identificar.request. |
| `contabilidad.tercero.historial.failed` | Par de fallo determinista: historial de tercero inexistente (404) o payload invalido. Cierra el circulo de contabilidad.tercero.historial.request. |
| `contabilidad.tercero_declarado.failed` | Par de fallo del evento de dominio contabilidad.tercero_declarado: la emision del hecho de dominio no se completo. |
| `contabilidad.tercero_identificado.failed` | Par de fallo del evento de dominio contabilidad.tercero_identificado: la emision del hecho de dominio no se completo. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> `contabilidad.tercero.declarar.failed` cierra `declarar.request`;
> `contabilidad.tercero.ficha.failed` cierra `ficha.request` (404 o payload inválido);
> `contabilidad.tercero.identificar.failed` cierra `identificar.request`;
> `contabilidad.tercero.historial.failed` cierra `historial.request`.

> Nota: no está en module.json pero sí lo emite index.js — `onDeclararRequest` e
> `onIdentificarRequest` publican su par de dominio o determinista dentro del handler;
> `onFichaRequest` y `onHistorialRequest` publican `contabilidad.tercero.ficha.failed` /
> `contabilidad.tercero.historial.failed` cuando `res.status !== 200`.

> Nota: `_anadirRol` (tools `toolAnadirRol` vía `_anadirRol`) y `_unificar` (tools
> `toolUnificar`) existen como proyecciones puras + Tools pero **NO tienen evento RPC en
> `module.json`**: se invocan como tools / desde el sitio de despliegue. `_unificar`
> publica el `contabilidad.tercero_identificado` de la faceta de identidad al ejecutarse
> como parte del flujo, no por RPC suscrita.

## Reglas de negocio

1. **Un solo escritor de la FICHA (guard de rol)**: `_declarar` exige
   `rol ∈ {DUENO, ASESOR}` (constante `ROLES_FICHA`). Cualquier otro →
   `403 PERMISSION_DENIED` `{ message:'solo DUENO/ASESOR declara terceros', details:{ roles_esperados:['DUENO','ASESOR'], rol_recibido:<rol> } }`.
   Second-writer rechazado.
2. **La IDENTIDAD la gobierna SISTEMA**: `_identificar` y `_unificar` exigen
   `rol === 'SISTEMA'` **o** `DUENO/ASESOR` (constante `ROL_SISTEMA`); otro rol →
   `403 PERMISSION_DENIED` `{ message:'la identidad la gobierna SISTEMA/DUENO/ASESOR', details:{ rol_recibido:<rol> } }`
   (o `'la unificacion la gobierna SISTEMA'`). **Dos escritores sobre la identidad =
   terceros contradictorios = prohibido**.
3. **NO duplicar por NIF (identidad por número fiscal)**: `_declarar` normaliza el NIF
   (`_normNIF`: quita espacios/guiones y pasa a mayúsculas) y busca en `d.porNIF`. Si ya
   existe, **REUSA** el tercero, **añade los roles** que falten (`reusado:true`).
   **Cliente+proveedor NO duplica**: es el mismo tercero con dos roles.
4. **"Un proveedor escrito de tres formas = uno"**: `_identificar` resuelve por NIF
   normalizado; si existe → `{ hallado:true, id_tercero }`; si no, **crea la identidad**
   (aún sin ficha) con `id` nuevo, `roles:[]` y `identificado_por`, y la registra en
   `porNIF` → `{ hallado:false }`.
5. **Unificar conserva un superviviente**: `_unificar(id_a, id_b, evidencia)` conserva A
   como superviviente, absorbe los roles y el historial de B, hereda su NIF si A no lo
   tenía, registra `unificado_con` y `evidencia_unificacion`, y **elimina B**. `id_a === id_b`
   → `400 INVALID_INPUT id_a/id_b`; si alguno no existe → `404 RESOURCE_NOT_FOUND`.
6. **Validaciones deterministas**: falta `project_id` → `400 project_id`; `tercero`
   ausente/no objeto o sin `nombreFiscal` → `400 tercero` / `400 tercero.nombreFiscal`;
   falta `id_tercero` → `400 id_tercero`; falta `nif` (al identificar) → `400 nif`.
7. **La lectura no muta**: `_ficha` y `_historial` son proyecciones PURAS; devuelven
   `404 RESOURCE_NOT_FOUND` si el tercero no existe. `_declarar` asigna roles por defecto
   (`['CLIENTE']` si no se aportan) y expone `roles_disponibles`.
8. **HTTP exacto**: éxito `200`; payload inválido → `400`; rol inválido → `403`; tercero
   no hallado → `404`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPCs que responden en `contabilidad.tercero.declarar.response`,
`contabilidad.tercero.ficha.response`, `contabilidad.tercero.identificar.response` y
`contabilidad.tercero.historial.response`.

### 1. `declarar` — declarar/reusar una ficha (solo DUENO/ASESOR)

```json
{
  "project_id": "e57a318a-...",
  "rol": "ASESOR",
  "tercero": { "nif": "B12345678", "nombreFiscal": "ACME SL", "roles": ["PROVEEDOR"] },
  "correlation_id": "abc-123"
}
```
Respuesta `200` (primera vez, no reusado):
```json
{
  "project_id": "e57a318a-...",
  "tercero": { "id": "e57a318a-...-t1", "nif": "B12345678", "nombreFiscal": "ACME SL", "nombreComercial": null, "roles": ["PROVEEDOR"], "condiciones": {}, "roles_disponibles": ["CLIENTE","PROVEEDOR","EMPLEADO","ACREEDOR","SOCIO"], "declarado_por": "ASESOR", "created_at": "2026-09-28T..." },
  "reusado": false
}
```
Si el NIF ya existe (mismo tercero, ahora también cliente) → `{ tercero: {...roles:["PROVEEDOR","CLIENTE"]}, reusado: true }`.
Emite `contabilidad.tercero_declarado` (res.data + correlation_id).

### 2. `ficha` — leer la ficha (proyección pura)

```json
{ "project_id": "e57a318a-...", "id_tercero": "e57a318a-...-t1" }
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "tercero": { "id": "e57a318a-...-t1", "nif": "B12345678", "nombreFiscal": "ACME SL", "roles": ["PROVEEDOR"], "...": "..." } }
```
Si no existe → `404` + `contabilidad.tercero.ficha.failed`:
```json
{ "status": 404, "error": { "code": "RESOURCE_NOT_FOUND", "message": "tercero e57a318a-...-t9 no hallado", "details": { "id_tercero": "e57a318a-...-t9" } } }
```

### 3. `identificar` — identidad por NIF (N2, la gobierna SISTEMA)

```json
{ "project_id": "e57a318a-...", "nif": "b12345678", "nombreFiscal": "Acme, S.L.", "rol": "SISTEMA", "correlation_id": "abc-124" }
```
Respuesta `200` (NIF normalizado a `B12345678`; ya existía → hallado):
```json
{ "project_id": "e57a318a-...", "id_tercero": "e57a318a-...-t1", "hallado": true, "nif": "B12345678" }
```
Si no existía → crea identidad sin ficha y devuelve `{ hallado: false }`.
Emite `contabilidad.tercero_identificado` (res.data + correlation_id).

### 4. `historial` — historial del tercero (proyección pura)

```json
{ "project_id": "e57a318a-...", "id_tercero": "e57a318a-...-t1" }
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "id_tercero": "e57a318a-...-t1", "historial": [] }
```
Si no existe → `404` + `contabilidad.tercero.historial.failed`.

### 5. Tools (sin RPC en module.json): añadir rol y unificar

`toolAnadirRol` / `_anadirRol` (`cliente+proveedor NO duplica`):
```json
{ "project_id": "e57a318a-...", "id_tercero": "e57a318a-...-t1", "rol_tercero": "CLIENTE" }
```
→ `{ "project_id": "...", "tercero": { "...roles": ["PROVEEDOR","CLIENTE"] }, "rol_anadido": "CLIENTE" }`

`toolUnificar` / `_unificar` ("tres formas = uno"):
```json
{ "project_id": "e57a318a-...", "id_a": "e57a318a-...-t1", "id_b": "e57a318a-...-t4", "evidencia": "mismo NIF y direccion" }
```
→ `{ "project_id": "...", "id_tercero": "e57a318a-...-t1", "absorbido": "e57a318a-...-t4", "tercero": { "...": "..." } }`

### Fallo — rol inválido

```json
{ "project_id": "e57a318a-...", "rol": "OPERADOR", "tercero": { "nombreFiscal": "X" } }
```
Respuesta `403` + `contabilidad.tercero.declarar.failed`:
```json
{ "status": 403, "error": { "code": "PERMISSION_DENIED", "message": "solo DUENO/ASESOR declara terceros", "details": { "roles_esperados": ["DUENO", "ASESOR"], "rol_recibido": "OPERADOR" } } }
```

## Tests

El test vive en `tests/unit/maestro-terceros.test.js`. Cubre:

- `declarar` con rol `ASESOR` → `200 {reusado:false}`, emite `contabilidad.tercero_declarado`.
- **No duplica por NIF**: declarar dos veces el mismo NIF reusa el tercero y añade el rol
  (`reusado:true`) — cliente+proveedor es un solo tercero.
- `declarar` con rol distinto → `403 PERMISSION_DENIED` + `contabilidad.tercero.declarar.failed`.
- `ficha` existente → `200`; inexistente → `404` + `contabilidad.tercero.ficha.failed`.
- `identificar` con NIF existente → `hallado:true`; con NIF nuevo → `hallado:false` (crea
  identidad) y emite `contabilidad.tercero_identificado`; sin `nif` → `400`.
- `historial` → `200 {historial}`; inexistente → `404` + `contabilidad.tercero.historial.failed`.
- `_unificar` conserva A y absorbe B; `id_a===id_b` → `400`.
- `project.activated` restaura el maestro vía PosPersistencia.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/maestro-terceros
node --test tests/unit/maestro-terceros.test.js
```

## Notas de implementación

- Clase `MaestroTerceros extends ModuloHibridoReflejo`; `name = 'maestro-terceros'`,
  `version = 'reflejo-0.1.0'`. Store en memoria `this._store` (Map project_id →
  `{ esquema:'contabilidad-maestro-terceros-v1', terceros:{}, porNIF:{}, historial:{} }`).
- **PosPersistencia**: `_persist = new PosPersistencia({ modulo, file:
  'maestro-terceros.json', dir: '/contabilidad/maestro-terceros', snapshot, hidratar })`.
  `onProjectActivated` → `restaurar(project_id)`; `onUnload` → `flush()` + `detener()`.
  Cada mutación marca `marcarDirty(pid)`.
- `onDeclararRequest`/`onFichaRequest`/`onIdentificarRequest`/`onHistorialRequest` delegan
  en `_atender(e, '<op>', 'contabilidad.tercero.<op>.response', fn)`; emiten el evento de
  dominio o el par determinista dentro de la proyección, propagando `correlation_id`.
- Proyecciones puras: `_declarar` (escritura + guard + no-duplicación por NIF), `_ficha`
  y `_historial` (lecturas), `_anadirRol`, `_identificar` (N2) y `_unificar`. Helpers
  `_obtenerOCrear(pid)` y `_normNIF(nif)`. `_invalid`/`_errorResponse` vienen de la base.
- Tools: `toolDeclarar`, `toolFicha`, `toolIdentificar`, `toolHistorial`, `toolUnificar`.
- DEP hacia delante: lo consume `resolucion-contrapartida` (A6.1) para dar identidad al
  tercero del hecho.
