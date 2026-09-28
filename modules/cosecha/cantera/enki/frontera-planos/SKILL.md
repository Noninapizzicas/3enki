---
name: frontera-planos
description: >
  Skill FULL del módulo REFLEJO `frontera-planos` de la vertical contabilidad de Enki
  (M1, hoja del plan). CERROJO 1 · anti-realimentación: contabilidad es la OBSERVADORA
  que no produce hechos de negocio. El sistema emite CÁLCULOS (su espacio es
  `contabilidad.*`); si un contrato pretende ser un HECHO de negocio (vertical
  productora VENTA/COBRO/PAGO/COMPRA/CONSUMO/CIERRE_JORNADA/RECTIFICATIVO/NOMINA, o
  marcado `es_hecho:true`, o fuera del prefijo `contabilidad.*`) → RECHAZO determinista
  con ERROR_FUGA (409). Cero realimentación de la operación (invariante 5 del dominio).
  Juicio MECÁNICO sobre el prefijo del contrato: misma entrada → mismo veredicto. Es
  stateless (sin PosPersistencia ni project.activated). Úsala para operar, depurar o
  extender el reflejo, o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites verificar que una emisión es un CÁLCULO y no un hecho de negocio
    (RPC contabilidad.frontera_planos.verificar.request).
  - Cuando depures por qué una emisión se rechaza (409 ERROR_FUGA si la vertical es
    productora, si `es_hecho:true` o si el contrato no empieza por `contabilidad.`), o
    por qué el payload es inválido (400).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), el cerrojo
    anti-realimentación y el juicio determinista sobre el prefijo del contrato.
  - Cuando vayas a escribir/ampliar el test unitario del reflejo frontera-planos.
tags: [enki, modulo, reflejo, contabilidad, frontera-planos, cerrojo, fuga, realimentacion]
---

# frontera-planos — REFLEJO del cerrojo anti-realimentación

## Qué hace el módulo

`frontera-planos` es un **REFLEJO STATELESS** (M1, hoja del plan): **CERROJO 1 ·
anti-realimentación**. La identidad del dominio contable es que **contabilidad es la
OBSERVADORA que no produce hechos de negocio** (invariante 5: cero realimentación de la
operación). Por eso el sistema **emite CÁLCULOS** (su espacio de planos es
**`contabilidad.*`**), y si un contrato pretende ser un **HECHO de negocio** —de una
vertical productora, marcado `es_hecho:true`, o simplemente **fuera** del prefijo
`contabilidad.*`— se **RECHAZA** de forma determinista con **`ERROR_FUGA`** (409).

El juicio es **MECÁNICO sobre el prefijo del contrato emitido**: **misma entrada → mismo
veredicto**. No hay ambigüedad ni juicio fuzzy: es pura proyección.

Es **stateless**: sin PosPersistencia ni `project.activated` — no guarda estado; cada
op **entra objeto, sale objeto**.

