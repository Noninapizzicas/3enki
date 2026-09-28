---
name: puente-lenguaje-dueno
description: >
  Skill FULL del módulo MICRO-AGENTE `puente-lenguaje-dueno` de la vertical contabilidad de
  Enki (Q2, hoja del plan). EL REQUISITO «EN LENGUAJE LLANO» MATERIALIZADO. Traductor
  BIDIRECCIONAL: `_traducirPregunta(preguntaNatural)` — su pregunta → consulta contable, y
  `traducirCifra(resultado)` — cálculo → cifra en su idioma (caja, deuda, resultado, «¿puedo
  pagar X?»). EL LENGUAJE ES FUZZY: mapear «¿me da la vida?» a la operación contable correcta
  es JUICIO, no un lookup. Mitad REFLEJO determinista (matching contra el VOCABULARIO
  DECLARABLE + aprendizaje previo) + mitad FUZZY en el cajón de blueprint (el LLM que propone
  la traducción cuando el vocabulario no cubre). Sin confianza suficiente NO se inventa la
  traducción: 422 PREGUNTA_NO_TRADUCIDA — jamás a ciegas. NO CALCULA: traduce y ENVÍA a
  `consulta-dueno` (Q1) por EVENTO. SI PERSISTE: su memoria es el VOCABULARIO APRENDIDO
  (aprendizaje del traductor, no dato de dominio). Úsala para operar, depurar o extender el
  micro-agente, o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando el dueño pregunte en su lenguaje y haya que traducir a consulta contable y
    responder (RPC contabilidad.dueno.preguntar.request), o cuando haya que decir una cifra ya
    calculada en su idioma (contabilidad.dueno.cifra.presentar.request).
  - Cuando depures por qué no se traduce (422 PREGUNTA_NO_TRADUCIDA si ni el vocabulario ni el
    juicio alcanzan el umbral 0.6, 503 DEPENDENCIA_NO_DISPONIBLE si Q1 no responde, 400
    INVALID_INPUT).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), por qué el
    vocabulario es declarable y por qué el traductor no calcula.
  - Cuando vayas a escribir/ampliar el test unitario del micro-agente puente-lenguaje-dueno.
tags: [enki, modulo, micro-agente, persistencia, contabilidad, puente-lenguaje-dueno, fuzzy, lenguaje-llano]
---

# puente-lenguaje-dueno — MICRO-AGENTE · traductor bidireccional en lenguaje llano

## Qué hace el módulo

`puente-lenguaje-dueno` es un **MICRO-AGENTE CON PERSISTENCIA** (Q2, hoja del plan): **EL
REQUISITO «EN LENGUAJE LLANO» MATERIALIZADO**. Traductor **BIDIRECCIONAL**:

- `_traducirPregunta(preguntaNatural)` → **ConsultaContable**: *su pregunta → consulta
  contable*.
- `traducirCifra(resultado)` → **CifraEnSuIdioma**: *cálculo → cifra en su idioma* (caja,
  deuda, resultado, *«¿puedo pagar X?»*).

**EL LENGUAJE ES FUZZY**: mapear *«¿me da la vida?»* o *«¿puedo pagar la nómina?»* a la
operación contable correcta es **JUICIO**, no un *lookup*. **MICRO-AGENTE (patrón híbrido
real)**: mitad **REFLEJO determinista** (*matching* contra el **VOCABULARIO DECLARADO** —
palabra del dueño → operación contable, con **aprendizaje previo**) + mitad **FUZZY** en el
cajón de blueprint del módulo (el **LLM** que **PROPONE** la traducción cuando el vocabulario
no cubre; el gate `scripts/validate-hibridos.js` exige que la op fuzzy **NO** vaya en
`module.json.subscribes`). Cuando ni el vocabulario ni el juicio alcanzan confianza, **NO se
inventa la traducción**: se devuelve **`422 PREGUNTA_NO_TRADUCIDA`** y el dueño puede precisar
— **jamás se contesta a ciegas** (umbral de juicio declarable **`0.6`**).

