---
name: retenciones-is-irpf
description: >
  Skill FULL del módulo REFLEJO `retenciones-is-irpf` de la vertical contabilidad de
  Enki (D4+D5, hoja del plan). RETENCIONES practicadas/soportadas (D4) y ESTIMACIÓN
  IS/IRPF (D5). LA LEY ENTRA COMO DATO: los tipos de retención (profesionales,
  alquileres, trabajo, mobiliario, actividades) son parámetros DECLARABLES y el sujeto
  fiscal (IS sociedad | IRPF persona física) es parámetro POR SOCIEDAD — ninguna
  constante legal cableada; si no se declara → 422 PRECONDITION_FAILED / [ABIERTO],
  jamás un tipo de memoria. Stateless: sin PosPersistencia ni project.activated. Las
  bases se derivan del mayor (B3) o del resultado (C2) por EVENTO/payload (contrato
  TOLERANTE: si no responde → 503 DEPENDENCIA_NO_DISPONIBLE y NUNCA una cuota
  inventada). Úsala para operar, depurar o extender el reflejo, o para entender su
  contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites calcular retenciones con tipos declarados (RPC
    contabilidad.retenciones.calcular.request) o estimar la cuota de IS/IRPF (RPC
    contabilidad.estimacion.calcular.request).
  - Cuando depures por qué no se calcula (422 PRECONDITION_FAILED si faltan tipos,
    régimen o escala/tramos, 503 DEPENDENCIA_NO_DISPONIBLE si no hay base fiscal, 400
    INVALID_INPUT si falta project_id/bases).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), por qué la
    ley entra como DATO y por qué el sujeto fiscal no se asume.
  - Cuando vayas a escribir/ampliar el test unitario del reflejo retenciones-is-irpf.
tags: [enki, modulo, reflejo, contabilidad, retenciones-is-irpf, retenciones, fiscal]
---

# retenciones-is-irpf — REFLEJO · retenciones y estimación IS/IRPF

## Qué hace el módulo

`retenciones-is-irpf` es un **REFLEJO STATELESS** (D4+D5, hoja del plan): **RETENCIONES
practicadas/soportadas** (D4) y **ESTIMACIÓN IS/IRPF** (D5). **LA LEY ENTRA COMO
DATO**: los **tipos de retención** (profesionales, alquileres, trabajo, mobiliario,
actividades) y el **sujeto fiscal** (IS sociedad | IRPF persona física) son
**PARÁMETROS DECLARABLES** por sociedad — **ninguna constante legal cableada**. El
sistema **no asume el sujeto fiscal**: si no está declarado, se responde **`422
PRECONDITION_FAILED`** / `[ABIERTO]`, **jamás un tipo de memoria**.

Es **stateless**: **sin PosPersistencia ni `project.activated`** — cada op **entra
objeto, sale objeto**. Las bases se **DERIVAN** del mayor (B3) o del **resultado**
(C2, para el IS/IRPF) por **EVENTO/payload**; contrato **TOLERANTE**: si la dependencia
**no responde**, se **declara** y **NUNCA se emite una cuota inventada**. La dependencia
es **por EVENTO, NUNCA por `require` cruzado**.

