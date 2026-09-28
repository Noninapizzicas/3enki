---
name: informe-accionable
description: >
  Skill FULL del módulo MICRO-AGENTE `informe-accionable` de la vertical contabilidad de Enki
  (R2 + R3, hoja del plan). EL «QUÉ HACER» Y LA NARRACIÓN: todo informe que recibe el cliente
  lleva qué hacer con él y los estados van NARRADOS a su lenguaje. Es la otra mitad de la
  composición — `informe-rico` (K3) COMPONE la cifra + el contexto, aquí se le añade el JUICIO
  (la recomendación y la narración). INVARIANTE DURA: **EL SISTEMA NO DECIDE POR EL DUEÑO** —
  aquí se PROPONE qué hacer; decidir es del dueño (`propone_no_decide:true`,
  `el_dueno_decide:true`, `el_sistema_no_decide:true`). Dos clases: R2 `_recomendar(informe)`
  deriva SEÑALES DURAS (DESVIACION_EXCEDIDA, COBERTURA_INCOMPLETA, PERIODO_EN_BORRADOR,
  RESULTADO_NEGATIVO, SIN_OBJETIVO_DECLARADO) y PROPONE acciones (fuzzy); R3 `_narrar(estados)`
  cuenta «esto es lo que te ha pasado y lo que viene». LA MÉTRICA ÚNICA SIGUE SIENDO UNA: la
  cobertura se LEE del informe (que la leyó de A12), no se recalcula. SI PERSISTE: memoria de
  lo propuesto (evidencia revisable). Úsala para operar, depurar o extender el micro-agente.
when-to-use: >
  - Cuando haya que añadir «qué hacer» a un informe rico (RPC
    contabilidad.informe.accionable.request) o narrar balance/resultado al lenguaje del negocio
    (contabilidad.estados.narrar.request).
  - Cuando depures por qué no propone (503 DEPENDENCIA_NO_DISPONIBLE si no hay informe ni cifra,
    o si no hay estados C1/C2 ni en el payload; 400 INVALID_INPUT) o por qué no se entrega la
    recomendación (contabilidad.aviso.enrutar.failed si R1 no confirma).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), el invariante «el
    sistema no decide por el dueño» y cómo se derivan las señales duras.
  - Cuando vayas a escribir/ampliar el test unitario del micro-agente informe-accionable.
tags: [enki, modulo, micro-agente, persistencia, contabilidad, informe-accionable, fuzzy, propone-no-decide]
---

# informe-accionable — MICRO-AGENTE · el «qué hacer» y la narración

## Qué hace el módulo

`informe-accionable` es un **MICRO-AGENTE CON PERSISTENCIA** (R2 + R3, hoja del plan): **EL
«QUÉ HACER» Y LA NARRACIÓN**. Todo informe que recibe el cliente lleva **QUÉ HACER** con él
(**R2**) y los estados van **NARRADOS** a su lenguaje (**R3**). Es **la otra mitad de la
composición**: `informe-rico` (**K3**) **COMPONE** la cifra + el contexto; aquí se le añade el
**JUICIO** — la recomendación y la narración.

- **R2 InformeAccionable** — `_recomendar(informe)` → InformeAccionable (*«qué hacer»* con él).
- **R3 NarradorEstados** — `_narrar(estados)` → Narración (*«esto es lo que te ha pasado y lo
  que viene»*).

**INVARIANTE DURA: EL SISTEMA NO DECIDE POR EL DUEÑO.** Aquí se **PROPONE** qué hacer;
**decidir es del dueño**. Cada recomendación viaja con **`propone_no_decide:true`** y
**`el_dueno_decide:true`** (y la respuesta con `el_sistema_no_decide:true`) — **nunca se
ejecuta nada ni se cierra nada por cuenta propia**. Lo que el informe-accionable propone se
puede, además, **ENTREGAR** al negocio por el puente `aviso-al-negocio` (**R1**) — *proponer y
hacer llegar, sin decidir*.

**EL JUICIO ES FUZZY**: qué recomendar ante una desviación, una cobertura incompleta o un
periodo en borrador es **interpretación**, no un *lookup* — por eso vive en el **cajón de
blueprint** del módulo (el **LLM**), sobre las **SEÑALES DURAS** que el informe ya trae. La
mitad **determinista** deriva las señales (desviación excedida, huecos de cobertura, marca de
borrador); la **fuzzy** las convierte en *«qué hacer»*.

