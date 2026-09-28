---
name: saldo-tesoreria
description: >
  Skill FULL del módulo REFLEJO `saldo-tesoreria` de la vertical contabilidad de Enki
  (E4/E5, hoja del plan). LA POSICIÓN REAL DE DINERO por cuenta bancaria — no la
  posición contable, la REAL — derivada de forma determinista sobre los movimientos
  bancarios (que llegan en el payload o se LEEN de puerto-extracto E2 por EVENTO); el
  importe lleva SIGNO. Y la PREVISIÓN DE CAJA: proyecta entradas/salidas desde los
  COMPROMISOS (vencimientos de cuenta-terceros N6/N8) con la POLÍTICA DECLARADA (E6);
  los UMBRALES (caja mínima, deuda máxima) los declara el dueño (Q24) — si no se
  declaran, la señal es UMBRAL_NO_DECLARADO y NO se asume umbral. Sin estado. Si una
  dependencia no responde → 503 DEPENDENCIA_NO_DISPONIBLE y NUNCA se emite un saldo o
  una caja inventados. Úsala para operar, depurar o extender el reflejo, o para
  entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites la posición real de dinero por cuenta (RPC
    contabilidad.tesoreria.saldo.request) o la previsión de caja
    (contabilidad.tesoreria.prevision.request).
  - Cuando depures por qué no se deriva la posición (503 DEPENDENCIA_NO_DISPONIBLE si
    puerto-extracto E2 o cuenta-terceros N6/N8 no responden, 400 INVALID_INPUT si falta
    project_id) o por qué la señal de caja es UMBRAL_NO_DECLARADO.
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), la
    derivación determinista desde los movimientos reales y la política declarada.
  - Cuando vayas a escribir/ampliar el test unitario del reflejo saldo-tesoreria.
tags: [enki, modulo, reflejo, contabilidad, saldo-tesoreria, tesoreria, determinista]
---

# saldo-tesoreria — REFLEJO de la posición real de dinero y la previsión de caja

## Qué hace el módulo

`saldo-tesoreria` es un **REFLEJO STATELESS** (E4/E5, hoja del plan): **LA POSICIÓN REAL
DE DINERO, por cuenta**. No la posición **contable**: la **REAL** (E4). Es una
**derivación determinista** sobre los **movimientos bancarios** (que llegan en el payload
o se **LEEN** de `puerto-extracto` (E2) por **EVENTO**); el **importe lleva signo**. La
lista de cuentas viene del **catálogo declarable** de `maestro-cuentas-bancarias` (E11)
por **EVENTO** `contabilidad.cuenta_bancaria.listar.request`.

Y la **PREVISIÓN DE CAJA** (E5): proyecta **entradas/salidas** desde los **COMPROMISOS**
(vencimientos de `cuenta-terceros` N6/N8, por **EVENTO**
`contabilidad.cuenta_terceros.vencimiento.request`) con la **POLÍTICA DECLARADA** (E6, por
**EVENTO** `contabilidad.criterio.leer.request`). Los **UMBRALES** («caja mínima», «deuda
máxima») los **declara el DUEÑO** (Q24): si **no se declaran**, la señal es
**`UMBRAL_NO_DECLARADO`** y **NO se asume umbral**.

Es **stateless**: sin PosPersistencia ni `project.activated` — cada op **entra objeto,
sale objeto**. El contrato es **TOLERANTE**: si `puerto-extracto` (E2) o `cuenta-terceros`
(N6/N8) **no responden**, se devuelve **`503 DEPENDENCIA_NO_DISPONIBLE`** y **NUNCA** se
emite un saldo o una caja **inventados**. Emite `contabilidad.saldo_tesoreria_calculado`
y `contabilidad.caja_proyectada` en éxito, y sus pares deterministas en fallo. Las
dependencias son **por EVENTO, nunca por `require` cruzado**.

