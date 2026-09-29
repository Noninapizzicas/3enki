---
name: rappel-pronto-pago
description: >
  Skill FULL del módulo REFLEJO `rappel-pronto-pago` de la vertical contabilidad de Enki.
  Ajusta el coste real de la compra a lo realmente pagado (pronto pago/rappels/anticipos) con
  porcentajes, plazos y tramos DECLARABLES — jamás cableados — y con las condiciones sin dato
  declarado PENDIENTES en vez de aplicadas. Sin estado. Úsala para operar, depurar o extender el
  reflejo, o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites el coste real de una factura de compra tras los descuentos que se aplican (RPC
    rappel-pronto-pago.ajustar.request).
  - Cuando depures por qué `disponible:false` (la factura no declara importe), por qué una condición
    va a `condiciones_inaplicables` (sin porcentaje) o a `condiciones_pendientes_de_dato` (sin
    `dias_pago`/`volumen`).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las invariantes del
    ajuste (determinista, parámetro como dato, cada descuento con su justificación).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo rappel-pronto-pago.
tags: [enki, modulo, reflejo, contabilidad, rappel-pronto-pago]
---

# rappel-pronto-pago — REFLEJO STATELESS del ajuste del coste real

## Qué hace el módulo

`rappel-pronto-pago` es un **REFLEJO STATELESS** (N7, hoja del plan): **DESCUENTOS / RAPPELS /
ANTICIPOS QUE AJUSTAN EL COSTE REAL DE LA COMPRA A LO REALMENTE PAGADO.** Determinista: dada la
factura (o su importe declarado) y las **CONDICIONES DECLARADAS**, se calcula el **coste real**
(importe menos los descuentos que **efectivamente se aplican**) y lo que queda **pendiente**.

Atributos del diseño: `compra:Factura`, `condiciones:ParametroDeclarable`. Métodos:
`ajustar(f:Factura):Cuantía`.

**🔴 LOS PORCENTAJES Y LAS CONDICIONES SON DECLARABLES — PROHIBIDO CABLEARLOS.** En este fichero
**NO** hay ningún porcentaje, ningún plazo ni ningún umbral escrito: ni «2% a 10 días», ni «1% a
30», ni tramos de rappel, ni un mínimo de anticipo. Todo entra como **DATO** (`condiciones`):

- **pronto pago** → `{tipo:'pronto_pago', porcentaje, dias}` (el `dias` es la condición declarada);
- **rappel** → `{tipo:'rappel', tramos:[{desde,hasta,porcentaje}], volumen|base}` o `{porcentaje}`;
- **anticipo** → `{tipo:'anticipo', porcentaje, dias}` (condición declarada);
- **descuento** → `{tipo:'descuento', porcentaje}`.

Si una condición **no declara su porcentaje**, esa condición **NO es aplicable** y se declara
(`condiciones_inaplicables`): **NO se asume un porcentaje**. Si **NO se declara ninguna condición**,
el coste real es el declarado y se dice que **no hay descuento** — un descuento inventado rebajaría
el coste de la compra que el negocio no aprobó.

**🔴 LA CONDICIÓN SE APLICA SOLO SI SE CUMPLE CON LO DECLARADO.** El pronto pago/anticipo con plazo
exige los **DÍAS REALES de pago** declarados (`dias_pago`); sin ese dato, la condición queda
**PENDIENTE de dato** (`condiciones_pendientes_de_dato`), ni se aplica ni se descarta. El rappel por
tramos exige el `volumen`/`base` declarado y aplica el tramo declarado en que cae.

Invariantes:

- **DETERMINISTA**: misma factura + mismas condiciones + mismos datos de pago → mismo coste real.
- **Dato ausente = desconocido**: sin importe no hay coste (`disponible:false`); sin dato para
  aplicar una condición esta queda **pendiente**; nada se estima. Los pagos declarados se leen tal
  cual (`total_pagado`), **no se suponen**. Sin pagos declarados → `pendiente:null` (**no se estima**).
