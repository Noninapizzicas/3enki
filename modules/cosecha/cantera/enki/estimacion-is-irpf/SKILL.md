---
name: estimacion-is-irpf
description: >
  Skill FULL del módulo REFLEJO `estimacion-is-irpf` de la vertical contabilidad de
  Enki. ESTIMA la cuota del IS o del IRPF sobre una BASE declarada con escalas/tramos
  también declarables — nada se estima sin base y el sistema no inventa el tipo;
  el asesor presenta y firma. Úsala para operar, depurar o extender el reflejo, o para
  entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites la estimación del IS/IRPF de un ejercicio (RPC
    estimacion-is-irpf.estimar.request).
  - Cuando depures por qué la estimación sale `estimado:false` con `cuota:null` (sin base
    declarada), o por qué hay base pero `cuota:null` (sin escala/tipo declarado), o por
    qué falta `project_id` (400 INVALID_INPUT).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    invariantes de la estimación (la ley entra como dato, nada se estima sin base, el
    sistema prepara y el asesor firma).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo estimacion-is-irpf.
tags: [enki, modulo, reflejo, contabilidad, estimacion-is-irpf]
---

# estimacion-is-irpf — REFLEJO STATELESS de la estimación

## Qué hace el módulo

`estimacion-is-irpf` es un **REFLEJO STATELESS** (D5, hoja del plan): **ESTIMA la cuota
del Impuesto sobre Sociedades (IS) o del IRPF** según el **RÉGIMEN DECLARADO** por el
negocio, partiendo del **RESULTADO contable del ejercicio** (`cuenta-resultados`, C2).
**NO determina la base fiscal** por su cuenta ni recalcula asientos.

**LA LEY ENTRA COMO DATO** (invariante 5): **NO se cablea NINGUNA escala, NINGÚN tramo,
NINGÚN tipo ni NINGÚN módulo de estimación objetiva** — todo llega **DECLARADO**
(`base`, `escalas`/`tramos` o `tipo`, `ajustes`, `ParametroDeclarable` por negocio y
ejercicio).

- **Sin `base` declarada NO se estima**: `estimado:false`, `cuota:null`, `motivo`
  declarado (invariante 7: nada se estima sin base).
- Con `base` y `tramos` declarados se aplica la escala **DECLARADA** de forma
  determinista por tramos (**límites y tipos son datos, no ley**); con `tipo` único
  declarado, tramo único.
- Con `base` pero **SIN** escala/tipo → se entrega la base imponible y `cuota:null`
  (**el sistema no inventa el tipo**).

Los **ajustes extracontables** son **DECLARADOS** (sin declarar → `0`, neutro, no un
ajuste inventado). El resultado contable llega por **dos vías**, ninguna es un `require`
cruzado: declarado en la petición (`resultado`) o pedido a `cuenta-resultados` **POR
EVENTO** (RPC `cuenta-resultados.calcular.request`).

**El sistema PREPARA la estimación; el ASESOR presenta y firma** — la salida viaja con
`presentada:false`, `firmada:false`, `preparada_para_asesor:true`. Sin `PosPersistencia`
ni `project.activated`: no es custodio.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `estimacion-is-irpf.estimar.request` | `onEstimarRequest` | RPC reflejo (calculo determinista): {project_id, ejercicio?, regimen?('IS'\|'IRPF'), resultado?, base?{imponible}, escalas?\|tramos?\|[tipo], ajustes?} → {regimen, origen_resultado, resultado_contable, base_declarada, estimado, cuota, estimacion?, motivo}. Sin base imponible declarada → estimado:false, cuota:null, motivo (nada se estima sin base). Con base y tramos/tipo declarados aplica la escala por tramos (los limites y tipos son DATO, no ley cableada); con base pero sin escala/tipo → cuota:null (no se inventa el tipo). El resultado se toma declarado o pedido a cuenta-resultados POR EVENTO. Responde por estimacion-is-irpf.estimar.response; fallo (project_id ausente) → estimacion-is-irpf.estimar.failed. |
| `contabilidad.asiento_registrado` | `onAsientoRegistrado` | Fire-and-forget (B2 → D5): el diario registro un asiento → se acumula la muestra en el espejo en memoria (idempotente por clave natural o numero). No estima nada; sin base declarada no hay estimacion. |

### Publishes

| Evento | Descripción |
|---|---|
| `estimacion-is-irpf.estimar.response` | Respuesta RPC correlada de estimacion-is-irpf.estimar.request → {request_id, status:200, data:{regimen, origen_resultado, resultado_contable, base_declarada, estimado, cuota, estimacion?, motivo}}. Emitida por el helper _atender. |
| `estimacion-is-irpf.estimar.failed` | Par de fallo determinista (D5): project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de estimacion-is-irpf.estimar.request. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `estimacion-is-irpf.estimar.failed` cierra el círculo de
> `estimacion-is-irpf.estimar.request` cuando `_estimar` devuelve status ≠ 200
> (`project_id` ausente).

