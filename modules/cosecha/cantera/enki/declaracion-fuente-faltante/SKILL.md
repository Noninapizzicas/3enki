---
name: declaracion-fuente-faltante
description: >
  Skill FULL del módulo PUENTE `declaracion-fuente-faltante` de la vertical
  contabilidad de Enki. Declara que una vertical no publica un hecho necesario
  (abierto + aviso, sin obligarla a producirlo); contrato tolerante — si la
  cobertura no responde da 503 y jamás fabrica el dato. Úsala para operar,
  depurar o extender el puente, o para entender su contrato de eventos y sus
  reglas de negocio.
when-to-use: >
  - Cuando necesites declarar que una fuente no publica un hecho
    (RPC declaracion-fuente-faltante.declarar.request).
  - Cuando depures por qué se declara un hueco o por qué falla
    (400 INVALID_INPUT si falta project_id/vertical, 503 UPSTREAM_UNREACHABLE si
    completitud-cobertura no responde).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y la
    invariante del contrato tolerante (nunca se fabrica el dato).
  - Cuando vayas a escribir/ampliar el test unitario del puente
    declaracion-fuente-faltante.
tags: [enki, modulo, puente, contabilidad, declaracion-fuente-faltante]
---

# declaracion-fuente-faltante — PUENTE STATELESS del hueco declarado

## Qué hace el módulo

`declaracion-fuente-faltante` es un **PUENTE STATELESS** (A15, hoja del plan):
detecta que una vertical **NO publica un hecho necesario** y lo **DECLARA** — queda
**ABIERTO** y se emite un aviso; **NO** obliga a la vertical a producirlo
(`obliga_a_producir:false`): contabilidad se adapta, no manda.

**CONTRATO TOLERANTE**: la detección se apoya en **LA métrica única de cobertura**
(`completitud-cobertura` A12) consultada **por evento**; si su dependencia **NO**
responde (timeout/ausencia), este puente responde **`503 UPSTREAM_UNREACHABLE`** —
**NUNCA fabrica el dato** (no inventa una cobertura ni un hueco que no pudo medir).
Si el hueco ya llega declarado por el llamante (`faltantes`), no hace falta la
métrica externa. Si la métrica existe pero declara que no hay expectativa
(`cobertura.declarada:false`), no se afirma un hueco (`falta:false`, motivo).

Sin PosPersistencia y sin `project.activated`: no es custodio.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `declaracion-fuente-faltante.declarar.request` | `onDeclararRequest` | RPC puente (contrato tolerante): {project_id, vertical, faltantes?, esperados?, llegados?, motivo?} → {falta, declaracion:{faltantes, abierto:true, obliga_a_producir:false, aviso, motivo}, origen}. Sin faltantes declarados consulta la metrica unica (completitud-cobertura) por evento; si NO responde → 503 UPSTREAM_UNREACHABLE (nunca se fabrica el dato). Cobertura sin expectativa → falta:false (no se afirma hueco). Exito con faltantes → publica contabilidad.fuente_faltante y responde por declaracion-fuente-faltante.declarar.response; project_id/vertical ausente o 503 → declaracion-fuente-faltante.declarar.failed. |
| `contabilidad.cobertura_medida` | `onCoberturaMedida` | Fire-and-forget (escucha LA metrica unica): completitud-cobertura (A12) publica {project_id, vertical, cobertura} al medir. Este puente escucha para tener la cobertura viva y poder declarar el hueco sin volver a medir; NO recalcula la metrica (la LEEN). |

### Publishes

| Evento | Descripción |
|---|---|
| `declaracion-fuente-faltante.declarar.response` | Respuesta RPC correlada de declaracion-fuente-faltante.declarar.request → {request_id, status:200, data:{falta, declaracion, origen}}. Emitida por el helper _atender. |
| `declaracion-fuente-faltante.declarar.failed` | Par de fallo determinista (A15): project_id/vertical ausente (400) o dependencia completitud-cobertura sin responder (503 UPSTREAM_UNREACHABLE) → {status, error:{code, message, details?}}. Cierra el circulo de declaracion-fuente-faltante.declarar.request. Nunca sustituye el dato faltante por una invencion. |
| `contabilidad.fuente_faltante` | Fire-and-forget (A15): una vertical no publica hechos necesarios y queda DECLARADO (abierto + aviso) → {project_id, vertical, declaracion, faltantes, correlation_id}. Lo LEEN la cola de excepciones y el bucle de declaracion de criterios (K9); no obliga a la fuente a producirlo. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `declaracion-fuente-faltante.declarar.failed` cierra el círculo de
> `declaracion-fuente-faltante.declarar.request` cuando `_declarar` devuelve
> status ≠ 200 (400 por payload, **o 503 UPSTREAM_UNREACHABLE** por dependencia sin
> responder).