- **NO escribe, NO persiste, NO muta y NO decide**: el ajuste es un **DERIVADO**.
- **Cada descuento aplicado viaja con SU condición declarada y el dato que lo justifica**
  (`justificacion`) — **auditable, no caja negra**.
- **Sin `PosPersistencia` y sin `project.activated`**: no es custodio.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `rappel-pronto-pago.ajustar.request` | `onAjustarRequest` | RPC reflejo (calculo puro, determinista): {project_id, factura:{importe?, clave_natural?, condiciones?, pagos?}\|importe?, condiciones?:[{tipo:'pronto_pago'\|'rappel'\|'anticipo'\|'descuento', porcentaje?, dias?, tramos?:[{desde,hasta,porcentaje}], base?, origen?}], dias_pago?, volumen?, pagos?, total_pagado?} → {project_id, tipo:'rappel-pronto-pago', factura, importe, descuento_total, coste_real, disponible, descuentos_aplicados:[{tipo, porcentaje, base, descuento, justificacion}], condiciones_inaplicables, condiciones_pendientes_de_dato, condiciones_declaradas, total_pagado, pendiente, abierto}. Los porcentajes, plazos y tramos son DECLARABLES: una condicion sin porcentaje NO es aplicable y una condicion con plazo sin dias_pago declarado queda PENDIENTE. Responde por rappel-pronto-pago.ajustar.response; project_id ausente → rappel-pronto-pago.ajustar.failed. OJO: sin importe declarado NO es un fallo — se responde 200 con disponible:false. |

### Publishes

| Evento | Descripción |
|---|---|
| `rappel-pronto-pago.ajustar.response` | Respuesta RPC correlada de rappel-pronto-pago.ajustar.request → {request_id, status:200, data:{importe, descuento_total, coste_real, disponible, descuentos_aplicados, condiciones_inaplicables, condiciones_pendientes_de_dato, condiciones_declaradas, total_pagado, pendiente, abierto}}. Emitida por el helper _atender. |
| `rappel-pronto-pago.ajustar.failed` | Par de fallo determinista (N7): project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de rappel-pronto-pago.ajustar.request. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `rappel-pronto-pago.ajustar.failed` cierra el círculo de `rappel-pronto-pago.ajustar.request`
> cuando `_ajustar` devuelve status ≠ 200 (`400 INVALID_INPUT` por `project_id` ausente). **OJO**:
> sin importe declarado **NO es un fallo**: se responde `200` con `disponible:false`.

> Nota: **no hay fire-and-forget** en este módulo. El único subscribe es la RPC
> `rappel-pronto-pago.ajustar.request`; los demás publishers son su response y su `failed`.

## Reglas de negocio

1. **La FACTURA** (`input.factura`, objeto) es opcional como objeto; el **importe** (`_importe`) es
   `input.importe` o `factura.importe`/`factura.total`/`factura.base_imponible` (valor absoluto).
   **Sin importe → `disponible:false`**, `coste_real:null` y `abierto.importe` («no hay coste que
   ajustar (nada se estima)»). **No es un fallo.**
2. **Las CONDICIONES son DECLARADAS** (`_condiciones`): `input.condiciones`/`input.condicion` o
   `factura.condiciones`; ausente → `[]`. Cada condición se normaliza a
   `{tipo, porcentaje, dias, tramos, base, origen, aplicable, motivo, declarado}`. El **tipo** debe
   estar en `TIPOS_CONDICION = {pronto_pago, rappel, anticipo, descuento}` (`toLowerCase().trim()`);
   un tipo no reconocible se **descarta** (no se aplica). El `dias` sale de `dias`/`plazo`.
3. **El PORCENTAJE** (`_porcentaje`): `porcentaje` → `pct` → `tanto_por_ciento` → `descuento_pct` →
   `descuento` (no objeto). **Sin porcentaje → `aplicable:false`, `motivo:'sin_porcentaje'`** («NO se
   asume uno (PROHIBIDO cablear)»).
4. **La BASE**: `c.base` (valor absoluto) o el importe de la factura. `descuento = base × pct / 100`
   (redondeado a 2).