**EL VOCABULARIO ES DECLARABLE** (K8/K7 son `[ABIERTO]`): que «caja» signifique la posición de
tesorería y «deuda» los vencimientos por pagar **lo declara el dueño**; hay un vocabulario
**BASE** declarable (`VOCABULARIO_BASE`) y el declarante lo sobreescribe/añade
(`ley_cableada:false`).

**NO CALCULA**: traduce la pregunta a una consulta y la **ENVÍA** a `consulta-dueno` (**Q1**)
por **EVENTO** `contabilidad.consulta.responder.request`; y traduce la cifra que le devuelven.
El núcleo de informe (K3) **lo comparte con R3**, pero el **TRADUCTOR es propio**. Dependencia
entre módulos **por EVENTO, nunca por `require` cruzado**.

**SÍ PERSISTE (justificado)**: su memoria es el **VOCABULARIO APRENDIDO** — los mapeos *«su
palabra → operación contable»* que se han resuelto bien, para no re-traducir lo ya aprendido y
como **EVIDENCIA revisable** de cómo se le está hablando al dueño (requisito *«que el asesor
lo acepte»*). Por eso lleva **PosPersistencia** + `project.activated`; la parcela es
**APRENDIZAJE del traductor**, no dato de dominio. **NO escribe** el vocabulario declarado
(K8): solo lo **LEE** y lo memoriza.

> **NO REUTILIZA**: el puente de lenguaje del dueño no existe; comparte el núcleo de informe
> (K3) con R3, no el traductor.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.dueno.preguntar.request` | `onPreguntarRequest` | RPC micro-agente (Q2) — el flujo completo en lenguaje llano: {project_id, pregunta?\|texto?, consulta?:{operacion,...}, periodo?, dimension?, vocabulario?} → {project_id, pregunta, consulta, traduccion:{origen:'DECLARADA'\|'VOCABULARIO'\|'APRENDIZAJE', clave, confianza, fuzzy:true}, respuesta_cruda, cifra_en_su_idioma:{que_es, cuanto, como_se_dice, unidad, detalle_tecnico_disponible}, sello_cobertura, marca, lenguaje_llano:true, propone_no_decide:true}. Traduce la pregunta a consulta contable (fuzzy: vocabulario declarable + aprendizaje) y la ENVIA a consulta-dueno (Q1) por EVENTO contabilidad.consulta.responder.request (aqui no se calcula); luego traduce la cifra devuelta a su idioma. Pregunta no traducible con confianza → 422 PREGUNTA_NO_TRADUCIDA (nunca a ciegas); Q1 sin responder → 503 DEPENDENCIA_NO_DISPONIBLE. Exito publica contabilidad.consulta.responder.request (hacia Q1); responde por contabilidad.dueno.preguntar.response; error → contabilidad.dueno.preguntar.failed. |
| `contabilidad.dueno.cifra.presentar.request` | `onCifra_presentarRequest` | RPC micro-agente (Q2): {project_id, resultado\|resultado_calculo, operacion?, sello_cobertura?, marca?, vocabulario?} → {project_id, operacion, cifra_en_su_idioma:{que_es, cuanto, como_se_dice, unidad, detalle_tecnico_disponible}, lenguaje_llano:true, fuzzy:true, no_jerga:true}. Traduce una cifra ya calculada al idioma del dueno (caja, deuda, resultado, 'puedo pagar X'): usa la etiqueta del vocabulario que apunta a la operacion o el mapa base. La cifra contable NO se recalculca: solo se dice en llano, con el detalle tecnico disponible. Exito publica contabilidad.cifra_presentada y responde por contabilidad.dueno.cifra.presentar.response; error → contabilidad.dueno.cifra.presentar.failed. |
| `project.activated` | `onProjectActivated` | Restaura del storage (PosPersistencia) el VOCABULARIO APRENDIDO del proyecto activado: los mapeos 'su palabra → operacion contable' ya resueltos y la evidencia de las traducciones hechas son POR PROYECTO (aprendizaje del traductor, no dato de dominio). |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.consulta.responder.request` | Señal a Q1 (Q2 → consulta-dueno): la pregunta ya traducida se ENVIA a la puerta pull por EVENTO (con consulta:{operacion, periodo?, dimension?, parametros?}) — aqui no se calcula. Lo consume consulta-dueno (Q1), que responde con el resultado calculado. Este puente no calcula: traduce y delega. |
| `contabilidad.cifra_presentada` | Fire-and-forget (Q2): una cifra quedo dicha en el idioma del dueno → {project_id, operacion, cifra_en_su_idioma:{que_es, cuanto, como_se_dice, unidad, detalle_tecnico_disponible}, lenguaje_llano:true, fuzzy:true, no_jerga:true}. Lo consumen la cara de consulta/entrega. La cifra contable no se recalcula: solo se dice en llano. |
| `contabilidad.dueno.preguntar.failed` | Par de fallo determinista: preguntar sin project_id/pregunta (400), pregunta no traducible con confianza (422 PREGUNTA_NO_TRADUCIDA: ni el vocabulario ni el juicio alcanzan el umbral — el dueno puede precisar, nunca a ciegas) o consulta-dueno Q1 sin responder (503 DEPENDENCIA_NO_DISPONIBLE). Cierra el circulo de contabilidad.dueno.preguntar.request. |
| `contabilidad.dueno.cifra.presentar.failed` | Par de fallo determinista: presentar sin project_id o sin resultado (400). Cierra el circulo de contabilidad.dueno.cifra.presentar.request. |
| `contabilidad.consulta.responder.failed` | Par de fallo del envio a Q1: consulta-dueno no respondio (503 DEPENDENCIA_NO_DISPONIBLE) — se DECLARA, no se traduce una cifra que no se ha calculado. |
| `contabilidad.cifra_presentada.failed` | Par de fallo del evento de dominio contabilidad.cifra_presentada: la emision del hecho de dominio no se completo. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> `contabilidad.dueno.preguntar.failed` cierra `contabilidad.dueno.preguntar.request`;
> `contabilidad.dueno.cifra.presentar.failed` cierra
> `contabilidad.dueno.cifra.presentar.request`;
> `contabilidad.consulta.responder.failed` cierra el envío a Q1.

