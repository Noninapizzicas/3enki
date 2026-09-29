---
name: cuadro-mando-contable
description: >
  Skill FULL del módulo REFLEJO `cuadro-mando-contable` de la vertical contabilidad de Enki.
  LA LENTE DEL JEFE: el cuadro de conjunto (caja · resultado · margen · desviación ·
  ejercicio) COMPONE las cifras ya calculadas por sus dueños por evento — nunca recalcula ni
  baja al asiento, y lo que falta queda abierto, no a 0. Sin estado. Úsala para operar,
  depurar o extender el reflejo, o para entender su contrato de eventos y sus reglas de
  negocio.
when-to-use: >
  - Cuando necesites el cuadro de mando de conjunto de un proyecto y periodo (RPC
    cuadro-mando-contable.componer.request).
  - Cuando depures por qué una celda sale `valor:null` con `abierto:true` (su dueño por
    evento no respondió) o por qué la cobertura sale `declarada:false` (no se recalcula: se
    LEE de completitud-cobertura).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las invariantes
    del cuadro (agrega sin recalcular, cada cifra con su origen, el jefe decide, no escribe
    ni persiste).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo cuadro-mando-contable.
tags: [enki, modulo, reflejo, contabilidad, cuadro-mando-contable]
---

# cuadro-mando-contable — REFLEJO STATELESS de la lente del jefe

## Qué hace el módulo

`cuadro-mando-contable` es un **REFLEJO STATELESS** (J8, hoja del plan): **LA LENTE DEL
JEFE** — el **CONJUNTO económico visto desde arriba** (caja, resultado, margen, desviación y
ejercicio) **SIN BAJAR AL ASIENTO**.

**======================== AGREGA. NO RECALCULA NADA. ========================**

Este módulo es un **AGREGADO DE CONJUNTO**: pide cada cifra **YA CALCULADA** a su dueño
**POR EVENTO** y las compone en un solo informe. **NO vuelve a sumar partidas**, **NO vuelve a
derivar el mayor**, **NO recalcula** el margen ni la desviación ni el saldo. Cada cifra llega
con su **ORIGEN declarado** (`origen`/`fuente`) para que el jefe sepa de dónde sale: el cuadro
**no es caja negra**. Es una **COMPOSICIÓN, no un cálculo**.

```
caja       ← saldo-tesoreria.calcular.request        (E4)  saldo ya derivado del mayor+maestro
resultado  ← cuenta-resultados.calcular.request      (C2)  cuenta de resultados ya calculada
margen     ← margen-analitico.calcular.request       (J2)  margen ya calculado por dimension
desviacion ← desviacion.calcular.request             (J4)  desviacion ya medida vs presupuesto
ejercicio  ← declarado                                el ejercicio vigente, DATO
cobertura  ← completitud-cobertura.medir.request      (A12) LA metrica unica: se LEE, no se recalcula
```

Atributos del diseño: `caja:SaldoTesoreria`, `resultado:CuentaResultados`, `margen`,
`desviacion`, `ejercicio`. Métodos: `componer(periodo):Informe`. Regla: **agregación de
conjunto SIN bajar al asiento. Lente del jefe. Determinista.**

**EL JEFE DECIDE Y DECLARA**: el cuadro **no decide nada** (`decide:false`) — **presenta**. Lo
que el jefe aún no ha declarado (granularidad del grupo I7, vista agregada I6) se **DECLARA
como hueco** (`granularidad_declarada:false`), no se inventa.

**UNA SOLA MÉTRICA DE COBERTURA**: si el cuadro muestra cobertura, **LEE**
`completitud-cobertura` (A12) **POR EVENTO**; **no la recalcula**. Y si la cobertura no está
declarada, la muestra dice eso: `declarada:false`, `tasa:null` — **un 0 afirmaría una medida
que no se hizo**.

Invariantes:

- **AGREGA SIN RECALCULAR**: ninguna cifra se computa aquí; todas se piden y se declara su
  origen.
- **DETERMINISTA**: mismos agregados → mismo cuadro (composición pura, sin juicio).
- **Dato ausente = desconocido**: cifra no disponible → `null` + `abierto` + `faltan`;
  **nunca 0**.
- **NO escribe, NO persiste, NO muta**: el cuadro es un **DERIVADO de lectura**. Sin
  `PosPersistencia` ni `project.activated`.

