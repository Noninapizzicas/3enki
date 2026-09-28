---
name: aislamiento-negocio
description: >
  Skill FULL del módulo CUSTODIO `aislamiento-negocio` de la vertical contabilidad
  de Enki (I4, hoja del plan). Multi-negocio SIN FUGA (invariante 13 del dominio):
  un dueño por parcela; ningún cálculo de un negocio lee ni escribe la parcela de
  otro salvo por CONSOLIDACIÓN DECLARADA. Escribe aquí el rol SISTEMA y solo él;
  re-registrar la misma parcela con otro dueño o tocar la parcela de otro negocio
  se rechaza deterministamente con ERROR_FUGA_ENTRE_NEGOCIOS (409). Persiste por
  proyecto vía PosPersistencia. Úsala para operar, depurar o extender el custodio,
  o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites registrar la parcela de un negocio con su dueño
    (RPC contabilidad.parcela_negocio.registrar.request) o escribir en ella
    (RPC contabilidad.parcela_negocio.escribir.request).
  - Cuando necesites saber la parcela de un negocio (toolParcela/_parcela, sin RPC).
  - Cuando depures una fuga entre negocios (409 ERROR_FUGA_ENTRE_NEGOCIOS al
    re-registrar con otro dueño o al tocar la parcela de otro negocio), un
    PERMISSION_DENIED (rol != SISTEMA) o un 404 (parcela no registrada).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), la
    consolidación declarada como única excepción y la persistencia por proyecto.
  - Cuando vayas a escribir/ampliar el test unitario del custodio aislamiento-negocio.
tags: [enki, modulo, custodio, persistencia, contabilidad, aislamiento-negocio, parcela, multi-negocio]
---

# aislamiento-negocio — CUSTODIO del multi-negocio sin fuga

## Qué hace el módulo

`aislamiento-negocio` es un **CUSTODIO CON PERSISTENCIA** (I4, hoja del plan): el
dueño del store de **parcelas de negocio**, por proyecto. Materializa la
**invariante 13 del dominio**: **multi-negocio SIN FUGA** — *un dueño por parcela*.
Ningún cálculo de un negocio **lee ni escribe** la parcela de otro salvo por
**CONSOLIDACIÓN DECLARADA** (la única excepción, y hay que declararla).

La clave conceptual: **la capa de proyecto (PosPersistencia) NO sustituye a este
aislamiento**. Dos negocios pueden vivir en el **mismo `project_id`** y **siguen
sin verse**: el aislamiento es por **negocio dentro del proyecto**, no por
proyecto.

Escribe aquí **el rol `SISTEMA` y solo él** (guard en `_registrar`); los demás
procesos son lectores. `_parcela` es **proyección PURA de lectura** (no muta) y
`_escribir` es el **guard de aislamiento**: si un cambio pretende tocar la parcela
de otro negocio sin consolidación declarada → **409 `ERROR_FUGA_ENTRE_NEGOCIOS`**.

