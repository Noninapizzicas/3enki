---
name: etiquetado-analitico
description: >
  Skill FULL del módulo MICRO-AGENTE `etiquetado-analitico` de la vertical contabilidad
  de Enki (J1, hoja del plan). EL JUICIO ANALÍTICO: asigna centro/línea/producto a cada
  hecho con REGLA DECLARABLE (dimensiones J6 + reglas declaradas). Cuando la regla NO
  CUBRE, clasificar es JUICIO → lo dudoso va a la cola (A8.1) por su puerta única; NUNCA
  se etiqueta a ciegas ni se ignora el hecho. El caso cubierto por regla es REFLEJO
  (determinista); el caso no cubierto es FUZZY (juicio). Aquí PROPONE, no decide
  (`propone_no_decide:true`): la etiqueta dudosa no se aplica sola. SI PERSISTE: su
  memoria de etiquetado es APRENDIZAJE — evita re-clasificar el mismo hecho
  (tercero+cuenta), es la EVIDENCIA de la regla que el jefe/asesor ratifica y la base de
  la explicación analítica; por eso lleva PosPersistencia + project.activated. Úsala para
  operar, depurar o extender el micro-agente, o para entender su contrato de eventos y
  sus reglas de negocio.
when-to-use: >
  - Cuando necesites etiquetar analíticamente un hecho (RPC
    contabilidad.etiqueta.aplicar.request): por regla declarable (caso CUBIERTO) o por
    juicio (caso NO CUBIERTO).
  - Cuando depures por qué una etiqueta no se resuelve (409 SIN_REGLA → va a la cola
    A8.1, 503 DEPENDENCIA_NO_DISPONIBLE si cola-revision no confirma, 400 INVALID_INPUT)
    o por qué la etiqueta queda sin aplicar.
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), por qué el
    juicio vive aquí y por qué propone pero no decide, y por qué persiste (aprendizaje).
  - Cuando vayas a escribir/ampliar el test unitario del micro-agente etiquetado-analitico.
tags: [enki, modulo, micro-agente, persistencia, contabilidad, etiquetado-analitico, juicio, fuzzy]
---

# etiquetado-analitico — MICRO-AGENTE · el juicio analítico por regla o propuesta

## Qué hace el módulo

`etiquetado-analitico` es un **MICRO-AGENTE CON PERSISTENCIA** (J1, hoja del plan): **EL
JUICIO ANALÍTICO**. Asigna **centro/línea/producto** a cada hecho con **REGLA
DECLARABLE** (dimensiones J6 + reglas declaradas). Cuando la regla **NO CUBRE**,
clasificar es **JUICIO** → lo **dudoso va a la cola (A8.1, `cola-revision`)** por su
puerta única; **NUNCA se etiqueta a ciegas ni se ignora el hecho**. El **caso cubierto
por regla es REFLEJO** (determinista); el **caso no cubierto es FUZZY** (juicio). Aquí
**PROPONE, no decide** (`propone_no_decide:true`): la etiqueta dudosa **no se aplica
sola**.

**MICRO-AGENTE (patrón híbrido real)**: mitad **REFLEJO determinista** (lectura de
reglas/dimensiones declarables, *matching* por patrones) + mitad **FUZZY** en el cajón
de blueprint del módulo (el LLM que **PROPONE** la etiqueta cuando la regla no cubre; el
gate `scripts/validate-hibridos.js` exige que la op fuzzy **NO** vaya en
`module.json.subscribes`).

**SÍ PERSISTE (justificado)**: su memoria de etiquetado es **APRENDIZAJE** — evita
re-clasificar el mismo hecho (`tercero`+`cuenta`), es la **EVIDENCIA** de la regla que el
jefe/asesor ratifica (*«esta contrapartida → este centro»*) y la base de la explicación
analítica; por eso lleva **PosPersistencia** + `project.activated`, como pide la espina
para esta hoja. **NO escribe** las reglas de J6 (declarables): solo **LEE** y **PROPONE**;
lo dudoso se **PUBLICA** a la cola (`contabilidad.excepcion.encolar.request`) por su
puerta única.

