---
name: antiguedad-de-saldos
description: >
  Skill FULL del módulo REFLEJO `antiguedad-de-saldos` de la vertical contabilidad de Enki.
  El aging de saldos por vencimiento: lo pendiente clasificado en tramos DECLARABLES (sin inventar
  30/60/90) y medido contra una fecha de referencia también declarada; quién y cuánto está vencido.
  Es el espejo de `vencimiento-pago` (N6); no calcula fechas, las clasifica. Sin estado. Úsala para
  operar, depurar o extender el reflejo, o para entender su contrato de eventos y sus reglas.
when-to-use: >
  - Cuando necesites la tabla de antigüedad de saldos vencidos (RPC
    antiguedad-de-saldos.clasificar.request).
  - Cuando depures por qué `clasificado:false` (sin tramos declarados: no se inventan 30/60/90), por
    qué `hoy:null` (sin fecha de referencia no se sabe qué está vencido) o por qué un vencimiento va
    a `fuera_de_tramos`/`sin_fecha`/`sin_importe`.
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las invariantes del
    aging (determinista, tramos declarables, nada se estima).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo antiguedad-de-saldos.
tags: [enki, modulo, reflejo, contabilidad, antiguedad-de-saldos]
---

# antiguedad-de-saldos — REFLEJO STATELESS del aging de saldos

## Qué hace el módulo

`antiguedad-de-saldos` es un **REFLEJO STATELESS** (N8, hoja del plan): **LO PENDIENTE CLASIFICADO
POR VENCIMIENTO: QUIÉN Y CUÁNTO ESTÁ VENCIDO. (Aging.)** Determinista: toma los vencimientos (el
tipo `Vencimiento` con **dos lados**, N6) y clasifica lo pendiente en **tramos de antigüedad**. Es
el **espejo de `vencimiento-pago` (N6) del lado del cobro** — aquí **NO se calcula la fecha de
vencimiento** (eso es N6), se **CLASIFICA** lo que ya vence.

Atributos del diseño: `vencimientos:Set<Vencimiento>`. Métodos: `clasificar():Tabla`.

**🔴 LOS TRAMOS SON DECLARABLES.** En este fichero **NO** hay ningún 30, 60 ni 90 escrito: los tramos
los **DECLARA** el negocio (`tramos:[30,60,90]` límites consecutivos, o
`tramos:[{desde,hasta,etiqueta}]`). Si no los declara, **NO** se clasifica por tramos:
`clasificado:false`, `tabla:[]`, `abierto:['tramos']` — **el sistema NO inventa los tramos del
negocio**.

**🔴 SIN `hoy` DECLARADO NO SE SABE QUÉ ESTÁ VENCIDO.** La antigüedad se mide contra una **FECHA DE
REFERENCIA DECLARADA** (`hoy`/`fecha_referencia`); sin ella, `dias_vencido:null`, `vencido:null` y
se declara `[ABIERTO]` — **no se usa «hoy» por sorpresa como si fuera un dato del negocio**.

Invariantes:

- **DETERMINISTA**: mismos vencimientos + mismos tramos + misma fecha de referencia → misma tabla;
  los vencidos se ordenan **de más antiguo a más reciente**.
- **Dato ausente = desconocido**: un vencimiento **sin fecha** no se coloca en ningún tramo (va a
  `sin_fecha`); uno **sin importe** no se lee como 0 (va a `sin_importe`); uno vencido que **no cae en
  ningún tramo declarado** va a `fuera_de_tramos` (**no se fuerza a un tramo**).
- **NO escribe, NO persiste, NO muta y NO decide**: la tabla es un **DERIVADO**; **reclamar es del
  negocio**.
- **Solo lo VENCIDO** (`dias_vencido > 0`) entra en los tramos; el **no vencido** y los totales se
  agregan aparte.
- Alimenta la **reclamación del cobro** y la **política declarada** (E6): lo **LEEN**, no lo
  recalculan.
