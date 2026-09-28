---
name: conciliacion-bancaria
description: >
  Skill FULL del módulo REFLEJO `conciliacion-bancaria` de la vertical contabilidad de
  Enki (E1/E3/E9/E10, hoja del plan). FRONTERA ÚNICA DE FORMATOS: el CRUCE extracto <->
  libro por CLAVE NATURAL y reglas es DETERMINISTA (un test lo afirma). El JUICIO está
  AISLADO en sus satélites: E7 partida-no-identificada (micro-agente fuzzy) y E8
  regla-movimiento-bancario (custodio) — aquí NO se duplica el juicio ni se inventa la
  contrapartida de un movimiento: lo que no cruza se PUBLICA como
  contabilidad.movimiento_sin_cruzar entregándolo a E7 (NO SE IGNORA). Cuatro derivaciones:
  cruzar, cuadrar el movimiento, explicar el desfase (partidas en tránsito) y componer el
  documento de cuadre (saldo banco <-> saldo contable ajustado). Sin estado. Si faltan el
  extracto (E2) o el diario, 503 DEPENDENCIA_NO_DISPONIBLE — nunca se inventa el cruce.
  Úsala para operar, depurar o extender el reflejo, o para entender su contrato de eventos
  y sus reglas de negocio.
when-to-use: >
  - Cuando necesites cruzar el extracto con el libro (RPC
    contabilidad.conciliacion.cruzar.request) o componer el documento de cuadre
    (contabilidad.conciliacion.informe.request).
  - Cuando depures por qué no cruza (503 DEPENDENCIA_NO_DISPONIBLE si puerto-extracto E2 no
    responde, 409 DESCUADRE de un movimiento con su cobro/pago, 422 SIN_CONTRAPARTE, 400
    INVALID_INPUT).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), el cruce
    determinista por clave natural y por qué el juicio está aislado en E7/E8.
  - Cuando vayas a escribir/ampliar el test unitario del reflejo conciliacion-bancaria.
tags: [enki, modulo, reflejo, contabilidad, conciliacion-bancaria, cruce, determinista]
---

# conciliacion-bancaria — REFLEJO · el cruce determinista extracto <-> libro

## Qué hace el módulo

`conciliacion-bancaria` es un **REFLEJO STATELESS** (E1/E3/E9/E10, hoja del plan):
**FRONTERA ÚNICA DE FORMATOS**. El **CRUCE extracto <-> libro** por **CLAVE NATURAL** y
reglas es **DETERMINISTA** (un test unitario lo afirma). **El JUICIO está AISLADO en sus
satélites**: E7 `partida-no-identificada` (micro-agente fuzzy) y E8
`regla-movimiento-bancario` (custodio) — aquí **NO se duplica el juicio ni se inventa la
contrapartida** de un movimiento: lo que no cruza se **PUBLICA** como
`contabilidad.movimiento_sin_cruzar` y se lo entrega a **E7** (**NO SE IGNORA**).

Cuatro derivaciones deterministas:

- **E1** `_cruzar(extracto, libro)` → `{ conciliaciones, sin_cruzar }` (cruce por clave
  natural compartida `fecha_valor|importe|documento`, con tolerancia declarada por importe).
- **E3** `_cuadrarMovimiento(movimiento, cobroOPago)` → `Ok | Descuadre` (*un movimiento
  bancario = un cobro/pago*; si no casa → `409 DESCUADRE` hacia E7/E9, **nunca se ignora**).
- **E9** `_explicarDesfase()` → `List<PartidaEnTransito>` (cheque no cobrado / cobro no
  apuntado).
- **E10** `_componerInforme()` → `DocumentoCuadre` (saldo banco <-> saldo contable ajustado,
  `cuadra:bool`).

Es **stateless**: sin PosPersistencia ni `project.activated`. El extracto lo da
`puerto-extracto` (E2) y el libro `mayor-balanza` (B3), **ambos por EVENTO**
(`contabilidad.extracto.leer.request` / `contabilidad.mayor.movimientos.request`); contrato
**TOLERANTE**: si faltan, se devuelve **`503 DEPENDENCIA_NO_DISPONIBLE`** y **NUNCA** se
inventa el cruce. Emite `contabilidad.conciliacion_realizada` y
`contabilidad.movimiento_sin_cruzar`.