Publica `contabilidad.cuadro_compuesto` (lo LEEN los canales de entrega). Proyección única
`_componer` (async: pide los agregados en paralelo). Tool `toolComponer`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `cuadro-mando-contable.componer.request` | `onComponerRequest` | RPC reflejo agregado (composicion pura, determinista): {project_id, periodo?, ejercicio?, eje?, dimension?, vertical?, granularidad?, caja?/resultado?/margen?/desviacion?/cobertura? declaradas} → {project_id, periodo, cuadro:{caja:{valor,origen,fuente}, resultado:{valor,origen,fuente,signo}, margen:{valor,origen,fuente}, desviacion:{valor,origen,fuente,signo,avisa,umbral}, cobertura, ejercicio, granularidad, granularidad_declarada}, fuentes:{caja:'saldo-tesoreria', resultado:'cuenta-resultados', margen:'margen-analitico', desviacion:'desviacion', cobertura:'completitud-cobertura'}, faltan, n_piezas, n_disponibles, abierto, decide:false, publicable, motivo}. AGREGA SIN RECALCULAR: pide cada cifra a su dueño POR EVENTO (saldo-tesoreria E4, cuenta-resultados C2, margen-analitico J2, desviacion J4) y LEE la metrica unica de cobertura (completitud-cobertura A12); una cifra no disponible queda valor:null y en faltan (nunca 0). Exito → publica contabilidad.cuadro_compuesto y responde por cuadro-mando-contable.componer.response; project_id ausente → cuadro-mando-contable.componer.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `cuadro-mando-contable.componer.response` | Respuesta RPC correlada de cuadro-mando-contable.componer.request → {request_id, status:200, data:{cuadro, fuentes, faltan, abierto, decide:false}}. Emitida por el helper _atender. |
| `cuadro-mando-contable.componer.failed` | Par de fallo determinista (J8): project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de cuadro-mando-contable.componer.request. |
| `contabilidad.cuadro_compuesto` | Fire-and-forget (J8): el cuadro del jefe quedo COMPUESTO (agregacion de cifras ya calculadas, sin bajar al asiento) → {project_id, periodo, cuadro, faltan, abierto, correlation_id}. Lo consumen los canales de entrega del negocio; el cuadro NO decide nada, solo presenta. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `cuadro-mando-contable.componer.failed` cierra el círculo de
> `cuadro-mando-contable.componer.request` cuando `_componer` devuelve status ≠ 200 (solo
> `400 INVALID_INPUT` por `project_id` ausente).

> Nota de honestidad (cruce con `index.js`): `onComponerRequest` publica
> `contabilidad.cuadro_compuesto` **solo si `res.status === 200` Y `res.data.publicable`** (con
> el payload `{project_id, periodo, cuadro, faltan, abierto, correlation_id}`); con
> `status !== 200` publica `cuadro-mando-contable.componer.failed`. `publicable` es siempre
> `true` en `_componer` (el cuadro se compone con lo disponible, aunque quede `[ABIERTO]`).

> Nota: el módulo pide a `saldo-tesoreria.calcular.request` (E4),
> `cuenta-resultados.calcular.request` (C2), `margen-analitico.calcular.request` (J2),
> `desviacion.calcular.request` (J4) y `completitud-cobertura.medir.request` (A12) **POR
> EVENTO** (dependencias salientes; no figuran como subscripción). El `ejercicio` **no** se
> pide por evento en `index.js`: se toma de `input.ejercicio ?? input.periodo`. Tampoco
> figuran `_pieza`, `_cobertura` ni `_num` en `module.json`.

## Reglas de negocio

1. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente →
   `400 INVALID_INPUT` (`field:'project_id'`). `periodo` con `String(...)` o `null`;
   `ejercicio = input.ejercicio ?? periodo`.
2. **Composición en PARALELO** (`Promise.all`): caja, resultado, margen, desviación y
   cobertura. Cada pieza se pide **POR EVENTO** a su dueño (`timeout_ms:5000` para E4/C2/J2/J4;
   `4000` para A12).
