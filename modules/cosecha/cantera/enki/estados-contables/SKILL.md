---
name: estados-contables
description: >
  Skill FULL del módulo REFLEJO `estados-contables` de la vertical contabilidad de
  Enki (C1+C2, hoja del plan). BALANCE DE SITUACIÓN (C1) y CUENTA DE RESULTADOS (C2)
  DERIVADOS del mayor: NO se recalcula el libro — los estados se derivan de
  `mayor-balanza` (B3) por EVENTO, que a su vez deriva del diario; este módulo NO muta
  nada. Determinista: mismas entradas → mismos estados. No se «arregla» un resultado:
  se explica con su base y su cobertura. La CLASIFICACIÓN de cuentas
  (activo/pasivo/patrimonio/ingreso/gasto) es DECLARABLE (payload
  `clasificacion`/`mapa_cuentas`); sin declararla se aplica el mapa PGC por defecto como
  CONVENCIÓN, nunca como ley cableada. El inmovilizado (F4) y las existencias valoradas
  (H1) completan el activo por EVENTO/payload. Stateless: sin PosPersistencia ni
  project.activated. Contrato TOLERANTE con `mayor-balanza` (B3): si no responde → 503
  DEPENDENCIA_NO_DISPONIBLE y NUNCA un balance inventado. Úsala para operar, depurar o
  extender el reflejo, o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites el balance de situación (RPC contabilidad.estado.balance.request) o
    la cuenta de resultados (RPC contabilidad.estado.resultado.request) derivados del
    mayor.
  - Cuando depures por qué no se deriva nada (503 DEPENDENCIA_NO_DISPONIBLE si
    mayor-balanza B3 no responde, 400 INVALID_INPUT si falta project_id).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), la
    clasificación de cuentas declarable y el invariante «activo = pasivo + patrimonio».
  - Cuando vayas a escribir/ampliar el test unitario del reflejo estados-contables.
tags: [enki, modulo, reflejo, contabilidad, estados-contables, balance, resultados]
---

# estados-contables — REFLEJO · balance y cuenta de resultados derivados del mayor

## Qué hace el módulo

`estados-contables` es un **REFLEJO STATELESS** (C1+C2, hoja del plan): **el BALANCE
DE SITUACIÓN (C1)** y **la CUENTA DE RESULTADOS (C2)** **DERIVADOS** del mayor. **NO
se recalcula el libro**: los estados se **DERIVAN** de `mayor-balanza` (B3) por
**EVENTO** —que a su vez deriva del diario—; este módulo **NO muta nada**.

Es **DETERMINISTA**: *mismas entradas → mismos estados*. **No se «arregla» un
resultado: se explica con su base y su cobertura**.

La **CLASIFICACIÓN de cuentas** (qué grupo es activo/pasivo/patrimonio/ingreso/gasto)
es **DECLARABLE**: el plan contable entra como **DATO** (payload `clasificacion` o
`mapa_cuentas`); si **no se declara**, se aplica el **mapa PGC por defecto como
CONVENCIÓN**, **NUNCA como ley cableada**. El **inmovilizado** (F4) y las
**existencias valoradas** (H1) completan el activo por **EVENTO/payload**.

Es **stateless**: **sin PosPersistencia ni `project.activated`** — cada op **entra
objeto, sale objeto**. Contrato **TOLERANTE** con `mayor-balanza` (B3): si **no
responde** → **`503 DEPENDENCIA_NO_DISPONIBLE`** y **NUNCA se emite un balance
inventado**. La dependencia es **por EVENTO, NUNCA por `require` cruzado**.

