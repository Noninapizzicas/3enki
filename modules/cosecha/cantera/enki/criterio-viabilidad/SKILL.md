---
name: criterio-viabilidad
description: >
  Skill FULL del módulo CUSTODIO CON PERSISTENCIA `criterio-viabilidad` (C2) de la vertical
  nichos (Radar de Nichos). Es la PIEZA CENTRAL del eslabón limitante (embudo de validación):
  guarda el CRITERIO/UMBRAL DE VIABILIDAD declarable que decide qué nicho es viable
  (umbral_ingresos, minimos_demanda, disposicion_a_pagar, tipo). Un solo escritor del store
  (el DUEÑO declara; el bucle C7 recalibra en caliente) y el veredicto (C3) lo consulta.
  Úsala para operar, depurar o extender el criterio/umbral, o para entender su contrato de
  eventos, PosPersistencia y reglas de negocio.
when-to-use: >
  - Cuando necesites leer el criterio de viabilidad vigente (RPC nichos.criterio.leer.request).
  - Cuando el DUEÑO deba declarar el umbral, o cuando depures por qué una declaración fue
    rechazada (rol != DUEÑO → 403, payload inválido → 400) o un recalibrado (delta inválido).
  - Cuando entiendas el patrón CUSTODIO con PosPersistencia (project.activated + snapshot/
    hidratar + storage /prisma/nichos/criterio-viabilidad.json) y el bucle C7->C2 en caliente.
  - Cuando vayas a escribir/ampliar el test unitario del custodio.
tags: [enki, modulo, custodio, persistencia, nichos, radar, eslabon-limitante, validacion, umbral, proyecto-3d]
---

# criterio-viabilidad — CUSTODIO CON PERSISTENCIA (C2) del ESLABÓN LIMITANTE del Radar

## Qué hace el módulo

`criterio-viabilidad` es la **PIEZA CENTRAL del eslabón limitante** (embudo de validación).
Guarda en un store por proyecto el **CRITERIO/UMBRAL DE VIABILIDAD declarable** que decide
qué nicho es viable. Almacena por proyecto:

- `umbral_ingresos` — base `50-300 EUR/semana` según tipo (`[ABIERTO]`, permite cualquier `>0`).
- `minimos_demanda` — `numero_busquedas` y `contactos_semana` por semana (tolera que solo se
  exija UNO de los dos).
- `disposicion_a_pagar` — EUR/venta.
- `tipo` — segmento de viabilidad: `marginal` | `estandar` | `premium`.

Es un **CUSTODIO real** (no un reflejo stateless): **un solo escritor del store**. El **DUEÑO**
declara el umbral (guard `Rol=DUEÑO` vía K3; un `second-writer` es rechazado). Además el bucle
**C7→C2** recalibra en caliente consumiendo `nichos.umbral.recalibrado` (publicado por
`reglas-aprendidas` tras un COBRÓ/SANGRA/NEUTRO): el delta refina el umbral y el siguiente lote
de C1/C3 evalúa contra el umbral refinado.

**Persiste por proyecto con PosPersistencia** (`_shared/pos-persistencia`, storage
`/prisma/nichos/criterio-viabilidad.json`), **restaura en `project.activated`** y vuelca en
`onUnload`. La lectura (`_leer`/`leerVigente`) **no muta**; la escritura valida y guarda.

