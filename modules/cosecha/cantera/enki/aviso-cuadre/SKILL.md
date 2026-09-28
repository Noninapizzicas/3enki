---
name: aviso-cuadre
description: >
  Skill FULL del módulo PUENTE `aviso-cuadre` de la vertical contabilidad de Enki (C6,
  hoja del plan). NO FINGE EL CUADRE: si falta cobertura, AVISA — y si no hay métrica
  declarada, lo DICE (no asume que todo llegó). Es una VISTA de la MÉTRICA ÚNICA (A12,
  completitud-cobertura): aquí NO se recalcula «lo que falta» (lee_metrica:'A12',
  recalcula_metrica:false, segunda_metrica:false). Cuando el cálculo de cobertura llega
  por EVENTO (contabilidad.cobertura_calculada) se LEE su resultado tal cual; cuando el
  disparo viene del cierre (contabilidad.cierre_realizado) se PIDE la métrica a A12 por
  EVENTO (contabilidad.cobertura.calcular.request) con CONTRATO TOLERANTE: si A12 no
  responde NO se afirma ni que cuadra ni que falta — 503 DEPENDENCIA_NO_DISPONIBLE,
  accion NO_FINGIR_CUADRE. TRES VEREDICTOS deterministas: CUADRA (esperados>0, huecos=0,
  tasa=1), FALTA_COBERTURA (huecos>0 o tasa<1 → avisa) y SIN_ACTIVIDAD (esperados=0:
  cuadra:null, avisa:false). El AVISO se pide al motor de avisos (K2) por EVENTO
  (contabilidad.aviso.solicitar.request con origen 'C6_AVISO_CUADRE', tipo 'AVISO_CUADRE'):
  el veredicto QUEDA EMITIDO igualmente y si K2 no contesta se declara
  contabilidad.aviso.solicitar.failed. Stateless. Úsala para operar, depurar o extender el
  puente.
when-to-use: >
  - Cuando la cobertura se calcule (entrada contabilidad.cobertura_calculada) o un cierre
    dispare la evaluación (entrada contabilidad.cierre_realizado) y haya que decir si el
    cuadre se sostiene y avisar si falta cobertura.
  - Cuando depures por qué no hay veredicto (503 DEPENDENCIA_NO_DISPONIBLE, NO_FINGIR_CUADRE,
    si A12 no responde; 422 PRECONDITION_FAILED SIN_METRICA si el payload no trae la métrica;
    422 si se intenta avisar de un cuadre que no falta cobertura).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), los tres veredictos
    y por qué la métrica se LEE, nunca se recalcula.
  - Cuando vayas a escribir/ampliar el test unitario del puente aviso-cuadre.
tags: [enki, modulo, puente, contabilidad, aviso-cuadre, cuadre, metrica-unica]
---

# aviso-cuadre — PUENTE que no finge el cuadre

## Qué hace el módulo

`aviso-cuadre` es un **PUENTE STATELESS** (C6, hoja del plan): **NO FINGE EL CUADRE** — si
falta cobertura, **AVISA**; y si no hay cobertura declarada, **lo DICE** (no asume que todo
llegó).

Es una **VISTA de la METRICA UNICA** (A12, `completitud-cobertura`): aquí **NO se recalcula
«lo que falta»** (`lee_metrica:'A12'`, `recalcula_metrica:false`, `segunda_metrica:false` —
*el conflicto ② del diseño no se materializa*). Dos entradas:

- `contabilidad.cobertura_calculada` (A12 lo calculó) → se **LEE el resultado tal cual**.
- `contabilidad.cierre_realizado` (C4 cerró un periodo) → se **PIDE la métrica a A12 por
  EVENTO** (`contabilidad.cobertura.calcular.request`) con **CONTRATO TOLERANTE**: si A12 no
  responde **NO se afirma ni que cuadra ni que falta** — se publica `contabilidad.cuadre.failed`
  con **`503 DEPENDENCIA_NO_DISPONIBLE`** y `accion:'NO_FINGIR_CUADRE'`.

**TRES VEREDICTOS deterministas** (`_evaluar`):

- **`CUADRA`** — `esperados > 0`, `huecos = 0`, `tasa = 1`, `avisa:false`.
- **`FALTA_COBERTURA`** — `huecos > 0` o `tasa < 1` → **avisa**, con los huecos y las
  verticales **leídas de la clave `<pid>:<vertical>:<unidad>`** de la métrica, **SIN inventar**.