> **NO REUTILIZA**: la posición real de tesorería y la previsión de caja no existen en el
> inventario (conciliación = 0 módulos).

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.tesoreria.saldo.request` | `onSaldoRequest` | RPC reflejo: {project_id, cuenta?, movimientos?, cuentas?, saldos_iniciales?, canal?} → {project_id, posicion_real:{cuenta:importe}, total, n_cuentas, n_movimientos} o, si se declara cuenta, {cuenta, saldo, posicion_real}. Deriva la posicion REAL de dinero de los movimientos bancarios (payload o EVENTO contabilidad.extracto.leer.request) y del catalogo de cuentas (payload o EVENTO contabilidad.cuenta_bancaria.listar.request). Determinista; sin estado. Si puerto-extracto (E2) no responde → 503 DEPENDENCIA_NO_DISPONIBLE. Exito publica contabilidad.saldo_tesoreria_calculado y responde por contabilidad.tesoreria.saldo.response; error → contabilidad.tesoreria.saldo.failed. |
| `contabilidad.tesoreria.prevision.request` | `onPrevisionRequest` | RPC reflejo: {project_id, desde?, hasta?, vencimientos?, politica?, caja_inicial?, umbral?} → {project_id, caja_proyectada:{entradas, salidas, neto, caja_inicial, caja_final, n_compromisos, politica}, umbral_declarado, senal}. Proyecta entradas/salidas desde los compromisos (payload o EVENTO contabilidad.cuenta_terceros.vencimiento.request) con la POLITICA DECLARADA (payload o EVENTO contabilidad.criterio.leer.request criterio E6); el umbral es DECLARABLE (Q24) — si no se declara NO se asume. Sin cuenta-terceros (N6/N8) → 503. Exito publica contabilidad.caja_proyectada y responde por contabilidad.tesoreria.prevision.response; error → contabilidad.tesoreria.prevision.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.saldo_tesoreria_calculado` | Fire-and-forget (E4): la posicion REAL de tesoreria quedo calculada → {project_id, posicion_real:{cuenta:importe}, total, n_cuentas, n_movimientos}. Lo consume el cuadro de mando y aviso-cuadre (C6) como base de la senal de caja. |
| `contabilidad.caja_proyectada` | Fire-and-forget (E5): la prevision de caja quedo proyectada → {project_id, caja_proyectada:{entradas, salidas, neto, caja_inicial, caja_final}, umbral_declarado, senal}. Lo consume motor-avisos (K2) para la senal CAJA_BAJO_UMBRAL. |
| `contabilidad.tesoreria.saldo.failed` | Par de fallo determinista: saldo sin project_id, o puerto-extracto (E2) no respondio (503 DEPENDENCIA_NO_DISPONIBLE). Cierra el circulo de contabilidad.tesoreria.saldo.request. |
| `contabilidad.tesoreria.prevision.failed` | Par de fallo determinista: prevision sin project_id, o cuenta-terceros (N6/N8) no respondio (503 DEPENDENCIA_NO_DISPONIBLE). Cierra el circulo de contabilidad.tesoreria.prevision.request. |
| `contabilidad.saldo_tesoreria_calculado.failed` | Par de fallo del evento de dominio contabilidad.saldo_tesoreria_calculado: la emision del hecho de dominio no se completo. |
| `contabilidad.caja_proyectada.failed` | Par de fallo del evento de dominio contabilidad.caja_proyectada: la emision del hecho de dominio no se completo. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> `contabilidad.tesoreria.saldo.failed` cierra `contabilidad.tesoreria.saldo.request`;
> `contabilidad.tesoreria.prevision.failed` cierra
> `contabilidad.tesoreria.prevision.request`.

> Nota: no está en module.json pero sí lo emite index.js — `_atender` publica
> `contabilidad.tesoreria.saldo.response` y `contabilidad.tesoreria.prevision.response`
> (los pares response de los RPC); **NO están declaradas en `publishes`**.

> Nota: declarado en module.json pero NO emitido por index.js (patrón de la vertical: el
> par de fallo real es `<op>.failed`) — `contabilidad.saldo_tesoreria_calculado.failed` y
> `contabilidad.caja_proyectada.failed` son los pares de fallo de los eventos de DOMINIO;
> el reflejo solo publica los pares `*.failed` de sus RPC.

> Nota: no está en module.json pero sí lo emite index.js — el módulo publica por `_rpc`
> `contabilidad.extracto.leer.request` (puerto-extracto E2),
> `contabilidad.cuenta_bancaria.listar.request` (maestro-cuentas-bancarias E11),
> `contabilidad.cuenta_terceros.vencimiento.request` (N6/N8) y
> `contabilidad.criterio.leer.request` (cola-declaraciones-criterio E6); dependencias por
> EVENTO no declaradas como publishers.