> **NO REUTILIZA**: el etiquetado analítico por dimensiones declaradas **no existe en el
> inventario**.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.etiqueta.aplicar.request` | `onAplicarRequest` | RPC micro-agente: {project_id, hecho:{cuenta\|apuntes, concepto, tercero, clave_natural}, dimensiones:[{centro, linea, claves}], reglas:[{id, cuenta_prefijo?, concepto_contiene?, tercero?, centro, linea}]} → caso CUBIERTO: {project_id, hecho_ref, etiqueta:{centro,linea,producto}, origen:'REGLA', aplicada:true, confianza:1}; caso NO CUBIERTO: se PROPONE (fuzzy por señales + aprendizaje previo) y, si la confianza no alcanza el umbral, → 409 SIN_REGLA y el hecho se ENCOLA (contabilidad.excepcion.encolar.request, naturaleza ANALITICA, cola JEFE). Nunca a ciegas. Exito publica contabilidad.etiqueta_aplicada y responde por contabilidad.etiqueta.aplicar.response; error → contabilidad.etiqueta.aplicar.failed. |
| `project.activated` | `onProjectActivated` | Restaura la memoria del juicio analitico (etiquetas aplicadas/propuestas y excepciones encoladas) del proyecto activado desde el storage (PosPersistencia): es APRENDIZAJE por proyecto. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.etiqueta_aplicada` | Fire-and-forget (J1): un hecho quedo ETIQUETADO (por regla declarable o por juicio con confianza suficiente) → {project_id, hecho_ref, etiqueta:{centro,linea,producto}, origen:'REGLA'\|'JUICIO'\|'APRENDIZAJE', aplicada:true, confianza, propone_no_decide:true}. Lo consume margen-analitico (J2/J10, margen por dimension) y el cuadro de mando. PROPONE; no decide el corte duro. |
| `contabilidad.excepcion.encolar.request` | Señal a la cola (J1 → A8.1): el hecho cuya etiqueta NO se pudo resolver (regla no cubre y juicio sin confianza) se encola con motivo ETIQUETA_NO_RESUELTA (naturaleza ANALITICA, cola JEFE) → {project_id, cola:'JEFE', excepcion:{id, naturaleza, motivo, confianza, propuesta, no_inventa:true}, encolada:true}. Lo consume cola-revision (A8.1) por su puerta unica. El hecho NUNCA se ignora. |
| `contabilidad.etiqueta.aplicar.failed` | Par de fallo determinista: sin project_id/hecho (400) o etiqueta no resuelta (409 SIN_REGLA: la regla no cubre y el juicio no alcanza confianza → va a la cola). Cierra el circulo de contabilidad.etiqueta.aplicar.request. |
| `contabilidad.etiqueta_aplicada.failed` | Par de fallo del evento de dominio contabilidad.etiqueta_aplicada: la emision del hecho de dominio no se completo. |
| `contabilidad.excepcion.encolar.failed` | Par de fallo del encolado: cola-revision (A8.1) no confirmo el encolado de la etiqueta no resuelta (503 DEPENDENCIA_NO_DISPONIBLE) — se DECLARA, no se asume encolada. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> `contabilidad.etiqueta.aplicar.failed` cierra `contabilidad.etiqueta.aplicar.request`;
> `contabilidad.excepcion.encolar.failed` cierra el encolado cuando A8.1 no confirma.

> Nota: no está en module.json pero sí lo emite index.js — `_atender` publica
> `contabilidad.etiqueta.aplicar.response` (el par response del RPC); **NO está declarada
> en `publishes`**.