- **`SIN_ACTIVIDAD`** — `esperados = 0`: `cuadra:null`, `avisa:false`, `huecos:0`,
  `'no habia nada esperado: el sistema NO finge un cuadre'`.

El **AVISO** se pide al motor de avisos (**K2**) por EVENTO
(`contabilidad.aviso.solicitar.request` con `origen:'C6_AVISO_CUADRE'`, `tipo:'AVISO_CUADRE'`,
`prioridad:'ALTA'` si `tasa < 0.5`, `contexto` con esperados/recibidos/huecos/tasa/verticales):
el **veredicto de cuadre QUEDA EMITIDO igualmente** (es de contabilidad) y si K2 no contesta se
declara `contabilidad.aviso.solicitar.failed` — **no se fabrica un aviso que K2 no produjo**.

Es **stateless**: **SIN PosPersistencia ni `project.activated`** — cada op entra objeto, sale
objeto. La dependencia con `completitud-cobertura` (A12) y `motor-avisos` (K2) es **por
EVENTO, NUNCA por `require` cruzado`.

> **NO REUTILIZA**: el aviso de cuadre bebe de la métrica de cobertura de ESTA vertical.

## Contrato de eventos (module.json real)

### Subscribes (consumo por evento fire-and-forget)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.cobertura_calculada` | `onCoberturaCalculada` | Fire-and-forget (A12 → C6): completitud-cobertura calculo la cobertura → {project_id, periodo, esperados, recibidos, huecos, tasa, detalle:{huecos:[clave]}, senal}. Se EVALUA el cuadre LEYENDO la metrica unica (no se recalcula) y se publica contabilidad.cuadre_evaluado con su veredicto: CUADRA / FALTA_COBERTURA / SIN_ACTIVIDAD. Si falta cobertura se PIDE el aviso a motor-avisos (K2) por contabilidad.aviso.solicitar.request. Si la metrica no llega → contabilidad.cuadre.failed (el cuadre NO se finge). |
| `contabilidad.cierre_realizado` | `onCierreRealizado` | Fire-and-forget (C4 → C6): cierre-ejercicio cerro un periodo → hay que decir si el cuadre se sostiene. La metrica se PIDE a completitud-cobertura (A12) por EVENTO (contabilidad.cobertura.calcular.request, contrato TOLERANTE): si A12 no responde se publica contabilidad.cuadre.failed (503 DEPENDENCIA_NO_DISPONIBLE, NO_FINGIR_CUADRE) porque NO se afirma ni el cuadre ni su falta. Con la metrica, mismo veredicto y mismo aviso a K2. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.cuadre_evaluado` | Fire-and-forget (C6): el cuadre de un periodo quedo EVALUADO con su veredicto → {project_id, periodo, veredicto:'CUADRA'\|'FALTA_COBERTURA'\|'SIN_ACTIVIDAD', cuadra, falta_cobertura, avisa, esperados, recibidos, huecos, tasa, detalle_huecos, verticales?, destinatario?, lee_metrica:'A12', recalcula_metrica:false, finge_cuadre:false, cierre}. Es una VISTA de la metrica unica: se emite SIEMPRE, aunque motor-avisos no este vivo. |
| `contabilidad.aviso.solicitar.request` | Peticion de aviso por EVENTO a motor-avisos (K2): {project_id, origen:'C6_AVISO_CUADRE', tipo:'AVISO_CUADRE', motivo, destinatario, cola_destino, prioridad:'ALTA'\|'NORMAL', contexto:{periodo, esperados, recibidos, huecos, tasa, verticales, lee_metrica:'A12'}}. K2 la declara en sus subscribes y responde por contabilidad.aviso.solicitar.response. Solo se pide cuando FALTA cobertura (no se avisa de lo que cuadra). |
| `contabilidad.cuadre.failed` | Par de fallo determinista (C6): no llego la metrica unica (A12 ausente → 503 DEPENDENCIA_NO_DISPONIBLE, NO_FINGIR_CUADRE), no hay metrica en el payload (422 SIN_METRICA), o se intento avisar de un cuadre que no falta cobertura. El cuadre NO se finge: se declara. |
| `contabilidad.cuadre_evaluado.failed` | Par de fallo del evento de dominio contabilidad.cuadre_evaluado: la emision del hecho de dominio no se completo. |
| `contabilidad.aviso.solicitar.failed` | Contrato TOLERANTE: motor-avisos (K2) no respondio la peticion de aviso → 503 DEPENDENCIA_NO_DISPONIBLE. El veredicto de cuadre queda EMITIDO igualmente; NO se fabrica un aviso que K2 no produjo. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí no hay RPC propio: los pares de fallo son `contabilidad.cuadre.failed` (veredicto
> imposible o métrica ausente) y `contabilidad.aviso.solicitar.failed` (K2 mudo).

> Nota: declarado en module.json pero NO emitido por index.js (patrón de la vertical: el par
> de fallo real es `<op>.failed`) — `contabilidad.cuadre_evaluado.failed` es el par del
> evento de DOMINIO; el puente no lo publica desde ningún handler. Los pares que **sí** se
> emiten son `contabilidad.cuadre.failed` y `contabilidad.aviso.solicitar.failed`.

> Nota: **no hay `*.request`/`*.response` de RPC propio** en su `module.json`: todo entra por
> EVENTOS fire-and-forget. **No usa `_atender`** ni hay pares response. La petición de aviso
> a K2 se hace con `_rpc` (`contabilidad.aviso.solicitar.request`, `timeout_ms:4000`).

> Nota: el `publishes` **declara** `contabilidad.aviso.solicitar.request` como evento de
> salida del puente (petición a K2): es un RPC request/response con el motor-avisos, no un
> dominio.

## Reglas de negocio

1. **LA METRICA SE LEE, NO SE RECALCULA (invariante)**: `_evaluar` acepta la métrica si
   `c.es_metrica_unica === true`, o `Array.isArray(detalle.huecos)`, o `c.tasa !== undefined`;
   si no, **`422 PRECONDITION_FAILED`** con `{metrica:'A12', recalcula_metrica:false,
   asumido:false, senal:'SIN_METRICA'}`. Toda respuesta lleva `lee_metrica:'A12'`,
   `recalcula_metrica:false`, `finge_cuadre:false`.
2. **SIN ACTIVIDAD (no se finge un cuadre)**: si `senalMetrica === 'SIN_ACTIVIDAD'` o
   `esperados === 0` → `veredicto:'SIN_ACTIVIDAD'`, `cuadra:null`, `falta_cobertura:false`,
   `avisa:false`, `huecos:0`, `motivo:'no habia nada esperado: el sistema NO finge un
   cuadre'`. **Ni cuadra ni falta: no había nada que medir.**