- **Sin `PosPersistencia` y sin `project.activated`**: no es custodio.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `antiguedad-de-saldos.clasificar.request` | `onClasificarRequest` | RPC reflejo (clasificacion pura, determinista): {project_id, vencimientos?:[...]\|facturas?:[...], tramos?\|[30,60,90]\|[{desde,hasta,etiqueta}], hoy?\|fecha_referencia?, lado?, politica?, base?, periodo?} → {project_id, tipo:'antiguedad-de-saldos', lado, hoy, hoy_declarado, clasificado, tabla:[{desde,hasta,etiqueta,num,total_pendiente,terceros}], tramos_declarados, vencidos:[{clave,tercero,lado,fecha_vencimiento,pendiente,dias_vencido}], num_vencidos, total_vencido, total_no_vencido, total_pendiente, fuera_de_tramos, sin_fecha, sin_importe, fuente_vencimientos, alimenta, decide, abierto}. Sin `hoy` declarado no se sabe que esta vencido ([ABIERTO]); sin tramos declarados no se clasifica (no se inventan 30/60/90). Los vencimientos se declaran o se PIDEN a vencimiento-pago (N6) POR EVENTO. Responde por antiguedad-de-saldos.clasificar.response; project_id ausente → antiguedad-de-saldos.clasificar.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `antiguedad-de-saldos.clasificar.response` | Respuesta RPC correlada de antiguedad-de-saldos.clasificar.request → {request_id, status:200, data:{hoy, clasificado, tabla, tramos_declarados, vencidos, num_vencidos, total_vencido, total_no_vencido, total_pendiente, fuera_de_tramos, sin_fecha, sin_importe, abierto}}. Emitida por el helper _atender. |
| `antiguedad-de-saldos.clasificar.failed` | Par de fallo determinista (N8): project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de antiguedad-de-saldos.clasificar.request. OJO: no tener vencimientos o no tener tramos declarados NO es un fallo: es un no-disponible/no-clasificable declarado en la response 200. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `antiguedad-de-saldos.clasificar.failed` cierra el círculo de
> `antiguedad-de-saldos.clasificar.request` cuando `_clasificar` devuelve status ≠ 200
> (`400 INVALID_INPUT` por `project_id` ausente). **OJO**: no tener vencimientos o no tener tramos
> declarados **NO es un fallo**: es `200` con lo declarado en `abierto`.

> Nota: **no hay fire-and-forget** en este módulo. El único subscribe es la RPC
> `antiguedad-de-saldos.clasificar.request`; los demás publishers son su response y su `failed`. La
> lectura de vencimientos (N6/B2) se hace **pidiendo por EVENTO** dentro de `_clasificar`.

## Reglas de negocio

1. **La FECHA DE REFERENCIA (`hoy`) es DECLARADA**: `input.hoy` o `input.fecha_referencia`;
   `hoy_declarado` distingue «no se declaró» de «se declaró algo inválido». Sin `hoy` válido →
   `dias_vencido:null`, `vencido:null` y `abierto.hoy` (**no se usa «hoy» por sorpresa**).
2. **Los VENCIMIENTOS** (`_vencimientos`): `input.vencimientos` (array) → `fuente:'declarados'`; si
   no, `input.facturas` (array) → se pide a N6 **POR EVENTO** (`vencimiento-pago.calcular.request`
   por cada factura, con `lado`/`politica`/`base`/`hoy`) guardando `data.vencimiento` →
   `fuente:'vencimiento-pago'`. Sin nada declarado, se pide a B2
   (`escritor-diario.asientos.request`) y se toman los asientos con `fecha_vencimiento != null` →
   `fuente:'escritor-diario'`. Sin vencimientos → `disponible:false` y `abierto.vencimientos`.
3. **Un vencimiento SIN importe va APARTE**: `pendiente` = `pendiente`/`importe`/`total` (valor
   absoluto); `null` → a `sin_importe` («no se lee como 0 (nada se estima)»).
4. **Un vencimiento SIN fecha va APARTE**: `fecha_vencimiento` (o `fecha`); sin fecha válida → a
   `sin_fecha` («no se coloca en ningun tramo»).
5. **Los DÍAS VENCIDOS solo con `hoy` declarado**: `dias_vencido = roundDias(fecha_vencimiento,
   hoy)` (positivo = vencido); sin `hoy` → `null` y `vencido:null`.
6. **Los TRAMOS son DECLARABLES** (`_tramos`): `input.tramos`/`input.antiguedad_tramos`/
   `input.tramos_antiguedad`. Sin declarar → `null` (**no se clasifica**). Dos formas:
   - **límites** (`[30,60,90]`, todos numéricos) → se construyen tramos **consecutivos** a partir de
     los cortes ordenados: `1-30`, `31-60`, `61-90`, y `>90` (etiquetas compuestas);
   - **objetos** (`[{desde,hasta,etiqueta}]`) → se respeta `desde`/`hasta` (enteros) y la `etiqueta`
     declarada; un tramo sin ningún límite se **descarta** (no se asume rango).