> **NO REUTILIZA**: IRPF/IS y retenciones **no existen en el inventario**.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.retenciones.calcular.request` | `onCalcularRequest` | RPC reflejo (D4): {project_id, periodo?, bases:[{concepto, base, tipo?, sentido:'PRACTICADA'\|'SOPORTADA'}], tipos:{PROFESIONALES:15, ALQUILERES:19,...}} → {project_id, detalle:[{concepto, base, tipo, cuota, sentido}], total_practicadas, total_soportadas, neto}. Retenciones con los porcentajes DECLARADOS (nunca de memoria): sin tipos → 422 PRECONDITION_FAILED. Exito publica contabilidad.retenciones_calculadas y responde por contabilidad.retenciones.calcular.response; error → contabilidad.retenciones.calcular.failed. |
| `contabilidad.estimacion.calcular.request` | `onEstimarRequest` | RPC reflejo (D5): {project_id, periodo?, regimen:'IS'\|'IRPF', sociedad?, base_fiscal?, escala:[{hasta,tipo}]} → {project_id, sociedad, regimen, base_fiscal, fuente_base, tramos, cuota_estimada, tipo_efectivo, estimacion:true, no_presenta:true}. Estimacion con base DECLARADA (resultado C2 en payload o por EVENTO) y escala de tramos declarable: sin regimen → 422 (parametro POR SOCIEDAD, no se asume); sin base/tramos → 503/422. Exito publica contabilidad.cuota_estimada y responde por contabilidad.estimacion.calcular.response; error → contabilidad.estimacion.calcular.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.retenciones_calculadas` | Fire-and-forget (D4): las retenciones practicadas/soportadas quedaron calculadas con los tipos DECLARADOS → {project_id, periodo, detalle, total_practicadas, total_soportadas, neto}. Lo consumen la liquidacion (D1) y generador-modelo (D7) para el modelo correspondiente (111/190...). Determinista; jamas un tipo de memoria. |
| `contabilidad.cuota_estimada` | Fire-and-forget (D5): la cuota estimada de IS/IRPF quedo calculada con base declarada y tramos declarables → {project_id, periodo, sociedad, regimen, base_fiscal, tramos, cuota_estimada, tipo_efectivo, estimacion:true, no_presenta:true}. Lo consumen generador-modelo (D7), el cuadro de mando y los informes. El sistema PREPARA; el asesor PRESENTA. |
| `contabilidad.retenciones.calcular.failed` | Par de fallo determinista: sin project_id/bases (400) o tipos de retencion no declarados (422 PRECONDITION_FAILED: la ley entra como DATO). Cierra el circulo de contabilidad.retenciones.calcular.request. |
| `contabilidad.estimacion.calcular.failed` | Par de fallo determinista: regimen/sujeto fiscal no declarado (422: parametro POR SOCIEDAD), escala no declarada (422) o base fiscal no disponible (503 DEPENDENCIA_NO_DISPONIBLE). Cierra el circulo de contabilidad.estimacion.calcular.request. |
| `contabilidad.retenciones_calculadas.failed` | Par de fallo del evento de dominio contabilidad.retenciones_calculadas: la emision del hecho de dominio no se completo. |
| `contabilidad.cuota_estimada.failed` | Par de fallo del evento de dominio contabilidad.cuota_estimada: la emision del hecho de dominio no se completo. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> `contabilidad.retenciones.calcular.failed` cierra `contabilidad.retenciones.calcular.request`;
> `contabilidad.estimacion.calcular.failed` cierra `contabilidad.estimacion.calcular.request`.

> Nota: no está en module.json pero sí lo emite index.js — `_atender` publica
> `contabilidad.retenciones.calcular.response` y `contabilidad.estimacion.calcular.response`
> (los pares response de los RPC); **NO están declaradas en `publishes`**.

> Nota: declarado en module.json pero NO emitido por index.js (patrón de la vertical:
> el par de fallo real es `<op>.failed`) — `contabilidad.retenciones_calculadas.failed` y
> `contabilidad.cuota_estimada.failed` son los pares de los eventos de **DOMINIO**; el
> reflejo solo publica los pares `*.failed` de sus RPC.

> Nota: no está en module.json pero sí lo emite index.js — el módulo publica por `_rpc`
> `contabilidad.estado.resultado.request` (dependencia por EVENTO hacia
> `estados-contables`, no declarada como publisher).

## Reglas de negocio

1. **Tipos de retención DECLARABLES (la ley entra como DATO)**: `_tiposDe` exige
   `tipos`/`tipos_retencion` (objeto `{CONCEPTO: tipo}`). Si **no está declarado** →
   **`422 PRECONDITION_FAILED`** (`no_declarado:true`, `conceptos`). **Nunca un tipo de
   memoria.** `CONCEPTOS = ['PROFESIONALES','ALQUILERES','TRABAJO','MOBILIARIO',
   'ACTIVIDADES']` (la lista es convención; el **TIPO es dato**).
2. **Retenciones D4 (practicadas/soportadas)**: `_retencionesDe` recorre las bases
   (concepto, base, tipo?, sentido). El `tipo` sale del payload o de `tipos[concepto]`;
   si **no es finito** → **`422 PRECONDITION_FAILED`** (`no_declarado:true`). `cuota =
   base · (tipo/100)` redondeada a 2. El `sentido` (`PRACTICADA` por defecto, o
   `SOPORTADA`) decide si suma a `total_practicadas` o `total_soportadas`;
   `neto = practicadas − soportadas`.
3. **Atajos D4**: `_practicadas`/`_soportadas` devuelven el mismo cálculo con
   `sentido:'PRACTICADAS'`/`'SOPORTADAS'` e `importe` = el total correspondiente.
