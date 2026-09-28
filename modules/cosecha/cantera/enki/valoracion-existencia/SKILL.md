---
name: valoracion-existencia
description: >
  Skill FULL del módulo REFLEJO `valoracion-existencia` de la vertical contabilidad
  de Enki (H1+H3+H4, hoja del plan). LA CAPA DE VALOR sobre el stock EXISTENTE: NO
  duplica el inventario — `inventario` custodia el stock real (cantidad); aquí se le
  pone el VALOR. Valoración por MÉTODO DECLARABLE (FIFO/PMP permitidos; LIFO no),
  capa de valor, ajuste de merma/rotura y variación valorada (entrada por compra,
  salida por consumo). El método es un PARÁMETRO declarable por negocio — la política
  entra como DATO, nunca cableada; si no se declara → 422 PRECONDITION_FAILED.
  Stateless: sin PosPersistencia ni project.activated — cada op entra objeto, sale
  objeto. El stock se lee por EVENTO/payload (contrato TOLERANTE: si no responde →
  503 DEPENDENCIA_NO_DISPONIBLE y NUNCA se valora un stock inventado). Úsala para
  operar, depurar o extender el reflejo, o para entender su contrato de eventos y sus
  reglas de negocio.
when-to-use: >
  - Cuando necesites valorar una existencia por método declarado (RPC
    contabilidad.existencia.valorar.request) o regularizar una merma con asiento (RPC
    contabilidad.inventario.ajuste.request).
  - Cuando depures por qué no se valora (422 PRECONDITION_FAILED si el método no está
    declarado o no está permitido, 503 DEPENDENCIA_NO_DISPONIBLE si no hay capas, 400
    INVALID_INPUT si falta project_id/cantidad/stock_real).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), por qué el
    método es declarable y por qué el asiento de regularización SUMA (borra_original:false).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo valoracion-existencia.
tags: [enki, modulo, reflejo, contabilidad, valoracion-existencia, existencias, declarable]
---

# valoracion-existencia — REFLEJO · capa de valor sobre el stock existente

## Qué hace el módulo

`valoracion-existencia` es un **REFLEJO STATELESS** (H1+H3+H4, hoja del plan): la
**CAPA DE VALOR** sobre el **stock EXISTENTE**. **NO duplica el inventario**:
`inventario` custodia el **stock real** (cantidad); aquí se le pone el **VALOR**:

- **valoración por MÉTODO DECLARABLE** (`_valorar`; FIFO/PMP permitidos; LIFO no);
- **capa de valor** (`_capaDeValor`; no recrea el stock);
- **ajuste de merma/rotura** (`_calcularDiferencia` + `_regularizar` + `_ajustarInventario`);
- **variación valorada** (entrada por compra `_valorarEntrada`, salida por consumo
  `_valorarSalida`).

El **MÉTODO de valoración es un PARÁMETRO declarable** por negocio: **la política
entra como DATO**, nunca cableada; **si no se declara → `422 PRECONDITION_FAILED`**.
Es **DETERMINISTA**: *mismas entradas → mismas salidas*.

Es **stateless**: **sin PosPersistencia ni `project.activated`** — cada op **entra
objeto, sale objeto**. El stock real se **LEE** por **EVENTO/payload** (contrato
**TOLERANTE**: si no responde → `503 DEPENDENCIA_NO_DISPONIBLE` y **NUNCA se valora
un stock inventado**). El coste de la ficha cruza por `frontera-ficha-producto` (H2)
**por EVENTO, NUNCA por `require` cruzado**.