> **NO REUTILIZA**: los estados contables no existen en el inventario; son la
> **derivación del mayor**.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.estado.balance.request` | `onBalanceRequest` | RPC reflejo (C1): {project_id, periodo?, balanza?, clasificacion?, inmovilizado?, existencias?, tolerancia?} → {project_id, periodo, balance:{activo:{lineas,total}, pasivo:{...}, patrimonio:{...}}, cuadre:{cuadra, descuadre, resultado:'CUADRA'\|'ERROR_ACTIVO_NO_CUADRA'}, cuadra, derivado_del_mayor:true}. Balance DERIVADO del mayor (B3 por EVENTO o en payload) + inmovilizado (F4) + existencias (H1). Exito publica contabilidad.balance_calculado y responde por contabilidad.estado.balance.response; si el mayor no responde → 503 DEPENDENCIA_NO_DISPONIBLE → contabilidad.estado.balance.failed. |
| `contabilidad.estado.resultado.request` | `onResultadoRequest` | RPC reflejo (C2): {project_id, periodo?, balanza?, clasificacion?} → {project_id, periodo, resultado:{ingresos:{lineas,total}, gastos:{lineas,total}, resultado}, derivado_del_mayor:true, se_explica_no_se_arregla:true}. Cuenta de resultados DERIVADA del mayor (B3): ingresos (grupo 7) - gastos (grupo 6). Exito publica contabilidad.resultado_calculado y responde por contabilidad.estado.resultado.response; si el mayor no responde → 503 → contabilidad.estado.resultado.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.balance_calculado` | Fire-and-forget (C1): el balance de situacion quedo calculado DERIVADO del mayor + valoraciones → {project_id, periodo, balance:{activo,pasivo,patrimonio}, cuadre, cuadra}. Lo consumen el cierre de ejercicio (B7), el cuadro de mando, la memoria/informes y consolidacion-grupo (I3). Determinista; jamas un estado inventado. |
| `contabilidad.resultado_calculado` | Fire-and-forget (C2): la cuenta de resultados quedo calculada DERIVADA del mayor → {project_id, periodo, resultado:{ingresos,gastos,resultado}}. Lo consumen retenciones-is-irpf (D5, base del IS/IRPF), el presupuesto (J3/J4) y los informes. No se 'arregla': se explica con su base y su cobertura. |
| `contabilidad.estado.balance.failed` | Par de fallo determinista: balance sin project_id (400) o mayor-balanza (B3) no respondio (503 DEPENDENCIA_NO_DISPONIBLE: no se emite un balance sin derivarlo del libro). Cierra el circulo de contabilidad.estado.balance.request. |
| `contabilidad.estado.resultado.failed` | Par de fallo determinista: resultado sin project_id (400) o mayor-balanza (B3) no respondio (503 DEPENDENCIA_NO_DISPONIBLE: no se emite una cuenta de resultados sin derivarla del libro). Cierra el circulo de contabilidad.estado.resultado.request. |
| `contabilidad.balance_calculado.failed` | Par de fallo del evento de dominio contabilidad.balance_calculado: la emision del hecho de dominio no se completo. |
| `contabilidad.resultado_calculado.failed` | Par de fallo del evento de dominio contabilidad.resultado_calculado: la emision del hecho de dominio no se completo. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> `contabilidad.estado.balance.failed` cierra `contabilidad.estado.balance.request`;
> `contabilidad.estado.resultado.failed` cierra `contabilidad.estado.resultado.request`.

> Nota: no está en module.json pero sí lo emite index.js — `_atender` publica
> `contabilidad.estado.balance.response` y `contabilidad.estado.resultado.response`
> (los pares response de los RPC); **NO están declaradas en `publishes`**.

> Nota: declarado en module.json pero NO emitido por index.js (patrón de la vertical:
> el par de fallo real es `<op>.failed`) — `contabilidad.balance_calculado.failed` y
> `contabilidad.resultado_calculado.failed` son los pares de los eventos de **DOMINIO**;
> el reflejo solo publica los pares `*.failed` de sus RPC.

> Nota: no está en module.json pero sí lo emite index.js — el módulo publica por `_rpc`
> `contabilidad.mayor.balanza.request` (dependencia por EVENTO hacia `mayor-balanza` B3,
> no declarada como publisher).

## Reglas de negocio

1. **Los estados se DERIVAN del mayor, no se recalculan**: `_componerBalance`/
   `_componerResultado` parten de la balanza de sumas y saldos (B3), derivada a su vez
   del diario. **No hay almacén de estados**: son una proyección de lectura.
2. **La balanza se LEE por EVENTO (contrato TOLERANTE)**: `_balanzaDe` acepta la
   balanza del payload (`balanza`/`lineas_balanza`/`lineas`); si no, pide
   `contabilidad.mayor.balanza.request` a `mayor-balanza` (B3) (timeout 4000ms). Si **no
   responde** → `null` → **`503 DEPENDENCIA_NO_DISPONIBLE`** (`{dependencia:'mayor-balanza',
   accion:'NO_CALCULAR_PUBLICAR_FALLO'}`). **Nunca un balance/resultado inventado.**
3. **Clasificación DECLARABLE (la ley entra como DATO)**: `_clasificacionDe` toma
   `clasificacion`/`mapa_cuentas`. `_grupoDe` resuelve por cuenta exacta o por
   **prefijo declarado** (más largo primero); sin declaración, cae al **mapa PGC por
   defecto** (`CLASIFICACION_PGC`) como **convención**, no como ley.