4. **Sujeto fiscal POR SOCIEDAD (no se asume)**: `_estimar` exige `regimen`/
   `sujeto_fiscal`. Sin declarar → **`422 PRECONDITION_FAILED`** (`regimenes:['IS','IRPF']`,
   `abierto:'[ABIERTO]'`, `no_asumido:true`). Régimen fuera del catálogo → `422`.
5. **Base fiscal DECLARADA o derivada (contrato TOLERANTE)**: `_baseFiscalDe` toma
   `base_fiscal` del payload (fuente `'DECLARADA'`) o pide `contabilidad.estado.resultado.request`
   a `estados-contables` (C2) (timeout 4000ms) y usa `resultado.resultado` (fuente
   `'DERIVADA_DEL_RESULTADO'`). Si **no hay base** → **`503 DEPENDENCIA_NO_DISPONIBLE`**
   (`{dependencia:'estados-contables', accion:'NO_CALCULAR_PUBLICAR_FALLO'}`) — **nunca
   una cuota inventada**.
6. **Escala/tramos DECLARABLES (ley como DATO)**: `_aplicarEscala` exige `escala` (array
   de `{hasta, tipo}`). Sin escala → **`422 PRECONDITION_FAILED`** (`tramos_declarables:true`,
   `no_declarado:true`). Los tramos se ordenan por techo; un `hasta` `null`/ausente es
   un **tramo abierto** (`Infinity`, **nunca 0**). Se aplica por tramos acumulativos
   (`base del tramo · tipo/100`), y `tipo_efectivo = cuota/base · 100`.
7. **El sistema PREPARA, no presenta**: la respuesta de estimación lleva
   `estimacion:true`, `no_presenta:true` y la nota *«el sistema PREPARA, no presenta (eso
   es del asesor)»*.
8. **Validaciones deterministas de entrada**: falta `project_id` → `400 INVALID_INPUT
   project_id`; sin `bases` → `400 INVALID_INPUT bases`; `escala.tipo` no finito → `400
   INVALID_INPUT escala.tipo`. Shape: `{status:400, error:{code:'INVALID_INPUT',
   message:'<campo> requerido', details:{field:<campo>}}}`.