> **NO REUTILIZA**: `inventario` custodia el stock real; la **VALORACIÓN contable**
> (capa de valor, merma, coste del consumo) **no existe en el inventario**.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.existencia.valorar.request` | `onValorarRequest` | RPC reflejo: {project_id, producto, cantidad, fecha?, metodo, capas?} → {project_id, producto, cantidad, metodo, importe, coste_unitario, capas_consumidas, capas_restantes}. Valoracion por metodo DECLARABLE (FIFO/PMP; LIFO no): sin metodo → 422 PRECONDITION_FAILED; sin capas → 503 DEPENDENCIA_NO_DISPONIBLE. Exito publica contabilidad.existencia_valorada y responde por contabilidad.existencia.valorar.response; error → contabilidad.existencia.valorar.failed. |
| `contabilidad.inventario.ajuste.request` | `onAjusteRequest` | RPC reflejo (H3): {project_id, producto, stock_real, stock_contable, coste_unitario?, cuenta?, metodo?} → {project_id, diferencia:{diferencia_unidades, diferencia_valor, clase}, asiento (partida doble, suma_al_libro:true), aviso:{senal:'MERMA_REGULARIZADA'}}. Regulariza merma/rotura con asiento que SUMA (borra_original:false). Exito publica contabilidad.ajuste_inventario_calculado y responde por contabilidad.inventario.ajuste.response; sin coste → 422 (dato ausente = desconocido); error → contabilidad.inventario.ajuste.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.existencia_valorada` | Fire-and-forget (H1): una existencia quedo VALORADA por el metodo declarado → {project_id, producto, cantidad, metodo, importe, coste_unitario, capas_consumidas}. Lo consume margen-analitico (J2, coste imputado), estados-contables (C1, existencias) y el asiento (B2). Determinista; jamas un valor inventado. |
| `contabilidad.ajuste_inventario_calculado` | Fire-and-forget (H3): se calculo la diferencia merma/rotura y su asiento de regularizacion (que SUMA) → {project_id, diferencia, asiento, aviso}. Lo consume el libro (B2) y el motor de avisos (C6/K2). |
| `contabilidad.existencia.valorar.failed` | Par de fallo determinista: sin project_id/cantidad (400), metodo no declarado o no permitido (422), o stock/capas no disponibles (503 DEPENDENCIA_NO_DISPONIBLE: no se valora un stock inventado). Cierra el circulo de contabilidad.existencia.valorar.request. |
| `contabilidad.inventario.ajuste.failed` | Par de fallo determinista: sin project_id, sin stock_real/stock_contable (400), o diferencia sin valor (422: sin coste no hay asiento de regularizacion). Cierra el circulo de contabilidad.inventario.ajuste.request. |
| `contabilidad.existencia_valorada.failed` | Par de fallo del evento de dominio contabilidad.existencia_valorada: la emision del hecho de dominio no se completo. |
| `contabilidad.ajuste_inventario_calculado.failed` | Par de fallo del evento de dominio contabilidad.ajuste_inventario_calculado: la emision del ajuste calculado no se completo. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> `contabilidad.existencia.valorar.failed` cierra `contabilidad.existencia.valorar.request`;
> `contabilidad.inventario.ajuste.failed` cierra `contabilidad.inventario.ajuste.request`.

> Nota: no está en module.json pero sí lo emite index.js — `_atender` publica
> `contabilidad.existencia.valorar.response` y `contabilidad.inventario.ajuste.response`
> (los pares response de los RPC); **NO están declaradas en `publishes`**.

> Nota: declarado en module.json pero NO emitido por index.js (patrón de la vertical:
> el par de fallo real es `<op>.failed`) — `contabilidad.existencia_valorada.failed` y
> `contabilidad.ajuste_inventario_calculado.failed` son los pares de los eventos de
> **DOMINIO**; el reflejo solo publica los pares `*.failed` de sus RPC.

## Reglas de negocio

1. **Capa de VALOR, no inventario paralelo**: `_capaDeValor` compone **valor por
   línea** (`{producto, cantidad, coste_unitario, valor, coste_ausente}`) sobre el
   stock leído; **no recrea el stock** (`no_duplica_inventario:true`). Si una línea
   **no trae coste**, se marca `coste_ausente:true` y su `valor` queda `null` — **nunca
   0**.
2. **El MÉTODO es DECLARABLE (dato, nunca constante cableada)**: `_metodoDe` exige
   `metodo`/`metodo_valoracion`. Sin declarar → **`422 PRECONDITION_FAILED`**
   (`no_declarado:true`, `metodos_permitidos`). `METODOS_PERMITIDOS = ['FIFO','PMP',
   'COSTE_MEDIO','IDENTIFICACION_DIRECTA']`; `LIFO` está **PROHIBIDO** (`422`); otro no
   declarado en el catálogo → `422`.
3. **Consumo determinista de capas**: `_consumirCapas` — para `PMP`/`COSTE_MEDIO`
   calcula el coste medio ponderado (`Σcant·coste / Σcant`) e importe = `pmp ·
   cantidad`; para `FIFO`/`IDENTIFICACION_DIRECTA` consume la **capa más antigua
   primero** (orden por `fecha` o `orden`) y devuelve `capas` consumidas, `restantes` y
   `faltante_sin_capa` si la cantidad excede las capas.
4. **Contrato TOLERANTE con el stock**: `_capasDe`/`_inventarioDe` acceptan las capas
   en el payload (`capas`/`inventario`/`stock`); si **no hay capas** → **`503
   DEPENDENCIA_NO_DISPONIBLE`** con `{dependencia:'inventario', accion:'NO_VALORAR_PUBLICAR_FALLO'}`
   (*no se valora un stock inventado*).