3. **FALTA COBERTURA (avisa)**: si `huecos > 0` o `tasa < 1` → `veredicto:'FALTA_COBERTURA'`,
   `cuadra:false`, `falta_cobertura:true`, `avisa:true`. Las **verticales** se extraen de las
   claves de `detalle.huecos` (`<pid>:<vertical>:<unidad>`) con
   `[...new Set(lista.map(k => String(k).split(':')[1]).filter(Boolean))]` — **SIN inventar**.
   `destinatario` = `DUENO` si hay lista de huecos, si no `ASESOR` (lo de una fuente del
   negocio al dueño; lo contable al asesor).
4. **CUADRA (con su base)**: `esperados > 0`, `huecos = 0`, `tasa >= 1` →
   `veredicto:'CUADRA'`, `cuadra:true`, `avisa:false`, `base:{esperados, recibidos, tasa}`.
5. **El veredicto se emite SIEMPRE**: `_evaluarConAviso` publica `contabilidad.cuadre_evaluado`
   (con `cierre` y `correlation_id`) **antes** de pedir el aviso — independiente de que K2
   esté vivo. Es de contabilidad.
6. **Solo se avisa de lo que FALTA**: `_avisar` rechaza con **`422 PRECONDITION_FAILED`**
   (`'no se avisa de un cuadre que no falta cobertura'`) si `!evaluacion.falta_cobertura`.
7. **El aviso a K2 (contrato TOLERANTE)**: `_pedirAviso` hace `_rpc`
   (`contabilidad.aviso.solicitar.request`, `timeout_ms:4000`); si no responde o
   `status !== 200` → publica `contabilidad.aviso.solicitar.failed` con **`503
   DEPENDENCIA_NO_DISPONIBLE`** y `details:{dependencia:'motor-avisos', tipo, huecos}`. **El
   veredicto queda emitido: NO se fabrica el aviso.**
8. **Prioridad del aviso**: `tasa < 0.5 ? 'ALTA' : 'NORMAL'`. El `contexto` lleva
   `{periodo, esperados, recibidos, huecos, tasa, verticales, lee_metrica:'A12'}`.
