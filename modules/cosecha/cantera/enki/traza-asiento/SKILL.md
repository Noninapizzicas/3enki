---
name: traza-asiento
description: >-
  Skill FULL del módulo CUSTODIO CON PERSISTENCIA `traza-asiento` de la vertical
  contabilidad (Enki). Registro INMUTABLE y APPEND-ONLY de quién y cuándo creó
  cada asiento: cada traza se APILA con su secuencia y nada se borra ni se
  sobrescribe. Un solo escritor, y exige su `asiento_id` (sin asiento no se anota).
  Persiste por proyecto vía PosPersistencia (storage `/contabilidad/traza-asiento`),
  restaura en `project.activated` y vuelca en `onUnload`. NO confundir con
  `historial-proceso-contable` (P2), que registra el PROCESO DE ENTRADA, no el asiento.
when-to-use: >-
  - Cuando necesites anotar o consultar quién/cuándo creó un asiento
    (RPC `traza-asiento.registrar.request`).
  - Cuando depures por qué no se anota una traza (falta `project_id` o `asiento_id`
    → INVALID_INPUT y `traza-asiento.registrar.failed`) o por qué no llega
    `contabilidad.traza_registrada`.
  - Cuando quieras entender su contrato de eventos (subscribes/publishes) y sus
    reglas (append-only, un solo escritor, el autor ausente se declara `abierto`).
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, custodio, persistencia, append-only, contabilidad, libro, trazabilidad, asientos]
---

# traza-asiento — CUSTODIO CON PERSISTENCIA de la trazabilidad del diario

## Qué hace el módulo

`traza-asiento` es un **CUSTODIO CON PERSISTENCIA** (hoja **B4** del plan,
eje `contabilidad-libro`, forma CUSTODIO). Su único trabajo es **dejar
constancia inmutable de quién y cuándo creó cada asiento**.

Es un **registro APPEND-ONLY**: cada traza se **apila** con su secuencia. Nada se
sobraescribe, nada se borra. La traza es la memoria de auditoría del diario: si
mañana alguien pregunta *"¿quién anotó este asiento y cuándo?"*, la respuesta está
aquí y no se puede reescribir.

**NO es** `historial-proceso-contable` (P2, eje entrada): aquél registra el
**proceso de entrada** (qué documento llegó, qué se descartó…). Éste registra el
**asiento** — la pieza ya contable.

### Invariantes que impone el código

```
1 · APPEND-ONLY   cada traza se APILA con su secuencia; NADA se borra ni se sobrescribe
2 · EXIGE ASIENTO sin `asiento_id` NO se anota (no se apila la traza de nada)
3 · ABIERTO SE DECLARA  una traza sin autor se apila con su hueco (`abierto`), no se inventa
4 · UN ESCRITOR   el módulo es el único que escribe su store
5 · PERSISTE POR PROYECTO  PosPersistencia, storage `/contabilidad/traza-asiento`
```

## Contrato de eventos

### Subscribes (lo que escucha)

| Evento | Handler | Qué hace |
|---|---|---|
| `traza-asiento.registrar.request` | `onRegistrarRequest` | RPC del custodio (ORDEN → panel). Apila la traza de un asiento. |
| `project.activated` | `onProjectActivated` | Restaura la traza del proyecto activado desde el storage. |

### Publishes (lo que emite)

| Evento | Cuándo |
|---|---|
| `contabilidad.traza_registrada` | **El HECHO de dominio**: quedó registrada (append-only) la traza de un asiento → `{project_id, asiento_id, traza, registrada}`. Lo consume `marca-borrador-validado`. |
| `traza-asiento.registrar.response` | Respuesta RPC correlada de `registrar`. |
| `traza-asiento.registrar.failed` | **Par de fallo determinista**: falta `project_id` o `asiento_id` → `{status, code, message}`. Cierra el círculo de `registrar.request`. |

> **Nota R3 (la deriva que se EVITA).** El plan de F3b declara escucha de
> `contabilidad.asiento_asentado` (lo emite `escritor-diario`, B2) y
> `contabilidad.ajuste_entrado` (`asiento-ajuste`). **Ningún módulo los emite aún**,
> así que declararlos daría una **cadena colgada** (R3 deriva). **NO se declaran**
> hasta que su emisor exista. El gate del ADN lo confirma.