5. **RAPPEL por TRAMOS** (`c.tramos` array): exige el `volumen` declarado
   (`input.volumen` → `c.volumen` → `factura.volumen`); sin él → **`pendiente_de_dato`**
   (`motivo:'sin_volumen'`). Localiza el tramo donde cae el volumen (`desde <= volumen <= hasta`;
   límites `null` = abierto); sin tramo → `inaplicable` (`sin_tramo`); tramo sin porcentaje →
   `inaplicable` (`sin_porcentaje`). `justificacion` declara el tramo y el porcentaje.
6. **PRONTO PAGO / ANTICIPO con plazo**: si la condición declara `dias`, exige `dias_pago`
   (`input.dias_pago` → `c.dias_pago` → `factura.dias_pago`); sin él → **`pendiente_de_dato`**
   (`sin_dias_pago`: ni se aplica ni se descarta). Si `dias_pago > c.dias` → **`inaplicable`**
   (`fuera_de_plazo`, con `dias_pago` y `dias_declarados`). Si está dentro → **`aplicada`** con
   `justificacion`. **El plazo no está cableado: lo declara la condición.**
7. **DESCUENTO (o condición sin plazo)**: se aplica sobre la base declarada al porcentaje declarado.
8. **Los tres estados**: `aplicada`, `pendiente_de_dato`, `inaplicable` → se reparten en
   `descuentos_aplicados`, `condiciones_pendientes_de_dato` y `condiciones_inaplicables`.
9. **El DESCUENTO TOTAL**: la suma de los aplicados; sin condiciones aplicadas → `0` (**no se
   inventa**). `coste_real = importe − descuento_total` (redondeado a 2).
10. **Lo pagado** (`_pagos`): `input.pagos` (lista) o `factura.pagos`, o `input.total_pagado`/
    `factura.total_pagado` (valor absoluto). **Ausente → `null`** (`pendiente:null`, **no se asume
    pagado**). `pendiente = importe − total_pagado`.
11. **`condiciones_declaradas`** devuelve cada condición declarada tal cual
    (`{tipo, porcentaje, dias, aplicable}`) — **nada cableado**; `deriva_de:['condiciones declaradas
    (ParametroDeclarable)']`.
12. **`abierto` declara lo que falta**: `condiciones` (ninguna declarada → coste real sin descuento),
    `porcentajes` (hay condiciones sin porcentaje), `datos_de_pago` (condiciones pendientes de dado),
    `total_pagado` (hay condiciones pero no se declararon pagos → el pendiente **no se estima**).
13. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente →
    `400 INVALID_INPUT` (`field:'project_id'`).
14. **HTTP exacto**: éxito `200` (también con `disponible:false`); `project_id` ausente → `400`;
    excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `rappel-pronto-pago.ajustar.response`. **No emite evento de dominio.**

### 1. `ajustar` — pronto pago declarado que se cumple

```json
{
  "project_id": "e57a318a-...",
  "importe": 1000,
  "condiciones": [ { "tipo": "pronto_pago", "porcentaje": 2, "dias": 10 } ],
  "dias_pago": 7,
  "correlation_id": "abc-123"
}
```

Respuesta `200`: `importe:1000`, `descuento_total:20`, `coste_real:980`, `disponible:true`,
`descuentos_aplicados:[{tipo:'pronto_pago', porcentaje:2, base:1000, descuento:20,
justificacion:'pago a 7 dias, dentro del plazo declarado (<= 10) al 2%'}]`,
`condiciones_declaradas:[{tipo:'pronto_pago', porcentaje:2, dias:10, aplicable:true}]`,
`total_pagado:null`, `pendiente:null`.

### 2. `ajustar` — condición con plazo pero sin `dias_pago` → PENDIENTE

Sin `dias_pago` → la condición va a `condiciones_pendientes_de_dato` (`motivo:'sin_dias_pago'`) y
`abierto.datos_de_pago` («no se aplican ni se descartan»). `descuento_total:0`, `coste_real:importe`.

