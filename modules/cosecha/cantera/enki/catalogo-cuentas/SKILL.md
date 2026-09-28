---
name: catalogo-cuentas
description: >
  Skill FULL del módulo CUSTODIO `catalogo-cuentas` de la vertical contabilidad de Enki
  (B1+B6 FUSIONADOS, hoja del plan). EL PLAN DE CUENTAS DEL NEGOCIO es DECLARABLE (lo
  aporta el negocio/asesor) e IMPORTABLE: B6 es la frontera ÚNICA de codificación del
  plan (un solo cruce de formatos csv/tsv/txt). Un único ESCRITOR de la familia
  DUENO/ASESOR: cualquier rol fuera de la familia (segundo escritor) se rechaza de forma
  determinista con 409 ERROR_DOS_ESCRITORES — dos escritores sobre el plan = codificación
  contradictoria = prohibido. NO se inventa un plan por defecto: sin plan declarado,
  resolver(codigo) devuelve NO_EXISTE (determinista, jamás una cuenta fabricada). Persiste
  por proyecto vía PosPersistencia. Úsala para operar, depurar o extender el custodio, o
  para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites declarar una cuenta del plan (RPC contabilidad.cuenta.declarar.request),
    resolverla (contabilidad.cuenta.resolver.request), importar el plan entero desde el
    documento del asesor (contabilidad.plan.importar.request) o exportarlo
    (contabilidad.plan.exportar.request).
  - Cuando depures por qué se rechaza (409 ERROR_DOS_ESCRITORES si el rol no es de la
    familia DUENO/ASESOR, 422 PLAN_VACIO / código ilegible, 400 INVALID_INPUT) o por qué
    una cuenta devuelve NO_EXISTE.
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), el guard de
    escritor único del plan y la frontera única de formatos (B6).
  - Cuando vayas a escribir/ampliar el test unitario del custodio catalogo-cuentas.
tags: [enki, modulo, custodio, persistencia, contabilidad, catalogo-cuentas, plan-de-cuentas, escritor]
---

# catalogo-cuentas — CUSTODIO del plan de cuentas declarable/importable

## Qué hace el módulo

`catalogo-cuentas` es un **CUSTODIO CON PERSISTENCIA** (B1+B6 fusionados, hoja del
plan): **EL PLAN DE CUENTAS DEL NEGOCIO**. El plan es **DECLARABLE** (lo aporta el
negocio o el asesor — dato, nunca constante cableada) e **IMPORTABLE**: **B6 es la
frontera ÚNICA de codificación** del plan (un solo cruce de formatos `csv` | `tsv` |
`txt`).

El plan tiene **UN SOLO ESCRITOR** de la familia **DUENO/ASESOR** (`FAMILIA_ESCRITURA`).
Un rol fuera de la familia (segundo escritor) se rechaza de forma determinista con
**`409 ERROR_DOS_ESCRITORES`** (`CODE_DOS_ESCRITORES`): *dos escritores sobre el plan =
codificación contradictoria = prohibido* (invariante 8). El primer rol que escribe queda
como `escritor` vigente del plan.

**NO se inventa un plan por defecto**: sin plan declarado, `resolver(codigo)` devuelve
**`NO_EXISTE`** (determinista, nunca una cuenta fabricada; invariante 7: *dato ausente =
desconocido*). El plan se cierra con el criterio declarado (K9
`cola-declaraciones-criterio`).

Persiste por proyecto con **PosPersistencia** (storage
`/contabilidad/catalogo-cuentas/catalogo-cuentas.json`), restaura en `project.activated`
y vuelca en `onUnload`. Proyecciones puras: `_declarar` (guard de escritor único),
`_resolver` (no muta), `_importar` (B6), `_exportar` (B6) y `_parsear` (el cruce de
formatos).