Persiste por proyecto con **PosPersistencia** (storage
`/contabilidad/aislamiento-negocio/aislamiento-negocio.json`), restaura en
`project.activated` y vuelca en `onUnload`. Emite
`contabilidad.parcela_negocio_registrada` en éxito y sus pares deterministas de
fallo. La dependencia con `single-writer` (M2) es **por EVENTO, nunca por
`require` cruzado**.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.parcela_negocio.registrar.request` | `onRegistrarRequest` | RPC custodio: {project_id, rol:'SISTEMA', negocio, dueno, consolidacion?} → {project_id, negocio, parcela, reusado}. Un solo escritor: solo SISTEMA gobierna las parcelas (second-writer rechazado con PERMISSION_DENIED). Re-registrar la misma parcela con otro dueno → ERROR_FUGA_ENTRE_NEGOCIOS (409). Publica contabilidad.parcela_negocio_registrada y responde por contabilidad.parcela_negocio.registrar.response; si el rol o el payload son invalidos → contabilidad.parcela_negocio.registrar.failed. |
| `contabilidad.parcela_negocio.escribir.request` | `onEscribirRequest` | RPC custodio: {project_id, rol, negocio, negocio_destino?, cambio?} → {project_id, negocio, rol, escrito, cambio, via_consolidacion} \| ERROR_FUGA_ENTRE_NEGOCIOS. Guard de aislamiento: si el cambio pretende tocar la parcela de OTRO negocio sin consolidacion declarada → 409 ERROR_FUGA_ENTRE_NEGOCIOS; parcela no registrada → 404. Responde por contabilidad.parcela_negocio.escribir.response; si hay fuga o el payload es invalido → contabilidad.parcela_negocio.escribir.failed. |
| `project.activated` | `onProjectActivated` | Restaura las parcelas de negocio del proyecto activado desde el storage (PosPersistencia): el aislamiento es POR PROYECTO (y por negocio dentro de el). |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.parcela_negocio_registrada` | Fire-and-forget (I4): la parcela de un negocio quedo registrada con su dueno (y su consolidacion declarada) → {project_id, negocio, parcela, reusado}. Senal de que el negocio ya tiene su espacio aislado. |
| `contabilidad.parcela_negocio.registrar.failed` | Par de fallo determinista: registrar rechazado (rol != SISTEMA), payload invalido o parcela ya con otro dueno (ERROR_FUGA_ENTRE_NEGOCIOS). Cierra el circulo de contabilidad.parcela_negocio.registrar.request. |
| `contabilidad.parcela_negocio.escribir.failed` | Par de fallo determinista: escribir con fuga entre negocios (ERROR_FUGA_ENTRE_NEGOCIOS), parcela no registrada (404) o payload invalido. Cierra el circulo de contabilidad.parcela_negocio.escribir.request. |
| `contabilidad.parcela_negocio_registrada.failed` | Par de fallo del evento de dominio contabilidad.parcela_negocio_registrada: la emision del hecho de dominio no se completo. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `contabilidad.parcela_negocio.registrar.failed` cierra
> `contabilidad.parcela_negocio.registrar.request` y
> `contabilidad.parcela_negocio.escribir.failed` cierra
> `contabilidad.parcela_negocio.escribir.request`.

> Nota: no está en module.json pero sí lo emite index.js — `onRegistrarRequest`
> publica `contabilidad.parcela_negocio_registrada` (éxito) /
> `contabilidad.parcela_negocio.registrar.failed` (fallo), y `onEscribirRequest`
> publica `contabilidad.parcela_negocio.escribir.failed` cuando `res.status !== 200`.
> Ambas dentro del handler, además de la response de `_atender`.

> Nota: `contabilidad.parcela_negocio.registrar.response` y
> `contabilidad.parcela_negocio.escribir.response` las emite `_atender` y **NO están
> declaradas en `publishes`**.

> Nota: **`contabilidad.parcela_negocio_registrada.failed` está declarada en
> `publishes` pero no se emite en `index.js`** — el custodio solo publica los pares
> de fallo de sus RPC, no el par del evento de dominio.

> Nota: **`_parcela` (tools `toolParcela`) es una proyección pura + Tool pero NO
> tiene evento RPC en `module.json`**: se invoca como tool o desde el sitio de
> despliegue (p. ej. antes de escribir en una parcela).

## Reglas de negocio

1. **Un solo escritor de las parcelas (guard de rol)**: `_registrar` exige
   `rol === 'SISTEMA'` (constante `ROL_ESCRITOR`). Cualquier otro → **`403
   PERMISSION_DENIED`** con
   `{ status:403, error:{ code:'PERMISSION_DENIED', message:'solo SISTEMA gobierna las parcelas de negocio', details:{ rol_esperado:'SISTEMA', rol_recibido:<rol> } } }`.
   Second-writer rechazado.
2. **Un dueño por parcela (invariante 13)**: re-registrar la MISMA parcela con un
   `dueno` **distinto** al vigente → **`409 ERROR_FUGA_ENTRE_NEGOCIOS`** con
   `{ negocio, dueno_vigente, dueno_intentado, simbolico:'ERROR_FUGA_ENTRE_NEGOCIOS' }`
   (constante `CODE_FUGA`). Re-registrar con el **mismo** dueño es idempotente
   (`reusado:true`, sin rechazo).
3. **Guard de aislamiento al escribir**: `_escribir` exige `rol ∈ {SISTEMA,
   DUENO, JEFE}` (constantes `ROL_ESCRITOR` + `ROLES_CONSOLIDACION`); otro rol →
   `403 PERMISSION_DENIED`. Si `negocio_destino` **difiere** de `negocio` y ese
   destino **no** está en `parcela.consolidacion_declarada` → **`409
   ERROR_FUGA_ENTRE_NEGOCIOS`** con
   `{ negocio, negocio_destino, consolidacion_declarada, simbolico:'ERROR_FUGA_ENTRE_NEGOCIOS' }`.
