---
name: prevision-caja
description: >
  Skill FULL del módulo REFLEJO `prevision-caja` de la vertical contabilidad de Enki.
  PROYECTA ENTRADAS Y SALIDAS de caja desde los vencimientos y el saldo de tesorería con la
  POLÍTICA DECLARADA — declara sus SUPUESTOS y no estima nada sin base declarada; lo no
  proyectable va a `no_proyectables`. Sin estado. Úsala para operar, depurar o extender el
  reflejo, o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites la previsión de caja (RPC prevision-caja.proyectar.request).
  - Cuando depures por qué `disponible:false` (sin saldo base E4), por qué un vencimiento va a
    `no_proyectables` (sin fecha o sin lado) o por qué `completo:false`.
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las invariantes de
    la previsión (nada se estima sin base declarada, los supuestos viajan explícitos, el signo
    sale del lado, serie determinista).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo prevision-caja.
tags: [enki, modulo, reflejo, contabilidad, prevision-caja]
---

# prevision-caja — REFLEJO STATELESS de la proyección de caja

## Qué hace el módulo

`prevision-caja` es un **REFLEJO STATELESS** (E5, hoja del plan): **PROYECTA ENTRADAS Y
SALIDAS de caja** a partir de los **COMPROMISOS** (vencimientos) y el **SALDO de tesorería**,
aplicando la **POLÍTICA DECLARADA**. Determinista: misma lista de vencimientos + mismo saldo
+ misma política → **misma serie**.

**INVARIANTE 7 — NADA SE ESTIMA SIN BASE DECLARADA**: la previsión solo suma lo que tiene
**fecha de vencimiento CONOCIDA** y una base declarada. Un vencimiento sin fecha
(`[ABIERTO]`) **NO se coloca en ningún tramo**: se declara aparte (`no_proyectables`) y **no
se rellena con una suposición**. Si falta el **saldo inicial**, la serie se declara **SIN
base** (`disponible:false`, `serie:[]`).

**DECLARA SUPUESTOS**: todo lo que entra en la proyección viaja explícitamente en
`supuestos` (agrupación, horizonte, cuenta, política, fuente del saldo, y la regla
`solo_vencimientos_con_fecha`) — **nada queda implícito**.

Fuentes, todas **POR EVENTO** (**nunca `require` cruzado**):

- **`saldo-tesoreria.calcular.request`** (E4) → el saldo inicial.
- **`vencimiento-pago.calcular.request`** (N6) por cada factura (o los vencimientos
  declarados).

El **SIGNO** de cada línea sale del **LADO declarado** del vencimiento (**cobro → entra**,
**pago → sale**), no de una constante; **sin lado declarado el vencimiento no es
proyectable**. La **agrupación** de la serie (diaria/semanal/mensual/anual) es **DECLARABLE**;
sin declararla se usa `'mensual'`, que viaja como **supuesto visible**. Determinista y puro:
**NO escribe, NO persiste, NO muta**. Sin `PosPersistencia` ni `project.activated`: **no es
custodio**.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `prevision-caja.proyectar.request` | `onProyectarRequest` | RPC reflejo (calculo puro, determinista): {project_id, hasta?, agrupacion?('diaria'\\|'semanal'\\|'mensual'\\|'anual'), cuenta?, desde?, facturas?\\|vencimientos?, politica?, lado?} → {project_id, hasta, agrupacion, disponible, supuestos, saldo_inicial, saldo_final, num_tramos, serie:[{tramo, entradas, salidas, neto, saldo}], no_proyectables:[{vencimiento, motivo}], completo}. Pide el saldo a saldo-tesoreria (E4) y los vencimientos a vencimiento-pago (N6) por EVENTO; sin saldo base → disponible:false y serie vacia (no se estima); los vencimientos sin fecha o sin lado van a no_proyectables (no se colocan por suposicion). Exito → publica contabilidad.vencimiento_proximo por tramo y responde por prevision-caja.proyectar.response; project_id ausente → prevision-caja.proyectar.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `prevision-caja.proyectar.response` | Respuesta RPC correlada de prevision-caja.proyectar.request → {request_id, status:200, data:{serie, saldo_inicial, saldo_final, no_proyectables, supuestos, completo}}. Emitida por el helper _atender. |
| `prevision-caja.proyectar.failed` | Par de fallo determinista (E5): project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de prevision-caja.proyectar.request. |
| `contabilidad.vencimiento_proximo` | Fire-and-forget (E5, uno por tramo de la serie): un tramo de la prevision de caja quedo proyectado → {project_id, tramo, hasta, saldo_proyectado, supuestos, correlation_id}. Lo LEEN las cupulas de negocio y el aviso proactivo. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `prevision-caja.proyectar.failed` cierra el círculo de
> `prevision-caja.proyectar.request` cuando `_proyectar` devuelve status ≠ 200 (`400`,
> `project_id` ausente).

