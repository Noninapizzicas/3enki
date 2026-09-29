---
name: comparador-periodos
description: >
  Skill FULL del módulo REFLEJO `comparador-periodos` de la vertical contabilidad de Enki.
  COMPARA periodos (ejercicio vs ejercicio, mes vs mes, real vs presupuesto) reutilizando
  J3/J4 por evento — no los duplica; la métrica y el modo son declarables y sin ellos no
  compara nada. Sin estado. Úsala para operar, depurar o extender el reflejo, o para entender
  su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites comparar dos periodos o el real contra el presupuesto (RPC
    comparador-periodos.comparar.request).
  - Cuando depures por qué `delta:null` con `abierto:true` (falta modo, métrica o alguno de
    los dos extremos) o por qué no se compara contra 0 (no se midió).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las invariantes
    del reflejo (determinista, reutiliza sin duplicar, modo y métrica como DATO, no escribe
    ni persiste).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo comparador-periodos.
tags: [enki, modulo, reflejo, contabilidad, comparador-periodos]
---

# comparador-periodos — REFLEJO STATELESS del comparador de periodos

## Qué hace el módulo

`comparador-periodos` es un **REFLEJO STATELESS** (J9, hoja del plan): **COMPARAR** —
ejercicio vs ejercicio, mes vs mes, real vs presupuesto. La **lente del jefe** para poder
**DECIDIR**: sin comparación no se sabe si el mes ha ido bien o mal. Determinista: mismos dos
periodos + misma métrica → mismo delta.

Atributos del diseño: `presupuesto:Presupuesto`, `desviacion:Desviacion`.
Métodos: `comparar(a,b):Delta`. Regla: **ejercicio vs ejercicio, mes vs mes, real vs
presupuesto. REUTILIZA J3/J4, NO los duplica.**

**========================== REUTILIZA J3/J4, NO LOS DUPLICA ==========================**

El modo `real_vs_presupuesto` **NO recalcula nada**: **DELEGA** en `desviacion` (J4) **POR
EVENTO** (`desviacion.calcular.request`), que ya compone el real (de J2) contra el objetivo
que el JEFE declaró (de J3). Aquí solo se **PRESENTA** el delta con su signo, su umbral y su
`avisa` — **cero aritmética propia del dominio**.

En los modos `ejercicio_vs_ejercicio` y `mes_vs_mes` **NO se recalcula** la cifra de ningún
periodo: cada extremo se **PIDE ya calculado** a su dueño **POR EVENTO** (según la métrica:
`margen` → `margen-analitico` J2, `resultado` → `cuenta-resultados` C2, `caja` →
`saldo-tesoreria` E4) o llega declarado. **La única aritmética de este reflejo es la
DIFERENCIA entre los dos extremos** — comparar, que es su oficio.

**LA MÉTRICA ES DECLARABLE**: qué se compara lo declara el jefe; sin métrica declarada **NO se
elige por él** (`faltan:['metrica']`, delta `null`). **Sin los dos extremos** → `delta:null` y
`abierto:true` con lo que falta (no se compara contra un `0` que nadie midió).

**El MODO es declarable** (`ejercicio_vs_ejercicio` | `mes_vs_mes` | `real_vs_presupuesto`);
sin modo declarado no se compara.

Invariantes:

- **DETERMINISTA**: mismos extremos + misma métrica → mismo delta.
- **Dato ausente = desconocido**: sin métrica o sin alguno de los dos periodos → `delta:null`,
  `abierto:true` con lo que falta.
- **REUTILIZA SIN DUPLICAR**: J3/J4 se piden por evento; J2/C2/E4 por evento. Cero reglas
  cableadas.
- **NO escribe, NO persiste, NO muta**: la comparación es un **DERIVADO**. Sin
  `PosPersistencia` ni `project.activated`.