**REGLA DE DOMINIO clave**: el **corte DURO "no viable no pasa" vive aquí** (umbral vigente) +
C6 (corte-temprano), **NUNCA en el agente de veredicto** (C3). Ese corte se aplica leyendo este
umbral vigente antes de evaluar.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `nichos.criterio.leer.request` | `onLeerRequest` | RPC custodio: {project_id} → {project_id, criterio}. Lee el criterio de viabilidad vigente del proyecto (umbral_ingresos, minimos_demanda, disposicion_a_pagar, tipo, recalibrado_por). La lectura no muta. Lo consume el veredicto de viabilidad (C3) antes de evaluar. |
| `nichos.criterio.declarar.request` | `onDeclararRequest` | RPC custodio: {project_id, rol:'DUEÑO', criterio:{...}} → {project_id, criterio, declarado}. Guard Rol=DUEÑO (second-writer rechazado; canal K3). Persiste el umbral, publica nichos.criterio.declarado y responde por nichos.criterio.declarar.response. Si no es DUEÑO o el payload es inválido → nichos.criterio.declarar.failed. |
| `nichos.umbral.recalibrado` | `onUmbralRecalibrado` | Fire-and-forget (bucle C7->C2): reglas-aprendidas publica {project_id, delta, resultado_real} tras un COBRÓ/SANGRA/NEUTRO. Recalibra el umbral del proyecto en caliente (refina umbral_ingresos/minimos con el delta), publica nichos.criterio.recalibrado y, si el delta es inválido, nichos.criterio.recalibrar.failed. Bucle de sistema autorizado; el siguiente lote evalúa contra el umbral refinado. |
| `project.activated` | `onProjectActivated` | Restaura el criterio de viabilidad del proyecto activado desde el storage (PosPersistencia). |

### Publishes

| Evento | Descripción |
|---|---|
| `nichos.criterio.declarado` | Fire-and-forget (C2): el DUEÑO declaró el criterio/umbral de viabilidad → {project_id, criterio, declarado:true}. Lo consume el veredicto (C3) y el resto del embudo para aplicar el corte de viabilidad vigente. |
| `nichos.criterio.declarar.failed` | Par de fallo determinista (C2): escritura rechazada (rol != DUEÑO) o payload inválido → {status, code, message, data}. Cierra el círculo de nichos.criterio.declarar.request. |
| `nichos.criterio.recalibrado` | Fire-and-forget (C2): el bucle C7 recalibró el umbral en caliente → {project_id, criterio, recalibrado:true, delta}. El siguiente lote de C1/C3 evalúa contra el umbral refinado. |
| `nichos.criterio.recalibrar.failed` | Par de fallo determinista (C2): recalibración rechazada (delta inválido) → {status, code, message, data}. Cierra el círculo de nichos.umbral.recalibrado. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico. Dos pares aquí:
> `nichos.criterio.declarar.failed` (declaración del DUEÑO) y `nichos.criterio.recalibrar.failed`
> (recalibrado del bucle C7).

> **Nota: no está en module.json pero sí lo emite `_atender` (modulo-hibrido-reflejo, línea 93)**:
> en TODO RPC request/response, ante una excepción inesperada en la proyección, se responde con
> `{ status: 500, code: 'UNKNOWN_ERROR', mensaje: err.message }` por el canal de la response.

## Reglas de negocio

1. **Un solo escritor del store — el DUEÑO**: `_declarar` exige `rol === 'DUEÑO'`. Si no →
   **`403 PERMISSION_DENIED`** + `nichos.criterio.declarar.failed` con
   `{ status:403, code:'PERMISSION_DENIED', mensaje:'solo el DUEÑO puede declarar el criterio de viabilidad', data:{ rol_esperado:'DUEÑO', rol_recibido:<rol> } }`.
2. **El bucle C7 recalibra en caliente (escritor del sistema)**: `_recalibrar` consume el delta
   y refina `umbral_ingresos`/`minimos_demanda` (suma/resta, **nunca baja de 0**:
   `Math.max(0, base + ajuste)`). `recalibrado_por: 'SISTEMA_C7'`. El ajuste debe ser finito y
   ≠ 0, o `400 INVALID_INPUT`.
3. **Corte DURO del eslabón**: el umbral vigente (aquí) marca el corte "no viable no pasa";
   el veredicto (C3) y corte-temprano (C6) lo aplican, el agente NO. `_leer` no muta.
4. **Payload sin `project_id`** → **`400 INVALID_INPUT`** + failed con
   `{ status:400, code:'INVALID_INPUT', mensaje:'project_id requerido', data:{ field:'project_id' } }`.
5. **Validación de campos declarables** (todo lo demás → `400 INVALID_INPUT` + failed con el
   campo en `mensaje`/`data.field`): `criterio` debe ser objeto; `umbral_ingresos` y
   `disposicion_a_pagar` deben ser número estrictamente `>0` (`numPos`); `minimos_demanda` debe
   tener **al menos uno** de `numero_busquedas`/`contactos_semana` `>0` (ambos null =
   `criterio.minimos_demanda` inválido); `tipo` ∈ {marginal, estandar, premium} (minúscula).