3. **`_pieza`** (valor de una celda), en orden:
   - **Declarada** en la petición: `input[nombre]` escalar numérico →
     `{valor, origen:'declarado', fuente:'declarado', signo:null}`; objeto →
     `{valor: _num(decl.valor ?? decl.importe), origen:'declarado', fuente: decl.fuente ??
     'declarado', signo, avisa, umbral}`.
   - **Pedida a su dueño POR EVENTO**: si el dueño no responde → `{valor:null, origen:null,
     fuente:null, signo:null}` (**no se inventa la cifra**); si responde →
     `{valor: extractor(data), origen:'agregado', fuente:<dueño>, signo, avisa, umbral}`.
   - Extractores: caja → `data.saldo_total`; resultado → `data.resultado`; margen →
     `data.margen_total`; desviación → `data.desviacion`.
   - Payloads: caja → `{project_id, fecha:input.fecha, ejercicio}` (E4); resultado →
     `{project_id, ejercicio}` (C2); margen → `{project_id, periodo, eje:input.eje}` (J2);
     desviación → `{project_id, periodo, dimension:input.dimension}` (J4).
4. **La COBERTURA** (`_cobertura`): `input.cobertura` objeto → `{...input.cobertura,
   origen:'declarada_en_peticion'}`; si no, **POR EVENTO** `completitud-cobertura.medir.request`
   (`{project_id, vertical: input.vertical ?? null}`) → `data.cobertura` envuelta con
   `origen:'completitud-cobertura'`. Sin métrica → `medida:null` (**se declara el hueco; no se
   estima una tasa**).
5. **El EJERCICIO es DATO declarado**: `ejercicioDeclarado = ejercicio != null &&
   String(ejercicio).trim() !== ''`; **no se adivina por la fecha**.
6. **`faltan`**: se apila la clave de cada pieza con `valor === null`; si el ejercicio no está
   declarado → `'ejercicio'`; si `cobertura.medida === null` → `'cobertura'`.
7. **El cuadro**: `{periodo, ejercicio, caja:{valor,origen,fuente},
   resultado:{valor,origen,fuente,signo}, margen:{valor,origen,fuente},
   desviacion:{valor,origen,fuente,signo,avisa,umbral}, cobertura, granularidad,
   granularidad_declarada}`. `granularidad_declarada = input.granularidad != null &&
   String(input.granularidad).trim() !== ''` (**hueco declarado, no inventado**).
8. **`fuentes`**: `{caja:'saldo-tesoreria', resultado:'cuenta-resultados',
   margen:'margen-analitico', desviacion:'desviacion', cobertura:'completitud-cobertura'}` —
   **la traza de composición**.
9. **`abierto`, `decide`, `publicable`**: `abierto = faltan.length > 0`; `n_piezas:4`;
   `n_disponibles = 4 − <piezas en faltan>`; **`decide:false`** (el cuadro no decide nada);
   `publicable:true`. Si hay faltan, `motivo:'el cuadro se compone con lo disponible; queda
   [ABIERTO] <faltan> (cada cifra la calcula su dueño; aqui no se recalcula nada)'`.