> Nota: declarado en module.json pero NO emitido por index.js (patrón de la vertical: el
> par de fallo real es `<op>.failed`) — `contabilidad.etiqueta_aplicada.failed` es el par
> del evento de **DOMINIO**; el micro-agente no lo publica desde ningún handler (solo
> publica `contabilidad.etiqueta.aplicar.failed` en el rechazo y
> `contabilidad.excepcion.encolar.failed` si la cola no confirma).

> Nota: no está en module.json pero sí lo emite index.js — el módulo publica por `_rpc`
> `contabilidad.excepcion.encolar.request` (dependencia por EVENTO hacia `cola-revision`
> A8.1); es una petición request/response que el micro-agente emite, además de la señal
> de encolado ya listada.

## Reglas de negocio

1. **La REGLA declarada manda (reflejo determinista)**: `_etiquetarConRegla` compara el
   hecho contra las `reglas` declaradas (`_buscarRegla`): `cuenta_prefijo` (la cuenta
   empieza por), `concepto_contiene` (el concepto incluye) o `tercero` (coincide). Con
   regla → `origen:'REGLA'`, `aplicada:true`, `confianza:1`, etiqueta tomada de la regla
   (`centro`/`linea`/`producto`).
2. **La regla NO cubre → el reflejo NO inventa (es juicio)**: si no hay regla → `200`
   con `sin_regla:true`, `etiqueta:null`, `aplicada:false`, `simbolico:'SIN_REGLA'`. En el
   handler eso dispara el **juicio FUZZY** (`_proponerEtiqueta`).
3. **El JUICIO propone por señales declaradas + aprendizaje**: `_proponerEtiqueta` puntúa
   cada dimensión declarada por `claves` (aciertos en `concepto`/`cuenta`);
   `confianza = min(1, aciertos/claves.length)`; y reusa el **aprendizaje previo**
   (`_recuerdoDe` por `tercero`+`cuenta`, `origen:'APRENDIZAJE'`).
4. **Umbral DECLARABLE del juicio**: si la confianza de la propuesta **alcanza** el
   umbral (`_umbralJuicio() = 0.6`) → la etiqueta se **aplica** (`origen:'JUICIO'`,
   `propuesta:true`) y se publica `contabilidad.etiqueta_aplicada`. Por debajo del umbral
   → **`409 SIN_REGLA`**: **lo dudoso va a la cola, nunca a ciegas**.
5. **PROPONE, no decide**: toda clasificación/propuesta lleva **`propone_no_decide:true`**.
   La etiqueta dudosa **no se aplica sola**; el corte duro lo fija el jefe/asesor vía la
   cola.
6. **Lo dudoso se ENCOLA (nunca se ignora el hecho)**: `_encolar` construye la excepción
   `{id, naturaleza:'ANALITICA', motivo:'ETIQUETA_NO_RESUELTA', confianza, propuesta,
   no_inventa:true}` y la envía a A8.1 por `_rpc`
   `contabilidad.excepcion.encolar.request` (cola `JEFE`, timeout 4000ms). Si A8.1 **no
   confirma** (status != 200) → **`contabilidad.excepcion.encolar.failed`** con
   `DEPENDENCIA_NO_DISPONIBLE` (*se DECLARA, no se asume encolada*); si confirma → la
   excepción se memoriza.
7. **La memoria es APRENDIZAJE (persiste)**: `_memorizar` empuja cada etiqueta
   (`hecho_ref, cuenta, tercero, centro, linea, origen, en`) a
   `this._store.get(pid).etiquetas` y marca `marcarDirty(pid)`. Las excepciones se
   guardan en `d.excepciones`. Es **evidencia** de la regla y **base de la explicación
   analítica** — no una parcela de dominio (las reglas vivas son de J6, declarables).
8. **Dimensiones/reglas declarables**: `_dimensionesDe`/`_reglasDe` las toman del
   payload (`dimensiones`/`reglas`); si no hay `reglas` en el payload, se usan las
   **aprendidas** del store.
