---
name: consulta-cuentas-bajo-demanda
description: >
  Skill FULL del módulo PUENTE `consulta-cuentas-bajo-demanda` de la vertical
  contabilidad de Enki. LA PUERTA PULL — la pregunta del dueño cuando él quiera:
  conecta su pregunta con el cálculo POR PETICIÓN (la pieza que ya calcula ese
  dato), sin imponer cadencia. Consulta, no decide. Úsala para operar, depurar o
  extender el puente, o para entender su contrato de eventos y sus reglas de
  negocio.
when-to-use: >
  - Cuando necesites responder la pregunta del dueño enroutándola a su fuente
    (RPC consulta-cuentas-bajo-demanda.preguntar.request).
  - Cuando depures por qué la respuesta sale `null` con `abierto:true` y
    `faltan:['tema']` (sin tema) o `faltan:['fuente']` (tema sin fuente
    declarada), o por qué falta `project_id` (400 INVALID_INPUT).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    invariantes del puente (consulta no decide, fuente declarable, no recalcula,
    sin cadencia, sin estado).
  - Cuando vayas a escribir/ampliar el test unitario del puente
    consulta-cuentas-bajo-demanda.
tags: [enki, modulo, puente, contabilidad, consulta-cuentas-bajo-demanda]
---

# consulta-cuentas-bajo-demanda — PUENTE de la puerta PULL del dueño

## Qué hace el módulo

`consulta-cuentas-bajo-demanda` es un **PUENTE STATELESS** (Q1, hoja del plan): **LA PUERTA
*PULL*** — la pregunta del **dueño**, cuando **él quiera**. Conecta su pregunta con el **cálculo
POR PETICIÓN**. **NO impone cadencia** (distinto del cuadro del jefe, J8, que **sí** la impone).

Atributos del diseño: `fuente:ParametroDeclarable`.
Método: `preguntar(q:Consulta):Respuesta`.

Invariantes:

- **CONSULTA, NO DECIDE**: **enruta** la pregunta a la pieza que **ya calcula** ese dato **POR
  EVENTO** y devuelve su respuesta. **No interpreta, no juzga, no decide** por el dueño
  (`decide:false`).
- **LA FUENTE ES DECLARABLE**: el mapa `tema → fuente` es **`ParametroDeclarable`**
  (`saldo`/`balanza`→`mayor-balanza`, `resultado`→`cuenta-resultados`, `caja`→`saldo-tesoreria`,
  `margen`→`margen-analitico`, `proveedor`→`estado-cuenta-proveedor`); **sin fuente declarada NO
  se inventa el cálculo** → `[ABIERTO]`.
- **NO RECALCULA**: no duplica la aritmética de las piezas; su oficio es **ENRUTAR**, no computar.
- **Dato ausente = desconocido**: si la fuente no responde, la respuesta es **`null`** con lo que
  falta; **jamás un `0`**.
- **Sin estado**: un puente. **No recuerda** preguntas ni respuestas.