> Nota: no está en module.json pero sí lo emite index.js — `_atender` publica
> `contabilidad.dueno.preguntar.response` y `contabilidad.dueno.cifra.presentar.response` (los
> pares response de los RPC); **NO están declaradas en `publishes`**.

> Nota: declarado en module.json pero NO emitido por index.js (patrón de la vertical: el par
> de fallo real es `<op>.failed`) — `contabilidad.cifra_presentada.failed` es el par de fallo
> del evento de DOMINIO; el micro-agente solo publica los pares `*.failed` de sus RPC (y
> `contabilidad.consulta.responder.failed` cuando Q1 no responde).

> Nota: no está en module.json pero sí lo emite index.js — el módulo publica por `_rpc`
> `contabilidad.consulta.responder.request` (dependencia por EVENTO hacia consulta-dueno Q1,
> ya declarada como `publishes`, pero aquí se emite también como petición request/response).

## Reglas de negocio

1. **EL LENGUAJE ES FUZZY (juicio, no lookup)**: la mitad determinista es el *matching* contra
   el vocabulario; el resto es el **cajón de blueprint** (el LLM propone la traducción). La op
   fuzzy **NO** va en `module.json.subscribes` (gate `scripts/validate-hibridos.js`).
2. **EL VOCABULARIO ES DECLARABLE (BASE + aprendido + payload)**: `_vocabularioDe(pid, input)`
   compone `{ ...VOCABULARIO_BASE, ...aprendido_del_store, ...(input.vocabulario ||
   input.vocabulario_dueno) }`. El **payload manda** sobre el aprendido, y el aprendido sobre
   el BASE. `VOCABULARIO_BASE`: `caja`/`dinero`/`banco` → `caja`; `resultado`/`ganancia`/
   `beneficio`/`perdida` → `resultado`; `deuda`/`deudas`/`pagar`/`cobrar` → `prevision`;
   `margen` → `margen`; `cuadro`/`resumen` → `cuadro`; `desviacion`/`objetivo` → `desviacion`;
   `cobertura` → `cobertura`. **No hay ley cableada.**