### 3. `ajustar` — condición sin porcentaje → NO aplicable

`{tipo:'descuento'}` sin `porcentaje` → `condiciones_inaplicables` (`motivo:'sin_porcentaje'`) y
`abierto.porcentajes` («esas condiciones NO son aplicables (no se asume un porcentaje)»).

### 4. `ajustar` — rappel por tramos declarados

`{tipo:'rappel', tramos:[{desde:0,hasta:5000,porcentaje:1},{desde:5001,hasta:null,porcentaje:3}]}`
con `volumen:6000` → tramo `[5001..-]` al 3%, `justificacion` declara el volumen y el tramo. Sin
`volumen` → `pendiente_de_dato` (`sin_volumen`).

### 5. `ajustar` — sin importe → `disponible:false` (no es fallo)

`disponible:false`, `coste_real:null`, `abierto.importe`. **No se estima ningún coste.**

### 6. Fallo — falta `project_id`

Respuesta `400` + `rappel-pronto-pago.ajustar.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/rappel-pronto-pago.test.js`. Cubre:

- Pronto pago declarado dentro de plazo → `descuento_total`, `coste_real` y `justificacion`.
- Condición con plazo **sin `dias_pago`** → `condiciones_pendientes_de_dato` (**ni se aplica ni se
  descarta**).
- Condición **sin porcentaje** → `condiciones_inaplicables` (**no se asume porcentaje**).
- Rappel por **tramos declarados** → cae en el tramo correcto; sin `volumen` → `pendiente_de_dato`.
- Pago **fuera de plazo** → `inaplicable` (`fuera_de_plazo`).
- **Sin condiciones declaradas** → `descuento_total:0`, coste real = declarado, `abierto.condiciones`.
- **Sin importe** → `disponible:false` (**no es fallo**).
- Sin pagos declarados → `pendiente:null` (**no se estima pagado**).
- **Determinismo**: misma factura + mismas condiciones + mismos datos de pago → mismo coste real.
- `project_id` ausente → `400 INVALID_INPUT` + `rappel-pronto-pago.ajustar.failed`.
- `toolAjustar` devuelve la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `RappelProntoPago extends ModuloHibridoReflejo`; `name = 'rappel-pronto-pago'`,
  `version = 'reflejo-0.1.0'`. Sin `PosPersistencia`, sin store, sin `onProjectActivated`
  (REFLEJO stateless).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-entrada/rappel-pronto-pago/`; es de la vertical **entrada**).
- Constante de **FORMA** (identidad de tipo, no criterio): `TIPOS_CONDICION = new Set(['pronto_pago',
  'rappel', 'anticipo', 'descuento'])`. **QUÉ se aplica y CUÁNTO lo declara el negocio.**
- `onAjustarRequest` usa `this._atender(e, 'ajustar', 'rappel-pronto-pago.ajustar.response',
  async (d) => {...})` y publica `rappel-pronto-pago.ajustar.failed` si `status !== 200`.
- Proyección `_ajustar(input)` (**sync**, cálculo puro); helpers `_evaluar` (evalúa UNA condición),
  `_condiciones`, `_porcentaje`, `_base`, `_importe`, `_pagos`, `_fichaFactura`, `_num`. Tool
  `toolAjustar`.
- `_invalid` / `_round` vienen de `modulo-hibrido-reflejo`.
- **🔴 PORCENTAJES Y CONDICIONES DECLARABLES**: **cero porcentajes, plazos, umbrales o tramos
  cableados**. Sin importe no hay coste; una condición sin porcentaje **no es aplicable**; una
  condición con plazo sin dato de pago queda **PENDIENTE**. **Un descuento inventado rebajaría el
  coste de la compra que el negocio no aprobó.**
- **AUDITABLE, NO CAJA NEGRA**: cada descuento aplicado viaja con su condición declarada y su
  `justificacion` (el dato que lo justifica).
- **DATO AUSENTE = DESCONOCIDO**: `disponible:false` sin importe; `pendiente:null` sin pagos
  declarados. **NO escribe, NO persiste, NO muta.**