> **NO REUTILIZA**: no existe plan contable en el inventario; el formato declarable del
> asesor es DATO (K9).

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.cuenta.declarar.request` | `onDeclararRequest` | RPC custodio: {project_id, rol:'DUENO'\|'ASESOR', cuenta:{codigo, nombre, naturaleza?, tipo?}} → {project_id, cuenta, n_cuentas, escritor}. Guard de un solo escritor: un rol fuera de la familia DUENO/ASESOR es rechazado con 409 ERROR_DOS_ESCRITORES. Exito publica contabilidad.cuenta_declarada y responde por contabilidad.cuenta.declarar.response; si falta cuenta/codigo/nombre → contabilidad.cuenta.declarar.failed. |
| `contabilidad.cuenta.resolver.request` | `onResolverRequest` | RPC custodio: {project_id, codigo} → {project_id, codigo, hallada, resultado:'CUENTA'\|'NO_EXISTE', cuenta, plan_declarado}. Proyeccion PURA de lectura (no muta, no inventa): una cuenta desconocida es NO_EXISTE, no un fallo. Responde por contabilidad.cuenta.resolver.response; si falta project_id/codigo → contabilidad.cuenta.resolver.failed. Lo consume escritor-diario (B2) para codificar y resolucion-contrapartida (A6.1). |
| `contabilidad.plan.importar.request` | `onImportarRequest` | RPC custodio (B6, frontera unica de formatos del plan): {project_id, rol, origen:{formato:'csv'\|'tsv'\|'txt', contenido}} → {project_id, formato, n_importadas, cuentas, n_cuentas}. Un documento vacio o con codigos ilegibles → 422 PRECONDITION_FAILED/INVALID_INPUT (no se importa vacio). Guard de un solo escritor. Exito publica contabilidad.plan_importado y responde por contabilidad.plan.importar.response; error → contabilidad.plan.importar.failed. |
| `contabilidad.plan.exportar.request` | `onExportarRequest` | RPC custodio (B6): {project_id, formato?} → {project_id, formato, documento:{formato, contenido, n_cuentas}, n_cuentas}. Proyeccion de lectura: compone el DocumentoPlan desde el catalogo declarado. Responde por contabilidad.plan.exportar.response y publica contabilidad.plan_exportado; error → contabilidad.plan.exportar.failed. |
| `project.activated` | `onProjectActivated` | Restaura el plan contable del proyecto activado desde el storage (PosPersistencia): el plan es POR PROYECTO. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.cuenta_declarada` | Fire-and-forget (B1): una cuenta quedo declarada en el plan → {project_id, cuenta:{codigo, nombre, naturaleza}, n_cuentas, escritor}. Lo consume escritor-diario (B2) para codificar apuntes y resolucion-contrapartida (A6.1) para proponer cuenta. |
| `contabilidad.plan_importado` | Fire-and-forget (B6): un plan entero quedo importado desde el documento del asesor → {project_id, formato, n_importadas, cuentas, n_cuentas}. El plan se cierra con el criterio declarado (K9). |
| `contabilidad.plan_exportado` | Fire-and-forget (B6): el plan quedo exportado a un DocumentoPlan → {project_id, formato, documento, n_cuentas}. |
| `contabilidad.cuenta.declarar.failed` | Par de fallo determinista: declarar con rol fuera de la familia (409 ERROR_DOS_ESCRITORES), o payload invalido (cuenta/codigo/nombre/naturaleza). Cierra el circulo de contabilidad.cuenta.declarar.request. |
| `contabilidad.cuenta.resolver.failed` | Par de fallo determinista: resolver sin project_id o sin codigo. Cierra el circulo de contabilidad.cuenta.resolver.request. OJO: NO_EXISTE NO es fallo (es respuesta determinista). |
| `contabilidad.plan.importar.failed` | Par de fallo determinista: origen ausente/formato no declarable, plan vacio (422 PLAN_VACIO) o codigo ilegible en el documento. Cierra el circulo de contabilidad.plan.importar.request. |
| `contabilidad.plan.exportar.failed` | Par de fallo determinista: exportar sin project_id o con formato no declarable. Cierra el circulo de contabilidad.plan.exportar.request. |
| `contabilidad.cuenta_declarada.failed` | Par de fallo del evento de dominio contabilidad.cuenta_declarada: la emision del hecho de dominio no se completo. |
| `contabilidad.plan_importado.failed` | Par de fallo del evento de dominio contabilidad.plan_importado: la emision del hecho de dominio no se completo. |
| `contabilidad.plan_exportado.failed` | Par de fallo del evento de dominio contabilidad.plan_exportado: la emision del hecho de dominio no se completo. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> `contabilidad.cuenta.declarar.failed` cierra `contabilidad.cuenta.declarar.request`;
> `contabilidad.cuenta.resolver.failed` cierra `contabilidad.cuenta.resolver.request`;
> `contabilidad.plan.importar.failed` cierra `contabilidad.plan.importar.request`;
> `contabilidad.plan.exportar.failed` cierra `contabilidad.plan.exportar.request`.