> Nota de honestidad (cruce con `index.js`): `onAsientoRegistrado` (fire-and-forget)
> **devuelve `null` siempre** y **no publica ningún evento**: solo refleja la muestra del
> asiento en el espejo (idempotente por `clave_natural`/`numero`). **No estima nada**: sin
> base declarada no hay estimación.

> Nota: no figura en `module.json` pero lo **pide** `index.js` en `_resultado`: la RPC
> saliente `cuenta-resultados.calcular.request` con `{project_id, ejercicio}` y
> `timeout_ms:5000`. Es una dependencia (DEP) por evento, no un evento emitido.

## Reglas de negocio

1. **Fallo determinista**: `_estimar` toma `input.project_id || this.project_id`;
   ausente → `400 INVALID_INPUT` (`field:'project_id'`).
2. **El resultado se declara o se pide, nunca se inventa**: `_resultado(pid, input)` usa
   `input.resultado` si llega (`origen:'declarado_en_peticion'`); si no, pide
   `cuenta-resultados.calcular.request` por evento (`origen:'cuenta-resultados'`); si no
   responde → `{resultado:null, origen:null}`. El resultado **no** se deriva del espejo.
3. **Sin base declarada NO se estima (invariante 7)**: `_base(raw)` exige un objeto con
   `imponible` numérico finito; si no → `200` con `estimado:false`, `cuota:null`,
   `base_declarada:null` y
   `motivo:'no hay base imponible declarada: nada se estima sin base (invariante 7)'`.
4. **La base es DECLARADA, no derivada**: `_base` **no** deriva la base del resultado
   contable — la base fiscal es dato del asesor. Devuelve `{imponible, origen:'declarada'}`.
5. **Los ajustes extracontables son DECLARADOS**: `_ajustes(raw)` suma los `importe`
   (array) o toma el número; sin declarar o inválido → `0` (**neutro, no un ajuste
   inventado**).
6. **La base ajustada es determinista**: `base_ajustada = round(imponible + ajustes, 2)`.
7. **La escala es DECLARABLE** (`_escala(escalas, tramos, tipo)`): array de `{hasta, tipo}`
   (los `hasta` vacíos/null son el **tramo final abierto**); se ordena de forma
   determinista por límite superior (el abierto al final). Con `tipo` único declarado se
   construye `[{hasta:null, tipo}]` (tramo único). **Sin escala ni tipo → `null` (jamás se
   cablea una escala legal).**
8. **Aplicación por tramos determinista** (`_aplicarEscala`): recorre los tramos con un
   `restante` y un `anterior`; `gravado = min(restante, límite − anterior)`;
   `cuota += gravado × tipo`; hasta agotar la base. Redondeo a 2 decimales.
9. **Con base pero SIN escala/tipo → cuota `null`**: `cuota = escala ? aplicarEscala(...) : null`
   y `motivo = 'hay base declarada pero no escala/tipo declarado: el sistema no inventa el tipo'`.
   **El sistema no inventa el tipo.**
10. **La estimación declara lo que usó**: `estimacion = {regimen, base:{imponible,
    ajustes_declarados, imponible_ajustada}, escala:{tramos, origen:'declarada'} | null,
    cuota, tipo_efectivo, presentada:false, firmada:false, preparada_para_asesor:true}`.
    `tipo_efectivo = round(cuota / base_ajustada, 6)` si hay cuota y base ≠ 0, si no `null`.
11. **El régimen es DECLARABLE**: `regimen = input.regimen ?? null` (IS | IRPF), sin
    enumerar valores ni asumir uno por defecto.
12. **El sistema NO presenta ni firma**: la estimación declara `presentada:false`,
    `firmada:false`, `preparada_para_asesor:true`. **No lo asume: lo declara.**
13. **El espejo es idempotente y no decide**: `onAsientoRegistrado` guarda el asiento por
    `clave_natural`/`numero`; no estima nada.
14. **Sin estado persistente**: sin `PosPersistencia`, sin `onProjectActivated`.
15. **HTTP exacto**: éxito `200` (con `estimado` true o false); `project_id` ausente →
    `400`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `estimacion-is-irpf.estimar.response`.

### 1. `estimar` — con base y tramos declarados