> Nota de honestidad (cruce con `index.js`): `onProyectarRequest` publica
> `contabilidad.vencimiento_proximo` **una vez por cada tramo de la serie** (`for (const
> tramo of res.data.serie)`), **solo si `_proyectar` devuelve `200`**. Si la serie está vacía
> (`disponible:false`) **no se emite ningún tramo**. La rama `else` publica
> `prevision-caja.proyectar.failed`.

> Nota: la respuesta **sin saldo base** es `200` con `disponible:false`, `serie:[]`,
> `saldo_inicial:null`, `no_proyectables` (los vencimientos sin fecha) y un campo
> **`motivo` no listado en el `description`** del module.json:
> `'no hay saldo de tesoreria (E4) disponible: la prevision no se estima sin base declarada'`.

## Reglas de negocio

1. **El saldo inicial sale de E4 POR EVENTO**: `saldo-tesoreria.calcular.request`
   (`{project_id, cuenta, fecha:desde}`, `timeout_ms:4000`). `saldo_inicial` solo se acepta
   si `saldo_total` es **número**; si no → `null`.
2. **Sin saldo base NO se estima**: `saldo_inicial === null` → `200` con `disponible:false`,
   `serie:[]`, `saldo_inicial:null`, `motivo` declarado; `no_proyectables` son los
   vencimientos sin fecha. **La serie no se rellena con suposiciones.**
3. **Los vencimientos, dos vías**: si `input.vencimientos` es array → se usan; si no, si
   `input.facturas` es array → se pide a `vencimiento-pago.calcular.request` (N6) **una vez
   por factura** (`timeout_ms:4000`), pasando `lado`, `politica` y `hoy:desde`; se acumulan
   los `vencimiento` devueltos. Sin ninguna de las dos → `[]`.
4. **`supuestos` — todo explícito**: `{agrupacion, hasta, cuenta (o 'todas'), politica,
   saldo_inicial_fuente ('saldo-tesoreria' o null), solo_vencimientos_con_fecha:true}`. La
   regla de la invariante 7 **viaja como supuesto visible**, no como comentario.
5. **Agrupación declarable**: `input.agrupacion` (minúsculas, trim) o `'mensual'`
   (`AGRUPACION_DEFECTO`) — un **default declarado y visible**, no una ley.
6. **Solo lo que tiene fecha se proyecta**: si `_fechaDe(v)` es `null` →
   `no_proyectables` con `motivo:'sin fecha de vencimiento declarada: [ABIERTO]'`.
   `_fechaDe` lee `v.fecha_vencimiento` o `v.fecha`, normaliza a `YYYY-MM-DD`; fecha
   ilegible → `null`. **`[ABIERTO]` no se coloca por suposición.**
7. **Horizonte declarado**: un vencimiento cuya fecha es `> hasta` se **descarta** (fuera del
   horizonte declarado) — no entra en la serie **ni** en `no_proyectables`.
8. **Sin importe no se proyecta**: `importe` no numérico → `no_proyectables` con
   `motivo:'sin importe declarado'`. `_num` devuelve `Math.abs(Number(...))` o `null`.
9. **El signo sale del LADO declarado** (dato, no constante): `lado === 'cobro'` → `+1`;
   `lado === 'pago'` → `-1`; cualquier otro o ausente → `0` → `no_proyectables` con
   `motivo:'sin lado (pago/cobro) declarado: no se sabe si entra o sale'`.
10. **Serie determinista**: los proyectables se agrupan por `_tramo(fecha, agrupacion)` en un
    `Map`: `entradas` suman los signo > 0, `salidas` suman los signo < 0; los valores se
    redondean a 2 en cada acumulación.
11. **Clave de tramo** (`_tramo`): `'diaria'` → `YYYY-MM-DD`; `'anual'` → `YYYY`; `'semanal'`
    → el **lunes** de esa semana ISO (`dow = (getUTCDay()+6)%7`); cualquier otra → `YYYY-MM`
    (mensual).
12. **Serie ordenada y acumulada**: los tramos se ordenan por `localeCompare` (determinista)
    y se acumulan con el saldo anterior (el primero parte del `saldo_inicial`); cada tramo
    queda `{tramo, entradas, salidas, neto, saldo}`.
13. **`saldo_final`**: el saldo del último tramo; si la serie quedó vacía, el propio
    `saldo_inicial`.
14. **`completo`**: `no_proyectables.length === 0` — si algo quedó sin proyectar, la previsión
    se declara **incompleta** y se declara por qué.
15. **`num_tramos`**: número de tramos de la serie.
16. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente →
    `400 INVALID_INPUT` (`field:'project_id'`).