## Operaciones (RPC)

| Op | Clase | Entrada | Salida | Errores |
|---|---|---|---|---|
| `registrar` | **ORDEN** (lleva panel) | `{project_id, asiento_id, actor?, rol?, accion?, detalle?, en?}` | `{project_id, registro, registrada, total, append_only}` | `400 INVALID_INPUT` si falta `project_id` o `asiento_id` |

**Clasificación del plan (F3b):** `registrar` es **ORDEN** → el humano la opera desde
un **panel** (`system_panel` / `lateral_derecha`). Por eso lleva `ui_handler`; las
preguntas (si las hubiera) irían por el bus, sin panel.

## Reglas de negocio

- **Append-only de verdad**: el store guarda `registros[]` y sólo se hace `push`.
  No hay operación de borrado ni de modificación — ni la habrá.
- **El asiento manda**: sin `asiento_id` la operación se rechaza. La traza siempre
  cuelga de un asiento real; no hay trazas huérfanas.
- **El hueco se declara**: si no llega autor, la traza se apila marcando el hueco
  como `abierto`. La ausencia de dato **no se rellena con una suposición**.
- **Un solo escritor**: el guard del custodio protege la escritura del store.
- **Persistencia por proyecto**: cada `project_id` tiene su propia traza; el
  snapshot se vuelca en `onUnload` y se restaura en `project.activated`.

## Cómo se usa

```jsonc
// Registrar la traza de un asiento (ORDEN, desde el panel o por el bus)
{
  "event": "traza-asiento.registrar.request",
  "data": {
    "project_id": "<uuid>",
    "asiento_id": "as-2026-000431",
    "actor": "asesor@despacho",
    "rol": "asesor",
    "accion": "crear",
    "detalle": "asiento de apertura del ejercicio"
  }
}
```

Respuesta (por `traza-asiento.registrar.response`):

```jsonc
{
  "project_id": "<uuid>",
  "registro": { "secuencia": 12, "asiento_id": "as-2026-000431", "...": "..." },
  "registrada": true,
  "total": 12,
  "append_only": true
}
```

Y **el hecho** sale al bus, para quien lo consuma:

```jsonc
// contabilidad.traza_registrada
{ "project_id": "<uuid>", "asiento_id": "as-2026-000431", "traza": { "...": "..." }, "registrada": true }
```

## Errores y qué significan

| Código | Cuándo | Qué hacer |
|---|---|---|
| `INVALID_INPUT` (400) | falta `project_id` o `asiento_id` | el asiento es obligatorio: sin él no hay traza que anotar |
| `traza-asiento.registrar.failed` | cualquiera de los anteriores | el par de fallo determinista cierra el círculo del request |

## Relación con otras piezas

**Siempre por EVENTO, nunca por `import`** (R1 · isla):

- **`escritor-diario` (B2)** — el que asienta; de él vendrá (cuando lo emita) el
  `contabilidad.asiento_asentado` que hoy **no** se declara (R3).
- **`marca-borrador-validado`** — consume `contabilidad.traza_registrada`: se apoya
  en la traza para saber que el asiento está registrado.
- **`historial-proceso-contable` (P2)** — **NO confundir**: aquél registra el
  proceso de entrada, éste el asiento.

## Verificación

```bash
# 1 · carga la clase
node -e "const C=require('./modules/contabilidad-libro/traza-asiento'); console.log(typeof new C().onLoad)"

# 2 · el manifiesto es válido y declara su contrato
node -e "const j=require('./modules/contabilidad-libro/traza-asiento/module.json'); console.log(j.name, j.subscribes.length, j.publishes.length)"

# 3 · el ADN (el gate que mide la forma)
node -e "const v=require('./scripts/verificar-adn-modulo.js'); console.log(JSON.stringify(v.medirSlug('traza-asiento')))"
```

Comprobaciones que deben dar verde:

- La clase carga y `onLoad` existe.
- Cada `subscribes[].handler` está implementado en `index.js`.
- El ADN da `ok:true` (escribe y **anuncia** su hecho; no escucha a nadie que no exista).
- Sin `asiento_id`, `registrar` responde `INVALID_INPUT` y emite su `.failed`.