```json
{
  "project_id": "e57a318a-...",
  "ejercicio": "2026",
  "regimen": "IS",
  "resultado": 120000,
  "base": { "imponible": 100000 },
  "tramos": [
    { "hasta": 50000, "tipo": 0.15 },
    { "hasta": null, "tipo": 0.25 }
  ],
  "ajustes": [ { "concepto": "multa no deducible", "importe": 2000 } ],
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "ejercicio": "2026",
  "regimen": "IS",
  "origen_resultado": "declarado_en_peticion",
  "resultado_contable": 120000,
  "base_declarada": { "imponible": 100000, "origen": "declarada" },
  "estimado": true,
  "cuota": 20500,
  "motivo": null,
  "estimacion": {
    "regimen": "IS",
    "base": { "imponible": 100000, "ajustes_declarados": 2000, "imponible_ajustada": 102000 },
    "escala": { "tramos": [ { "hasta": 50000, "tipo": 0.15 }, { "hasta": null, "tipo": 0.25 } ], "origen": "declarada" },
    "cuota": 20500,
    "tipo_efectivo": 0.20098,
    "presentada": false,
    "firmada": false,
    "preparada_para_asesor": true
  }
}
```

### 2. Sin base declarada — nada se estima

```json
{ "project_id": "e57a318a-...", "ejercicio": "2026", "regimen": "IRPF" }
```

Respuesta `200`:

```json
{ "regimen": "IRPF", "origen_resultado": "cuenta-resultados", "resultado_contable": 120000, "base_declarada": null, "estimado": false, "cuota": null, "motivo": "no hay base imponible declarada: nada se estima sin base (invariante 7)" }
```

### 3. Con base pero sin escala ni tipo — el sistema no inventa el tipo

```json
{ "project_id": "e57a318a-...", "ejercicio": "2026", "base": { "imponible": 100000 } }
```

Respuesta `200` con `estimado:true`, `cuota:null`, `estimacion.escala:null` y
`motivo:'hay base declarada pero no escala/tipo declarado: el sistema no inventa el tipo'`.

### 4. Fallo — falta `project_id`

```json
{ "ejercicio": "2026", "base": { "imponible": 100000 } }
```

Respuesta `400` + `estimacion-is-irpf.estimar.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/estimacion-is-irpf.test.js`. Cubre:

- `estimar` con `base` + `tramos` declarados → `200 estimado:true`, cuota por tramos
  (límites y tipos son datos), `tipo_efectivo`, `presentada:false`/`firmada:false`.
- `estimar` con `base` + `tipo` único declarado → tramo único.
- **Sin `base`** → `estimado:false`, `cuota:null`, motivo (nada se estima sin base).
- Con `base` **sin** escala/tipo → `estimado:true`, `cuota:null`, motivo (**no se inventa
  el tipo**).
- `ajustes` declarados suman a la base ajustada; sin declarar → `0` (neutro).
- `resultado` declarado → `origen_resultado:'declarado_en_peticion'`; sin él → pedido a
  `cuenta-resultados` por evento (`origen_resultado:'cuenta-resultados'`).
- Tramo final abierto (`hasta:null`) se ordena al final (determinista).
- `estimar` sin `project_id` → `400 INVALID_INPUT` + `estimacion-is-irpf.estimar.failed`.
- `onAsientoRegistrado` refleja y devuelve `null` sin publicar evento.
- `toolEstimar` devuelve la misma proyección que `_estimar`.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `EstimacionIsIrpf extends ModuloHibridoReflejo`; `name = 'estimacion-is-irpf'`,
  `version = 'reflejo-0.1.0'`. Espejo `this._espejo` (`Map<project_id, Map<clave, asiento>>`)
  y `this._declarado` (`Map<project_id, ...>`) para la última base/escala declarada.
  Sin `PosPersistencia`.
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-fiscal/estimacion-is-irpf/`).
- `onEstimarRequest` usa `this._atender(e, 'estimar', 'estimacion-is-irpf.estimar.response',
  async (d) => {...})` y dentro publica `estimacion-is-irpf.estimar.failed` si
  `status !== 200`. `onAsientoRegistrado` **no** usa `_atender`.
- Proyección `_estimar(input)` (`async`, pide el resultado por evento); helpers
  `_resultado`, `_base`, `_ajustes`, `_escala`, `_aplicarEscala`, `_espejoDe`. Tool
  `toolEstimar`.
- `_invalid` / `_rpc` vienen de `modulo-hibrido-reflejo`.
- DEP: pide `cuenta-resultados.calcular.request` (C2) por evento; lo alimenta
  `contabilidad.asiento_registrado` (B2).
- **LA LEY COMO DATO**: la base imponible, los ajustes extracontables, las escalas/
  tramos/tipos y el régimen son **declarables por negocio y ejercicio** — el módulo
  **PREPARA** la estimación; **el sistema no presenta y no firma; el asesor presenta y
  firma**.