> Nota: no está en module.json pero sí lo emite index.js — `_atender` publica
> `contabilidad.cuenta.declarar.response`, `contabilidad.cuenta.resolver.response`,
> `contabilidad.plan.importar.response` y `contabilidad.plan.exportar.response` (los pares
> response de los RPC); **NO están declaradas en `publishes`**.

> Nota: declarado en module.json pero NO emitido por index.js (patrón de la vertical: el par
> de fallo real es `<op>.failed`) — `contabilidad.cuenta_declarada.failed`,
> `contabilidad.plan_importado.failed` y `contabilidad.plan_exportado.failed` son pares de
> fallo de eventos de DOMINIO. El custodio solo publica los pares `*.failed` de sus RPC
> (`contabilidad.cuenta.declarar.failed`, etc.); los tres `.failed` de dominio no se emiten.

## Reglas de negocio

1. **Un solo escritor del plan (guard de familia)**: `_verificarEscritorUnico` exige que el
   rol (normalizado a mayúsculas) pertenezca a `FAMILIA_ESCRITURA = {DUENO, ASESOR}`.
   Cualquier otro → **`409 ERROR_DOS_ESCRITORES`** con
   `{ message:'el plan contable tiene UN escritor: solo DUENO/ASESOR declara', details:{
   escritor_vigente:<escritor vigente o 'DUENO/ASESOR'>, rol_intentado:<rol>,
   simbolico:'ERROR_DOS_ESCRITORES' } }`. El guard corre **antes** de tocar el plan.
2. **El escritor vigente se fija al primero**: si `d.escritor` es `null`, el primer rol de
   la familia que escribe lo fija (`if (!d.escritor) d.escritor = rol`). El plan tiene **un
   solo escritor por proyecto**.
3. **El plan es DECLARABLE (dato, no constante)**: `cuenta.codigo`, `cuenta.nombre` y
   `cuenta.naturaleza` vienen del payload. Naturalezas canónicas declarables:
   `NATURALEZAS = ['ACTIVO','PASIVO','PATRIMONIO_NETO','INGRESO','GASTO']`. Una naturaleza
   fuera del conjunto → **`400 INVALID_INPUT cuenta.naturaleza`**.
4. **SIN plan declarado una cuenta es NO_EXISTE (no se fabrica)**: `_resolver` devuelve
   `{ hallada:false, resultado:'NO_EXISTE', cuenta:null, plan_declarado:false }` con
   **`status 200`** — *NO_EXISTE no es un fallo, es respuesta determinista*. El módulo
   **jamás** crea una cuenta que el plan no declare.
5. **Frontera ÚNICA de formatos (B6)**: `FORMATOS_PLAN = ['csv','tsv','txt']`. El separador
   lo fija `_parsear`/`_exportar`: `tsv` → `\t`; `csv` y `txt` → `;`. Un formato fuera del
   conjunto → **`400 INVALID_INPUT origen.formato`** (importar) o **`400 INVALID_INPUT
   formato`** (exportar).
6. **No se importa vacío**: si el documento no produce ninguna cuenta legible → **`422
   PRECONDITION_FAILED`** con `{ message:'el documento del plan no trae cuentas legibles:
   no se importa vacio', details:{ formato, senal:'PLAN_VACIO' } }`.
7. **Código ilegible = frontera corta**: un código que no cumple `/^[0-9A-Za-z_.-]+$/` →
   **`422 INVALID_INPUT`** con
   `{ message:'codigo de cuenta ilegible en el documento del plan: <codigo>', details:{ codigo, formato } }`.
8. **Importar es un UPSERT por código**: cada cuenta parseada se escribe en
   `d.cuentas[codigo]`; reimportar actualiza las coincidentes y añade las nuevas. El
   formato usado queda en `d.formato`.
9. **Exportar es lectura pura**: `_exportar` compone el `DocumentoPlan` (`{formato,
   contenido, n_cuentas}`) desde el catálogo declarado; las líneas son
   `codigo;nombre;naturaleza` (separador por formato).
10. **La naturaleza inválida en importación se degrada, no rompe**: en `_parsear`, una
    naturaleza del documento que no está en `NATURALEZAS` se guarda como `null` (no se
    rechaza la línea).