4. **La consolidación declarada es la ÚNICA excepción**: `consolidacion` es un
   array de negocios con los que se permite tocar la parcela cruzada; se normaliza
   con `Set` (dedup) y se guarda como `consolidacion_declarada`. Sin ella, **no hay
   excepción**: un negocio **NO ve** a otro.
5. **Parcela no registrada → 404**: `_parcela` y `_escribir` de un negocio sin
   parcela devuelven `404 RESOURCE_NOT_FOUND` con
   `{ message:'el negocio <negocio> no tiene parcela registrada', details:{ negocio } }`.
6. **La lectura no muta**: `_parcela` es proyección PURA de lectura; solo
   `_registrar` y `_escribir` marcan `marcarDirty(pid)` y persisten.
7. **El aislamiento es por NEGOCIO dentro del proyecto**: se guarda en
   `store[pid].parcelas[<negocio>]`; el mismo negocio en otro `project_id` tiene su
   propia parcela y su propio dueño. La capa de proyecto **no** los mezcla.
8. **Validaciones deterministas**: falta `project_id` → `400 INVALID_INPUT
   project_id`; falta `negocio` (o `id_negocio`) → `400 INVALID_INPUT negocio`.
   Shape: `{ status:400, error:{ code:'INVALID_INPUT', message:'<campo> requerido', details:{ field:<campo> } } }`.
9. **La ley entra como DATO**: qué negocio, qué dueño y qué consolidación son
   **declarables** por SISTEMA, nunca cableados en el código del cerrojo.
10. **HTTP exacto**: éxito `200`; payload inválido → `400`; rol inválido → `403`;
    parcela no registrada → `404`; fuga entre negocios → `409`; excepción en
    `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPCs que responden en `contabilidad.parcela_negocio.registrar.response` y
`contabilidad.parcela_negocio.escribir.response`.

### 1. `registrar` — registrar la parcela de un negocio (solo SISTEMA)

```json
{
  "project_id": "e57a318a-...",
  "rol": "SISTEMA",
  "negocio": "PANADERIA",
  "dueno": "DUENO",
  "consolidacion": ["GRUPO_HOLDING"],
  "correlation_id": "abc-123"
}
```
Respuesta `200` (primera vez):
```json
{
  "project_id": "e57a318a-...",
  "negocio": "PANADERIA",
  "parcela": {
    "negocio": "PANADERIA",
    "dueno": "DUENO",
    "consolidacion_declarada": ["GRUPO_HOLDING"],
    "registrado_por": "SISTEMA",
    "registrado_en": "2026-09-28T..."
  },
  "reusado": false
}
```
Emite `contabilidad.parcela_negocio_registrada` (res.data + `correlation_id`).

### 2. `escribir` — escribir en la parcela (guard de aislamiento)

```json
{ "project_id": "e57a318a-...", "rol": "SISTEMA", "negocio": "PANADERIA", "cambio": { "saldo": 100 } }
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "negocio": "PANADERIA",
  "rol": "SISTEMA",
  "escrito": true,
  "cambio": { "saldo": 100 },
  "via_consolidacion": false
}
```

### 3. Fallo — fuga entre negocios (409)

Tocar la parcela de otro negocio sin consolidación declarada:
```json
{ "project_id": "e57a318a-...", "rol": "SISTEMA", "negocio": "PANADERIA", "negocio_destino": "PANADERIA_2", "cambio": { "saldo": 1 } }
```
Respuesta `409` + `contabilidad.parcela_negocio.escribir.failed`:
```json
{ "status": 409, "error": { "code": "ERROR_FUGA_ENTRE_NEGOCIOS", "message": "el negocio PANADERIA no puede tocar la parcela de PANADERIA_2", "details": { "negocio": "PANADERIA", "negocio_destino": "PANADERIA_2", "consolidacion_declarada": ["GRUPO_HOLDING"], "simbolico": "ERROR_FUGA_ENTRE_NEGOCIOS" } } }
```

### 4. Fallo — re-registrar con otro dueño

```json
{ "project_id": "e57a318a-...", "rol": "SISTEMA", "negocio": "PANADERIA", "dueno": "JEFE" }
```
Respuesta `409` + `contabilidad.parcela_negocio.registrar.failed`:
```json
{ "status": 409, "error": { "code": "ERROR_FUGA_ENTRE_NEGOCIOS", "message": "la parcela del negocio PANADERIA ya tiene dueno", "details": { "negocio": "PANADERIA", "dueno_vigente": "DUENO", "dueno_intentado": "JEFE", "simbolico": "ERROR_FUGA_ENTRE_NEGOCIOS" } } }
```

### 5. Fallo — rol no-SISTEMA al registrar

`{ "rol": "OPERADOR", ... }` → `403 PERMISSION_DENIED` +
`contabilidad.parcela_negocio.registrar.failed`:
```json
{ "status": 403, "error": { "code": "PERMISSION_DENIED", "message": "solo SISTEMA gobierna las parcelas de negocio", "details": { "rol_esperado": "SISTEMA", "rol_recibido": "OPERADOR" } } }
```

## Tests

El test vive en `tests/unit/aislamiento-negocio.test.js`. Cubre:

- `registrar` con `rol:'SISTEMA'` y `negocio` válido → `200`, emite
  `contabilidad.parcela_negocio_registrada`; la segunda vez con el mismo dueño
  `reusado:true`.
- `registrar` con otro rol → `403 PERMISSION_DENIED` + par de fallo.
- `registrar` la misma parcela con **otro dueño** → `409 ERROR_FUGA_ENTRE_NEGOCIOS`.
- `escribir` sobre la propia parcela → `200 {escrito:true, via_consolidacion:false}`.
- `escribir` con `negocio_destino` sin consolidación → `409 ERROR_FUGA_ENTRE_NEGOCIOS`;
  con `negocio_destino` **en** `consolidacion_declarada` → `200 {via_consolidacion:true}`.
- `escribir`/`_parcela` de un negocio no registrado → `404`.
- `project.activated` restaura las parcelas vía PosPersistencia.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/aislamiento-negocio
node --test tests/unit/aislamiento-negocio.test.js
```