9. **Sin métrica de A12 no hay veredicto (contrato TOLERANTE)**: en `onCierreRealizado`,
   `_leerMetrica` pide `contabilidad.cobertura.calcular.request` (`timeout_ms:4000`); si no
   responde → `contabilidad.cuadre.failed` con **`503 DEPENDENCIA_NO_DISPONIBLE`**,
   `{dependencia:'completitud-cobertura', accion:'NO_FINGIR_CUADRE', cierre}`. **No se
   afirma ni el cuadre ni su falta.**
10. **El puente es stateless**: sin store, sin PosPersistencia, sin `project.activated`.
    Cada op entra objeto, sale objeto.
11. **Validaciones deterministas**: falta `project_id` → `400 INVALID_INPUT project_id`
    (en `_evaluar` y `_avisar`). Shape: `{status:400, error:{code:'INVALID_INPUT',
    message:'<campo> requerido', details:{field:<campo>}}}`.
12. **HTTP exacto**: veredicto calculado → `200`; métrica ausente en payload → `422`; A12
    mudo → `503` en `cuadre.failed`; K2 mudo → `503` en `aviso.solicitar.failed` (el
    veredicto **sigue** emitido); no usa `_atender` (sin RPC propio).

## Cómo se usa (eventos)

Este puente **no tiene RPCs**: todo entra por eventos. Se apoya en `_evaluar` / `_avisar` y
en las tools para probarlo.

### 1. Entrada — cobertura calculada → veredicto FALTA_COBERTURA + aviso a K2

Entra `contabilidad.cobertura_calculada`:

```json
{
  "project_id": "e57a318a-...",
  "periodo": "2026-09",
  "esperados": 10,
  "recibidos": 6,
  "huecos": 4,
  "tasa": 0.6,
  "detalle": { "huecos": ["e57a318a-...:COMPRA:2026-09", "e57a318a-...:VENTA:2026-09"] },
  "correlation_id": "abc-123"
}
```

Se publica `contabilidad.cuadre_evaluado`:

```json
{ "project_id": "e57a318a-...", "periodo": "2026-09", "veredicto": "FALTA_COBERTURA", "cuadra": false, "falta_cobertura": true, "avisa": true, "esperados": 10, "recibidos": 6, "huecos": 4, "tasa": 0.6, "verticales": ["COMPRA", "VENTA"], "detalle_huecos": ["e57a318a-...:COMPRA:2026-09", "e57a318a-...:VENTA:2026-09"], "destinatario": "DUENO", "motivo": "el cuadre no se sostiene: falta cobertura de la entrada", "lee_metrica": "A12", "recalcula_metrica": false, "segunda_metrica": false, "finge_cuadre": false, "cierre": null, "correlation_id": "abc-123" }
```

Y se PIDE el aviso a K2 por `contabilidad.aviso.solicitar.request`:

```json
{ "project_id": "e57a318a-...", "origen": "C6_AVISO_CUADRE", "tipo": "AVISO_CUADRE", "motivo": "el cuadre no se sostiene: falta cobertura de la entrada", "destinatario": "DUENO", "cola_destino": "DUENO", "prioridad": "NORMAL", "contexto": { "periodo": "2026-09", "esperados": 10, "recibidos": 6, "huecos": 4, "tasa": 0.6, "verticales": ["COMPRA", "VENTA"], "lee_metrica": "A12" }, "correlation_id": "abc-123" }
```

### 2. Entrada — cobertura completa → veredicto CUADRA (no avisa)

`esperados:10, recibidos:10, huecos:0, tasa:1, senal:'COMPLETA'` →
`veredicto:'CUADRA'`, `cuadra:true`, `avisa:false`, `base:{esperados, recibidos, tasa}`.

### 3. Entrada — sin actividad → SIN_ACTIVIDAD (ni cuadra ni falta)

`esperados:0` → `veredicto:'SIN_ACTIVIDAD'`, `cuadra:null`, `avisa:false`,
`motivo:'no habia nada esperado: el sistema NO finge un cuadre'`.

### 4. Entrada — cierre realizado, A12 mudo → 503 (no se finge)

Entra `contabilidad.cierre_realizado` y `completitud-cobertura` (A12) no responde →
`contabilidad.cuadre.failed`:

```json
{ "status": 503, "error": { "code": "DEPENDENCIA_NO_DISPONIBLE", "message": "completitud-cobertura (A12) no respondio: NO se afirma el cuadre ni su falta", "details": { "dependencia": "completitud-cobertura", "accion": "NO_FINGIR_CUADRE", "cierre": "e57a318a-...:2026:9" } } }
```