10. **`_num(v)`**: `undefined`/`null`/`''` → `null`; no finito → `null`.
11. **Puro**: sin estado, sin persistencia, sin reloj, sin azar. **AGREGA, no recalcula.**
12. **HTTP exacto**: éxito `200`; `project_id` ausente → `400`; excepción en `_atender` →
    `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `cuadro-mando-contable.componer.response` y emite
`contabilidad.cuadro_compuesto`.

### 1. `componer` — el cuadro del jefe (composición por evento)

```json
{
  "project_id": "e57a318a-...",
  "periodo": "2026-09",
  "ejercicio": "2026",
  "eje": "centro",
  "dimension": "C1",
  "granularidad": "mensual",
  "correlation_id": "abc-123"
}
```

Respuesta `200` (todos los dueños responden):

```json
{
  "project_id": "e57a318a-...",
  "periodo": "2026-09",
  "cuadro": {
    "periodo": "2026-09",
    "ejercicio": "2026",
    "caja": { "valor": 1210.5, "origen": "agregado", "fuente": "saldo-tesoreria" },
    "resultado": { "valor": 4200, "origen": "agregado", "fuente": "cuenta-resultados", "signo": null },
    "margen": { "valor": 1300, "origen": "agregado", "fuente": "margen-analitico" },
    "desviacion": { "valor": 2000, "origen": "agregado", "fuente": "desviacion", "signo": "DESVIACION_POSITIVA", "avisa": true, "umbral": 1200 },
    "cobertura": { "tasa": 0.87, "origen": "completitud-cobertura" },
    "granularidad": "mensual",
    "granularidad_declarada": true
  },
  "fuentes": { "caja": "saldo-tesoreria", "resultado": "cuenta-resultados", "margen": "margen-analitico", "desviacion": "desviacion", "cobertura": "completitud-cobertura" },
  "faltan": [],
  "n_piezas": 4,
  "n_disponibles": 4,
  "abierto": false,
  "decide": false,
  "publicable": true,
  "motivo": null
}
```

Emite `contabilidad.cuadro_compuesto` (lo LEEN los canales de entrega):

```json
{ "project_id": "e57a318a-...", "periodo": "2026-09", "cuadro": { "...": "..." }, "faltan": [], "abierto": false, "correlation_id": "abc-123" }
```

### 2. Una cifra no disponible — `valor:null`, en `faltan` (**nunca 0**)

Si `saldo-tesoreria` no responde, `cuadro.caja.valor:null`, `faltan` incluye `'caja'` y
`abierto:true` con el `motivo`. **Cada cifra la calcula su dueño; aquí no se recalcula nada.**

### 3. Cobertura no declarada — `declarada:false`, `tasa:null`

Si `completitud-cobertura` no responde y no se declara cobertura, `cuadro.cobertura:null`,
`faltan` incluye `'cobertura'`. **Se declara el hueco; no se estima una tasa.**

### 4. Valores declarados en la petición — origen `'declarado'`

Declarar `caja:1210.5` (o `{valor, fuente}`) evita el RPC y la celda sale con
`origen:'declarado'` y `fuente` declarada.

### 5. Fallo — falta `project_id`

Respuesta `400` + `cuadro-mando-contable.componer.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/cuadro-mando-contable.test.js`. Cubre:

- `componer` con todos los dueños respondiendo → `200` con el `cuadro`, `fuentes`,
  `decide:false` y emite `contabilidad.cuadro_compuesto`.
- Una cifra no disponible → `valor:null` y en `faltan` (**nunca 0**).
- Cobertura no declarada → `cuadro.cobertura:null`, `faltan` con `'cobertura'`
  (**no se recalcula ni se estima una tasa**).
- Valores declarados en la petición → `origen:'declarado'` (no se pide a la fuente).
- **AGREGA SIN RECALCULAR**: ninguna cifra se computa aquí; cada celda declara su `fuente`.
- `ejercicio` no declarado → `null` y en `faltan` (**no se adivina por la fecha**).
- **Determinismo**: mismos agregados → mismo cuadro.
- `project_id` ausente → `400 INVALID_INPUT` + `cuadro-mando-contable.componer.failed`.
- `toolComponer` devuelve la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `CuadroMandoContable extends ModuloHibridoReflejo`; `name =
  'cuadro-mando-contable'`, `version = 'reflejo-0.1.0'`. Sin `PosPersistencia`, sin store,
  sin `onProjectActivated` (REFLEJO stateless).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-analitica/cuadro-mando-contable/`).
- `onComponerRequest` usa `this._atender(e, 'componer',
  'cuadro-mando-contable.componer.response', async (d) => {...})` con cierre de círculo
  (evento de dominio en `200` con `publicable`, par `failed` si no).
- Proyección `_componer(input)` (async: `Promise.all` sobre los dueños); helpers `_pieza`,
  `_cobertura`, `_num`. Tool `toolComponer`.
- `_invalid` / `_rpc` vienen de `modulo-hibrido-reflejo`.
- **DEP**: pide por EVENTO a `saldo-tesoreria` (E4), `cuenta-resultados` (C2),
  `margen-analitico` (J2), `desviacion` (J4) y LEE la métrica única de cobertura de
  `completitud-cobertura` (A12). Emite `contabilidad.cuadro_compuesto`.
- **EL JEFE DECIDE Y DECLARA**: el cuadro **no decide** (`decide:false`) — presenta; lo no
  declarado queda `[ABIERTO]`. **UNA SOLA MÉTRICA DE COBERTURA**: se **LEE**, no se
  recalcula.