9. **Validaciones deterministas de entrada**: falta `project_id` → `400 INVALID_INPUT
   project_id`; `hecho` ausente/no objeto → `400 INVALID_INPUT hecho`. Shape:
   `{status:400, error:{code:'INVALID_INPUT', message:'<campo> requerido',
   details:{field:<campo>}}}`.
10. **HTTP exacto**: éxito `200` (por regla, o por juicio con confianza suficiente);
    payload inválido → `400`; etiqueta no resuelta → `409 SIN_REGLA` (va a la cola); cola
    no confirma → `503` en `contabilidad.excepcion.encolar.failed`; excepción en
    `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

El único RPC responde en `contabilidad.etiqueta.aplicar.response`.

### 1. `aplicar` — caso CUBIERTO por regla (reflejo determinista)

```json
{
  "project_id": "e57a318a-...",
  "hecho": { "cuenta": "600", "concepto": "COMPRA MATERIAL OFICINA", "tercero": "PAPELERIA X", "clave_natural": "...:COMPRA:9f2c" },
  "reglas": [ { "id": "R-1", "cuenta_prefijo": "60", "centro": "ADMIN", "linea": "SUMINISTROS" } ],
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "hecho_ref": "...:COMPRA:9f2c",
  "etiqueta": { "centro": "ADMIN", "linea": "SUMINISTROS", "producto": null, "dimensiones_declaradas": [] },
  "regla_id": "R-1",
  "origen": "REGLA",
  "aplicada": true,
  "sin_regla": false,
  "confianza": 1,
  "determinista": true
}
```

Emite `contabilidad.etiqueta_aplicada` (res.data + `correlation_id`) y memoriza.

### 2. `aplicar` — caso NO CUBIERTO → propuesta por JUICIO

Sin regla que cubra, pero con dimensiones declaradas cuyas `claves` aciertan →
`_proponerEtiqueta` da una propuesta con `confianza` ≥ 0.6 → respuesta `200` con
`origen:'JUICIO'`, `propuesta:true`, `aplicada:true`, `propone_no_decide:true`; emite
`contabilidad.etiqueta_aplicada` (`origen:'JUICIO'`).

### 3. `aplicar` — lo dudoso → 409 SIN_REGLA (va a la cola)

Sin regla y con confianza por debajo del umbral → `409` + `contabilidad.etiqueta.aplicar.failed`
+ `contabilidad.excepcion.encolar.request` (excepción a la cola A8.1):

```json
{ "status": 409, "error": { "code": "SIN_REGLA", "message": "la regla declarada no cubre el hecho y el juicio no alcanza confianza: lo dudoso va a la cola", "details": { "encolada": true, "naturaleza": "ANALITICA", "cola": "JEFE", "propuesta": null } } }
```

La excepción encolada: `{ project_id, cola:'JEFE', excepcion:{ id, naturaleza:'ANALITICA',
motivo:'ETIQUETA_NO_RESUELTA', confianza, propuesta, no_inventa:true }, encolada:true }`.

### 4. Fallo — la cola no confirma el encolado

Si cola-revision (A8.1) no confirma → `contabilidad.excepcion.encolar.failed`:

```json
{ "status": 503, "error": { "code": "DEPENDENCIA_NO_DISPONIBLE", "message": "cola-revision (A8.1) no confirmo el encolado" }, "detalle": { "naturaleza": "ANALITICA", "motivo": "ETIQUETA_NO_RESUELTA" } }
```

*Se DECLARA, no se asume encolada.*

### 5. Fallo — payload inválido

Sin `project_id`/`hecho` → `400 INVALID_INPUT project_id`/`hecho`.

### 6. Persistencia — `project.activated`

`onProjectActivated` restaura la memoria (etiquetas/excepciones) vía PosPersistencia
(`_persist.restaurar(project_id)`): es **APRENDIZAJE por proyecto**.

### 7. Tools (sin RPC en module.json)

`toolEtiquetar` → `_etiquetarConRegla`; `toolProponerEtiqueta` → `_proponerEtiqueta`.

## Tests

El test viviría en `tests/unit/etiquetado-analitico.test.js`. Cubre:

- `aplicar` con regla que cubre el hecho → `200`, `origen:'REGLA'`, `confianza:1`,
  `aplicada:true`; emite `contabilidad.etiqueta_aplicada`.
- **Sin regla, propuesta por JUICIO** con confianza ≥ umbral → `200`,
  `origen:'JUICIO'`, `propuesta:true`, `propone_no_decide:true`.
- **Lo dudoso** (confianza < umbral) → `409 SIN_REGLA` + `contabilidad.etiqueta.aplicar.failed`
  + `contabilidad.excepcion.encolar.request` (excepción a la cola A8.1, `naturaleza:'ANALITICA'`,
  `cola:'JEFE'`) — **el hecho nunca se ignora**.
- **La cola no confirma** → `contabilidad.excepcion.encolar.failed` (no se asume
  encolada).
- **Aprendizaje previo**: un hecho ya etiquetado igual (`tercero`+`cuenta`) reusa la
  etiqueta (`origen:'APRENDIZAJE'`).
- Payload sin `project_id`/`hecho` → `400 INVALID_INPUT`.
- **Persiste**: `project.activated` restaura la memoria vía PosPersistencia.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/etiquetado-analitico
node --test tests/unit/etiquetado-analitico.test.js
```