## Notas de implementación

- Clase `AislamientoNegocio extends ModuloHibridoReflejo`; `name =
  'aislamiento-negocio'`, `version = 'reflejo-0.1.0'`. Store en memoria
  `this._store` (Map `project_id` → `{ esquema:'contabilidad-aislamiento-negocio-v1', parcelas:{}, updated_at }`).
- Constantes: `ROL_ESCRITOR = 'SISTEMA'`, `ROLES_CONSOLIDACION` (Set `DUENO`,
  `JEFE`, `SISTEMA`), `CODE_FUGA = 'ERROR_FUGA_ENTRE_NEGOCIOS'`.
- **PosPersistencia**: `_persist = new PosPersistencia({ modulo, file:
  'aislamiento-negocio.json', dir: '/contabilidad/aislamiento-negocio', snapshot,
  hidratar })`. `onProjectActivated` → `restaurar(project_id)`; `onUnload` →
  `flush()` + `detener()`. Cada mutación marca `marcarDirty(pid)`.
- `onRegistrarRequest`/`onEscribirRequest` delegan en
  `_atender(e, '<op>', 'contabilidad.parcela_negocio.<op>.response', fn)`; los
  handlers emiten el evento de dominio (`contabilidad.parcela_negocio_registrada`)
  o el par determinista (`...registrar.failed` / `...escribir.failed`) dentro de la
  proyección, propagando `correlation_id`.
- Proyecciones puras: `_registrar` (escritura + guard + un dueño por parcela),
  `_parcela` (lectura; no muta) y `_escribir` (guard de aislamiento; consolidación
  declarada como excepción). Helpers `_obtenerOCrear(pid)`; `_invalid`/
  `_errorResponse` vienen de la base.
- Tools: `toolRegistrar` → `_registrar`, `toolParcela` → `_parcela`,
  `toolEscribir` → `_escribir`.
- DEP hacia delante: el aislamiento entre negocios. DEP por evento con
  `single-writer` (M2) — sin `require` cruzado. **`acceso-nomina` (G7) es el eje
  persona↔persona DENTRO del negocio, distinto de este** (entre negocios).