9. **HTTP exacto**: éxito `200`; payload inválido → `400`; tipos/régimen/escala no
   declarados → `422`; base fiscal no disponible → `503`; excepción en `_atender` →
   `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPCs que responden en `contabilidad.retenciones.calcular.response` y
`contabilidad.estimacion.calcular.response`.

### 1. `calcular` — retenciones con tipos declarados (D4)

```json
{
  "project_id": "e57a318a-...",
  "periodo": "2026-09",
  "bases": [
    { "concepto": "PROFESIONALES", "base": 1000, "sentido": "PRACTICADA" },
    { "concepto": "ALQUILERES", "base": 800, "tipo": 19, "sentido": "SOPORTADA" }
  ],
  "tipos": { "PROFESIONALES": 15, "ALQUILERES": 19 },
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "periodo": "2026-09",
  "detalle": [ { "concepto": "PROFESIONALES", "base": 1000, "tipo": 15, "cuota": 150, "sentido": "PRACTICADA" }, { "concepto": "ALQUILERES", "base": 800, "tipo": 19, "cuota": 152, "sentido": "SOPORTADA" } ],
  "total_practicadas": 150,
  "total_soportadas": 152,
  "neto": -2,
  "tipos_declarados": true,
  "determinista": true
}
```

Emite `contabilidad.retenciones_calculadas` (res.data + `correlation_id`).

### 2. `estimar` — cuota IS/IRPF con base declarada y escala

```json
{
  "project_id": "e57a318a-...",
  "periodo": "2026",
  "regimen": "IS",
  "sociedad": "S-1",
  "base_fiscal": 50000,
  "escala": [ { "hasta": 30000, "tipo": 20 }, { "hasta": 60000, "tipo": 25 } ],
  "correlation_id": "abc-123"
}
```

Respuesta `200` (30000·20% + 20000·25% = 11000):

```json
{
  "project_id": "e57a318a-...",
  "periodo": "2026",
  "sociedad": "S-1",
  "regimen": "IS",
  "base_fiscal": 50000,
  "fuente_base": "DECLARADA",
  "tramos": [ { "desde": 0, "hasta": 30000, "tipo": 20, "base": 30000, "cuota": 6000 }, { "desde": 30000, "hasta": 60000, "tipo": 25, "base": 20000, "cuota": 5000 } ],
  "cuota_estimada": 11000,
  "tipo_efectivo": 22,
  "estimacion": true,
  "no_presenta": true,
  "nota": "estimacion con base DECLARADA: el sistema PREPARA, no presenta (eso es del asesor)",
  "determinista": true
}
```

Emite `contabilidad.cuota_estimada` (res.data + `correlation_id`).

### 3. Fallo — tipos no declarados → 422

```json
{ "project_id": "e57a318a-...", "bases": [ { "concepto": "PROFESIONALES", "base": 1000 } ] }
```

→ `422 PRECONDITION_FAILED` (`no_declarado:true`, `conceptos`) +
`contabilidad.retenciones.calcular.failed`.

### 4. Fallo — régimen no declarado → 422

`estimar` sin `regimen` → `422` (`regimenes:['IS','IRPF']`, `no_asumido:true`,
`abierto:'[ABIERTO]'`): *el sujeto fiscal es un parámetro POR SOCIEDAD: no se asume*.

### 5. Fallo — sin base fiscal ni tramos → 503 / 422

Sin `base_fiscal` en el payload y con `estados-contables` (C2) sin responder →
`503 DEPENDENCIA_NO_DISPONIBLE`. Sin `escala` → `422 PRECONDITION_FAILED`
(`tramos_declarables:true`).

### 6. Tools (sin RPC en module.json)

`toolPracticadas` → `_practicadas`; `toolSoportadas` → `_soportadas`; `toolEstimar`
→ `_estimar`.

## Tests

El test viviría en `tests/unit/retenciones-is-irpf.test.js`. Cubre:

- `calcular` con tipos declarados → `200`, `detalle` con cuota por concepto,
  `total_practicadas`/`total_soportadas`/`neto`; emite
  `contabilidad.retenciones_calculadas`.
- **Tipos declarables**: sin `tipos` → `422 PRECONDITION_FAILED` (**nunca un tipo de
  memoria**).
- `estimar` con `regimen:'IS'` y `base_fiscal` declarada + escala → `200`,
  `cuota_estimada` por tramos, `tipo_efectivo`, `no_presenta:true`; emite
  `contabilidad.cuota_estimada`.
- **Sujeto fiscal no asumido**: sin `regimen` → `422` (`no_asumido:true`).
- **Escala declarable**: sin `escala` → `422` (`tramos_declarables:true`); tramo abierto
  (`hasta:null`) tratado como `Infinity`, **nunca 0**.
- **Base derivada**: sin `base_fiscal` en el payload se deriva del resultado (C2); si
  C2 no responde → `503 DEPENDENCIA_NO_DISPONIBLE` (**nunca una cuota inventada**).
- Payload sin `project_id`/`bases` → `400 INVALID_INPUT`.
- El reflejo es **stateless**: sin `project.activated` ni persistencia.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/retenciones-is-irpf
node --test tests/unit/retenciones-is-irpf.test.js
```

## Notas de implementación

- Clase `RetencionesIsIrpf extends ModuloHibridoReflejo`; `name =
  'retenciones-is-irpf'`, `version = 'reflejo-0.1.0'`. **Sin store** (reflejo stateless:
  nada que persistir).
- Constantes: `REGIMENES = ['IS','IRPF']` y `CONCEPTOS = ['PROFESIONALES','ALQUILERES',
  'TRABAJO','MOBILIARIO','ACTIVIDADES']` — la LISTA es convención; **el TIPO es dato**.
- `onCalcularRequest`/`onEstimarRequest` delegan en `_atender(e, '<op>',
  'contabilidad.<...>.response', fn)`: en éxito publican el hecho de dominio
  (`contabilidad.retenciones_calculadas` / `contabilidad.cuota_estimada`), en fallo su
  par `*.failed`.
- Proyecciones puras: `_retencionesDe`, `_practicadas`, `_soportadas`, `_estimar`
  (async) + helpers `_tiposDe`, `_basesDe`, `_baseFiscalDe` (async, EVENTO C2),
  `_aplicarEscala`, `_techoDe`. `_rpc`/`_invalid`/`_errorResponse` vienen de la base;
  `_round` de la base.
- Tools: `toolPracticadas`, `toolSoportadas`, `toolEstimar`.
- DEP hacia delante: `contabilidad.retenciones_calculadas` → liquidación (D1) y
  `generador-modelo` (D7, modelos 111/190…); `contabilidad.cuota_estimada` →
  `generador-modelo` (D7), cuadro de mando e informes. DEP hacia atrás por EVENTO:
  `estados-contables` (C2) provee la base fiscal (`contabilidad.estado.resultado.request`).