Proyección única `_preguntar`. Publica `contabilidad.respuesta_consulta` (lo consume
`puente-lenguaje-dueno`, Q2, para traducir la cifra al lenguaje del dueño). Cierra el círculo con
`consulta-cuentas-bajo-demanda.preguntar.failed`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `consulta-cuentas-bajo-demanda.preguntar.request` | `onPreguntarRequest` | RPC puente: {project_id, pregunta:{tema\|texto}\|tema, fuente?, cuenta?, periodo?, ejercicio?, desde?, hasta?, dimension?, eje?} → {pregunta, tema, fuente, evento_fuente, campo, respuesta, valor, disponible, cadencia:null, impone_cadencia:false, decide:false, abierto, faltan}. Enruta la pregunta a la fuente declarable (por defecto el mapa tema→dueño) POR EVENTO y devuelve su respuesta; NO recalcula nada. Sin tema → [ABIERTO]; fuente sin responder → respuesta null. Éxito → publica contabilidad.respuesta_consulta y responde por consulta-cuentas-bajo-demanda.preguntar.response; project_id ausente → consulta-cuentas-bajo-demanda.preguntar.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `consulta-cuentas-bajo-demanda.preguntar.response` | Respuesta RPC correlada de consulta-cuentas-bajo-demanda.preguntar.request → {request_id, status:200, data:{pregunta, tema, fuente, respuesta, valor, disponible, impone_cadencia:false, decide:false}}. Emitida por el helper _atender. |
| `consulta-cuentas-bajo-demanda.preguntar.failed` | Par de fallo determinista (Q1): project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de consulta-cuentas-bajo-demanda.preguntar.request. |
| `contabilidad.respuesta_consulta` | Fire-and-forget (Q1): hay respuesta a una pregunta del dueño (puerta pull) → {project_id, pregunta, fuente, respuesta, disponible, correlation_id}. Lo consume sello-cobertura (Q3) para sellar la completitud de lo consultado y puente-lenguaje-dueno (Q2) para traducir la cifra al lenguaje del dueño. Disponible:false → no se inventa cifra. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `consulta-cuentas-bajo-demanda.preguntar.failed` cierra el círculo de
> `consulta-cuentas-bajo-demanda.preguntar.request` cuando `_preguntar` devuelve status ≠ 200
> (`400 INVALID_INPUT` por `project_id` ausente).

> Nota de honestidad (cruce con `index.js`): `onPreguntarRequest` publica
> `contabilidad.respuesta_consulta` **siempre que `_preguntar` devuelve `200`** — lo que **incluye
> las vías `[ABIERTO]`** (sin tema, sin fuente, o fuente que no responde), en las que el evento
> viaja con `disponible:false` y `respuesta:null`. Es decir, el evento de dominio se emite **también
> cuando no hubo respuesta**; el consumidor debe mirar `disponible`. La rama `else` publica
> `consulta-cuentas-bajo-demanda.preguntar.failed`.

> Nota de sub-declaración (cruce con `index.js`): **no están en `module.json` pero sí los emite
> `index.js`** los RPC salientes de `_preguntar` (son **DEP por evento**, la fuente que se enruta):
> `mayor-balanza.saldos.request`, `mayor-balanza.balanza.request`, `cuenta-resultados.calcular.request`,
> `saldo-tesoreria.calcular.request`, `margen-analitico.calcular.request` o
> `estado-cuenta-proveedor.calcular.request` — según el mapa `FUENTES` y el tema
> (`timeout_ms:5000`, con `{project_id, cuenta, periodo, ejercicio, desde, hasta, dimension, eje}`).

> Nota: tampoco figuran `_tema`, `_fuente` ni el mapa `FUENTES` (internos) en el `module.json`.

## Reglas de negocio

1. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente →
   `400 INVALID_INPUT` (`field:'project_id'`).
2. **La PREGUNTA**: si `input.pregunta` es objeto → se usa tal cual; si no, se construye
   `{tema: input.tema, texto: input.texto}`.
3. **El TEMA** (`_tema`): `input.tema` ?? `pregunta.tema`, normalizado a minúsculas y recortado.
   **Sin tema NO se elige una fuente** → `200 [ABIERTO]` con `tema:null`, `fuente:null`,
   `respuesta:null`, `disponible:false`, `faltan:['tema']` y `motivo` («el puente no adivina qué
   se pregunta»). **No adivina.**
4. **La FUENTE** (`_fuente`): si `input.fuente` es objeto con `evento` → fuente **declarada**
   (`{evento, dueno, campo}`); si no, la del **mapa** de temas conocidos `FUENTES`. **Sin fuente
   declarada** para el tema → `200 [ABIERTO]` con `respuesta:null`, `disponible:false`,
   `faltan:['fuente']` y `motivo` («la fuente es ParametroDeclarable y no se inventa el cálculo»).
