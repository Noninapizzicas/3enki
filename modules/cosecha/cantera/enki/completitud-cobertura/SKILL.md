---
name: completitud-cobertura
description: >
  Skill FULL del módulo REFLEJO `completitud-cobertura` de la vertical
  contabilidad de Enki. LA métrica única de cobertura — qué hechos publicó una
  vertical y cuáles no llegaron; lo ausente es hueco declarado y nada se estima
  (las demás señales la LEEN, no la recalculan). Úsala para operar, depurar o
  extender el reflejo, o para entender su contrato de eventos y sus reglas de
  negocio.
when-to-use: >
  - Cuando necesites medir la cobertura de una vertical
    (RPC completitud-cobertura.medir.request).
  - Cuando depures por qué la cobertura sale `declarada:false` con `tasa:null`
    (400 INVALID_INPUT si falta project_id, o sin expectativa declarada ni
    contrato de la fuente).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    invariantes de la métrica (medida determinista por clave, lo ausente es
    hueco declarado, sin persistencia).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo
    completitud-cobertura.
tags: [enki, modulo, reflejo, contabilidad, completitud-cobertura]
---

# completitud-cobertura — REFLEJO STATELESS de la cobertura

## Qué hace el módulo

`completitud-cobertura` es un **REFLEJO STATELESS** (A12, hoja del plan):
**LA MÉTRICA ÚNICA** de cobertura. Mide qué hechos publicó una vertical y cuáles
**NO** llegaron; produce **LA Cobertura**. Las demás señales (SelloCobertura Q3,
AvisoCuadre C6, TasaCoberturaEntrada P4) la **LEEN** — no la recalculan (invariante
8, conflicto 2 resuelto).

**Invariante 7 — dato ausente = desconocido**: nada se estima. Lo que no llegó es
**HUECO DECLARADO** (`huecos`), no un cero silencioso; y si no hay expectativa
declarada, la `tasa` es **`null`** (no `0`: un `0` afirmaría una medida que no se
hizo).

La expectativa viene **declarada** (`esperados`) o, en su defecto, del mínimo
declarado por la fuente (`contrato-hecho-minimo` A11, consultado **por evento**).
Sin contrato declarado, la cobertura se declara `declarada:false` con `tasa:null` —
jamás se inventa la expectativa.

Es **determinista**: misma entrada (`esperados` + `llegados`) → misma Cobertura.
Cero estado, cero reloj en el cálculo. Sin PosPersistencia y sin
`project.activated`: no es custodio.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `completitud-cobertura.medir.request` | `onMedirRequest` | RPC reflejo (determinista): {project_id, vertical?, esperados?, llegados?} → {vertical, cobertura:{declarada, esperados, llegados, cubiertos, huecos, tasa, completa, no_esperados?}, origen_esperados}. Mide la cobertura por clave; lo ausente es hueco declarado; sin expectativa declarada → declarada:false, tasa null (no se inventa). Si faltan esperados consulta el minimo de la fuente por evento (contrato-hecho-minimo). Exito → publica contabilidad.cobertura_medida y responde por completitud-cobertura.medir.response; project_id ausente → completitud-cobertura.medir.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `completitud-cobertura.medir.response` | Respuesta RPC correlada de completitud-cobertura.medir.request → {request_id, status:200, data:{vertical, cobertura, origen_esperados}}. Emitida por el helper _atender. |
| `completitud-cobertura.medir.failed` | Par de fallo determinista (A12): project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de completitud-cobertura.medir.request. |
| `contabilidad.cobertura_medida` | Fire-and-forget (A12): LA metrica unica quedo medida → {project_id, vertical, cobertura, correlation_id}. La LEEN SelloCobertura (Q3), AvisoCuadre (C6), TasaCoberturaEntrada (P4) y declaracion-fuente-faltante (A15) — no la recalculan. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `completitud-cobertura.medir.failed` cierra el círculo de
> `completitud-cobertura.medir.request` cuando `_medir` devuelve status ≠ 200
> (`project_id` ausente).

> Nota de honestidad (cruce con `index.js`): `onMedirRequest` publica
> `contabilidad.cobertura_medida` **siempre que `_medir` devuelve `200`** — lo que
> incluye el caso `declarada:false` (sin expectativa, `tasa:null`). Es decir, el
> evento de la métrica única se emite también cuando no hubo expectativa que medir;
> el consumidor debe mirar `cobertura.declarada`.

## Reglas de negocio

1. **La expectativa es declarada, jamás inventada**: `esperados` se toma de
   `input.esperados` (`origen_esperados:'declarado'`) o, si no llega, se consulta
   `contrato-hecho-minimo.exigir.request` **por evento** con
   `{project_id, vertical}` y `timeout_ms:4000`; si el contrato está declarado
   (`data.declarado && Array.isArray(data.campos)`), `origen_esperados:
   'contrato-hecho-minimo'`. Si no responde o no hay contrato, `esperados` queda
   `null` — **no** se inventa.