7. **La TABLA por tramos**: solo lo **VENCIDO** (`dias_vencido > 0`) entra en los tramos; el no
   vencido se agrega aparte (`total_no_vencido`). Cada fila acumula `num`, `total_pendiente` y los
   **terceros** (Set → array). Un vencido que no cae en ningún tramo → `fuera_de_tramos` (**no se
   fuerza**).
8. **`clasificado = Boolean(tramos) && hoy !== null`**: sin tramos declarados o sin `hoy` **no se
   clasifica** (aunque el resto del cálculo se devuelva).
9. **Los VENCIDOS** se ordenan **de más antiguo a más reciente** (por `dias_vencido` descendente y, a
   igualdad, por orden de llegada) y se proyectan a `{clave, tercero, lado, fecha_vencimiento,
   pendiente, dias_vencido}`.
10. **Los TOTALES**: `num_vencidos`, `total_vencido` (= suma de los vencidos; `null` sin vencimientos
    y sin fuente disponible), `total_no_vencido`, `total_pendiente`.
11. **`alimenta`**: `['reclamacion', 'politica-cobro-pago (E6)']`; **`decide:'el negocio reclamar (la
    tabla es un DERIVADO)'`**; `deriva_de:['vencimiento-pago (N6)', 'escritor-diario (B2)']`.
12. **`abierto` declara lo que falta**: `tramos` (no declarados → no se clasifica), `hoy` (sin fecha
    de referencia no se sabe qué está vencido), `vencimientos` (sin material), `sin_fecha`,
    `sin_importe`.
13. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente →
    `400 INVALID_INPUT` (`field:'project_id'`).
14. **HTTP exacto**: éxito `200` (también con `clasificado:false`); `project_id` ausente → `400`;
    excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `antiguedad-de-saldos.clasificar.response`. **No emite evento de dominio.**

### 1. `clasificar` — tramos por límites + fecha de referencia declarada

```json
{
  "project_id": "e57a318a-...",
  "vencimientos": [
    { "clave": "F1", "tercero": "B123", "fecha_vencimiento": "2026-07-01", "pendiente": 100 },
    { "clave": "F2", "tercero": "B456", "fecha_vencimiento": "2026-09-20", "pendiente": 40 },
    { "clave": "F3", "tercero": "B789", "fecha_vencimiento": "2026-11-01", "pendiente": 10 }
  ],
  "tramos": [30, 60, 90],
  "hoy": "2026-09-30",
  "correlation_id": "abc-123"
}
```

Respuesta `200`: `hoy:'2026-09-30'`, `hoy_declarado:true`, `clasificado:true`,
`tramos_declarados:[{desde:1,hasta:30,etiqueta:'1-30'},{desde:31,hasta:60,etiqueta:'31-60'},
{desde:61,hasta:90,etiqueta:'61-90'},{desde:91,hasta:null,etiqueta:'>90'}]`,
`tabla:[{...,etiqueta:'61-90', num:1, total_pendiente:100, terceros:['B123']}, {etiqueta:'1-30',
num:1, total_pendiente:40, terceros:['B456']}, ...]`, `vencidos` ordenados (F1 con `dias_vencido:91`
primero, F2 con 10), `num_vencidos:2`, `total_vencido:140`, `total_no_vencido:10`,
`total_pendiente:150`, `alimenta:['reclamacion','politica-cobro-pago (E6)']`,
`decide:'el negocio reclamar (la tabla es un DERIVADO)'`.

### 2. `clasificar` — sin tramos → `clasificado:false` (no se inventan 30/60/90)

Sin `tramos` → `clasificado:false`, `tabla:[]`, `tramos_declarados:null` y `abierto.tramos` («el
sistema NO inventa los tramos del negocio»). El resto de totales se devuelve igual.

### 3. `clasificar` — sin `hoy` → `[ABIERTO]` (no se sabe qué está vencido)