11. **Validaciones deterministas**: falta `project_id` → `400 INVALID_INPUT project_id`;
    `cuenta` ausente/no objeto → `400 INVALID_INPUT cuenta`; sin código → `400 INVALID_INPUT
    cuenta.codigo`; sin nombre → `400 INVALID_INPUT cuenta.nombre`; sin código en resolver →
    `400 INVALID_INPUT codigo`; `origen` ausente → `400 INVALID_INPUT origen`; sin contenido
    → `400 INVALID_INPUT origen.contenido`. Shape: `{ status:400, error:{ code:'INVALID_INPUT',
    message:'<campo> requerido', details:{ field:<campo> } } }`.
12. **HTTP exacto**: éxito `200`; payload inválido → `400`; segundo escritor → `409`; plan
    vacío / código ilegible → `422`; excepción en `_atender` → `500 UNKNOWN_ERROR`.
13. **`NO_EXISTE` NUNCA es error**: resolver una cuenta desconocida devuelve `200`, no `404`.

## Cómo se usa (RPCs)

RPCs que responden en `contabilidad.cuenta.declarar.response`,
`contabilidad.cuenta.resolver.response`, `contabilidad.plan.importar.response` y
`contabilidad.plan.exportar.response`.

### 1. `declarar` — declarar una cuenta del plan (familia DUENO/ASESOR)

```json
{
  "project_id": "e57a318a-...",
  "rol": "ASESOR",
  "cuenta": { "codigo": "430", "nombre": "Clientes", "naturaleza": "ACTIVO", "tipo": "MAYOR" },
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "cuenta": { "codigo": "430", "nombre": "Clientes", "naturaleza": "ACTIVO", "tipo": "MAYOR", "mayor": true, "declarado_por": "ASESOR", "declarado_en": "..." },
  "n_cuentas": 1,
  "escritor": "ASESOR"
}
```
Emite `contabilidad.cuenta_declarada` (res.data + `correlation_id`).

### 2. `resolver` — ¿existe la cuenta? (pura, no inventa)

```json
{ "project_id": "e57a318a-...", "codigo": "430" }
```
Respuesta `200` (declarada):
```json
{ "project_id": "e57a318a-...", "codigo": "430", "hallada": true, "resultado": "CUENTA", "cuenta": { "codigo": "430", "nombre": "Clientes", "naturaleza": "ACTIVO" }, "plan_declarado": true }
```
Con un código que no está en el plan:
```json
{ "project_id": "e57a318a-...", "codigo": "999", "hallada": false, "resultado": "NO_EXISTE", "cuenta": null, "plan_declarado": true }
```
**`NO_EXISTE` no es fallo**: el reflejo no fabrica la cuenta.

### 3. `importar` — el plan entero desde el documento del asesor (B6)

```json
{
  "project_id": "e57a318a-...",
  "rol": "ASESOR",
  "origen": { "formato": "csv", "contenido": "430;Clientes;ACTIVO\n400;Proveedores;PASIVO" },
  "correlation_id": "abc-124"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "formato": "csv",
  "n_importadas": 2,
  "cuentas": [ { "codigo": "430", "nombre": "Clientes", "naturaleza": "ACTIVO", "tipo": null, "mayor": true, "importado_de": "csv" }, { "codigo": "400", "nombre": "Proveedores", "naturaleza": "PASIVO", "tipo": null, "mayor": true, "importado_de": "csv" } ],
  "n_cuentas": 2
}
```
Emite `contabilidad.plan_importado` (res.data + `correlation_id`).

### 4. `exportar` — el DocumentoPlan desde el catálogo (B6, lectura)

```json
{ "project_id": "e57a318a-...", "formato": "csv" }
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "formato": "csv", "documento": { "formato": "csv", "contenido": "430;Clientes;ACTIVO\n400;Proveedores;PASIVO", "n_cuentas": 2 }, "n_cuentas": 2 }
```
Emite `contabilidad.plan_exportado` (res.data + `correlation_id`).

### 5. Fallo — segundo escritor → 409

```json
{ "project_id": "e57a318a-...", "rol": "OPERADOR", "cuenta": { "codigo": "430", "nombre": "Clientes" } }
```
Respuesta `409` + `contabilidad.cuenta.declarar.failed`:
```json
{ "status": 409, "error": { "code": "ERROR_DOS_ESCRITORES", "message": "el plan contable tiene UN escritor: solo DUENO/ASESOR declara", "details": { "escritor_vigente": "DUENO/ASESOR", "rol_intentado": "OPERADOR", "simbolico": "ERROR_DOS_ESCRITORES" } } }
```