5. **El mapa `FUENTES`** (identidad de cada tema, no criterio de negocio):
   - `saldo` → `mayor-balanza.saldos.request` (`campo:'saldos'`).
   - `balanza` → `mayor-balanza.balanza.request` (`campo:'balanza'`).
   - `resultado` → `cuenta-resultados.calcular.request` (`campo:'resultado'`).
   - `caja` → `saldo-tesoreria.calcular.request` (`campo:'saldo_total'`).
   - `margen` → `margen-analitico.calcular.request` (`campo:'margen_total'`).
   - `proveedor` → `estado-cuenta-proveedor.calcular.request` (`campo:'saldo'`).
6. **LA PUERTA *PULL* enruta y NADA MÁS**: se llama `this._rpc(f.evento, {project_id, cuenta,
   periodo, ejercicio (o periodo), desde, hasta, dimension, eje}, {timeout_ms:5000})`. **Aquí nada
   se computa**: la respuesta es la de la **fuente**, sin interpretarla ni re-formularla (el
   lenguaje llano lo hace Q2).
7. **Si la fuente NO responde** → `200 [ABIERTO]`: `respuesta:null`, `disponible:false`,
   `abierto:true`, `faltan:[f.dueno]`, `motivo` («el puente NO recalcula: se declara el hueco»).
   `decide:false` e `impone_cadencia:false` también en esta vía.
8. **La respuesta con dato**: `{project_id, pregunta, tema, fuente:f.dueno, evento_fuente:f.evento,
   campo:f.campo, respuesta:<data de la fuente>, valor:<data[f.campo] o null>, disponible:true,
   cadencia:null, impone_cadencia:false, decide:false, abierto:{respuesta:null}}`.
   - `valor` = el campo declarado de la fuente (`data[f.campo]`) o `null`.
   - `cadencia:null` e `impone_cadencia:false`: la puerta es **PULL**, la pide el dueño **cuando
     quiere** — **cero cadencia impuesta**.
9. **CONSULTA, NO DECIDE** (`decide:false`): el puente **no interpreta, no juzga, no decide** por
   el dueño. Su oficio es **enrutar**.
10. **Sin estado**: no hay ninguna escritura ni store. Un puente **no recuerda** preguntas ni
    respuestas. Sin `PosPersistencia`, sin `onProjectActivated`.
11. **HTTP exacto**: éxito `200` (con dato o `[ABIERTO]`); `project_id` ausente → `400`; excepción
    en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `consulta-cuentas-bajo-demanda.preguntar.response` y emite
`contabilidad.respuesta_consulta`.

### 1. `preguntar` — la caja (fuente del mapa)

```json
{
  "project_id": "e57a318a-...",
  "tema": "caja",
  "periodo": "2026-09",
  "correlation_id": "abc-123"
}
```

Respuesta `200` (la fuente `saldo-tesoreria` respondió):

```json
{
  "project_id": "e57a318a-...",
  "pregunta": { "tema": null, "texto": null },
  "tema": "caja",
  "fuente": "saldo-tesoreria",
  "evento_fuente": "saldo-tesoreria.calcular.request",
  "campo": "saldo_total",
  "respuesta": { "saldo_total": 3421.75, "...": "..." },
  "valor": 3421.75,
  "disponible": true,
  "cadencia": null,
  "impone_cadencia": false,
  "decide": false,
  "abierto": { "respuesta": null }
}
```

Emite `contabilidad.respuesta_consulta` (lo consumen Q2 para traducir y Q3 para sellar):

```json
{ "project_id": "e57a318a-...", "pregunta": { "tema": null, "texto": null }, "fuente": "saldo-tesoreria", "respuesta": { "saldo_total": 3421.75 }, "disponible": true, "correlation_id": "abc-123" }
```

### 2. `preguntar` — sin tema → `[ABIERTO]` (el puente no adivina)

```json
{ "project_id": "e57a318a-...", "texto": "¿cómo vamos?" }
```