Sin `hoy` → `hoy:null`, `dias_vencido:null`, `vencido:null`, `clasificado:false` y `abierto.hoy`
(«no se sabe que esta vencido (nada se estima)»). **No se usa «hoy» por sorpresa.**

### 4. `clasificar` — vencido fuera de los tramos declarados

Un vencido de 120 días con tramos hasta `>90`… si no cae en ninguno → `fuera_de_tramos`
(«esta vencido pero no cae en ningun tramo declarado»). **No se fuerza a un tramo.**

### 5. `clasificar` — sin importe / sin fecha van aparte

Vencimiento sin importe → `sin_importe`; sin fecha → `sin_fecha`. **Ninguno se estima.**

### 6. `clasificar` — vencimientos pedidos por EVENTO

Sin `vencimientos` pero con `facturas` → se pide a `vencimiento-pago` (N6) por evento y
`fuente_vencimientos:'vencimiento-pago'`. Sin nada declarado → B2 → `fuente_vencimientos:
'escritor-diario'`.

### 7. Fallo — falta `project_id`

Respuesta `400` + `antiguedad-de-saldos.clasificar.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/antiguedad-de-saldos.test.js`. Cubre:

- Tramos por **límites** (`[30,60,90]`) → tramos consecutivos `1-30`, `31-60`, `61-90`, `>90` y
  tabla con `num`/`total_pendiente`/`terceros`.
- Tramos por **objetos** (`{desde,hasta,etiqueta}`) → se respeta la etiqueta declarada.
- **Sin tramos** → `clasificado:false`, `tabla:[]`, `abierto.tramos` (**no se inventan 30/60/90**).
- **Sin `hoy`** → `dias_vencido:null`, `vencido:null` (**no se sabe qué está vencido**).
- Solo lo **vencido** (`dias_vencido > 0`) entra en los tramos; el no vencido se agrega aparte.
- Vencido **fuera de los tramos** → `fuera_de_tramos` (**no se fuerza**).
- Sin importe → `sin_importe`; sin fecha → `sin_fecha`.
- Vencidos pedidos **por evento** a `vencimiento-pago` (N6) → `fuente_vencimientos:'vencimiento-pago'`.
- Vencidos ordenados **de más antiguo a más reciente**.
- **Determinismo**: mismos vencimientos + mismos tramos + misma fecha → misma tabla.
- `project_id` ausente → `400 INVALID_INPUT` + `antiguedad-de-saldos.clasificar.failed`.
- `toolClasificar` devuelve la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `AntiguedadSaldos extends ModuloHibridoReflejo`; `name = 'antiguedad-de-saldos'`,
  `version = 'reflejo-0.1.0'`. Sin `PosPersistencia`, sin store, sin `onProjectActivated`
  (REFLEJO stateless).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-entrada/antiguedad-de-saldos/`; es de la vertical **entrada**).
- `onClasificarRequest` usa `this._atender(e, 'clasificar',
  'antiguedad-de-saldos.clasificar.response', async (d) => {...})` y publica
  `antiguedad-de-saldos.clasificar.failed` si `status !== 200`.
- Proyección `_clasificar(input)` (`async`: pide vencimientos a N6/B2 por evento); helpers
  `_vencimientos`, `_tramos`, `_fecha`, `_diffDias`, `_num`. Tool `toolClasificar`.
- `_invalid` / `_rpc` / `_round` vienen de `modulo-hibrido-reflejo`.
- **DEP**: **espejo de `vencimiento-pago` (N6)** del lado del cobro — pide a
  `vencimiento-pago.calcular.request` (N6) y `escritor-diario.asientos.request` (B2) **por EVENTO**
  (best-effort). **NO calcula la fecha de vencimiento: la CLASIFICA.** Lo leen la **reclamación del
  cobro** y la **política declarada (E6)**.
- **🔴 TRAMOS DECLARABLES**: **cero 30/60/90 cableados**; sin tramos declarados **no se clasifica**.
  El sistema **NO inventa los tramos del negocio**.
- **🔴 SIN `hoy` DECLARADO NO SE SABE QUÉ ESTÁ VENCIDO**: la antigüedad se mide contra una fecha de
  referencia declarada; nada se estima.
- **DATO AUSENTE = DESCONOCIDO**: sin fecha → `sin_fecha`; sin importe → `sin_importe`; vencido sin
  tramo → `fuera_de_tramos`. **NO escribe, NO persiste, NO muta.**