> **NO REUTILIZA**: la conciliación bancaria no existe en el inventario; el cruce
> determinista es propio.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.conciliacion.cruzar.request` | `onCruzarRequest` | RPC reflejo (E1): {project_id, extracto?:[MovimientoBancario], libro?:[Apunte]} → {project_id, conciliaciones:[{clave_natural, via:'CLAVE_NATURAL'\|'IMPORTE', movimiento, apunte, cuadra}], n_conciliaciones, sin_cruzar:[...], n_sin_cruzar, determinista:true}. El extracto/libro llegan en el payload o por EVENTO (puerto-extracto E2 / mayor-balanza B3); sin extracto → 503 DEPENDENCIA_NO_DISPONIBLE. Exito publica contabilidad.conciliacion_realizada y, si hay movimientos que no cruzan, contabilidad.movimiento_sin_cruzar (senal a E7, el juicio NO se duplica aqui); responde por contabilidad.conciliacion.cruzar.response; error → contabilidad.conciliacion.cruzar.failed. |
| `contabilidad.conciliacion.informe.request` | `onInformeRequest` | RPC reflejo (E9+E10): {project_id, saldo_banco, saldo_contable, extracto?, libro?} → {project_id, documento_cuadre:{saldo_banco, saldo_contable, partidas_en_transito:[{clave_natural, importe, motivo, explicacion}], ajuste_transito, saldo_contable_ajustado, cuadra}, n_partidas}. Derivacion DETERMINISTA: la prueba de que el cuadre cuadra (saldo banco <-> saldo contable ajustado). Responde por contabilidad.conciliacion.informe.response; sin extracto → 503 → contabilidad.conciliacion.informe.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.conciliacion_realizada` | Fire-and-forget (E1): un cruce extracto <-> libro quedo realizado deterministicamente → {project_id, conciliaciones, n_conciliaciones, sin_cruzar, n_sin_cruzar}. El juicio de lo que no cruza NO se hace aqui: se entrega a E7. |
| `contabilidad.movimiento_sin_cruzar` | Fire-and-forget (E1 → E7): los movimientos del extracto SIN contrapartida en el libro → {project_id, movimientos:[...], n, destino:'partida-no-identificada (E7)', juicio_aislado:true}. Lo consume partida-no-identificada (E7) para INTERPRETAR la descripcion ambigua. NO se ignora. |
| `contabilidad.conciliacion.cruzar.failed` | Par de fallo determinista: cruzar sin project_id (400) o puerto-extracto (E2) no disponible (503 DEPENDENCIA_NO_DISPONIBLE). Cierra el circulo de contabilidad.conciliacion.cruzar.request. |
| `contabilidad.conciliacion.informe.failed` | Par de fallo determinista: informe sin project_id (400) o puerto-extracto (E2) no disponible (503). Cierra el circulo de contabilidad.conciliacion.informe.request. |
| `contabilidad.conciliacion_realizada.failed` | Par de fallo del evento de dominio contabilidad.conciliacion_realizada: la emision del hecho de dominio no se completo. |
| `contabilidad.movimiento_sin_cruzar.failed` | Par de fallo del evento de dominio contabilidad.movimiento_sin_cruzar: la emision de la senal a E7 no se completo. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> `contabilidad.conciliacion.cruzar.failed` cierra `contabilidad.conciliacion.cruzar.request`;
> `contabilidad.conciliacion.informe.failed` cierra
> `contabilidad.conciliacion.informe.request`.

> Nota: no está en module.json pero sí lo emite index.js — `_atender` publica
> `contabilidad.conciliacion.cruzar.response` y `contabilidad.conciliacion.informe.response`
> (los pares response de los RPC); **NO están declaradas en `publishes`**.