**LA MÉTRICA ÚNICA SIGUE SIENDO UNA**: si la recomendación depende de la cobertura, la **LEE**
del informe (que a su vez la leyó de **A12**) — no la recalcula
(`cobertura_recalculada_aqui:false`). La narración (R3) toma balance (**C1**) y resultado
(**C2**) de `estados-contables` por EVENTO, o de `estados` en el payload; **NUNCA recompone los
estados** (`estados_recalculados_aqui:false`).

**MICRO-AGENTE (patrón híbrido real)**: mitad **REFLEJO determinista** (derivar señales duras
del informe y componer la narración base) + mitad **FUZZY** (la recomendación y el fraseo) en
el cajón de blueprint. Dependencia entre módulos **por EVENTO, nunca por `require` cruzado**.

**SÍ PERSISTE (justificado)**: su memoria es la de las **RECOMENDACIONES PROPUESTAS** y las
**NARRACIONES emitidas** — evita repetir la misma recomendación sin novedad y es la **EVIDENCIA
revisable** de que se le propuso al dueño (requisito *«que el asesor lo acepte y pueda
presentarlo»*). Por eso lleva **PosPersistencia** + `project.activated`. **NO escribe el juicio
como regla**: solo registra lo propuesto; **el dueño decide**.

> **NO REUTILIZA**: la recomendación accionable y la narración de estados son juicio (fuzzy)
> propio de la vertical.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.informe.accionable.request` | `onInforme_accionableRequest` | RPC micro-agente (R2): {project_id, informe?\|\|cifra?\|resultado_calculo?, periodo?, entregar?} → {project_id, periodo, informe, senales:[{senal, detalle}], acciones:[{senal, hacer, prioridad, propone_no_decide:true, el_dueno_decide:true}], n_acciones, propone_no_decide:true, el_dueno_decide:true, el_sistema_no_decide:true, cobertura_recalculada_aqui:false}. El informe (K3) viene en el payload o se COMPONE por EVENTO contabilidad.informe.componer.request (la cifra no se recalcula). Deriva señales DURAS del informe (DESVIACION_EXCEDIDA, COBERTURA_INCOMPLETA, PERIODO_EN_BORRADOR, RESULTADO_NEGATIVO, SIN_OBJETIVO_DECLARADO) y PROPONE que hacer (fuzzy) — el sistema NO decide por el dueno. Sin informe ni cifra → 503 DEPENDENCIA_NO_DISPONIBLE. Si entregar:true, la recomendacion se ENTREGA al negocio (R1) por EVENTO contabilidad.aviso.enrutar.request. Exito publica contabilidad.informe_accionable; responde por contabilidad.informe.accionable.response; error → contabilidad.informe.accionable.failed. |
| `contabilidad.estados.narrar.request` | `onEstados_narrarRequest` | RPC micro-agente (R3): {project_id, balance?\|resultado?\|cuenta_resultados?, periodo?, marca?, con_balance?, con_resultado?} → {project_id, periodo, narracion:{pasado, viene, hechos, en_su_lenguaje:true}, texto, compartes_nucleo_k3:true, traduccion_fuzzy:true, no_jerga:true, estados_recalculados_aqui:false, dependencias_no_disponibles}. Narra balance/resultado (C1/C2) al LENGUAJE del negocio ('esto es lo que te ha pasado y lo que viene'): los estados vienen en el payload o se LEEN de estados-contables por EVENTO contabilidad.estado.balance.request / contabilidad.estado.resultado.request; NUNCA se recomponen. Sin estados ni payload → 503 DEPENDENCIA_NO_DISPONIBLE. Exito publica contabilidad.estados_narrados; responde por contabilidad.estados.narrar.response; error → contabilidad.estados.narrar.failed. |
| `project.activated` | `onProjectActivated` | Restaura del storage (PosPersistencia) la memoria de lo propuesto del proyecto activado: recomendaciones propuestas y narraciones emitidas son POR PROYECTO — memoria que evita repetir sin novedad y evidencia revisable de que se le propuso al dueno. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.informe_accionable` | Fire-and-forget (R2): el informe dejo de ser adorno — lleva QUE HACER con el → {project_id, periodo, informe, senales, acciones:[{senal, hacer, prioridad, propone_no_decide:true, el_dueno_decide:true}], propone_no_decide:true, el_dueno_decide:true, el_sistema_no_decide:true}. El sistema PROPONE; el dueno decide. Refuerza K3 (informe rico) y lo quita de adorno. Lo consumen la cara de consulta/entrega y el cuadro del jefe. |
| `contabilidad.estados_narrados` | Fire-and-forget (R3): los estados quedaron NARRADOS al lenguaje del negocio → {project_id, periodo, narracion:{pasado, viene, hechos}, texto, compartes_nucleo_k3:true, no_jerga:true}. Comparte el nucleo de informe (K3) con el traductor del dueno (Q2), pero el idioma de destino es otro. Los estados NO se recalculan: se leen de C1/C2. |
| `contabilidad.aviso.enrutar.request` | Señal a R1 (informe-accionable → aviso-al-negocio): cuando se pide entregar:true, la recomendacion se ENTREGA al negocio por EVENTO (tipo AVISO_ACCIONABLE, destinatario DUENO, prioridad de la primera accion) — proponer y hacer llegar, sin decidir. Lo consume aviso-al-negocio (R1), que entrega y confirma. Si R1 no responde → contabilidad.aviso.enrutar.failed. |
| `contabilidad.informe.accionable.failed` | Par de fallo determinista: informe.accionable sin project_id (400) o sin informe ni cifra (503 DEPENDENCIA_NO_DISPONIBLE: no se propone que hacer sobre la nada). Cierra el circulo de contabilidad.informe.accionable.request. |
| `contabilidad.estados.narrar.failed` | Par de fallo determinista: narrar sin project_id (400) o sin estados (C1/C2) ni en el payload (503 DEPENDENCIA_NO_DISPONIBLE: no se narra lo que no se ha derivado). Cierra el circulo de contabilidad.estados.narrar.request. |
| `contabilidad.informe_accionable.failed` | Par de fallo del evento de dominio contabilidad.informe_accionable: la emision del hecho de dominio no se completo. |
| `contabilidad.estados_narrados.failed` | Par de fallo del evento de dominio contabilidad.estados_narrados: la emision del hecho de dominio no se completo. |
| `contabilidad.aviso.enrutar.failed` | Par de fallo del envio a R1: aviso-al-negocio no confirmo la entrega de la recomendacion (DEPENDENCIA_NO_DISPONIBLE) — se DECLARA, no se asume entregada. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> `contabilidad.informe.accionable.failed` cierra `contabilidad.informe.accionable.request`;
> `contabilidad.estados.narrar.failed` cierra `contabilidad.estados.narrar.request`;
> `contabilidad.aviso.enrutar.failed` cierra el envío a R1.