## Notas de implementación

- Clase `EtiquetadoAnalitico extends ModuloHibridoReflejo`; `name = 'etiquetado-analitico'`,
  `version = 'reflejo-0.1.0'`. Store en memoria `this._store` (Map project_id →
  `{ esquema:'etiquetado-analitico-v1', reglas:[], etiquetas:[], excepciones:[] }`) —
  **es APRENDIZAJE del juicio**, no una parcela de dominio.
- Constantes: `NATURALEZA_EXCEPCION = 'ANALITICA'`, `COLA_DESTINO = 'JEFE'`; umbral del
  juicio `_umbralJuicio() = 0.6` (**DECLARABLE**: por debajo, la etiqueta va a la cola).
- **PosPersistencia**: `this._persist = new PosPersistencia({ modulo: this, file:
  'etiquetado-analitico.json', dir: '/contabilidad/etiquetado-analitico', snapshot,
  hidratar })`. `onProjectActivated` → `_persist.restaurar(project_id)`; `onUnload` →
  `flush()` + `detener()`. Cada mutación (`_memorizar`, excepción encolada) marca
  `marcarDirty(pid)`.
- `onAplicarRequest` delega en `_atender(e, 'aplicar', 'contabilidad.etiqueta.aplicar.response',
  fn)`: en caso CUBIERTO (`aplicada:true`) memoriza y publica
  `contabilidad.etiqueta_aplicada`; en caso NO CUBIERTO (`sin_regla:true`) llama a
  `_proponerEtiqueta` (fuzzy), aplica si la confianza alcanza el umbral, o encola
  (`_encolar`) y responde `409 SIN_REGLA` publicando `contabilidad.etiqueta.aplicar.failed`;
  otro fallo publica el par.
- Proyecciones puras: `_etiquetarConRegla`, `_proponerEtiqueta`, `_buscarRegla`,
  `_recuerdoDe`, `_memorizar`, `_encolar` (async, EVENTO A8.1) + helpers `_dimensionesDe`,
  `_reglasDe`. `_rpc`/`_invalid`/`_errorResponse` vienen de la base.
- Tools: `toolEtiquetar`, `toolProponerEtiqueta`.
- DEP hacia delante: `contabilidad.etiqueta_aplicada` (propone, no decide) lo consume
  `margen-analitico` (J2/J10, margen por dimensión) y el cuadro de mando;
  `contabilidad.excepcion.encolar.request` → `cola-revision` (A8.1) por su puerta única
  (cola `JEFE`). DEP hacia atrás: las dimensiones/reglas de J6 son **declarables** (solo
  se LEEN).