> Nota: declarado en module.json pero NO emitido por index.js (patrón de la vertical: el par
> de fallo real es `<op>.failed`) — `contabilidad.conciliacion_realizada.failed` y
> `contabilidad.movimiento_sin_cruzar.failed` son pares de fallo de eventos de DOMINIO; el
> reflejo solo publica los pares `*.failed` de sus RPC.

> Nota: no está en module.json pero sí lo emite index.js — el módulo publica por `_rpc`
> `contabilidad.extracto.leer.request` (dependencia por EVENTO hacia puerto-extracto E2) y
> `contabilidad.mayor.movimientos.request` (dependencia por EVENTO hacia mayor-balanza B3),
> no declaradas como publishers.

## Reglas de negocio

1. **El cruce es DETERMINISTA (E1)**: `_cruzar` recorre el extracto y, por cada movimiento,
   busca (1) una **clave natural exacta** (`via:'CLAVE_NATURAL'`) y (2) una **tolerancia
   declarada por importe** (`via:'IMPORTE'`). Cada apunte del libro se **consume una sola
   vez** (`noUsados`). Es determinista y no muta nada.
2. **La clave natural compartida (determinista)**: `_claveDe(m)` = `m.clave_natural` si
   viene, o `${fecha_valor|fecha|fecha_operacion : 10}|${importe:2}|${referencia|documento|
   documento_origen|concepto}`. La clave **compartida** entre extracto y libro es lo que hace
   casar el movimiento.
3. **El JUICIO NO se duplica aquí (aislamiento)**: lo que no cruza se marca
   `motivo:'SIN_CONTRAPARTIDA_EN_LIBRO'` y se **PUBLICA** como
   `contabilidad.movimiento_sin_cruzar` (`destino:'partida-no-identificada (E7)'`,
   `juicio_aislado:true`). **Aquí jamás se inventa la contrapartida de un movimiento** — el
   juicio vive en E7 (fuzzy) y E8.
4. **El extracto y el libro se LEEN por EVENTO (contrato TOLERANTE)**: `_extractoDe` acepta
   `input.extracto`/`input.movimientos`; si no, pide `contabilidad.extracto.leer.request` a
   `puerto-extracto` (E2) (timeout 4000ms). Si **no responde** → `null` → **`503
   DEPENDENCIA_NO_DISPONIBLE`** con `{ dependencia:'puerto-extracto',
   accion:'NO_CRUZAR_PUBLICAR_FALLO' }`. `_libroDe` hace lo análogo contra mayor-balanza (B3);
   sin libro devuelve `[]` (el cruce sigue, todo el extracto queda sin cruzar).
5. **Un movimiento bancario = un cobro/pago (E3)**: `_cuadrarMovimiento` compara el importe
   del movimiento con el de su cobro/pago; sin contraparte → **`422 PRECONDITION_FAILED`** con
   `{ clave_natural, senal:'SIN_CONTRAPARTE' }`; si no casa (`> 0.005`) → **`409 DESCUADRE`**
   con `{ clave_natural, importe_movimiento, importe_cobro_pago, destino:'E7/E9 (partida no
   identificada / partida en transito)', ignorado:false }`. **Nunca se ignora.**
6. **Partidas en tránsito (E9)**: `_explicarDesfase` reutiliza `_cruzar` y mapea cada
   movimiento sin cruzar a
   `{ clave_natural, importe, motivo:'MOVIMIENTO_EN_BANCO_NO_APUNTADO_EN_LIBRO', explicacion,
   en_banco:true, en_libro:false }` (cheque no cobrado / cobro no apuntado).
7. **Documento de cuadre (E10)**: `_componerInforme` toma `saldo_banco`/`saldo_contable`,
   calcula `ajuste_transito = Σ importes de las partidas en tránsito`,
   `saldo_contable_ajustado = saldo_contable + ajuste_transito`, y
   `cuadra = |saldo_banco - saldo_contable_ajustado| < 0.005`. **Es la prueba de que el cuadre
   cuadra.**
8. **Validaciones deterministas**: falta `project_id` → `400 INVALID_INPUT project_id`; falta
   movimiento (cuadre) → `400 INVALID_INPUT movimiento`. Shape: `{ status:400, error:{
   code:'INVALID_INPUT', message:'<campo> requerido', details:{ field:<campo> } } }`.