17. **Puro**: sin persistencia, sin reloj, sin azar. `hasta`/`desde` son **declarados**.
18. **HTTP exacto**: éxito `200`; `project_id` ausente → `400`; excepción en `_atender` →
    `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `prevision-caja.proyectar.response`; emite `contabilidad.vencimiento_proximo`
**por tramo**.

### 1. `proyectar` — la serie de caja

```json
{
  "project_id": "e57a318a-...",
  "hasta": "2026-12-31",
  "desde": "2026-09-30",
  "agrupacion": "mensual",
  "cuenta": null,
  "vencimientos": [
    { "clave_natural": "prov-x:factura:1", "lado": "pago", "fecha_vencimiento": "2026-10-01", "importe": 1210.5 },
    { "clave_natural": "cliente-y:factura:2", "lado": "cobro", "fecha_vencimiento": "2026-10-15", "importe": 500.0 }
  ],
  "politica": { "dias": 30, "base": "emision" },
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "hasta": "2026-12-31",
  "agrupacion": "mensual",
  "disponible": true,
  "supuestos": { "agrupacion": "mensual", "hasta": "2026-12-31", "cuenta": "todas", "politica": { "dias": 30, "base": "emision" }, "saldo_inicial_fuente": "saldo-tesoreria", "solo_vencimientos_con_fecha": true },
  "saldo_inicial": 3000.0,
  "saldo_final": 2289.5,
  "num_tramos": 1,
  "serie": [ { "tramo": "2026-10", "entradas": 500.0, "salidas": 1210.5, "neto": -710.5, "saldo": 2289.5 } ],
  "no_proyectables": [],
  "completo": true
}
```

Emite `contabilidad.vencimiento_proximo` **por cada tramo**:

```json
{ "project_id": "e57a318a-...", "tramo": { "tramo": "2026-10", "entradas": 500.0, "salidas": 1210.5, "neto": -710.5, "saldo": 2289.5 }, "hasta": "2026-12-31", "saldo_proyectado": 2289.5, "supuestos": { "...": "..." }, "correlation_id": "abc-123" }
```

### 2. Sin saldo base (E4 no responde) — **no se estima**

```json
{
  "project_id": "e57a318a-...",
  "hasta": "2026-12-31",
  "agrupacion": "mensual",
  "disponible": false,
  "supuestos": { "...": "..." },
  "saldo_inicial": null,
  "serie": [],
  "no_proyectables": [ { "vencimiento": { "...": "..." }, "motivo": "sin fecha de vencimiento declarada: [ABIERTO]" } ],
  "motivo": "no hay saldo de tesoreria (E4) disponible: la prevision no se estima sin base declarada"
}
```

### 3. Vencimiento sin lado → `no_proyectables`

`motivo:'sin lado (pago/cobro) declarado: no se sabe si entra o sale'` — **no se asume que
entre**.

### 4. Fallo — falta `project_id`

Respuesta `400` + `prevision-caja.proyectar.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/prevision-caja.test.js`. Cubre:

- `proyectar` con saldo (E4) y vencimientos declarados → serie ordenada con `saldo`
  acumulado y `completo:true`; emite `contabilidad.vencimiento_proximo` por tramo.
- Sin saldo base → `disponible:false`, `serie:[]`, `motivo` (**nada se estima**).
- Vencimiento sin fecha → `no_proyectables` con el motivo `[ABIERTO]`.
- Vencimiento sin lado → `no_proyectables` (**no se asume el sentido**).
- Vencimiento sin importe → `no_proyectables`.
- El signo sale del lado: `cobro` → `entradas`, `pago` → `salidas`.
- Agrupación declarable (`diaria`/`semanal`/`mensual`/`anual`) → clave de tramo correcta;
  sin declarar → `'mensual'` y viaja en `supuestos`.
- Vencimiento fuera del horizonte (`> hasta`) → descartado.
- **Determinismo**: misma entrada → misma serie.
- `project_id` ausente → `400 INVALID_INPUT` + `prevision-caja.proyectar.failed`.
- `toolProyectar` devuelve la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `PrevisionCaja extends ModuloHibridoReflejo`; `name = 'prevision-caja'`,
  `version = 'reflejo-0.1.0'`. Sin `PosPersistencia`, sin store, sin `onProjectActivated`
  (REFLEJO stateless). Constante `AGRUPACION_DEFECTO = 'mensual'` (default **declarado**).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-libro/prevision-caja/`; es de la vertical **libro**).
- `onProyectarRequest` usa `this._atender(e, 'proyectar', 'prevision-caja.proyectar.response',
  async (d) => {...})` y dentro hace el cierre de círculo (evento de dominio por tramo en
  `200`, par `failed` si no).
- Proyección `_proyectar(input)` (`async`: pide saldo y vencimientos por evento); helpers
  `_vencimientos`, `_fechaDe`, `_tramo`, `_num`. Tool `toolProyectar`.
- `_invalid` / `_round` / `_rpc` vienen de `modulo-hibrido-reflejo`.
- DEP: lee `saldo-tesoreria.calcular.request` (E4) y `vencimiento-pago.calcular.request`
  (N6) por EVENTO. E8 (`regla-movimiento-bancario.aplicar.request`) **NO** se usa aquí (el
  cierre por regla es E1). Lo LEEN las cúpulas de negocio y el aviso proactivo vía
  `contabilidad.vencimiento_proximo`.
- **PARÁMETRO COMO DATO**: agrupación, horizonte, cuenta, política, lado y `hoy` son
  **declarables**; los supuestos **viajan explícitos** y nada se estima sin base declarada.