4. **Composición del balance (C1)**: activo ← saldo deudor (grupos ACTIVO, y el lado
   deudor de TERCEROS); pasivo/patrimonio ← saldo acreedor. El grupo
   `PASIVO_PATRIMONIO` (grupo 1 PGC) va a **pasivo si el saldo acreedor ≥ 0**, si no a
   activo, con el valor absoluto. Los grupos INGRESO/GASTO **no** van al balance.
5. **El activo se completa por datos declarados/EVENTO**: `_inmovilizadoDe` (F4) añade
   `valor_neto_contable` con `origen:'inmovilizado'`; `_existenciasDe` (H1) añade
   `total_valor` con `origen:'valoracion-existencia'`. Cada uno se puede pasar como
   número o como objeto.
6. **Cuadre del balance (C1)**: `_cuadrar` verifica **`activo = pasivo + patrimonio`**.
   `descuadre = activo − (pasivo+patrimonio)`; `cuadra = |descuadre| <= tolerancia`
   (`tolerancia` declarable, por defecto `0.01`). `resultado` es `'CUADRA'` o
   `'ERROR_ACTIVO_NO_CUADRA'`. `_balanceConCuadre` encadena composición + cuadre.
7. **Cuenta de resultados (C2)**: ingresos = grupo `INGRESO` con `acreedor − deudor`;
   gastos = grupo `GASTO` con `deudor − acreedor`; `resultado = Σingresos − Σgastos`.
   Se marca `se_explica_no_se_arregla:true`: **no se «arregla»** un resultado, se
   explica.
8. **Validaciones deterministas de entrada**: falta `project_id` → `400 INVALID_INPUT
   project_id`; en `_cuadrar` sin `balance` (ni `activo`) → `400 INVALID_INPUT balance`.
   Shape: `{status:400, error:{code:'INVALID_INPUT', message:'<campo> requerido',
   details:{field:<campo>}}}`.
9. **HTTP exacto**: éxito `200`; payload inválido → `400`; mayor no disponible → `503`;
   excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPCs que responden en `contabilidad.estado.balance.response` y
`contabilidad.estado.resultado.response`.

### 1. `balance` — balance de situación con cuadre

```json
{
  "project_id": "e57a318a-...",
  "periodo": "2026-09",
  "balanza": { "lineas": [ { "cuenta": "430", "saldo_deudor": 121, "saldo_acreedor": 0 }, { "cuenta": "700", "saldo_deudor": 0, "saldo_acreedor": 100 }, { "cuenta": "477", "saldo_deudor": 0, "saldo_acreedor": 21 } ] },
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "periodo": "2026-09",
  "balance": {
    "activo": { "lineas": [ { "cuenta": "430", "importe": 121 } ], "total": 121 },
    "pasivo": { "lineas": [ { "cuenta": "477", "importe": 21 } ], "total": 21 },
    "patrimonio": { "lineas": [], "total": 0 }
  },
  "derivado_del_mayor": true,
  "clasificacion_declarada": false,
  "determinista": true,
  "cuadre": { "project_id": "e57a318a-...", "cuadra": false, "activo": 121, "pasivo": 21, "patrimonio": 0, "pasivo_mas_patrimonio": 21, "descuadre": 100, "tolerancia": 0.01, "resultado": "ERROR_ACTIVO_NO_CUADRA" },
  "cuadra": false
}
```

Emite `contabilidad.balance_calculado` (res.data + `correlation_id`).

### 2. `resultado` — cuenta de resultados (ingresos − gastos)

```json
{ "project_id": "e57a318a-...", "periodo": "2026-09", "balanza": { "lineas": [ { "cuenta": "700", "saldo_acreedor": 100, "saldo_deudor": 0 }, { "cuenta": "600", "saldo_deudor": 40, "saldo_acreedor": 0 } ] } }
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "periodo": "2026-09",
  "resultado": {
    "ingresos": { "lineas": [ { "cuenta": "700", "importe": 100 } ], "total": 100 },
    "gastos": { "lineas": [ { "cuenta": "600", "importe": 40 } ], "total": 40 },
    "resultado": 60
  },
  "derivado_del_mayor": true,
  "se_explica_no_se_arregla": true,
  "determinista": true
}
```

Emite `contabilidad.resultado_calculado` (res.data + `correlation_id`).

### 3. Balance con clasificación declarada (override del PGC)