2. **Sin expectativa → cobertura no declarada**: si `esperados` es `null`, devuelve
   `200 {cobertura:{declarada:false, esperados:null, llegados:<n>, cubiertos:null,
   huecos:null, tasa:null, completa:false}, origen_esperados:null, motivo:'no hay
   expectativa declarada (ni esperados en la peticion ni contrato de la fuente)'}`.
   Nunca `tasa:0` (no se afirma una medida que no se hizo).
3. **Medida determinista por clave**: `cubiertos = esperados.filter(e =>
   llegados.has(e))`, `huecos = esperados.filter(e => !llegados.has(e))` (en orden
   de la expectativa → determinista). `tasa = esperados.length === 0 ? 1 :
   round(cubiertos.length / esperados.length, 4)`. `completa = huecos.length === 0`.
4. **Lo de más también se declara**: `no_esperados = llegados.filter(l =>
   !esperados.includes(l))` — lo que llegó sin estar esperado se declara, no se
   oculta.
5. **Ausencia honesta, no `[]`**: `_lista(raw)` devuelve `null` si `raw` no es
   array (una lista ausente no es una lista vacía); si lo es, normaliza a String y
   filtra cadenas vacías.
6. **`llegados` por defecto `[]`**: `_lista(input.llegados) || []`; una lista de
   llegados ausente equivale a ninguno llegado.
7. **`vertical` opcional**: se normaliza a String o queda `null`; no estorba la
   medición, solo etiqueta la salida.
8. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente →
   `400 INVALID_INPUT` (`field:'project_id'`).
9. **HTTP exacto**: éxito `200` (con `declarada` true o false); `project_id`
   ausente → `400`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `completitud-cobertura.medir.response` y emite
`contabilidad.cobertura_medida`.

### 1. `medir` con expectativa declarada

```json
{
  "project_id": "e57a318a-...",
  "vertical": "pizzepos",
  "esperados": ["2026-09-01", "2026-09-02", "2026-09-03"],
  "llegados": ["2026-09-01", "2026-09-03"],
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "vertical": "pizzepos",
  "cobertura": { "declarada": true, "esperados": 3, "llegados": 2, "cubiertos": 2, "huecos": ["2026-09-02"], "tasa": 0.6667, "completa": false, "no_esperados": [] },
  "origen_esperados": "declarado"
}
```
Emite `contabilidad.cobertura_medida`:
```json
{ "project_id": "e57a318a-...", "vertical": "pizzepos", "cobertura": { "...": "..." }, "correlation_id": "abc-123" }
```

### 2. `medir` sin expectativa declarada (la consulta al mínimo de la fuente)

```json
{ "project_id": "e57a318a-...", "vertical": "pizzepos", "llegados": ["fecha", "importe", "moneda"] }
```
Si `contrato-hecho-minimo.exigir.request` responde con `declarado:true` y
`campos:["fecha","importe","moneda"]`, la cobertura sale con
`origen_esperados:"contrato-hecho-minimo"` y `tasa:1`. Si no hay contrato declarado
o la dependencia no responde, `esperados:null` → `declarada:false`, `tasa:null`.

### 3. Fallo — falta `project_id`

```json
{ "vertical": "pizzepos", "esperados": ["a"] }
```
Respuesta `400` + `completitud-cobertura.medir.failed`:
```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/completitud-cobertura.test.js`.
Cubre:

- `medir` con `esperados` + `llegados` → `200 declarada:true`, `huecos` con los
  ausentes, `tasa` redondeada a 4 decimales y `no_esperados` declarado.
- `medir` con `esperados` vacío (array) → `tasa:1`, `completa:true`.
- `medir` sin expectativa y sin contrato → `declarada:false`, `tasa:null` (no 0).
- `medir` sin `esperados` consulta `contrato-hecho-minimo.exigir.request` por evento
  (`origen_esperados:'contrato-hecho-minimo'`).
- `medir` sin `project_id` → `400 INVALID_INPUT` +
  `completitud-cobertura.medir.failed`.
- Emite `contabilidad.cobertura_medida` en status 200.
- `toolMedir` devuelve la misma proyección que `_medir`.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `CompletitudCobertura extends ModuloHibridoReflejo`; `name =
  'completitud-cobertura'`, `version = 'reflejo-0.1.0'`. Sin `PosPersistencia`, sin
  store, sin `onProjectActivated` (REFLEJO stateless).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-entrada/completitud-cobertura/`).
- `onMedirRequest` usa `this._atender(e, 'medir',
  'completitud-cobertura.medir.response', async (d) => {...})` y dentro hace el
  cierre de círculo: en status 200 publica `contabilidad.cobertura_medida`, si no
  publica `completitud-cobertura.medir.failed`.
- Proyección única `_medir(input)` (`async`, porque consulta por evento) →
  `{status, data}`; helper `_lista(raw)`, `_round(x, 4)`. Tool directa `toolMedir`.
- `_invalid` / `_errorResponse` / `_rpc` vienen de `modulo-hibrido-reflejo`.
- DEP: consulta `contrato-hecho-minimo.exigir.request` (A11) por evento; la LEEN
  SelloCobertura (Q3), AvisoCuadre (C6), TasaCoberturaEntrada (P4) y
  `declaracion-fuente-faltante` (A15) vía `contabilidad.cobertura_medida`.