> Nota: no está en module.json pero sí lo emite index.js — `_atender` publica
> `contabilidad.informe.accionable.response` y `contabilidad.estados.narrar.response` (los
> pares response de los RPC); **NO están declaradas en `publishes`**.

> Nota: declarado en module.json pero NO emitido por index.js (patrón de la vertical: el par
> de fallo real es `<op>.failed`) — `contabilidad.informe_accionable.failed` y
> `contabilidad.estados_narrados.failed` son los pares de fallo de los eventos de DOMINIO; el
> micro-agente solo publica los pares `*.failed` de sus RPC (y
> `contabilidad.aviso.enrutar.failed` cuando R1 no confirma la entrega).

> Nota: no está en module.json pero sí lo emite index.js — el módulo publica por `_rpc`
> `contabilidad.informe.componer.request` (informe-rico K3),
> `contabilidad.estado.balance.request` / `contabilidad.estado.resultado.request`
> (estados-contables C1/C2) y `contabilidad.aviso.enrutar.request` (aviso-al-negocio R1, ya
> declarado en `publishes`): dependencias por EVENTO no declaradas como publishers.

## Reglas de negocio

1. **EL SISTEMA NO DECIDE POR EL DUEÑO (invariante dura)**: la respuesta de R2 lleva
   `propone_no_decide:true`, `el_dueno_decide:true` y `el_sistema_no_decide:true`; cada acción
   lleva `propone_no_decide:true` y `el_dueno_decide:true`. La `nota` lo dice: *«el sistema
   PROPONE que hacer; decidir es del dueno»*. **Nada se ejecuta ni se cierra por cuenta
   propia.**