## Reglas de negocio

1. **La posición es REAL, no contable (E4)**: `_saldoPorCuenta(cuenta, movimientos,
   saldoInicial)` acumula `Σ importe` de los movimientos de esa cuenta (el **importe
   lleva signo**: positivo = entrada, negativo = salida) y le suma el `saldo_inicial`
   declarado. **Redondeo a céntimos.** El `status 200` incluye
   `derivado_de_movimientos_reales:true` y `determinista:true`.
2. **El identificador de cuenta se tolera en varias formas**: `_idDe(m)` acepta
   `cuenta_bancaria`, `cuenta`, `iban` o `id_cuenta_bancaria`. La lista de cuentas sale del
   catálogo (payload `cuentas`/`cuentas_bancarias` o EVENTO E11); si no hay catálogo, se
   derivan los IDs de las cuentas **vistas en los movimientos**.
3. **El extracto se LEE por EVENTO (contrato TOLERANTE)**: `_movimientosDe` acepta
   `input.movimientos` o `input.extracto` (array); si no, pide
   `contabilidad.extracto.leer.request` a `puerto-extracto` (E2) (timeout 4000ms). Si
   **no responde** → `null` → **`503 DEPENDENCIA_NO_DISPONIBLE`** con
   `{ dependencia:'puerto-extracto', accion:'NO_CALCULAR_PUBLICAR_FALLO' }`. **Nunca se
   posiciona la tesorería sin movimientos reales.**
4. **La previsión proyecta desde los COMPROMISOS (E5)**: `_proyectar` recorre los
   vencimientos, filtra por rango `[desde, hasta]` (corte por `YYYY-MM-DD` sobre
   `fecha`/`fecha_vencimiento`/`vencimiento`), y suma `importe`/`total`: si `>= 0` suma a
   `entradas`, si `< 0` suma `-imp` a `salidas`. Devuelve `{ entradas, salidas, neto =
   entradas - salidas, caja_inicial, caja_final = caja_inicial + neto, n_compromisos,
   politica, dias_cobro, dias_pago }`.
5. **La política es DECLARABLE (E6)**: `_politicaDe` acepta `input.politica` (objeto) o el
   EVENTO `contabilidad.criterio.leer.request` con `criterio:'E6'` (solo si
   `resp.data.hallado`). Devuelve `parametro.valor` o `null`. Su ausencia **no** es un
   error: `politica:null` y `politica_declarada:false`.
6. **El UMBRAL lo declara el dueño (Q24) — no se asume**: `_alertarUmbral(prevision,
   umbral)` — si `umbral` es `null`/`undefined` devuelve
   `{ alerta:false, senal:'UMBRAL_NO_DECLARADO', declarable:true, umbral:null,
   caja_final, nota:'los umbrales (caja minima / deuda maxima) los declara el dueno: no se
   asumen' }`. Si se declara: `alerta = caja_final < umbral` y `senal = 'CAJA_BAJO_UMBRAL'
   | 'CAJA_EN_UMBRAL'`.
7. **De dónde sale el umbral efectivo**: `input.umbral` si viene; si no,
   `politica.caja_minima` o `politica.umbral`. La respuesta declara
   `umbral_declarado` (el valor, o `null`).
8. **La caja inicial**: `input.caja_inicial`; si no, `input.total_tesoreria`; por defecto
   `0`.
9. **Los vencimientos se LEEN por EVENTO (TOLERANTE)**: `_vencimientosDe` acepta
   `input.vencimientos` o `input.compromisos` (array); si no, pide
   `contabilidad.cuenta_terceros.vencimiento.request` a `cuenta-terceros` (N6/N8) (timeout
   4000ms). Si no responde → `null` → **`503 DEPENDENCIA_NO_DISPONIBLE`** con
   `{ dependencia:'cuenta-terceros', accion:'NO_CALCULAR_PUBLICAR_FALLO' }`.
10. **Validaciones deterministas**: falta `project_id` → `400 INVALID_INPUT project_id`.
    Shape: `{ status:400, error:{ code:'INVALID_INPUT', message:'project_id requerido',
    details:{ field:'project_id' } } }`.
11. **HTTP exacto**: éxito `200`; payload inválido → `400`; dependencia no disponible →
    `503`; excepción en `_atender` → `500 UNKNOWN_ERROR`.
