---
name: normalizador-hecho
description: >
  Skill FULL del módulo CONVERSOR `normalizador-hecho` de la vertical contabilidad
  de Enki. UNICA puerta de formato: homogeneiza el hecho de cada vertical a la
  forma asentable del dominio segun una `regla_forma` declarable; lo ausente queda
  null y se lista en `abierto` (nada se estima, [ABIERTO]). Úsala para operar,
  depurar o extender el conversor, o para entender su contrato de eventos y sus
  reglas de negocio.
when-to-use: >
  - Cuando necesites dar forma asentable a un hecho crudo
    (RPC normalizador-hecho.normalizar.request).
  - Cuando depures por qué un hecho no se normaliza (400 INVALID_INPUT si el crudo
    falta o no es objeto).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    invariantes de la puerta unica de formato (regla declarable, nada se estima).
  - Cuando vayas a escribir/ampliar el test unitario del conversor normalizador-hecho.
tags: [enki, modulo, conversor, contabilidad, normalizador-hecho]
---

# normalizador-hecho — CONVERSOR STATELESS de la contabilidad

## Qué hace el módulo

`normalizador-hecho` es un **CONVERSOR STATELESS** (A2, hoja del plan): la **UNICA
puerta de formato**. Homogeneiza el hecho de cada vertical a la **forma asentable**
del dominio. La regla de forma es **DECLARABLE** (`regla_forma`: por campo canonico
su ruta en el crudo + requeridos + clave_natural); sin declararla, la regla es
identidad por nombre canonico y se declara asi en la salida (`regla_declarada:false`)
— nunca se cablea una forma legal.

Campos de la forma asentable: `fecha, importe, moneda, tercero, referencia, concepto,
lineas_impuesto, tipo, vertical` + `clave_natural`. Los campos que no llegan ni se
declaran quedan `null` y se listan en `abierto` ([ABIERTO], nada se estima). No escribe
ni deduplica: asentar es B2, la idempotencia es A7. En exito publica el fire-and-forget
`contabilidad.hecho_normalizado` (lo consumen `deduplicacion-hecho` y `lote-admision`
A7/A9); en error, su par `normalizador-hecho.normalizar.failed`. Sin PosPersistencia y
sin `project.activated`: no es custodio.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `normalizador-hecho.normalizar.request` | `onNormalizarRequest` | RPC conversor: {project_id, crudo, regla_forma?} → {hecho, regla_declarada, requeridos_faltantes, abierto}. Da forma asentable al hecho crudo segun la regla declarable; los campos ausentes quedan null y se declaran en `abierto`. Exito → publica contabilidad.hecho_normalizado y responde por normalizador-hecho.normalizar.response; crudo ausente → normalizador-hecho.normalizar.failed. |
| `contabilidad.hecho_crudo` | `onHechoCrudo` | Fire-and-forget (A2): puerto-evento-vertical (A1) publica un hecho crudo → {project_id, crudo:{vertical, tipo, clave_natural, payload, faltantes}, correlation_id}. Misma proyeccion que el RPC: normaliza a la forma asentable y publica contabilidad.hecho_normalizado; invalido → normalizador-hecho.normalizar.failed. Cierra el circulo del flujo de entrada. |

### Publishes

| Evento | Descripción |
|---|---|
| `normalizador-hecho.normalizar.response` | Respuesta RPC correlada de normalizador-hecho.normalizar.request → {request_id, status:200, data:{hecho, regla_declarada, requeridos_faltantes, abierto}}. Emitida por el helper _atender. |
| `normalizador-hecho.normalizar.failed` | Par de fallo determinista (A2): crudo ausente o invalido → {status, error:{code, message, details?}}. Cierra el circulo de normalizador-hecho.normalizar.request y de contabilidad.hecho_crudo. |
| `contabilidad.hecho_normalizado` | Fire-and-forget (A2): un hecho quedo homogeneizado a la forma asentable → {project_id, hecho, clave_natural, abierto, correlation_id}. Lo consumen deduplicacion-hecho y lote-admision (A7/A9). |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `normalizador-hecho.normalizar.failed` cierra el círculo de
> `normalizador-hecho.normalizar.request` **y** de `contabilidad.hecho_crudo`, porque
> `onNormalizarRequest` y `onHechoCrudo` usan la misma proyeccion `_normalizar`.

> Nota: `onHechoCrudo` recibe el evento por `e.data || e`, toma `d.crudo || d` como
> fuente y reenvia `regla_forma`/`correlation_id`; publica `contabilidad.hecho_normalizado`
> o `normalizador-hecho.normalizar.failed`.

## Reglas de negocio

1. **UNICA puerta de formato**: solo este modulo da forma asentable. Constante
   `CAMPOS_HECHO = ['fecha','importe','moneda','tercero','referencia','concepto',
   'lineas_impuesto','tipo','vertical']` (+ `clave_natural`).
2. **Regla de forma DECLARABLE**: `regla_forma = {campos:{<campo>:<ruta>},
   requeridos:[...], clave_natural:<ruta>}`. Sin regla, la ruta de cada campo es su
   propio nombre canonico y `regla_declarada:false`. Nunca se cablea una forma legal.