9. **HTTP exacto**: éxito `200`; payload inválido → `400`; descuadre E3 → `409`; sin
   contraparte / sin fechas de cuadre → `422`; extracto (E2) no disponible → `503`; excepción
   en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPCs que responden en `contabilidad.conciliacion.cruzar.response` y
`contabilidad.conciliacion.informe.response`.

### 1. `cruzar` — cruzar extracto y libro (determinista)

```json
{
  "project_id": "e57a318a-...",
  "extracto": [
    { "fecha_valor": "2026-09-15", "importe": 121, "documento": "TRF-001", "descripcion": "TRANSF RECIBIDA" },
    { "fecha_valor": "2026-09-20", "importe": -12.5, "documento": "COM-009", "descripcion": "COMISION MANTENIMIENTO" }
  ],
  "libro": [
    { "fecha_valor": "2026-09-15", "importe": 121, "documento": "TRF-001" }
  ],
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "conciliaciones": [ { "clave_natural": "2026-09-15|121|TRF-001", "via": "CLAVE_NATURAL", "movimiento": { "fecha_valor": "2026-09-15", "importe": 121, "documento": "TRF-001" }, "apunte": { "fecha_valor": "2026-09-15", "importe": 121, "documento": "TRF-001" }, "cuadra": true } ],
  "n_conciliaciones": 1,
  "sin_cruzar": [ { "fecha_valor": "2026-09-20", "importe": -12.5, "documento": "COM-009", "descripcion": "COMISION MANTENIMIENTO", "clave_natural": "2026-09-20|-12.5|COM-009", "importe": -12.5, "motivo": "SIN_CONTRAPARTIDA_EN_LIBRO" } ],
  "n_sin_cruzar": 1,
  "determinista": true,
  "juicio_aislado": "el juicio vive en E7 (partida-no-identificada) y E8 (regla-movimiento-bancario)",
  "nota": "el cruce por clave natural y reglas es DETERMINISTA; aqui no se inventa contrapartida"
}
```
Emite `contabilidad.conciliacion_realizada` (res.data + `correlation_id`) y, si hay
`sin_cruzar`, emite `contabilidad.movimiento_sin_cruzar` (señal a E7).

### 2. `informe` — documento de cuadre (saldo banco <-> contable ajustado)

```json
{ "project_id": "e57a318a-...", "saldo_banco": 108.5, "saldo_contable": 121, "extracto": [ { "fecha_valor": "2026-09-20", "importe": -12.5, "documento": "COM-009" } ], "libro": [] }
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "documento_cuadre": { "saldo_banco": 108.5, "saldo_contable": 121, "partidas_en_transito": [ { "clave_natural": "2026-09-20|-12.5|COM-009", "importe": -12.5, "motivo": "MOVIMIENTO_EN_BANCO_NO_APUNTADO_EN_LIBRO", "explicacion": "cheque no cobrado / cobro no apuntado: partida en transito", "en_banco": true, "en_libro": false } ], "ajuste_transito": -12.5, "saldo_contable_ajustado": 108.5, "cuadra": true },
  "n_partidas": 1,
  "determinista": true,
  "nota": "la prueba de que el cuadre cuadra: saldo banco <-> saldo contable ajustado"
}
```

### 3. Fallo — sin extracto → 503

Sin `extracto` en el payload y `puerto-extracto` (E2) no responde → `503
DEPENDENCIA_NO_DISPONIBLE` + `contabilidad.conciliacion.cruzar.failed`:
```json
{ "status": 503, "error": { "code": "DEPENDENCIA_NO_DISPONIBLE", "message": "puerto-extracto (E2) no respondio: no se concilia sin extracto", "details": { "dependencia": "puerto-extracto", "accion": "NO_CRUZAR_PUBLICAR_FALLO" } } }
```

### 4. Fallo — movimiento sin contraparte / descuadre (E3, tool)