3. **La TRADUCCIÓN de la pregunta (`_traducirPregunta`)**:
   - **Consulta ya estructurada** (`input.consulta.operacion`) → se respeta con
     `traduccion:{origen:'DECLARADA', confianza:1}` (el vocabulario no hace falta; tampoco
     exige `pregunta`).
   - **Sin pregunta** (ni `pregunta` ni `texto` string) → `400 INVALID_INPUT pregunta`.
   - **Matching determinista**: se normaliza la pregunta (`_normalizar`: minúsculas, sin
     tildes, sin puntuación, espacios colapsados) y se busca la clave más específica
     (coincidencia más larga). `confianza = min(1, len(clave)/len(pregunta) + 0.5)`.
   - **Aprendizaje previo**: si ya se tradujo una pregunta idéntica (`_recuerdoDe`), se reusa
     con `confianza:1` y `origen:'APRENDIZAJE'`.
4. **UMBRAL DE JUICIO DECLARABLE (`UMBRAL_JUICIO = 0.6`)**: si no hay mejor coincidencia o
   `confianza < 0.6` → **`422 PREGUNTA_NO_TRADUCIDA`** con `{ pregunta, vocabulario_declarado,
   umbral, confianza, propuesta, no_a_ciegas:true, declarable:'el vocabulario (Q2/K8) lo
   declara el dueno' }`. **Nunca se contesta a ciegas.**
5. **La TRADUCCIÓN de la cifra (`traducirCifra`)**: exige `project_id` (400) y un `resultado`
   (u `resultado_calculo`/`cifra`) **objeto** (400 `INVALID_INPUT resultado`). La operación se
   toma del payload o se **infiere** del shape (`_operacionDeResultado`: `operacion`, `cuadro`,
   `margen`, `posicion_real`/`total+n_cuentas` → `caja`, `resultado`, `caja_proyectada`/
   `caja_final` → `prevision`, `tasa+huecos` → `cobertura`, `desviacion` → `desviacion`). El
   valor plano con `_valorPlano` (`total`, `caja_final`, `resultado.resultado`, `resultado`,
   `margen.margen`, `margen`, `desviacion`, `tasa`). La etiqueta: la del vocabulario que
   apunta a esa operación, o `_ETIQUETA_IDIOMA[operacion]`, o `'la cifra'`.
6. **El idioma llano (sin jerga)**: `cifra_en_su_idioma = {que_es: <etiqueta llana>, cuanto:
   <valor>, como_se_dice: _frase(etiqueta, valor, unidad), unidad, detalle_tecnico_disponible:
   true}`. La frase se compone con `toLocaleString('es-ES', {minimumFractionDigits:2,
   maximumFractionDigits:2})`: `«<Etiqueta>: 1.234,56 EUR.»`; con valor `null` →
   *«No hay cifra disponible para <etiqueta>.»*. `_ETIQUETA_IDIOMA`: caja → *'el dinero que
   tienes'*, prevision → *'lo que puedes pagar o te tienen que pagar'*, resultado → *'lo que
   ganas o pierdes'*, margen → *'lo que te queda de cada venta'*, cuadro → *'el resumen de tu
   negocio'*, desviacion → *'tu desvio sobre el objetivo'*, cobertura → *'si falta algo por
   entrar'*. **El detalle contable queda disponible**: no se esconde la jerga, se traduce.