3. **Rutas con punto**: `_leerRuta(payload, 'a.b')` navega rutas anidadas; un tramo
   `null`/`undefined` da `undefined`.
4. **Dato ausente = desconocido (cero estimacion)**: valor `undefined`/`null`/`''` →
   `null` y se empuja a `abierto`. Marca `[ABIERTO]`.
5. **Crudo envuelto o plano**: si el crudo trae `payload` (sobre `HechoCrudo`), se usa
   `crudo.payload`; si no, el crudo entero. `vertical`/`tipo` se toman del sobre si los
   trae, si no del payload; los que queden resueltos salen de `abierto` y los que
   falten entran.
6. **Clave natural NO se inventa**: la declara el crudo (`crudo.clave_natural`) o la
   declara la regla (`regla.clave_natural` como ruta); si no, queda `null` y entra en
   `abierto`.
7. **`requeridos_faltantes`**: los campos de `regla.requeridos` que falten en el hecho
   — señal de que la normalizacion no es utilizable (pero no aborta: status `200`).
8. **No escribe ni deduplica**: asentar es B2, idempotencia A7. No persiste.
9. **Validacion determinista de payload**: `crudo` (o `hecho_crudo`) ausente/no objeto
   → `400 INVALID_INPUT` (`_invalid('crudo')`).
10. **HTTP exacto**: éxito `200`; crudo inválido → `400`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `normalizador-hecho.normalizar.response` y emite `contabilidad.hecho_normalizado`.

### 1. `normalizar` (RPC) — crudo a forma asentable

```json
{
  "project_id": "e57a318a-...",
  "crudo": {
    "vertical": "pizzepos", "tipo": "venta", "clave_natural": "pizzepos:venta:0001",
    "payload": { "fecha": "2026-09-01", "importe": 121, "moneda": "EUR", "cliente": "ACME" }
  },
  "regla_forma": { "campos": { "tercero": "cliente" }, "requeridos": ["fecha", "importe"] },
  "correlation_id": "abc-123"
}
```

Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "regla_declarada": true,
  "requeridos_faltantes": [],
  "abierto": ["referencia", "concepto", "lineas_impuesto"],
  "hecho": { "fecha": "2026-09-01", "importe": 121, "moneda": "EUR", "tercero": "ACME", "referencia": null, "concepto": null, "lineas_impuesto": null, "tipo": "venta", "vertical": "pizzepos", "clave_natural": "pizzepos:venta:0001" }
}
```
Emite `contabilidad.hecho_normalizado`:
```json
{ "project_id": "e57a318a-...", "hecho": { "...": "..." }, "clave_natural": "pizzepos:venta:0001", "abierto": ["referencia", "concepto", "lineas_impuesto"], "correlation_id": "abc-123" }
```

### 2. Fire-and-forget — reaccion a `contabilidad.hecho_crudo`

`onHechoCrudo` toma `d.crudo || d`, normaliza con `regla_forma`/`correlation_id` del
evento y publica `contabilidad.hecho_normalizado` (no responde).

### 3. Fallo — crudo ausente

```json
{ "project_id": "e57a318a-..." }
```
Respuesta `400` + `normalizador-hecho.normalizar.failed`:
```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "crudo requerido", "details": { "field": "crudo" } } }
```

## Tests

El test vive en `tests/unit/normalizador-hecho.test.js`. Cubre:

- `normalizar` con `regla_forma` declarada → `200 regla_declarada:true`, mapeo por ruta
  (`tercero→cliente`), `abierto` con los campos no presentes y emite
  `contabilidad.hecho_normalizado`.
- sin `regla_forma` → `regla_declarada:false` y rutas por nombre canonico.
- `requeridos` ausentes → aparecen en `requeridos_faltantes` (sin abortar).
- `crudo` ausente/no objeto → `400 INVALID_INPUT` (`field:'crudo'`).
- `onHechoCrudo` (fire-and-forget) normaliza el sobre y publica el evento de dominio.
- `clave_natural` del crudo prevalece; si no, se resuelve por ruta declarada; si no, `null` en `abierto`.
- `toolNormalizar` devuelve la misma proyeccion que `_normalizar`.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `NormalizadorHecho extends ModuloHibridoReflejo`; `name = 'normalizador-hecho'`,
  `version = 'reflejo-0.1.0'`. Sin `PosPersistencia`, sin store, sin
  `onProjectActivated` (CONVERSOR stateless).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-entrada/normalizador-hecho/`).
- `onNormalizarRequest` usa `this._atender(e, 'normalizar',
  'normalizador-hecho.normalizar.response', async (d) => {...})`. `onHechoCrudo` NO
  usa `_atender`: llama a `_normalizar` y publica el evento de dominio o el fallo.
- Proyeccion unica `_normalizar(input)` → `{status, data}`; helper `_leerRuta(obj, ruta)`.
  Tool directa `toolNormalizar`.
- `_invalid` / `_errorResponse` vienen de `modulo-hibrido-reflejo`.
- DEP: lo dispara `puerto-evento-vertical` (A1); lo consumen `deduplicacion-hecho` y
  `lote-admision` (A7/A9) via `contabilidad.hecho_normalizado`.