2. **Las cinco SEÑALES DURAS** (`SENALES`): `DESVIACION_EXCEDIDA`, `COBERTURA_INCOMPLETA`,
   `PERIODO_EN_BORRADOR`, `RESULTADO_NEGATIVO`, `SIN_OBJETIVO_DECLARADO`. Se derivan del
   informe (`_derivarSenales`):
   - `informe.cifra.detalle.desviacion.excede === true` → **`DESVIACION_EXCEDIDA`**;
   - `...umbral_declarado === false` → **`SIN_OBJETIVO_DECLARADO`**;
   - `contexto.cobertura` con `(tasa < UMBRAL_COBERTURA) || (huecos > 0)` →
     **`COBERTURA_INCOMPLETA`** (**la cobertura se LEE del informe, no se recalcula**);
   - `contexto.estado_periodo.estado` ∈ `{EN_CURSO, ABIERTO}` → **`PERIODO_EN_BORRADOR`**;
   - `informe.cifra.detalle.resultado` numérico `< 0` → **`RESULTADO_NEGATIVO`**.
   `UMBRAL_COBERTURA = 1` (declarable).
3. **El «qué hacer» (fuzzy)**: `_accionesDe` traduce cada señal a una acción propuesta con su
   prioridad — `DESVIACION_EXCEDIDA` → *«Revisa la desviacion: se ha salido del umbral que
   fijaste»* (`ALTA`); `COBERTURA_INCOMPLETA` → *«Hay hechos que no han entrado: pide a la
   fuente que los publique (el hueco queda declarado)»* (`ALTA`); `PERIODO_EN_BORRADOR` →
   *«El periodo esta en borrador: pide al asesor que lo revise y firme antes de decidir sobre
   el»* (`NORMAL`); `RESULTADO_NEGATIVO` → *«El resultado es negativo: mira que linea pierde
   margen antes de tomar decisiones»* (`NORMAL`); `SIN_OBJETIVO_DECLARADO` → *«No has fijado
   objetivo/umbral para este periodo: declara uno para poder medir la desviacion»* (`BAJA`).
   **Sin señales** se propone una acción `sin_novedad:true`: *«Sin senales que exijan accion: la
   cifra esta dentro de lo esperado»* (`BAJA`) — **nunca una lista vacía**.
4. **El informe (K3) se COMPONE por EVENTO si no viene**: `recomendar` — si no hay
   `informe`/`informe_rico` en el payload, `_rpc` a `contabilidad.informe.componer.request`
   (timeout 5000ms) con `origen:'informe-accionable (R2)'`. **Sin informe ni cifra → `503
   DEPENDENCIA_NO_DISPONIBLE`** con `{ dependencia:'informe-rico',
   accion:'NO_RECOMENDAR_INVENTANDO' }`: *«no se propone que hacer sobre la nada»*.
5. **La NARRACIÓN (R3) = dos mitades**: mitad **determinista** — `_hechosDeEstados(balance,
   resultado)` extrae `{activo, pasivo, patrimonio, cuadra}` del balance y `{ingresos, gastos,
   resultado}` del resultado; mitad **fuzzy** — `_pasado(hechos)` (*«Esto es lo que te ha
   pasado: has ingresado X, has gastado Y, has ganado/perdido Z»*) y `_viene(hechos, input)`
   (si `hechos.cuadra === false` → *«el balance no cuadra todavia: hay que revisarlo antes de
   presentar nada»*; si `input.marca.estado === 'EN_CURSO'` → *«el periodo sigue en borrador:
   lo que viene es que el asesor lo revise y lo firme»*; si no → *«lo que viene es el cierre
   del periodo cuando toque»*).
6. **Los estados (C1/C2) se LEEN, no se recomponen**: `_narrar` — `balance` del payload o
   `_rpc` a `contabilidad.estado.balance.request` (si `con_balance !== false`); `resultado` del
   payload o `_rpc` a `contabilidad.estado.resultado.request` (si `con_resultado !== false`)
   (timeout 5000ms). **Sin estados ni en el payload → `503 DEPENDENCIA_NO_DISPONIBLE`** con
   `{ dependencia:'estados-contables', accion:'NO_NARRAR_INVENTANDO' }`: *«no se narra lo que no
   se ha derivado»*. Lo que no responde se declara en `dependencias_no_disponibles` (`'estados-contables (C1)'`,
   `'estados-contables (C2)'`).