Respuesta `200`: `tema:null`, `fuente:null`, `respuesta:null`, `disponible:false`,
`faltan:["tema"]`, `motivo` («falta declarar su tema (saldo|balanza|resultado|caja|margen|proveedor)
— el puente no adivina qué se pregunta»). Emite `contabilidad.respuesta_consulta` con
`disponible:false`.

### 3. `preguntar` — tema sin fuente declarada → `[ABIERTO]`

Un tema que no está en el mapa y sin `input.fuente` → `respuesta:null`, `disponible:false`,
`faltan:["fuente"]`. **No se inventa el cálculo.**

### 4. `preguntar` — la fuente no responde → `[ABIERTO]` (no se recalcula)

Si `_rpc` devuelve `null` → `respuesta:null`, `disponible:false`, `abierto:true`,
`faltan:["saldo-tesoreria"]`, `motivo` («el puente NO recalcula: se declara el hueco»).

### 5. Fallo — falta `project_id`

```json
{ "tema": "caja" }
```

Respuesta `400` + `consulta-cuentas-bajo-demanda.preguntar.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/consulta-cuentas-bajo-demanda.test.js`. Cubre:

- `preguntar` con `tema:'caja'` → `200`, enruta a `saldo-tesoreria.calcular.request`, devuelve su
  `saldo_total` en `valor` y **emite** `contabilidad.respuesta_consulta` (`disponible:true`).
- **PULL**: `impone_cadencia:false` y `cadencia:null` **siempre**; `decide:false` **siempre**.
- Sin `tema` → `[ABIERTO]` con `faltan:['tema']` (**el puente no adivina**); emite el evento con
  `disponible:false`.
- Tema sin fuente declarada → `[ABIERTO]` con `faltan:['fuente']` (**no se inventa el cálculo**).
- Fuente que no responde → `respuesta:null`, `disponible:false`, `faltan:[<dueño>]` (**el puente
  NO recalcula**).
- `input.fuente` declarada (objeto con `evento`) → se usa esa fuente en vez del mapa.
- Cada tema del mapa enruta a su dueño/evento correcto (`saldo`, `balanza`, `resultado`, `caja`,
  `margen`, `proveedor`).
- `project_id` ausente → `400 INVALID_INPUT` + `.preguntar.failed`.
- **Sin estado**: ninguna llamada persistió ni recordó nada (stateless); `toolPreguntar` devuelve
  la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `ConsultaCuentasBajoDemanda extends ModuloHibridoReflejo`; `name =
  'consulta-cuentas-bajo-demanda'`, `version = 'reflejo-0.1.0'`. Sin `PosPersistencia`, sin store,
  sin `onProjectActivated` (PUENTE stateless).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-analitica/consulta-cuentas-bajo-demanda/`).
- Constante `FUENTES` — el mapa `tema → {evento, dueno, campo}` (la **identidad** de cada pregunta
  conocida; **no** criterio de negocio).
- `onPreguntarRequest` usa `this._atender(e, 'preguntar',
  'consulta-cuentas-bajo-demanda.preguntar.response', async (d) => {...})` con cierre de círculo
  (evento de dominio en `200` — con dato o `[ABIERTO]` —, par `failed` si no).
- Proyección única `_preguntar(input)` (**async**: enruta por evento a la fuente); helpers `_tema`,
  `_fuente`. Tool `toolPreguntar`.
- `_invalid` / `_rpc` vienen de `modulo-hibrido-reflejo`.
- DEP: **enruta POR EVENTO** a la fuente de cada tema (`mayor-balanza`, `cuenta-resultados`,
  `saldo-tesoreria`, `margen-analitico`, `estado-cuenta-proveedor`). Lo consumen
  `puente-lenguaje-dueno` (Q2) para traducir y `sello-cobertura` (Q3) para sellar vía
  `contabilidad.respuesta_consulta`.
- **CONSULTA, NO DECIDE y NO IMPONE CADENCIA**: es la puerta **PULL** (la pregunta la hace el
  dueño cuando quiere), frente al cuadro del jefe (J8) que **sí** impone cadencia.