### 5. Entrada — K2 mudo → 503 TOLERANTE (el veredicto queda emitido)

Si `motor-avisos` (K2) no responde, se publica `contabilidad.aviso.solicitar.failed`:

```json
{ "status": 503, "error": { "code": "DEPENDENCIA_NO_DISPONIBLE", "message": "motor-avisos (K2) no respondio: el veredicto de cuadre queda EMITIDO, no se fabrica el aviso", "details": { "dependencia": "motor-avisos", "tipo": "AVISO_CUADRE", "huecos": 4 } } }
```

El `contabilidad.cuadre_evaluado` ya se emitió **igual**.

### 6. Fallo — payload sin la métrica única → 422 SIN_METRICA

`_evaluar` sin `es_metrica_unica`/`detalle.huecos`/`tasa` → `422 PRECONDITION_FAILED`
(`senal:'SIN_METRICA'`, `recalcula_metrica:false`, `asumido:false`) + `contabilidad.cuadre.failed`.

### 7. Tools (sin RPC en module.json)

`toolEvaluar` → `_evaluar`; `toolAvisar` → `_avisar`; `toolLeerMetrica` → `_leerMetrica`.

## Tests

El test viviría en `tests/unit/aviso-cuadre.test.js`. Cubre:

- Cobertura con huecos → `contabilidad.cuadre_evaluado` `FALTA_COBERTURA` con `verticales`
  extraídas de las claves; pide `contabilidad.aviso.solicitar.request` a K2.
- Cobertura completa → `CUADRA`, `avisa:false` (no se pide aviso).
- **SIN ACTIVIDAD** (`esperados:0`) → `cuadra:null`, `avisa:false`, no se finge un cuadre.
- **Lee la métrica, no la recalcula**: la respuesta lleva `lee_metrica:'A12'`,
  `recalcula_metrica:false`, `segunda_metrica:false`.
- **Contrato TOLERANTE A12**: cierre dispara y A12 no responde → `contabilidad.cuadre.failed`
  (503, `NO_FINGIR_CUADRE`); **no** se emite veredicto.
- **Contrato TOLERANTE K2**: K2 no responde → `contabilidad.aviso.solicitar.failed` (503) y
  el `cuadre_evaluado` **sigue** emitido.
- Payload sin métrica → `422 SIN_METRICA` + `contabilidad.cuadre.failed`.
- Avisar de un cuadre que no falta cobertura → `422`.
- El puente es **stateless**: sin `project.activated` ni persistencia; **no usa `_atender`**.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/aviso-cuadre
node --test tests/unit/aviso-cuadre.test.js
```

## Notas de implementación

- Clase `AvisoCuadre extends ModuloHibridoReflejo`; `name = 'aviso-cuadre'`,
  `version = 'reflejo-0.1.0'`. **Sin store** (puente stateless: no hay `this._store` ni
  PosPersistencia ni `project.activated`).
- Constantes: `DESTINATARIO_CONTABLE = 'ASESOR'`, `DESTINATARIO_NEGOCIO = 'DUENO'`,
  `COBERTURA_COMPLETA = 1`.
- **No usa `_atender`** (no hay RPCs request/response): los dos handlers son fire-and-forget
  (`onCoberturaCalculada`, `onCierreRealizado`). El aviso se pide con `_rpc`
  (`contabilidad.aviso.solicitar.request`, `timeout_ms:4000`); la métrica con `_rpc`
  (`contabilidad.cobertura.calcular.request`, `timeout_ms:4000`).
- Proyecciones puras: `_evaluar`, `_evaluarConAviso` (async), `_avisar`, `_pedirAviso`
  (async), `_leerMetrica` (async). `_invalid` y `_errorResponse` vienen de la base.
- Tools: `toolEvaluar`, `toolAvisar`, `toolLeerMetrica`.
- DEP hacia delante: `contabilidad.cuadre_evaluado` traza el veredicto;
  `contabilidad.aviso.solicitar.request` es el PUERTO a K2 `motor-avisos`. DEP hacia atrás
  por evento: `completitud-cobertura` (A12) publica `contabilidad.cobertura_calculada` y
  responde `contabilidad.cobertura.calcular.request`; `cierre-ejercicio` (C4) publica
  `contabilidad.cierre_realizado`.