> Nota de honestidad (cruce con `index.js`): el handler publica
> `contabilidad.fuente_faltante` **solo si `res.data.falta && res.data.declaracion.faltantes.length > 0`**.
> Con status 200 pero sin huecos (`falta:false`) **no** publica ni el evento de
> dominio ni el par de fallo: es un "no falta nada" declarado.

> Nota: `onCoberturaMedida` también publica `contabilidad.fuente_faltante` — pero
> sin pasar por `_atender` (no hay response). Con huecos, declara en el acto; retorna
> `{falta:true, vertical, faltantes:<n>}`. Sin huecos retorna
> `{falta:false, vertical}` y no publica.

## Reglas de negocio

1. **Nunca se fabrica el dato**: si no llegan `faltantes` declarados, se pide
   `completitud-cobertura.medir.request` **por evento** con
   `{project_id, vertical, esperados, llegados}` y `timeout_ms:4000`. Si la
   respuesta es `null` o sin `cobertura` → `_errorResponse(503,
   'UPSTREAM_UNREACHABLE', 'completitud-cobertura no respondio; no se puede declarar
   el hueco sin fabricar el dato', {dependencia:'completitud-cobertura', project_id,
   vertical})`.
2. **Hueco declarado por el llamante**: si `input.faltantes` es array, se normaliza
   a String y se filtra; `origen:'declarado'`. No se consulta la métrica.
3. **Cobertura sin expectativa no afirma hueco**: si `data.cobertura.declarada` es
   falso → `200 {falta:false, declaracion:null, origen:'completitud-cobertura',
   motivo:'la cobertura no esta declarada (sin expectativa); no se afirma un hueco'}`.
4. **La métrica es la única fuente externa**: con cobertura declarada,
   `faltantes = data.cobertura.huecos` (normalizados a String), `origen:
   'completitud-cobertura'`. La métrica no se recalcula (se LEE).
5. **El aviso, no la orden**: la `declaracion` siempre lleva `abierto:true` y
   `obliga_a_producir:false`; el `aviso` es textual
   (`` `la vertical ${vertical} no publica ${n} hecho(s) necesario(s)` ``) o `null`
   si no hay faltantes. `falta = faltantes.length > 0`.
6. **Sin estado**: es un puente stateless; declara lo que la métrica le dice en el
   momento. No recuerda, no persiste.
7. **`motivo` opcional**: se toma de `input.motivo` (String) o `null`.
8. **`project_id` con fallback**: `input.project_id || this.project_id`.
9. **Validaciones deterministas**: `project_id` ausente → `400 INVALID_INPUT`
   (`field:'project_id'`); `vertical` vacía → `400 INVALID_INPUT`
   (`field:'vertical'`).
10. **Doble vía de notificación**: el RPC (`declarar.request`) y el escucha
    (`onCoberturaMedida`, fire-and-forget de `contabilidad.cobertura_medida`) pueden
    ambos publicar `contabilidad.fuente_faltante`.