7. **Sin jerga**: la narración lleva `en_su_lenguaje:true`, `traduccion_fuzzy:true` y
   `no_jerga:true`; las cifras se formatean `toLocaleString('es-ES', {minimumFractionDigits:2,
   maximumFractionDigits:2}) + ' EUR'` (`_euros`). `compartes_nucleo_k3:true` — comparte el
   núcleo de informe (K3) con Q2, pero **el idioma de destino es otro**.
8. **La ENTREGA es opt-in (`entregar:true`)**: tras proponer, `_entregarAlNegocio` hace `_rpc`
   a `contabilidad.aviso.enrutar.request` (**R1**, timeout 4000ms) con un aviso
   `{id: <pid>-R2-<epoch>, tipo:'AVISO_ACCIONABLE', texto: acciones[0].hacer, familia:'ANALITICA',
   destinatario:'DUENO', cola_destino:'DUENO', prioridad: acciones[0].prioridad, canal:'PANEL'}`
   → *proponer y hacer llegar, sin decidir*. Si R1 no responde → publica
   `contabilidad.aviso.enrutar.failed` (503) y **se DECLARA, no se asume entregada**.
9. **La memoria es EVIDENCIA (persistencia justificada)**: `_memorizarRecomendacion` empuja
   `{periodo, senales:[], acciones:[], propone_no_decide:true, en}` a `d.recomendaciones`;
   `_memorizarNarracion` empuja `{periodo, texto, en}` a `d.narraciones`. **Evita repetir sin
   novedad y es la evidencia revisable** de que se le propuso al dueño; `marcarDirty(pid)`.
   **NO escribe el juicio como regla.**
10. **Validaciones deterministas**: falta `project_id` → `400 INVALID_INPUT project_id` (en
    ambas ops). Shape: `{ status:400, error:{ code:'INVALID_INPUT', message:'project_id
    requerido', details:{ field:'project_id' } } }`.
11. **HTTP exacto**: éxito `200`; payload inválido → `400`; sin informe ni cifra (R2) o sin
    estados (R3) → `503 DEPENDENCIA_NO_DISPONIBLE`; R1 sin confirmar la entrega → `503` en
    `contabilidad.aviso.enrutar.failed`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPCs que responden en `contabilidad.informe.accionable.response` y
`contabilidad.estados.narrar.response`.

### 1. `informe_accionable` — el «qué hacer» (R2, propone no decide)

```json
{
  "project_id": "e57a318a-...",
  "informe": {
    "cifra": { "valor": 26800, "detalle": { "desviacion": { "desviacion": 1800, "umbral": 1500, "excede": true, "umbral_declarado": true } } },
    "contexto": { "periodo": "2026-09", "cobertura": { "tasa": 0.96, "huecos": 5, "senal": "INCOMPLETA" }, "estado_periodo": { "estado": "EN_CURSO" } }
  },
  "correlation_id": "abc-123"
}
```

Respuesta `200` (recortada):

```json
{
  "project_id": "e57a318a-...",
  "periodo": "2026-09",
  "informe": { "...": "el informe K3 tal cual" },
  "senales": [
    { "senal": "DESVIACION_EXCEDIDA", "detalle": { "desviacion": 1800, "umbral": 1500 } },
    { "senal": "COBERTURA_INCOMPLETA", "detalle": { "tasa": 0.96, "huecos": 5, "senal": "INCOMPLETA" } },
    { "senal": "PERIODO_EN_BORRADOR", "detalle": { "estado": "EN_CURSO" } }
  ],
  "acciones": [
    { "senal": "DESVIACION_EXCEDIDA", "hacer": "Revisa la desviacion: se ha salido del umbral que fijaste", "prioridad": "ALTA", "propone_no_decide": true, "el_dueno_decide": true },
    { "senal": "COBERTURA_INCOMPLETA", "hacer": "Hay hechos que no han entrado: pide a la fuente que los publique (el hueco queda declarado)", "prioridad": "ALTA", "propone_no_decide": true, "el_dueno_decide": true },
    { "senal": "PERIODO_EN_BORRADOR", "hacer": "El periodo esta en borrador: pide al asesor que lo revise y firme antes de decidir sobre el", "prioridad": "NORMAL", "propone_no_decide": true, "el_dueno_decide": true }
  ],
  "n_acciones": 3,
  "propone_no_decide": true,
  "el_dueno_decide": true,
  "el_sistema_no_decide": true,
  "fuzzy": true,
  "cobertura_recalculada_aqui": false,
  "nota": "el sistema PROPONE que hacer; decidir es del dueno"
}
```