6. **Merge conservador**: la declaración mezcla sobre el molde `criterioVacio()` y hereda del
   criterio previo los campos no declarados; marca `recalibrado_por: 'DUEÑO'`,
   `declarado_por: 'DUEÑO'` y `updated_at` ISO.
7. **Tipo [ABIERTO]**: el rango base es `50-300 EUR/semana` (`UMBRAL_MIN_EUR/UMBRAL_MAX_EUR`),
   pero es un CRITERIO no una norma dura: se permite declarar cualquier número `>0`.
8. **`delta` inválido en recalibrado** → `400 INVALID_INPUT` + `nichos.criterio.recalibrar.failed`:
   si `delta` no es objeto, o carece de un ajuste numérico finito
   (`(delta.umbral_ingresos ?? delta.minimos_demanda)`), o `delta.umbral_ingresos === 0`,
   o un `minimos_demanda.numero_busquedas`/`contactos_semana` no es finito.
9. **Sin `project_id` en el fire-and-forget `onUmbralRecalibrado`** → se ignora (`return null`),
   no se publica fallo (el que publica el delta es `reglas-aprendidas`).

## Cómo se usa (RPCs)

RPCs que responden en `nichos.criterio.leer.response` y `nichos.criterio.declarar.response`:

### 1. `leer` — leer el criterio vigente (no muta)

```json
{ "project_id": "e57a318a-..." }
```
Respuesta `200`:
```json
{
  "status": 200,
  "data": {
    "project_id": "e57a318a-...",
    "criterio": {
      "esquema": "nichos-criterio-viabilidad-v1",
      "umbral_ingresos": 150,
      "minimos_demanda": { "numero_busquedas": 30, "contactos_semana": 10 },
      "disposicion_a_pagar": 25,
      "tipo": "estandar",
      "recalibrado_por": "DUEÑO",
      "updated_at": "2026-09-25T10:00:00.000Z",
      "declarado_por": "DUEÑO"
    }
  }
}
```
Lo consume el veredicto (C3) antes de evaluar. Si no había criterio aún → crea el molde vacío
(`_obtenerOCrear` marcando dirty) y lo devuelve.

### 2. `declarar` — el DUEÑO declara el umbral

```json
{
  "project_id": "e57a318a-...",
  "rol": "DUEÑO",
  "criterio": {
    "umbral_ingresos": 200,
    "minimos_demanda": { "numero_busquedas": 40 },
    "disposicion_a_pagar": 20,
    "tipo": "premium"
  }
}
```
Respuesta `200` + publica `nichos.criterio.declarado`:
```json
{
  "status": 200,
  "data": {
    "project_id": "e57a318a-...",
    "criterio": {
      "esquema": "nichos-criterio-viabilidad-v1",
      "umbral_ingresos": 200,
      "minimos_demanda": { "numero_busquedas": 40, "contactos_semana": null },
      "disposicion_a_pagar": 20,
      "tipo": "premium",
      "recalibrado_por": "DUEÑO",
      "updated_at": "2026-09-25T10:00:00.000Z",
      "declarado_por": "DUEÑO"
    },
    "declarado": true
  }
}
```

### Fallo — escritura rechazada (rol != DUEÑO)

```json
{ "project_id": "e57a318a-...", "rol": "EDITOR", "criterio": { "umbral_ingresos": 100 } }
```
Respuesta `403` + `nichos.criterio.declarar.failed`:
```json
{ "status": 403, "code": "PERMISSION_DENIED", "mensaje": "solo el DUEÑO puede declarar el criterio de viabilidad", "data": { "rol_esperado": "DUEÑO", "rol_recibido": "EDITOR" } }
```

### Fallo — payload inválido (campo)

```json
{ "project_id": "e57a318a-...", "rol": "DUEÑO", "criterio": { "tipo": "lujo" } }
```
Respuesta `400` + `nichos.criterio.declarar.failed`:
```json
{ "status": 400, "code": "INVALID_INPUT", "mensaje": "criterio.tipo requerido", "data": { "field": "criterio.tipo" } }
```