Pasar `clasificacion: { "430": "ACTIVO", "700": "INGRESO", "477": "PASIVO" }` —
`_grupoDe` resuelve por cuenta/prefijo declarado antes del mapa PGC por defecto; la
respuesta marca `clasificacion_declarada:true`.

### 4. Fallo — mayor no responde → 503

```json
{ "project_id": "e57a318a-..." }
```

Sin `balanza` en el payload y con `mayor-balanza` (B3) sin responder → `503` +
`contabilidad.estado.balance.failed`:

```json
{ "status": 503, "error": { "code": "DEPENDENCIA_NO_DISPONIBLE", "message": "mayor-balanza (B3) no respondio: no se emite un balance sin derivarlo del libro", "details": { "dependencia": "mayor-balanza", "accion": "NO_CALCULAR_PUBLICAR_FALLO" } } }
```

### 5. Fallo — payload inválido

Sin `project_id` → `400 INVALID_INPUT project_id` + su par `.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

### 6. Tools (sin RPC en module.json)

`toolComponerBalance` → `_componerBalance`; `toolCuadrar` → `_cuadrar`;
`toolComponerResultado` → `_componerResultado`.

## Tests

El test viviría en `tests/unit/estados-contables.test.js`. Cubre:

- `balance` con balanza en el payload → `200`, `activo/pasivo/patrimonio` derivados y
  `cuadre`; emite `contabilidad.balance_calculado`.
- **Cuadre**: un balance cuadrado → `resultado:'CUADRA'`; uno descuadrado →
  `'ERROR_ACTIVO_NO_CUADRA'` (con tolerancia declarable).
- **Clasificación declarable**: `clasificacion` sobreescribe el mapa PGC
  (`clasificacion_declarada:true`).
- **Activo completado por datos**: `inmovilizado` (F4) y `existencias` (H1) añaden
  líneas con `origen` declarado.
- `resultado` → ingresos (grupo 7) − gastos (grupo 6); emite
  `contabilidad.resultado_calculado`; `se_explica_no_se_arregla:true`.
- **Determinismo**: la MISMA entrada devuelve EXACTAMENTE el MISMO estado (dos llamadas).
- **Dependencia tolerante**: sin balanza en el payload y `mayor-balanza` (B3) sin
  responder → `503 DEPENDENCIA_NO_DISPONIBLE`, **nunca** un estado inventado.
- Payload sin `project_id` → `400 INVALID_INPUT`.
- El reflejo es **stateless**: sin `project.activated` ni persistencia.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/estados-contables
node --test tests/unit/estados-contables.test.js
```

## Notas de implementación

- Clase `EstadosContables extends ModuloHibridoReflejo`; `name = 'estados-contables'`,
  `version = 'reflejo-0.1.0'`. **Sin store** (reflejo stateless: nada que persistir).
- Constante `CLASIFICACION_PGC` (mapa por primer dígito → grupo:
  `1:'PASIVO_PATRIMONIO'`, `2/3/5:'ACTIVO'`, `4:'TERCEROS'`, `6:'GASTO'`, `7:'INGRESO'`)
  — es **CONVENCIÓN declarable**, no constante legal cableada.
- `onBalanceRequest`/`onResultadoRequest` delegan en `_atender(e, '<op>',
  'contabilidad.estado.<op>.response', fn)`: en éxito publican el hecho de dominio
  (`contabilidad.balance_calculado` / `contabilidad.resultado_calculado`), en fallo su
  par `*.failed`.
- Proyecciones puras: `_componerBalance` (async), `_cuadrar`, `_componerResultado`,
  `_balanceConCuadre` (async, encadena composición + cuadre) + helpers `_balanzaDe`
  (async, EVENTO B3), `_balanzaDeInput`, `_balanzaDeRpcResultado`, `_clasificacionDe`,
  `_grupoDe`, `_inmovilizadoDe`, `_existenciasDe`. `_rpc`/`_invalid`/`_errorResponse`
  vienen de la base; `_round` de la base.
- Tools: `toolComponerBalance`, `toolCuadrar`, `toolComponerResultado`.
- DEP hacia delante: `contabilidad.balance_calculado` → cierre de ejercicio (B7),
  cuadro de mando, informes y `consolidacion-grupo` (I3);
  `contabilidad.resultado_calculado` → `retenciones-is-irpf` (D5, base IS/IRPF),
  presupuesto (J3/J4) e informes. DEP hacia atrás por EVENTO: `mayor-balanza` (B3)
  provee la balanza (`contabilidad.mayor.balanza.request`).