Emite `contabilidad.informe_accionable` (res.data + `correlation_id`).

### 2. `informe_accionable` — sin señales (nunca lista vacía)

Con un informe limpio → `acciones` = una única acción `{senal:null, hacer:'Sin senales que
exijan accion: la cifra esta dentro de lo esperado', prioridad:'BAJA', propone_no_decide:true,
el_dueno_decide:true, sin_novedad:true}`.

### 3. `informe_accionable` — con `entregar:true` (proponer y hacer llegar)

```json
{ "project_id": "e57a318a-...", "cifra": { "valor": 26800 }, "periodo": "2026-09", "entregar": true }
```

→ además del `200`, `_rpc` a R1 (`contabilidad.aviso.enrutar.request`) con
`AVISO_ACCIONABLE`; si R1 no confirma → `contabilidad.aviso.enrutar.failed` (503), sin asumir
la entrega.

### 4. `estados_narrar` — narrar balance/resultado (R3, sin jerga)

```json
{ "project_id": "e57a318a-...", "periodo": "2026-09", "marca": { "estado": "EN_CURSO" }, "correlation_id": "abc-123" }
```

(C1/C2 responden) → Respuesta `200` (recortada):

```json
{
  "project_id": "e57a318a-...",
  "periodo": "2026-09",
  "narracion": {
    "pasado": "Esto es lo que te ha pasado: has ingresado 45.200,00 EUR, has gastado 37.000,00 EUR, has ganado 8.200,00 EUR.",
    "viene": "Y lo que viene: el periodo sigue en borrador: lo que viene es que el asesor lo revise y lo firme.",
    "hechos": { "activo": 52000, "pasivo": 21000, "patrimonio": 31000, "cuadra": true, "ingresos": 45200, "gastos": 37000, "resultado": 8200 },
    "en_su_lenguaje": true
  },
  "texto": "Esto es lo que te ha pasado: ... Y lo que viene: ...",
  "compartes_nucleo_k3": true,
  "traduccion_fuzzy": true,
  "no_jerga": true,
  "estados_recalculados_aqui": false,
  "dependencias_no_disponibles": [],
  "nota": "narra balance/resultado al lenguaje del negocio: comparte el nucleo de informe (K3) con Q2, no el traductor"
}
```

Emite `contabilidad.estados_narrados` (res.data + `correlation_id`).

### 5. Fallo — sin informe ni cifra → 503 (no se propone sobre la nada)

```json
{ "status": 503, "error": { "code": "DEPENDENCIA_NO_DISPONIBLE", "message": "no hay informe rico (K3) ni cifra: no se propone que hacer sobre la nada", "details": { "dependencia": "informe-rico", "accion": "NO_RECOMENDAR_INVENTANDO" } } }
```

Y se publica `contabilidad.informe.accionable.failed`.

### 6. Fallo — sin estados → 503 (no se narra lo que no se ha derivado)

```json
{ "status": 503, "error": { "code": "DEPENDENCIA_NO_DISPONIBLE", "message": "no hay estados (C1/C2) ni en el payload: no se narra lo que no se ha derivado", "details": { "dependencia": "estados-contables", "accion": "NO_NARRAR_INVENTANDO" } } }
```

Y se publica `contabilidad.estados.narrar.failed`.

### 7. Fallo — R1 no confirma la entrega (se DECLARA)

```json
{ "status": 503, "error": { "code": "DEPENDENCIA_NO_DISPONIBLE", "message": "aviso-al-negocio (R1) no confirmo la entrega de la recomendacion" } }
```

Se publica `contabilidad.aviso.enrutar.failed`; **no se asume entregada**.