### Fire-and-forget — bucle C7 recalibra en caliente

El módulo consume `nichos.umbral.recalibrado` (no lo expone como RPC):
```json
{
  "project_id": "e57a318a-...",
  "delta": { "umbral_ingresos": 25, "minimos_demanda": { "numero_busquedas": 5 } },
  "resultado_real": "COBRO"
}
```
Respuesta pública (publica `nichos.criterio.recalibrado`):
```json
{
  "project_id": "e57a318a-...",
  "criterio": {
    "esquema": "nichos-criterio-viabilidad-v1",
    "umbral_ingresos": 225,
    "minimos_demanda": { "numero_busquedas": 45, "contactos_semana": 10 },
    "disposicion_a_pagar": 20,
    "tipo": "premium",
    "recalibrado_por": "SISTEMA_C7",
    "updated_at": "2026-09-25T12:00:00.000Z",
    "declarado_por": "DUEÑO"
  },
  "recalibrado": true,
  "delta": { "umbral_ingresos": 25, "minimos_demanda": { "numero_busquedas": 5 } }
}
```
Si el delta llega inválido (p.ej. `{ "delta": {} }`) → publica `nichos.criterio.recalibrar.failed`
con `{ status:400, code:'INVALID_INPUT', mensaje:'delta requerido', data:{ field:'delta' } }`.

## Tests

El test vive en `tests/unit/criterio-viabilidad.test.js`. Cubre:

- `leer` con `project_id` → `200` + criterio vigente; sin `project_id` → `400 INVALID_INPUT`.
- `declarar` con rol DUEÑO → `200`, persiste y publica `nichos.criterio.declarado`.
- `declarar` con rol != DUEÑO → `403 PERMISSION_DENIED` + `nichos.criterio.declarar.failed`.
- `declarar` con campo inválido (umbral ≤ 0, minimos sin mínimo, tipo fuera del set) → `400 INVALID_INPUT`.
- `_recalibrar` con delta válido → `200`, refina el umbral (sin bajar de 0) y publica
  `nichos.criterio.recalibrado`; con delta inválido → `400` + `nichos.criterio.recalibrar.failed`.
- PosPersistencia: `project.activated` restaura el criterio desde el storage; `onUnload` vuelca.

Para ejecutarlo:

```bash
cd /home/admin/3enki/modules/nichos/criterio-viabilidad
node tests/unit/criterio-viabilidad.test.js
```

## Notas de implementación

- Clase `CriterioViabilidad extends ModuloHibridoReflejo`; `name = 'criterio-viabilidad'`,
  `version = 'reflejo-0.1.0'`. Store en memoria: `this._criterios = new Map()` (project_id →
  criterio).
- **PosPersistencia**: `this._persist = new PosPersistencia({ modulo:this, file:'criterio-viabilidad.json',
  dir:'/prisma/nichos', snapshot, hidratar })`. `onProjectActivated` llama `this._persist.restaurar(d.project_id)`;
  `onUnload` hace `flush()` + `detener()`. `_obtenerOCrear`/`_declarar`/`_recalibrar` marcan `marcarDirty(pid)`.
- **Escritura de dominio**: `onDeclararRequest` publica `nichos.criterio.declarado` (criterio +
  `declarado:true` + `correlation_id`) o `nichos.criterio.declarar.failed`. `onUmbralRecalibrado`
  (fire-and-forget) publica `nichos.criterio.recalibrado` o `nichos.criterio.recalibrar.failed`.
- `_leer` delega vía `_atender(e,'leer','nichos.criterio.leer.response', d => this._leer(d))`.
- `leerVigente(pid)` es el alias semántico que usa el veredicto (C3): devuelve el umbral vigente
  o un `criterioVacio()` si no existe.
- **Corte DURO del eslabón**: la regla "no viable no pasa" vive aquí y en C6 (corte-temprano),
  nunca en el agente de veredicto. DEP: la consume `veredicto-viabilidad` (C3); le alimenta
  `reglas-aprendidas` vía `nichos.umbral.recalibrado` (C7).