12. **Determinismo**: mismas entradas → misma posición y misma caja, bit a bit. Toda op es
    una **proyección pura de lectura** (no muta nada).

## Cómo se usa (RPCs)

RPCs que responden en `contabilidad.tesoreria.saldo.response` y
`contabilidad.tesoreria.prevision.response`.

### 1. `saldo` — posición real de TODAS las cuentas

```json
{
  "project_id": "e57a318a-...",
  "movimientos": [
    { "cuenta_bancaria": "ES91...0001", "importe": 1200.50, "fecha": "2026-09-10" },
    { "cuenta_bancaria": "ES91...0001", "importe": -300.00, "fecha": "2026-09-11" },
    { "cuenta_bancaria": "ES91...0002", "importe": 500.00, "fecha": "2026-09-12" }
  ],
  "cuentas": [ { "id_cuenta_bancaria": "ES91...0001" }, { "id_cuenta_bancaria": "ES91...0002" } ],
  "saldos_iniciales": { "ES91...0001": 5000, "ES91...0002": 0 },
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "posicion_real": { "ES91...0001": 5900.5, "ES91...0002": 500 },
  "total": 6400.5,
  "n_cuentas": 2,
  "n_movimientos": 3,
  "maestro_cuentas_disponible": true,
  "derivado_de_movimientos_reales": true,
  "determinista": true,
  "nota": "posicion REAL de dinero por cuenta: el importe lleva signo"
}
```

Emite `contabilidad.saldo_tesoreria_calculado` (res.data + `correlation_id`).

### 2. `saldo` — el saldo de UNA cuenta declarada

```json
{ "project_id": "e57a318a-...", "cuenta": "ES91...0001", "movimientos": [ { "cuenta_bancaria": "ES91...0001", "importe": 100 } ], "saldos_iniciales": { "ES91...0001": 1000 } }
```

Respuesta `200`:

```json
{ "project_id": "e57a318a-...", "cuenta": "ES91...0001", "saldo": 1100, "posicion_real": { "ES91...0001": 1100 }, "n_movimientos": 1, "derivado_de_movimientos_reales": true, "determinista": true }
```

### 3. `prevision` — previsión de caja desde los compromisos

```json
{
  "project_id": "e57a318a-...",
  "desde": "2026-09-01",
  "hasta": "2026-09-30",
  "vencimientos": [
    { "fecha": "2026-09-15", "importe": 3000 },
    { "fecha": "2026-09-20", "importe": -1200 },
    { "fecha": "2026-10-05", "importe": 900 }
  ],
  "politica": { "dias_cobro": 30, "dias_pago": 45, "caja_minima": 2000 },
  "caja_inicial": 1500,
  "correlation_id": "abc-123"
}
```

Respuesta `200` (`2026-10-05` queda fuera del rango → no cuenta):

```json
{
  "project_id": "e57a318a-...",
  "caja_proyectada": { "entradas": 3000, "salidas": 1200, "neto": 1800, "caja_inicial": 1500, "caja_final": 3300, "desde": "2026-09-01", "hasta": "2026-09-30", "n_compromisos": 2, "politica": { "dias_cobro": 30, "dias_pago": 45, "caja_minima": 2000 }, "dias_cobro": 30, "dias_pago": 45 },
  "umbral_declarado": 2000,
  "senal": { "alerta": false, "senal": "CAJA_EN_UMBRAL", "umbral": 2000, "caja_final": 3300, "declarable": true },
  "politica_declarada": true,
  "determinista": true,
  "nota": "la prevision proyecta desde los COMPROMISOS con la POLITICA DECLARADA; el umbral lo declara el dueno"
}
```

Emite `contabilidad.caja_proyectada` (res.data + `correlation_id`).

### 4. `prevision` — sin umbral declarado → UMBRAL_NO_DECLARADO

Sin `umbral` ni `politica.caja_minima`:

```json
{ "project_id": "e57a318a-...", "vencimientos": [ { "fecha": "2026-09-15", "importe": 100 } ], "caja_inicial": 0 }
```

→ `senal: { "alerta": false, "senal": "UMBRAL_NO_DECLARADO", "declarable": true, "umbral": null, "caja_final": 100, "nota": "los umbrales (caja minima / deuda maxima) los declara el dueno: no se asumen" }`.