### 6. Fallo — plan vacío / código ilegible

- Importar con `contenido: ""` o sin líneas legibles → `422 PRECONDITION_FAILED` con
  `senal:'PLAN_VACIO'` + `contabilidad.plan.importar.failed`.
- Importar con un código que no casa `/^[0-9A-Za-z_.-]+$/` → `422 INVALID_INPUT` con
  `{ codigo, formato }` + `contabilidad.plan.importar.failed`.

### 7. Tools (sin RPC en module.json)

`toolDeclarar` → `_declarar`; `toolResolver` → `_resolver`; `toolImportar` → `_importar`;
`toolExportar` → `_exportar`.

## Tests

El test vive en `tests/unit/catalogo-cuentas.test.js`. Cubre:

- `declarar` con rol `ASESOR` → `200`, `n_cuentas` coherente, `escritor` fijado; emite
  `contabilidad.cuenta_declarada`.
- **Segundo escritor**: `declarar` con rol `OPERADOR` → `409 ERROR_DOS_ESCRITORES` +
  `contabilidad.cuenta.declarar.failed`.
- Naturaleza fuera de `NATURALEZAS` → `400 INVALID_INPUT cuenta.naturaleza`.
- **`resolver` no inventa**: cuenta declarada → `resultado:'CUENTA'`; cuenta desconocida →
  `resultado:'NO_EXISTE'`, `200` (no error), `plan_declarado` coherente.
- `resolver` sin `project_id`/`codigo` → `400 INVALID_INPUT` +
  `contabilidad.cuenta.resolver.failed`.
- **Importación (B6)**: `importar` con documento `csv` → `200`, `n_importadas`; documento
  vacío → `422 PLAN_VACIO`; código ilegible → `422 INVALID_INPUT`; formato no declarable →
  `400`.
- **Exportación (B6)**: `exportar` compone el `DocumentoPlan` con el separador del formato;
  formato inválido → `400 INVALID_INPUT formato`.
- `project.activated` restaura el plan vía PosPersistencia (el plan es por proyecto).

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/catalogo-cuentas
node --test tests/unit/catalogo-cuentas.test.js
```

## Notas de implementación

- Clase `CatalogoCuentas extends ModuloHibridoReflejo`; `name = 'catalogo-cuentas'`,
  `version = 'reflejo-0.1.0'`. Store en memoria `this._store` (Map project_id →
  `{ esquema:'contabilidad-catalogo-cuentas-v1', cuentas:{ <codigo>:Cuenta }, escritor,
  formato }`).
- Constantes: `FAMILIA_ESCRITURA` (Set `DUENO`,`ASESOR`), `CODE_DOS_ESCRITORES =
  'ERROR_DOS_ESCRITORES'`, `NATURALEZAS = ['ACTIVO','PASIVO','PATRIMONIO_NETO','INGRESO','GASTO']`,
  `FORMATOS_PLAN = ['csv','tsv','txt']`.
- **PosPersistencia**: `_persist = new PosPersistencia({ modulo, file:
  'catalogo-cuentas.json', dir: '/contabilidad/catalogo-cuentas', snapshot, hidratar })`.
  `onProjectActivated` → `restaurar(project_id)`; `onUnload` → `flush()` + `detener()`.
  Cada mutación marca `marcarDirty(pid)`.
- Handlers: `onDeclararRequest`/`onImportarRequest`/`onExportarRequest` publican el evento
  de dominio o el par `*.failed` según el `status`; `onResolverRequest` publica solo el par
  de fallo si `status !== 200` (`NO_EXISTE` es `200` y no publica fallo). Todos delegan en
  `_atender(e, '<op>', 'contabilidad.<op>.response', fn)`.
- Proyecciones puras: `_declarar`, `_resolver`, `_importar`, `_exportar`, `_parsear` +
  helpers `_obtenerOCrear(pid)`, `_verificarEscritorUnico(d, rol)`, `_normCodigo(codigo)`.
  `_invalid`/`_errorResponse` vienen de la base.
- Tools: `toolDeclarar`, `toolResolver`, `toolImportar`, `toolExportar`.
- DEP hacia delante: `contabilidad.cuenta_declarada` lo consume `escritor-diario` (B2) para
  codificar y `resolucion-contrapartida` (A6.1) para proponer cuenta. DEP por evento: el
  criterio del plan se cierra con K9 `cola-declaraciones-criterio`.