7. **NO CALCULA — DELEGA en Q1**: `onPreguntarRequest` traduce, luego `_rpc` a
   `contabilidad.consulta.responder.request` (timeout 6000ms). Si Q1 no responde →
   **`503 DEPENDENCIA_NO_DISPONIBLE`** con `{ dependencia:'consulta-dueno',
   accion:'NO_RESPONDER_INVENTANDO' }` y **publica** `contabilidad.consulta.responder.failed`:
   *«no se traduce una cifra que no se ha calculado»*. **No se calcula nada aquí.**
8. **El flujo completo (`preguntar`)**: (1) traduce la pregunta → si falla, publica
   `contabilidad.dueno.preguntar.failed`; (2) envía a Q1 (si falla, ver regla 7); (3) traduce
   la cifra devuelta al idioma del dueño (si falla, publica `...preguntar.failed`); (4)
   **memoriza** (`_memorizar`) y responde con `{pregunta, consulta, traduccion, respuesta_cruda,
   cifra_en_su_idioma, sello_cobertura, marca, lenguaje_llano:true, traduccion_fuzzy:true,
   propone_no_decide:true, determinista_en_lo_cubierto:true}`.
9. **PROPONE, NO DECIDE**: la traducción lleva `propone_no_decide:true`; la cifra se **dice en
   llano**, no se decide nada por el dueño.
10. **La memoria es APRENDIZAJE (persistencia justificada)**: `_memorizar` guarda en
    `d.vocabulario[clave]` (si falta) y empuja a `d.traducciones` una entrada
    `{pregunta_norm, clave, entrada, operacion, resuelta, en}`; cada mutación marca
    `marcarDirty(pid)`. Es la **EVIDENCIA** de cómo se le habla al dueño, no una parcela de
    dominio.
11. **Validaciones deterministas**: falta `project_id` → `400 INVALID_INPUT project_id`; sin
    `pregunta` (sin consulta estructurada) → `400 INVALID_INPUT pregunta`; `resultado` ausente
    o no objeto → `400 INVALID_INPUT resultado`. Shape: `{ status:400, error:{
    code:'INVALID_INPUT', message:'<campo> requerido', details:{ field:<campo> } } }`.