> **NO REUTILIZA**: cerrojo propio del dominio contable (la identidad "observadora que
> no produce hechos" se verifica aquí; ningún módulo del inventario la comprueba).

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.frontera_planos.verificar.request` | `onVerificarRequest` | RPC reflejo: {project_id, emision:{contrato, vertical?, es_hecho?}} → {project_id, contrato, plano:'CALCULO', verificado, fuga:false}. Proyeccion DETERMINISTA: acepta solo contratos del espacio de CALCULOS (prefijo contabilidad.*) que no pretendan ser un HECHO de negocio de una vertical productora (ERROR_FUGA, 409). Publica contabilidad.frontera_planos_verificada y responde por contabilidad.frontera_planos.verificar.response; si hay fuga o el payload es invalido → contabilidad.frontera_planos.verificar.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.frontera_planos_verificada` | Fire-and-forget (M1): una emision paso la frontera de planos — es un CALCULO, no un hecho de negocio → {project_id, contrato, plano, verificado, fuga:false}. Lo consume la cadena de emision (historial-proceso-contable P2 para el rastro). |
| `contabilidad.frontera_planos.verificar.failed` | Par de fallo determinista (ERROR_FUGA, 409): la emision pretende ser un hecho de negocio, o su contrato no pertenece al espacio de calculos contabilidad.*, o el payload es invalido. Cierra el circulo de contabilidad.frontera_planos.verificar.request. |
| `contabilidad.frontera_planos_verificada.failed` | Par de fallo del evento de dominio contabilidad.frontera_planos_verificada: la emision del hecho de dominio no se completo. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> `contabilidad.frontera_planos.verificar.failed` cierra
> `contabilidad.frontera_planos.verificar.request`.

> Nota: no está en module.json pero sí lo emite index.js — `_atender` publica
> `contabilidad.frontera_planos.verificar.response` (el par response del RPC); no está
> declarada en `publishes`.

## Reglas de negocio

1. **Espacio de planos = CÁLCULOS**: el contrato emitido debe pertenecer al espacio
   `PREFIJO_CALCULOS = 'contabilidad.'`. Si no empieza por ese prefijo →
   **`409 ERROR_FUGA`** con `{ contrato, prefijo_exigido:'contabilidad.', simbolico:'ERROR_FUGA' }`.
2. **Vertical productora = FUGA**: si `emision.vertical` (en mayúsculas) está en
   `VERTICALES_HECHO = {VENTA, COBRO, PAGO, COMPRA, CONSUMO, CIERRE_JORNADA,
   RECTIFICATIVO, NOMINA}` → **`409 ERROR_FUGA`** con
   `{ contrato, vertical_pretendida, espacio_de_calculos:'contabilidad.',
   simbolico:'ERROR_FUGA' }`. **Contabilidad no realimenta la operación.**
3. **`es_hecho:true` = FUGA**: un contrato de contabilidad **no puede declararse hecho
   de negocio** → **`409 ERROR_FUGA`** con
   `{ contrato, espacio_de_calculos:'contabilidad.', simbolico:'ERROR_FUGA' }`.
4. **Juicio determinista sobre el prefijo**: `_verificar` solo mira el contrato, la
   vertical pretendida y el flag `es_hecho`. Misma entrada → mismo veredicto; nada de
   estado, nada de juicio fuzzy.
5. **Validaciones deterministas**: falta `project_id` → `400 INVALID_INPUT project_id`;
   `emision` ausente/no objeto → `400 INVALID_INPUT emision`; sin `contrato` (ni
   `evento`) → `400 INVALID_INPUT emision.contrato`. Shape: `{ status:400,
   error:{ code:'INVALID_INPUT', message:'<campo> requerido', details:{ field:<campo> } } }`.
6. **Éxito expone el plano**: verificado → `200` con
   `{ project_id, contrato, plano:'CALCULO', verificado:true, fuga:false }`.
7. **La ley entra como DATO**: el conjunto de verticales productoras y el espacio de
   cálculos son los del contrato del dominio (declarados en constantes), y la emisión
   es un **dato** que se verifica; no se cablea por módulo.
8. **El sistema NO firma ni decide**: se limita a **verificar** la pertenencia al
   plano de cálculos; no autoriza hechos ni decide la operación.
9. **HTTP exacto**: éxito `200`; payload inválido → `400`; fuga → `409`; excepción en
   `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

El único RPC responde en `contabilidad.frontera_planos.verificar.response`.

### 1. `verificar` — ¿la emisión es un CÁLCULO (no un hecho)?

```json
{
  "project_id": "e57a318a-...",
  "emision": { "contrato": "contabilidad.asiento.generado", "vertical": "VENTA", "es_hecho": false },
  "correlation_id": "abc-123"
}
```
Respuesta `200` (el contrato vive en `contabilidad.*`; no es hecho):
```json
{ "project_id": "e57a318a-...", "contrato": "contabilidad.asiento.generado", "plano": "CALCULO", "verificado": true, "fuga": false }
```
Emite `contabilidad.frontera_planos_verificada` (res.data + `correlation_id`).

### Fallo — contrato fuera del espacio de cálculos

```json
{ "project_id": "e57a318a-...", "emision": { "contrato": "venta.ticket.emitido" } }
```
Respuesta `409` + `contabilidad.frontera_planos.verificar.failed`:
```json
{ "status": 409, "error": { "code": "ERROR_FUGA", "message": "el contrato venta.ticket.emitido no pertenece al espacio de CALCULOS", "details": { "contrato": "venta.ticket.emitido", "prefijo_exigido": "contabilidad.", "simbolico": "ERROR_FUGA" } } }
```

### Fallo — vertical productora de hechos (realimentación)

```json
{ "project_id": "e57a318a-...", "emision": { "contrato": "contabilidad.algo", "vertical": "COBRO" } }
```
Respuesta `409` + par de fallo:
```json
{ "status": 409, "error": { "code": "ERROR_FUGA", "message": "contabilidad no puede emitir el hecho de la vertical COBRO", "details": { "contrato": "contabilidad.algo", "vertical_pretendida": "COBRO", "espacio_de_calculos": "contabilidad.", "simbolico": "ERROR_FUGA" } } }
```

### Fallo — `es_hecho:true`

`{ "emision": { "contrato": "contabilidad.x", "es_hecho": true } }` → `409 ERROR_FUGA`
con `message:'un contrato de contabilidad no puede declararse hecho de negocio'`.

### Tools (sin RPC en module.json)

`toolVerificar` → `_verificar`.

## Tests

El test vive en `tests/unit/frontera-planos.test.js`. Cubre:

- `verificar` de un contrato `contabilidad.*` que no es hecho → `200 {plano:'CALCULO',
  fuga:false}`, emite `contabilidad.frontera_planos_verificada`.
- Contrato con prefijo ajeno (`venta.ticket.emitido`) → `409 ERROR_FUGA` + par de fallo.
- `emision.vertical` de una vertical productora (`COBRO`) → `409 ERROR_FUGA`.
- `emision.es_hecho:true` → `409 ERROR_FUGA`.
- Payload inválido (sin `project_id`/`emision`/`contrato`) → `400 INVALID_INPUT`.
- Determinismo: la misma entrada devuelve siempre el mismo veredicto (sin estado).

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/frontera-planos
node --test tests/unit/frontera-planos.test.js
```

## Notas de implementación

- Clase `FronteraPlanos extends ModuloHibridoReflejo`; `name = 'frontera-planos'`,
  `version = 'reflejo-0.1.0'`. **Sin store** (reflejo stateless: no hay `this._store`
  ni PosPersistencia ni `project.activated`).
- Constantes: `PREFIJO_CALCULOS = 'contabilidad.'`, `CODE_FUGA = 'ERROR_FUGA'` y
  `VERTICALES_HECHO` (Set de las 8 verticales productoras).
- `onVerificarRequest` delega en `_atender(e, 'verificar',
  'contabilidad.frontera_planos.verificar.response', fn)`; el handler emite el evento
  de dominio o el par determinista según el `status`.
- Proyección pura: `_verificar`. `_invalid` (→ 400 INVALID_INPUT `{field}`) y
  `_errorResponse` vienen de `modulo-hibrido-reflejo` / `base-module`.
- Tools: `toolVerificar`.
- DEP hacia delante: el rastro de `historial-proceso-contable` (P2) consume
  `contabilidad.frontera_planos_verificada` para la cadena de emisión.