5. **Merma/rotura y su asiento (H3)**: `_calcularDiferencia` = `stock_real -
   stock_contable` → `diferencia_unidades`, `diferencia_valor` (si hay coste) y `clase`
   (`MERMA` si < 0, `SOBRANTE` si > 0, `SIN_DIFERENCIA` si 0). `_regularizar` compone un
   asiento de **partida doble** con `tipo:'AJUSTE'`, `motivo:'REGULARIZACION_EXISTENCIA'`,
   **`borra_original:false`** y **`suma:true`** — el asiento **SUMA al libro**, no borra.
   Sin `diferencia_valor` finito → **`422 PRECONDITION_FAILED`** (`coste_ausente:true`).
6. **Cuentas declarables**: las cuentas del asiento de regularización salen de
   `input.cuenta`/`cuenta_gasto`/`cuenta_existencia`; si no, `'[ABIERTO]'`.
7. **Variación valorada (H4)**: `_valorarEntrada(compra)` = `cantidad · coste` — **si
   no hay coste de ficha, se declara AUSENTE (`importe:null`, `no_inventa:true`), nunca
   0**. `_valorarSalida(consumo)` valora el consumo con las capas y marca
   `el_hecho_es_de_la_fuente:true` / `contabilidad_solo_valora:true` (el hecho de stock
   lo emite la fuente; contabilidad **solo valora**).
8. **Validaciones deterministas de entrada**: falta `project_id` → `400 INVALID_INPUT
   project_id`; `cantidad` no finita o `< 0` → `400 INVALID_INPUT cantidad`;
   `stock_real`/`stock_contable` no finitos → `400 INVALID_INPUT
   stock_real/stock_contable`. Shape: `{status:400, error:{code:'INVALID_INPUT',
   message:'<campo> requerido', details:{field:<campo>}}}`.
9. **HTTP exacto**: éxito `200`; payload inválido → `400`; método/diferencia sin valor →
   `422`; stock/capas no disponibles → `503`; excepción en `_atender` → `500
   UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPCs que responden en `contabilidad.existencia.valorar.response` y
`contabilidad.inventario.ajuste.response`.

### 1. `valorar` — valoración FIFO por capas

```json
{
  "project_id": "e57a318a-...",
  "producto": "P-001",
  "cantidad": 15,
  "metodo": "FIFO",
  "capas": [
    { "producto": "P-001", "cantidad": 10, "coste_unitario": 12, "fecha": "2026-08-01" },
    { "producto": "P-001", "cantidad": 10, "coste_unitario": 14, "fecha": "2026-09-01" }
  ],
  "correlation_id": "abc-123"
}
```

Respuesta `200` (10·12 + 5·14 = 190):

```json
{
  "project_id": "e57a318a-...",
  "producto": "P-001",
  "cantidad": 15,
  "metodo": "FIFO",
  "importe": 190,
  "coste_unitario": 12.6667,
  "capas_consumidas": [ { "capa": "P-001", "cantidad": 10, "coste_unitario": 12 }, { "capa": "P-001", "cantidad": 5, "coste_unitario": 14 } ],
  "capas_restantes": 1,
  "fecha": null,
  "determinista": true,
  "fuente": "CAPAS_VALOR"
}
```

Emite `contabilidad.existencia_valorada` (res.data + `correlation_id`).

### 2. `ajuste` — regularizar una merma (asiento que SUMA)

```json
{ "project_id": "e57a318a-...", "producto": "P-001", "stock_real": 8, "stock_contable": 10, "coste_unitario": 12, "cuenta": "610", "cuenta_existencia": "300" }
```

Respuesta `200` (diferencia −2 uds, −24 €):

```json
{
  "project_id": "e57a318a-...",
  "diferencia": { "producto": "P-001", "stock_real": 8, "stock_contable": 10, "diferencia_unidades": -2, "coste_unitario": 12, "diferencia_valor": -24, "coste_ausente": false, "clase": "MERMA", "determinista": true },
  "asiento": { "tipo": "AJUSTE", "motivo": "REGULARIZACION_EXISTENCIA", "borra_original": false, "suma": true, "apuntes": [ { "cuenta": "610", "debe": 24, "haber": 0 }, { "cuenta": "300", "debe": 0, "haber": 24 } ] },
  "aviso": { "senal": "MERMA_REGULARIZADA", "clase": "MERMA", "destinatario": "ASESOR" },
  "suma_al_libro": true,
  "determinista": true
}
```

Emite `contabilidad.ajuste_inventario_calculado` (res.data + `correlation_id`).

### 3. Fallo — método no declarado → 422

```json
{ "project_id": "e57a318a-...", "producto": "P-001", "cantidad": 5 }
```

→ `422 PRECONDITION_FAILED` (`no_declarado:true`, `metodos_permitidos`) +
`contabilidad.existencia.valorar.failed`:

```json
{ "status": 422, "error": { "code": "PRECONDITION_FAILED", "message": "el metodo de valoracion no esta declarado: la politica de valoracion entra como DATO", "details": { "metodos_permitidos": ["FIFO", "PMP", "COSTE_MEDIO", "IDENTIFICACION_DIRECTA"], "no_declarado": true } } }
```

### 4. Fallo — sin capas de valor → 503

Sin `capas`/`inventario` en el payload → `503 DEPENDENCIA_NO_DISPONIBLE`
(`{dependencia:'inventario', accion:'NO_VALORAR_PUBLICAR_FALLO'}`).

### 5. Fallo — diferencia sin valor (sin coste) → 422

En `ajuste`, sin `coste` → `422 PRECONDITION_FAILED` (`coste_ausente:true`).

### 6. Tools (sin RPC en module.json)

`toolValorar` → `_valorar`; `toolCapaDeValor` → `_capaDeValor`;
`toolCalcularDiferencia` → `_calcularDiferencia`; `toolRegularizar` → `_regularizar`;
`toolValorarEntrada` → `_valorarEntrada`; `toolValorarSalida` → `_valorarSalida`.

## Tests

El test viviría en `tests/unit/valoracion-existencia.test.js`. Cubre:

- `valorar` FIFO → `200`, `importe` = consumo por capa más antigua, `capas_consumidas`
  y `capas_restantes` correctos; emite `contabilidad.existencia_valorada`.
- `valorar` PMP → coste medio ponderado determinista.
- **Método declarable**: sin `metodo` → `422 PRECONDITION_FAILED`; `LIFO` → `422` (no
  permitido); método desconocido → `422`.
- **Sin capas** → `503 DEPENDENCIA_NO_DISPONIBLE` (`NO_VALORAR_PUBLICAR_FALLO`); nunca
  un stock inventado.
- `ajuste` con merma → `200`, `clase:'MERMA'`, asiento **`suma:true`/`borra_original:false`**
  (el asiento SUMA); emite `contabilidad.ajuste_inventario_calculado`.
- **Sin coste** en `ajuste` → `422` (dato ausente = desconocido).
- `valorarEntrada` sin coste → `importe:null`, `no_inventa:true` (**jamás 0**).
- Payload sin `project_id`/`cantidad`/`stock_real` → `400 INVALID_INPUT`.
- El reflejo es **stateless**: sin `project.activated` ni persistencia.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/valoracion-existencia
node --test tests/unit/valoracion-existencia.test.js
```