12. **HTTP exacto**: éxito `200`; payload inválido → `400`; no traducible con confianza → `422
    PREGUNTA_NO_TRADUCIDA`; Q1 sin responder → `503 DEPENDENCIA_NO_DISPONIBLE`; excepción en
    `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPCs que responden en `contabilidad.dueno.preguntar.response` y
`contabilidad.dueno.cifra.presentar.response`.

### 1. `preguntar` — el flujo completo en lenguaje llano

```json
{
  "project_id": "e57a318a-...",
  "pregunta": "¿me da la vida este mes?",
  "periodo": "2026-09",
  "correlation_id": "abc-123"
}
```

(`caja` está en el vocabulario BASE; «me da la vida» se resuelve al vocabulario declarado del
dueño) → Respuesta `200` (recortada):

```json
{
  "project_id": "e57a318a-...",
  "pregunta": "¿me da la vida este mes?",
  "consulta": { "operacion": "caja", "etiqueta": "dinero disponible", "unidad": "EUR", "periodo": "2026-09", "dimension": null, "parametros": null },
  "traduccion": { "origen": "VOCABULARIO", "clave": "vida", "confianza": 0.72, "fuzzy": true, "propone_no_decide": true },
  "respuesta_cruda": { "total": 12450.5, "n_cuentas": 3 },
  "cifra_en_su_idioma": { "que_es": "el dinero que tienes", "cuanto": 12450.5, "como_se_dice": "El dinero que tienes: 12.450,50 EUR.", "unidad": "EUR", "detalle_tecnico_disponible": true },
  "sello_cobertura": { "sellado": true, "sello": "COMPLETO", "cobertura": { "tasa": 1, "huecos": 0, "senal": "COMPLETA" }, "fuera_de_ciclo": true, "es_metrica_unica": true, "recalculada_aqui": false },
  "marca": { "estado": "EN_CURSO", "periodo": "2026-09", "fuente": "DERIVADO", "borrador_vivo": true, "el_sistema_no_firma": true },
  "lenguaje_llano": true,
  "traduccion_fuzzy": true,
  "propone_no_decide": true,
  "determinista_en_lo_cubierto": true,
  "nota": "el puente traduce pregunta ↔ cifra; NO calcula (eso es Q1) ni juzga el dato"
}
```

Publica `contabilidad.consulta.responder.request` (hacia Q1).

### 2. `preguntar` — consulta ya estructurada (se respeta)

```json
{ "project_id": "e57a318a-...", "consulta": { "operacion": "margen", "periodo": "2026-09", "dimension": "CENTRO-NORTE" } }
```

→ `traduccion:{origen:'DECLARADA', confianza:1}` (no se exige `pregunta`).

### 3. `cifra_presentar` — decir una cifra ya calculada en su idioma

```json
{
  "project_id": "e57a318a-...",
  "resultado": { "resultado": 8200, "ingresos": { "total": 45200 }, "gastos": { "total": 37000 } },
  "operacion": "resultado",
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "operacion": "resultado",
  "cifra_en_su_idioma": { "que_es": "lo que ganas o pierdes", "cuanto": 8200, "como_se_dice": "Lo que ganas o pierdes: 8.200,00 EUR.", "unidad": "EUR", "detalle_tecnico_disponible": true },
  "sello_cobertura": null,
  "marca": null,
  "lenguaje_llano": true,
  "fuzzy": true,
  "no_jerga": true,
  "determinista_en_lo_cubierto": true,
  "nota": "la cifra se dice en su idioma (caja, deuda, resultado, \"puedo pagar\"); el detalle contable queda disponible"
}
```

Emite `contabilidad.cifra_presentada` (res.data + `correlation_id`).

### 4. Fallo — pregunta no traducible con confianza → 422 (nunca a ciegas)

```json
{ "project_id": "e57a318a-...", "pregunta": "¿cómo va el chiringuito ese raro?" }
```

→ Respuesta `422` + `contabilidad.dueno.preguntar.failed`:

```json
{ "status": 422, "error": { "code": "PREGUNTA_NO_TRADUCIDA", "message": "no se pudo traducir la pregunta a una consulta contable con confianza: el dueno puede precisar", "details": { "pregunta": "¿cómo va el chiringuito ese raro?", "vocabulario_declarado": ["caja", "dinero", "banco", "resultado", "ganancia", "beneficio", "perdida", "deuda", "deudas", "pagar", "cobrar", "margen", "cuadro", "resumen", "desviacion", "objetivo", "cobertura"], "umbral": 0.6, "confianza": 0, "propuesta": null, "no_a_ciegas": true, "declarable": "el vocabulario (Q2/K8) lo declara el dueno" } }
```

### 5. Fallo — Q1 no responde → 503 (no se traduce una cifra que no se ha calculado)

```json
{ "status": 503, "error": { "code": "DEPENDENCIA_NO_DISPONIBLE", "message": "consulta-dueno (Q1) no respondio: no se traduce una cifra que no se ha calculado", "details": { "dependencia": "consulta-dueno", "accion": "NO_RESPONDER_INVENTANDO" } } }
```

Y se publica `contabilidad.consulta.responder.failed`.

### 6. Fallo — payload inválido

Sin `pregunta` ni consulta estructurada → `400 INVALID_INPUT pregunta`; sin `resultado` en
`cifra_presentar` → `400 INVALID_INPUT resultado` + `contabilidad.dueno.cifra.presentar.failed`.

### 7. Tools (sin RPC en module.json)

`toolTraducirPregunta` → `_traducirPregunta`; `toolTraducirCifra` → `traducirCifra`.

## Tests

El test vive en `tests/unit/puente-lenguaje-dueno.test.js`. Cubre:

- `preguntar` con pregunta cubierta por el vocabulario → `200`, `traduccion.fuzzy:true`,
  `cifra_en_su_idioma.como_se_dice` en llano, `lenguaje_llano:true`; publica
  `contabilidad.consulta.responder.request`.
- Consulta ya estructurada → `traduccion:{origen:'DECLARADA', confianza:1}` y no exige
  `pregunta`.
- **Aprendizaje**: la segunda vez que llega la MISMA pregunta se reusa con
  `origen:'APRENDIZAJE'`/`confianza:1`.
- `cifra_presentar` con cifra ya calculada → `cifra_en_su_idioma` con `no_jerga:true` y
  `determinista_en_lo_cubierto`; emite `contabilidad.cifra_presentada`.
- **Sin confianza** → `422 PREGUNTA_NO_TRADUCIDA` (`no_a_ciegas:true`), **sin** inventar la
  traducción.
- **Dependencia tolerante**: Q1 no responde → `503 DEPENDENCIA_NO_DISPONIBLE`
  (`NO_RESPONDER_INVENTANDO`) + `contabilidad.consulta.responder.failed`.
- Sin `project_id`/`pregunta`/`resultado` (según la op) → `400 INVALID_INPUT` + par `*.failed`.
- **Persiste**: `project.activated` restaura el vocabulario aprendido y las traducciones vía
  PosPersistencia; `_memorizar` amplía `vocabulario`/`traducciones`.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/puente-lenguaje-dueno
node --test tests/unit/puente-lenguaje-dueno.test.js
```

## Notas de implementación

- Clase `PuenteLenguajeDueno extends ModuloHibridoReflejo`; `name = 'puente-lenguaje-dueno'`,
  `version = 'reflejo-0.1.0'`. Store en memoria `this._store` (Map project_id →
  `{ esquema:'puente-lenguaje-dueno-v1', vocabulario:{}, traducciones:[] }`) — **es
  APRENDIZAJE del traductor**, no una parcela de dominio.
- Constantes: `VOCABULARIO_BASE` (17 entradas), `UMBRAL_JUICIO = 0.6`; prototipo
  `_ETIQUETA_IDIOMA` (mapa base de etiquetas en lenguaje llano).
- **PosPersistencia**: `_persist = new PosPersistencia({ modulo, file:
  'puente-lenguaje-dueno.json', dir: '/contabilidad/puente-lenguaje-dueno', snapshot,
  hidratar })`. `onProjectActivated` → `restaurar(project_id)`; `onUnload` → `flush()` +
  `detener()`. Cada mutación marca `marcarDirty(pid)`.
- Handlers: `onPreguntarRequest` (no usa `_atender` para el flujo interno: llama a
  `_traducirPregunta`, a `_rpc` de Q1 y a `traducirCifra`, y publica los pares `*.failed`
  correspondientes; responde por `contabilidad.dueno.preguntar.response`); `onCifra_presentarRequest`
  delega en `_atender(e, 'cifra_presentar', 'contabilidad.dueno.cifra.presentar.response', fn)`.
- Proyecciones: `_traducirPregunta`, `traducirCifra`, `_memorizar` + helpers `_vocabularioDe`,
  `_entradaPorOperacion`, `_operacionDeResultado`, `_valorPlano`, `_frase`, `_normalizar`,
  `_recuerdoDe`. `_rpc`/`_invalid`/`_errorResponse`/`_round` vienen de la base.
- Tools: `toolTraducirPregunta`, `toolTraducirCifra`.
- DEP hacia delante: `contabilidad.cifra_presentada` lo consume la cara de consulta/entrega;
  `contabilidad.consulta.responder.request` es la señal a Q1. DEP hacia atrás por EVENTO:
  `consulta-dueno` (Q1) responde con el resultado calculado (y su sello de cobertura y marca).