Proyección única `_comparar` (async). Tool `toolComparar`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `comparador-periodos.comparar.request` | `onCompararRequest` | RPC reflejo (comparacion pura, determinista): {project_id, modo:'ejercicio_vs_ejercicio'\|'mes_vs_mes'\|'real_vs_presupuesto', metrica?, desde?/hasta?, a?/b? (valor declarado o {periodo,valor}), dimension?, real?/objetivo?/umbral?} → {project_id, modo, metrica, fuente_metrica, a:{periodo,valor,fuente}, b:{periodo,valor,fuente}, delta, delta_relativa, signo:'SUBE'\|'BAJA'\|'IGUAL', direccion, avisa?, umbral?, abierto, faltan, motivo}. real_vs_presupuesto DELEGA en desviacion (J4) por EVENTO (no recalcula la desviacion ni duplica J3); periodo vs periodo pide cada extremo YA CALCULADO a su dueño por evento (margen→J2, resultado→C2, caja→E4) y solo resta los dos extremos. Sin modo o sin metrica declarada → delta:null y abierto:true (no se elige por el jefe); sin los dos extremos → delta:null (no se compara contra un 0 que nadie midio). Responde por comparador-periodos.comparar.response; project_id ausente → comparador-periodos.comparar.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `comparador-periodos.comparar.response` | Respuesta RPC correlada de comparador-periodos.comparar.request → {request_id, status:200, data:{delta, delta_relativa, signo, a, b, fuente_metrica, faltan}}. Emitida por el helper _atender. |
| `comparador-periodos.comparar.failed` | Par de fallo determinista (J9): project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de comparador-periodos.comparar.request. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `comparador-periodos.comparar.failed` cierra el círculo de
> `comparador-periodos.comparar.request` cuando `_comparar` devuelve status ≠ 200 (solo
> `400 INVALID_INPUT` por `project_id` ausente).

> Nota de honestidad (cruce con `index.js`): `onCompararRequest` publica
> `comparador-periodos.comparar.failed` **solo si `res.status !== 200`**; con `200` responde
> por `comparador-periodos.comparar.response` (vía `_atender`) y **no emite evento de
> dominio**.

> Nota: el módulo pide a `desviacion.calcular.request` (J4) en modo `real_vs_presupuesto`, y a
> `margen-analitico.calcular.request` (J2), `cuenta-resultados.calcular.request` (C2),
> `saldo-tesoreria.calcular.request` (E4) en modo periodo vs periodo — **POR EVENTO**
> (dependencias salientes; no figuran como subscripción). Tampoco figuran `_realVsPresupuesto`,
> `_extremo`, `_modo`, `_num` ni la constante `FUENTES`.

## Reglas de negocio

1. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente →
   `400 INVALID_INPUT` (`field:'project_id'`).
2. **El MODO** (`_modo`): `String(input.modo).toLowerCase()`. Sin modo → **compatibilidad
   declarada**: si `input.real != null` y (`input.objetivo != null || input.presupuesto !=
   null`) se asume `'real_vs_presupuesto'`; si no → `null`. Modo desconocido (no en `MODOS`) →
   `null`.
3. **Sin modo NO se compara**: `200` con `modo:null`, `metrica:null`, `a:null`, `b:null`,
   `delta:null`, `delta_relativa:null`, `signo:null`, `abierto:true`, `faltan:['modo']` y
   `motivo:'no se compara: falta declarar el modo (ejercicio_vs_ejercicio | mes_vs_mes |
   real_vs_presupuesto)'`.
4. **Modo `real_vs_presupuesto`** (`_realVsPresupuesto`): **DELEGA** en
   `desviacion.calcular.request` (J4) con `{project_id, dimension, periodo: input.periodo ??
   input.hasta ?? null, real?, objetivo?, umbral?}`, `timeout_ms:5000`. **Sin respuesta de J4
   NO se recalcula la desviación aquí** (eso sería duplicar J4) → `200` con `faltan:
   ['desviacion']` y el motivo. Con respuesta → `{modo:'real_vs_presupuesto', metrica:
   'desviacion', fuente:'desviacion', a:{periodo, valor:data.real, rol:'real'},
   b:{periodo, valor:data.objetivo, rol:'presupuesto'}, delta:data.desviacion,
   delta_relativa, signo:data.signo, avisa:data.avisa, umbral, abierto: data.abierto ||
   delta === null, faltan: data.faltan, motivo: data.motivo}` — **la traza de la delegación**.