### 5. Fallo — sin extracto → 503

```json
{ "project_id": "e57a318a-..." }
```

(business: `puerto-extracto` E2 no responde) → Respuesta `503` +
`contabilidad.tesoreria.saldo.failed`:

```json
{ "status": 503, "error": { "code": "DEPENDENCIA_NO_DISPONIBLE", "message": "puerto-extracto (E2) no respondio: no se posiciona la tesoreria sin movimientos reales", "details": { "dependencia": "puerto-extracto", "accion": "NO_CALCULAR_PUBLICAR_FALLO" } } }
```

### 6. Fallo — payload inválido

```json
{ "cuenta": "ES91...0001" }
```

Respuesta `400` + `contabilidad.tesoreria.saldo.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

### 7. Tools (sin RPC en module.json)

`toolSaldoPorCuenta` → `_saldoEntrada`; `toolPosicionReal` → `_posicionReal`;
`toolProyectar` → `_proyectarEntrada`; `toolAlertarUmbral` → `_alertarUmbral`.

## Tests

El test viviría en `tests/unit/saldo-tesoreria.test.js`. Cubre:

- `saldo` con movimientos en el payload → `200`, `posicion_real`/`total` correctos,
  `n_movimientos`, `derivado_de_movimientos_reales:true`; **no muta**.
- `saldo` con `cuenta` → devuelve el saldo de esa sola cuenta.
- **Determinismo**: la MISMA entrada devuelve EXACTAMENTE el MISMO resultado.
- `prevision` con vencimientos y rango → `entradas`/`salidas`/`neto`/`caja_final`
  correctos; los vencimientos fuera de `[desde, hasta]` no cuentan.
- **Umbral declarable**: sin umbral → `senal:'UMBRAL_NO_DECLARADO'` (`declarable:true`,
  `asumido:false`); con `umbral` → `CAJA_BAJO_UMBRAL`/`CAJA_EN_UMBRAL`; emite
  `contabilidad.caja_proyectada`.
- **Dependencia tolerante**: sin movimientos en el payload y `puerto-extracto` (E2) no
  responde → `503 DEPENDENCIA_NO_DISPONIBLE` (`NO_CALCULAR_PUBLICAR_FALLO`); ídem
  `cuenta-terceros` (N6/N8) en la previsión → **nunca** un saldo o caja inventados.
- Sin `project_id` → `400 INVALID_INPUT` + `contabilidad.tesoreria.saldo.failed`.
- El reflejo es **stateless**: sin `project.activated` ni persistencia.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/saldo-tesoreria
node --test tests/unit/saldo-tesoreria.test.js
```

## Notas de implementación

- Clase `SaldoTesoreria extends ModuloHibridoReflejo`; `name = 'saldo-tesoreria'`,
  `version = 'reflejo-0.1.0'`. **Sin store** (reflejo stateless: nada que persistir).
- Constante implícita: `EPS = 0.005` (redondeo de céntimos).
- `onSaldoRequest`/`onPrevisionRequest` publican el evento de dominio si `status === 200`
  y el par `*.failed` si no. Todos delegan en
  `_atender(e, '<op>', 'contabilidad.tesoreria.<op>.response', fn)`.
- Proyecciones puras: `_saldoPorCuenta`, `_posicionReal` (async), `_saldoEntrada` (async),
  `_proyectar`, `_alertarUmbral`, `_proyectarEntrada` (async); helpers de dependencia
  `_movimientosDe`, `_cuentasDe`, `_vencimientosDe`, `_politicaDe`, `_idDe`. `_rpc`,
  `_invalid`, `_errorResponse`, `_round` vienen de la base.
- Tools: `toolSaldoPorCuenta`, `toolPosicionReal`, `toolProyectar`, `toolAlertarUmbral`.
- DEP hacia delante: `contabilidad.caja_proyectada` lo consume `motor-avisos` (K2) para la
  señal `CAJA_BAJO_UMBRAL`; `contabilidad.saldo_tesoreria_calculado` lo consumen el cuadro
  de mando y `aviso-cuadre` (C6). DEP hacia atrás por evento: `puerto-extracto` (E2),
  `maestro-cuentas-bancarias` (E11), `cuenta-terceros` (N6/N8) y
  `cola-declaraciones-criterio` (E6).