## Notas de implementación

- Clase `ValoracionExistencia extends ModuloHibridoReflejo`; `name =
  'valoracion-existencia'`, `version = 'reflejo-0.1.0'`. **Sin store** (reflejo
  stateless: nada que persistir).
- Constantes: `METODOS_PERMITIDOS = ['FIFO','PMP','COSTE_MEDIO','IDENTIFICACION_DIRECTA']`
  y `METODO_PROHIBIDO = ['LIFO']` (la política es DATO, no constante legal cableada).
- `onValorarRequest`/`onAjusteRequest` delegan en `_atender(e, '<op>',
  'contabilidad.<...>.response', fn)`: en éxito publican el hecho de dominio
  (`contabilidad.existencia_valorada` / `contabilidad.ajuste_inventario_calculado`), en
  fallo su par `*.failed`.
- Proyecciones puras: `_valorar`, `_capaDeValor`, `_calcularDiferencia`,
  `_regularizar`, `_valorarEntrada`, `_valorarSalida`, `_ajustarInventario` (async,
  encadena diferencia + regularización) + helpers `_metodoDe`, `_costeDe`, `_capasDe`,
  `_inventarioDe`, `_consumirCapas`. `_rpc`/`_invalid`/`_errorResponse` vienen de la
  base; `_round` de la base. DEP por EVENTO: `inventario` (stock real),
  `frontera-ficha-producto` (H2, coste de la ficha).
- Tools: `toolValorar`, `toolCapaDeValor`, `toolCalcularDiferencia`,
  `toolRegularizar`, `toolValorarEntrada`, `toolValorarSalida`.
- DEP hacia delante: `contabilidad.existencia_valorada` → `margen-analitico` (J2),
  `estados-contables` (C1, existencias) y el asiento (B2);
  `contabilidad.ajuste_inventario_calculado` → libro (B2) y motor de avisos (C6/K2).