11. **HTTP exacto**: éxito `200`; payload inválido → `400`; dependencia sin
    responder → `503 UPSTREAM_UNREACHABLE`; excepción en `_atender` → `500
    UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `declaracion-fuente-faltante.declarar.response` y emite
`contabilidad.fuente_faltante`.

### 1. `declarar` con el hueco ya declarado por el llamante

```json
{
  "project_id": "e57a318a-...",
  "vertical": "pizzepos",
  "faltantes": ["2026-09-02"],
  "motivo": "cierre diario sin ventas publicadas",
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "vertical": "pizzepos",
  "falta": true,
  "declaracion": {
    "vertical": "pizzepos",
    "faltantes": ["2026-09-02"],
    "falta": true,
    "abierto": true,
    "obliga_a_producir": false,
    "aviso": "la vertical pizzepos no publica 1 hecho(s) necesario(s)",
    "motivo": "cierre diario sin ventas publicadas",
    "declarado_en": "2026-09-25T..."
  },
  "origen": "declarado"
}
```
Emite `contabilidad.fuente_faltante`:
```json
{ "project_id": "e57a318a-...", "vertical": "pizzepos", "declaracion": { "...": "..." }, "faltantes": ["2026-09-02"], "correlation_id": "abc-123" }
```

### 2. `declarar` sin faltantes — consulta la métrica única por evento

```json
{ "project_id": "e57a318a-...", "vertical": "pizzepos", "esperados": ["a", "b"], "llegados": ["a"] }
```
Consulta `completitud-cobertura.medir.request`; con cobertura declarada toma
`huecos` como `faltantes` y `origen:'completitud-cobertura'`.

### 3. Cobertura sin expectativa → no se afirma hueco

Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "vertical": "pizzepos", "falta": false, "declaracion": null, "origen": "completitud-cobertura", "motivo": "la cobertura no esta declarada (sin expectativa); no se afirma un hueco" }
```

### 4. Fallo — la dependencia no responde (nunca se fabrica)

Si `completitud-cobertura.medir.request` devuelve `null` (timeout/ausencia):
Respuesta `503` + `declaracion-fuente-faltante.declarar.failed`:
```json
{ "status": 503, "error": { "code": "UPSTREAM_UNREACHABLE", "message": "completitud-cobertura no respondio; no se puede declarar el hueco sin fabricar el dato", "details": { "dependencia": "completitud-cobertura", "project_id": "e57a318a-...", "vertical": "pizzepos" } } }
```

### 5. Fallo — falta vertical

```json
{ "project_id": "e57a318a-..." }
```
Respuesta `400` + `declaracion-fuente-faltante.declarar.failed`:
```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "vertical requerido", "details": { "field": "vertical" } } }
```

## Tests

El test unitario de la vertical vive en
`tests/unit/declaracion-fuente-faltante.test.js`. Cubre:

- `declarar` con `faltantes` declarados → `200 {falta:true}`, `origen:'declarado'` y
  emite `contabilidad.fuente_faltante`.
- `declarar` sin `faltantes` consulta la métrica por evento
  (`origen:'completitud-cobertura'`).
- Dependencia sin responder → `503 UPSTREAM_UNREACHABLE` +
  `declaracion-fuente-faltante.declarar.failed` (nunca fabrica).
- Cobertura `declarada:false` → `200 {falta:false}`, no afirma hueco.
- `declarar` sin `project_id`/`vertical` → `400 INVALID_INPUT`.
- `onCoberturaMedida` con huecos publica `contabilidad.fuente_faltante`; sin huecos
  retorna `{falta:false}`.
- `toolDeclarar` devuelve la misma proyección que `_declarar`.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `DeclaracionFuenteFaltante extends ModuloHibridoReflejo`; `name =
  'declaracion-fuente-faltante'`, `version = 'reflejo-0.1.0'`. Sin
  `PosPersistencia`, sin store, sin `onProjectActivated` (PUENTE stateless).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-entrada/declaracion-fuente-faltante/`).
- `onDeclararRequest` usa `this._atender(e, 'declarar',
  'declaracion-fuente-faltante.declarar.response', async (d) => {...})`; dentro
  publica `contabilidad.fuente_faltante` solo si `falta` con faltantes, y en status
  ≠ 200 publica `declaracion-fuente-faltante.declarar.failed` (incluye el 503).
- `onCoberturaMedida(e)` NO usa `_atender` (no hay response): lee
  `e.data || e`, y si `cobertura.declarada` y hay `huecos` publica
  `contabilidad.fuente_faltante` en el acto.
- Proyección única `_declarar(input)` (`async`, consulta la métrica por evento) →
  `{status, data}`. Tool directa `toolDeclarar`.
- `_invalid` / `_errorResponse` / `_rpc` vienen de `modulo-hibrido-reflejo`.
- DEP: depende de `completitud-cobertura.medir.request` (A12) por evento; escucha
  `contabilidad.cobertura_medida`. La LEEN la cola de excepciones (aviso lo consume
  `motor-avisos`) y el bucle de declaración de criterios (K9) vía
  `contabilidad.fuente_faltante`.