### 8. Fallo — payload inválido

Sin `project_id` → `400 INVALID_INPUT project_id` + el par `*.failed` de la op.

### 9. Tools (sin RPC en module.json)

`toolRecomendar` → `_recomendar`; `toolNarrar` → `_narrar`.

## Tests

El test vive en `tests/unit/informe-accionable.test.js`. Cubre:

- `informe_accionable` con informe que trae desviación excedida, huecos y periodo en borrador →
  `200`, las tres señales y sus acciones con `propone_no_decide:true`/`el_dueno_decide:true`,
  `cobertura_recalculada_aqui:false`; emite `contabilidad.informe_accionable`.
- **Sin señales** → una acción `sin_novedad:true` (`prioridad:'BAJA'`), **nunca lista vacía**.
- **La cobertura se LEE del informe, no se recalcula** (la recomendación depende de la señal
  derivada del informe).
- `estados_narrar` con C1/C2 respondiendo → `narracion.pasado`/`viene`/`hechos`,
  `no_jerga:true`, `estados_recalculados_aqui:false`; emite `contabilidad.estados_narrados`.
- `cuadra === false` → la narración lo dice (*«el balance no cuadra todavia»*); `marca.estado
  === 'EN_CURSO'` → *«el periodo sigue en borrador»*.
- **Dependencia tolerante**: sin informe ni cifra (R2) → `503 DEPENDENCIA_NO_DISPONIBLE`
  (`NO_RECOMENDAR_INVENTANDO`); sin estados (R3) → `503` (`NO_NARRAR_INVENTANDO`); `entregar:true`
  con R1 mudo → `contabilidad.aviso.enrutar.failed` (503).
- Sin `project_id` → `400 INVALID_INPUT` + par `*.failed`.
- **Persiste**: `project.activated` restaura `recomendaciones`/`narraciones` vía PosPersistencia;
  `_memorizar*` amplía la memoria.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/informe-accionable
node --test tests/unit/informe-accionable.test.js
```

## Notas de implementación

- Clase `InformeAccionable extends ModuloHibridoReflejo`; `name = 'informe-accionable'`,
  `version = 'reflejo-0.1.0'`. Store en memoria `this._store` (Map project_id →
  `{ esquema:'contabilidad-informe-accionable-v1', recomendaciones:[], narraciones:[] }`) —
  **memoria de lo propuesto / evidencia revisable**, no una regla que decida.
- Constantes: `SENALES` (5 señales duras), `UMBRAL_COBERTURA = 1`.
- **PosPersistencia**: `_persist = new PosPersistencia({ modulo, file: 'informe-accionable.json',
  dir: '/contabilidad/informe-accionable', snapshot, hidratar })`. `onProjectActivated` →
  `restaurar(project_id)`; `onUnload` → `flush()` + `detener()`. Cada mutación marca
  `marcarDirty(pid)`.
- `onInforme_accionableRequest` delega en `_atender(e, 'informe_accionable',
  'contabilidad.informe.accionable.response', fn)`: en éxito **memoriza**, publica
  `contabilidad.informe_accionable` y, si `entregar === true`, llama a `_entregarAlNegocio`.
  `onEstados_narrarRequest` delega en `_atender(e, 'estados_narrar',
  'contabilidad.estados.narrar.response', fn)`: memoriza y publica `contabilidad.estados_narrados`.
- Proyecciones: `_recomendar` (async), `_narrar` (async) + helpers `_derivarSenales`,
  `_accionesDe`, `_hechosDeEstados`, `_pasado`, `_viene`, `_euros`, `_entregarAlNegocio`
  (async, EVENTO R1), `_memorizarRecomendacion`, `_memorizarNarracion` (+ `_obtenerOCrear`).
  `_rpc`/`_invalid`/`_errorResponse` vienen de la base.
- Tools: `toolRecomendar`, `toolNarrar`.
- DEP hacia delante: `contabilidad.informe_accionable` y `contabilidad.estados_narrados` los
  consumen la cara de consulta/entrega y el cuadro del jefe. DEP hacia atrás por EVENTO:
  `informe-rico` (K3, composición), `estados-contables` (C1/C2, estados) y `aviso-al-negocio`
  (R1, entrega de la recomendación).