5. **Modo periodo vs periodo — la MÉTRICA es declarable**: `String(input.metrica).toLowerCase()`
   o `null`. Sin métrica → `200` con `faltan:['metrica']` y
   `motivo:'no se compara periodo vs periodo: la metrica a comparar es DECLARABLE y no se
   declaro'` (**no se elige por el jefe**).
6. **Los dos EXTREMOS** (`_extremo`), en orden:
   - **Declarado** en `input.a`/`input.b`: objeto → `{periodo:decl.periodo, valor:_num(
     decl.valor ?? decl.importe), fuente:'declarado', rol:decl.rol}`; escalar numérico →
     `{periodo:<desde|hasta>, valor, fuente:'declarado', rol:null}`.
   - **Pedido a la FUENTE de la métrica** (`FUENTES[metrica]`), **POR EVENTO**
     (`timeout_ms:4000`): `margen` → `margen-analitico.calcular.request`, campo
     `margen_total`, dueño `'margen-analitico'`; `resultado` → `cuenta-resultados.calcular.request`,
     campo `resultado`; `caja` → `saldo-tesoreria.calcular.request`, campo `saldo_total`. El
     payload es `{project_id, periodo, ejercicio:periodo, eje:input.eje}`. **La cifra de cada
     extremo NUNCA se recalcula.**
   - Métrica sin fuente conocida o sin respuesta → `valor:null`.
7. **Sin los dos extremos NO se computa delta**: si `a.valor === null` → `faltan` incluye
   `'a:<periodo>'`; si `b.valor === null` → `'b:<periodo>'`. Con faltan → `200` con
   `delta:null`, `abierto:true` y `motivo:'no se computa el delta: falta el valor de <faltan>
   (no se compara contra un 0 que nadie midio)'`.
8. **El delta** (única aritmética propia): `delta = round(a.valor − b.valor, 2)`. Signo:
   `> 0` → `'SUBE'`; `< 0` → `'BAJA'`; `= 0` → `'IGUAL'`. Relativa:
   `b.valor !== 0 ? round(delta / Math.abs(b.valor), 4) : null`.
9. **La direccion se declara**: `'SUBE'` → `'MEJORA_EN_A'`; `'BAJA'` → `'MEJORA_EN_B'`;
   `'IGUAL'` → `'SIN_CAMBIO'` — para que el jefe **no tenga que interpretar el signo**.
10. **`fuente_metrica`**: `a.fuente || b.fuente || null`.
11. **`_num(v)`**: `undefined`/`null`/`''` → `null`; no finito → `null`.
12. **Puro**: sin estado, sin persistencia, sin reloj, sin azar. **REUTILIZA, no duplica.**
13. **HTTP exacto**: éxito `200`; `project_id` ausente → `400`; excepción en `_atender` →
    `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `comparador-periodos.comparar.response`. **No emite evento de dominio.**

### 1. `comparar` — mes vs mes (métrica declarada, extremos por evento)

```json
{
  "project_id": "e57a318a-...",
  "modo": "mes_vs_mes",
  "metrica": "margen",
  "desde": "2026-09",
  "hasta": "2026-08",
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "modo": "mes_vs_mes",
  "metrica": "margen",
  "fuente_metrica": "margen-analitico",
  "a": { "periodo": "2026-09", "valor": 1300, "fuente": "margen-analitico", "rol": null },
  "b": { "periodo": "2026-08", "valor": 1100, "fuente": "margen-analitico", "rol": null },
  "delta": 200,
  "delta_relativa": 0.1818,
  "signo": "SUBE",
  "direccion": "MEJORA_EN_A",
  "abierto": false,
  "faltan": [],
  "motivo": null
}
```

### 2. `comparar` — real vs presupuesto (delega en J4)

```json
{ "project_id": "e57a318a-...", "modo": "real_vs_presupuesto", "dimension": "C1", "periodo": "2026-09" }
```

Respuesta `200` (traza de la delegación):

```json
{
  "project_id": "e57a318a-...",
  "modo": "real_vs_presupuesto",
  "metrica": "desviacion",
  "fuente": "desviacion",
  "a": { "periodo": "2026-09", "valor": 17000, "rol": "real" },
  "b": { "periodo": "2026-09", "valor": 15000, "rol": "presupuesto" },
  "delta": 2000,
  "delta_relativa": 0.1333,
  "signo": "DESVIACION_POSITIVA",
  "avisa": true,
  "umbral": 1200,
  "abierto": false,
  "faltan": [],
  "motivo": null
}
```

Si J4 no responde → `200` con `faltan:['desviacion']` y el motivo
(`'no se compara real vs presupuesto: desviacion (J4) no respondio (aqui NO se recalcula la
desviacion)'`). **Aqui NO se recalcula la desviación.**