- `toolCuadrarMovimiento` sin cobro/pago → `422 PRECONDITION_FAILED` con
  `{ clave_natural, senal:'SIN_CONTRAPARTE' }`.
- Importes distintos → `409 DESCUADRE` con `{ importe_movimiento, importe_cobro_pago,
  destino:'E7/E9 ...', ignorado:false }`.

### 5. Fallo — payload inválido

Sin `project_id` → `400 INVALID_INPUT project_id` + par `*.failed` correspondiente.

### 6. Tools (sin RPC en module.json)

`toolCruzar` → `_cruzarEntrada`; `toolCuadrarMovimiento` → `_cuadrarMovimiento`;
`toolExplicarDesfase` → `_explicarDesfase`; `toolComponerInforme` → `_componerInforme`.

## Tests

El test vive en `tests/unit/conciliacion-bancaria.test.js`. Cubre:

- `cruzar` con extracto y libro en el payload → `200`, `conciliaciones` con `via` correcta
  (`CLAVE_NATURAL` o `IMPORTE`); emite `contabilidad.conciliacion_realizada`.
- **Juicio aislado**: el movimiento sin contrapartida va a `sin_cruzar` con
  `motivo:'SIN_CONTRAPARTIDA_EN_LIBRO'` y publica `contabilidad.movimiento_sin_cruzar`
  (`destino:'partida-no-identificada (E7)'`, `juicio_aislado:true`); **no se inventa** la
  contrapartida.
- **Dependencia tolerante**: sin extracto en el payload y `puerto-extracto` (E2) no responde
  → `503 DEPENDENCIA_NO_DISPONIBLE` (`NO_CRUZAR_PUBLICAR_FALLO`).
- **Determinismo**: la MISMA entrada devuelve EXACTAMENTE el mismo cruce.
- `informe` → `documento_cuadre` con `ajuste_transito`, `saldo_contable_ajustado` y
  `cuadra`; partidas en tránsito E9 con `en_banco:true`/`en_libro:false`.
- `cuadrarMovimiento`: sin contraparte → `422 SIN_CONTRAPARTE`; importes distintos → `409
  DESCUADRE` con `ignorado:false`.
- El reflejo es **stateless**: sin `project.activated` ni persistencia.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/conciliacion-bancaria
node --test tests/unit/conciliacion-bancaria.test.js
```

## Notas de implementación

- Clase `ConciliacionBancaria extends ModuloHibridoReflejo`; `name = 'conciliacion-bancaria'`,
  `version = 'reflejo-0.1.0'`. **Sin store** (reflejo stateless).
- Constante: `EPS = 0.005` (tolerancia del cruce/cuadre por importe).
- `onCruzarRequest` delega en `_atender(e, 'cruzar', 'contabilidad.conciliacion.cruzar.response',
  fn)`: en éxito publica `contabilidad.conciliacion_realizada` y, si hay `sin_cruzar`,
  `contabilidad.movimiento_sin_cruzar`; en fallo publica `contabilidad.conciliacion.cruzar.failed`.
  `onInformeRequest` delega en `_atender(e, 'informe',
  'contabilidad.conciliacion.informe.response', fn)` y publica solo el par de fallo si
  `status !== 200`.
- Proyecciones puras: `_cruzarEntrada` (async, guarda el contrato tolerante del extracto),
  `_cruzar` (E1), `_cuadrarMovimiento` (E3, async), `_explicarDesfase` (E9, async),
  `_componerInforme` (E10, async), `_extractoDe`/`_libroDe` (async, EVENTO E2/B3), `_claveDe`,
  `_importeDe`. `_rpc`/`_invalid`/`_errorResponse` vienen de la base.
- Tools: `toolCruzar`, `toolCuadrarMovimiento`, `toolExplicarDesfase`, `toolComponerInforme`.
- DEP hacia delante: `contabilidad.movimiento_sin_cruzar` lo consume `partida-no-identificada`
  (E7) para el juicio de lo que no cruza. DEP hacia atrás por evento: `puerto-extracto` (E2)
  provee el extracto y `mayor-balanza` (B3) el libro.