### 3. `comparar` — sin modo o sin métrica → `[ABIERTO]`

Sin `modo` → `faltan:['modo']` y `delta:null`; con `modo:'mes_vs_mes'` sin `metrica` →
`faltan:['metrica']` y `delta:null`. **No se elige por el jefe.**

### 4. `comparar` — sin uno de los dos extremos → `delta:null`

`faltan:['a:2026-09']` o `['b:2026-08']` y el motivo
(`'no se computa el delta: falta el valor de <faltan> (no se compara contra un 0 que nadie
midio)'`).

### 5. `comparar` — extremos declarados

`a:1300, b:1100` (o `{periodo, valor}`) → `fuente:'declarado'` en cada extremo y `delta:200`
(`'SUBE'`, `'MEJORA_EN_A'`).

### 6. Fallo — falta `project_id`

Respuesta `400` + `comparador-periodos.comparar.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/comparador-periodos.test.js`. Cubre:

- `mes_vs_mes` con métrica `margen` → `200` con `delta`, `signo` y `direccion`; los extremos
  se piden a `margen-analitico` (J2) por evento.
- `real_vs_presupuesto` **delega** en `desviacion` (J4) por evento: el delta es el de J4; si
  J4 no responde → `faltan:['desviacion']` (**no se recalcula**).
- Sin modo → `delta:null`, `faltan:['modo']`; sin métrica → `delta:null`,
  `faltan:['metrica']`.
- Sin uno de los dos extremos → `delta:null` (**no se compara contra 0**).
- Extremos declarados → `fuente:'declarado'`; métrica sin fuente conocida → `valor:null`.
- Signo: `> 0` → `SUBE`, `< 0` → `BAJA`, `= 0` → `IGUAL`; `direccion` coherente.
- **Determinismo**: mismos extremos + misma métrica → mismo delta.
- `project_id` ausente → `400 INVALID_INPUT` + `comparador-periodos.comparar.failed`.
- `toolComparar` devuelve la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `ComparadorPeriodos extends ModuloHibridoReflejo`; `name = 'comparador-periodos'`,
  `version = 'reflejo-0.1.0'`. Sin `PosPersistencia`, sin store, sin `onProjectActivated`
  (REFLEJO stateless).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-analitica/comparador-periodos/`).
- Constantes: `MODOS = new Set(['ejercicio_vs_ejercicio','mes_vs_mes','real_vs_presupuesto'])`
  y `FUENTES` (mapa métrica → `{evento, dueño, campo}`: `margen`/`resultado`/`caja`).
- `onCompararRequest` usa `this._atender(e, 'comparar', 'comparador-periodos.comparar.response',
  async (d) => {...})` y publica el par `failed` si `status !== 200`.
- Proyección `_comparar(input)` (async); helpers `_realVsPresupuesto`, `_extremo`, `_modo`,
  `_num`. Tool `toolComparar`.
- `_invalid` / `_rpc` / `_round` vienen de `modulo-hibrido-reflejo`.
- **DEP**: pide a `desviacion` (J4) en `real_vs_presupuesto`, y a `margen-analitico` (J2),
  `cuenta-resultados` (C2), `saldo-tesoreria` (E4) en periodo vs periodo — **por EVENTO**.
- **PARÁMETRO COMO DATO**: el modo y la métrica son **declarables**; el código **no elige**
  modo, métrica ni fuente por el jefe. **REUTILIZA J3/J4 sin duplicarlos**.
