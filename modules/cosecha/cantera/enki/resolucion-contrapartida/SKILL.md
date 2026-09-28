---
name: resolucion-contrapartida
description: >
  Skill FULL del módulo MICRO-AGENTE `resolucion-contrapartida` de la vertical
  contabilidad de Enki (A6.1, hoja del plan). EL JUICIO DE LA CONTRAPARTIDA ASISTIDA:
  propone cuenta + tercero + periodo para un hecho YA normalizado y deduplicado, pero
  NO decide — el corte DURO lo fija la REGLA (A6.2 `regla-contrapartida`, custodio). Si
  una regla que ACTÚA (DECLARADA|RATIFICADA) cubre el hecho, la propuesta es la suya
  (origen REGLA, confianza 1, decidido_por_regla:true); si NINGUNA regla cubre, NO se
  inventa la cuenta: se alza una excepción a la cola de revisión (409 SIN_COBERTURA).
  Es híbrido (mitad reflejo determinista + mitad fuzzy en su blueprint), persiste su
  aprendizaje. Úsala para operar, depurar o extender el micro-agente, o para entender
  su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites proponer la contrapartida de un hecho
    (RPC contabilidad.contrapartida.proponer.request).
  - Cuando depures por qué no se propone la cuenta (409 SIN_COBERTURA si ninguna regla
    cubre, 503 DEPENDENCIA_NO_DISPONIBLE si regla-contrapartida no responde, 400
    INVALID_INPUT si falta project_id/hecho/vertical).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), el
    "propone, no decide" y por qué lo sin cobertura va a la cola en vez de inventarse.
  - Cuando vayas a escribir/ampliar el test unitario del micro-agente
    resolucion-contrapartida.
tags: [enki, modulo, micro-agente, contabilidad, resolucion-contrapartida, contrapartida, fuzzy]
---

# resolucion-contrapartida — MICRO-AGENTE del juicio de la contrapartida

## Qué hace el módulo

`resolucion-contrapartida` es un **MICRO-AGENTE** (A6.1, hoja del plan) del patrón
híbrido real: **mitad REFLEJO determinista** (lectura de las reglas por EVENTO,
coincidencia del patrón, grado de ambigüedad medido) + **mitad FUZZY** en el cajón de
blueprint del módulo (el LLM que elige cuenta/tercero cuando hay ambigüedad baja; el
gate `scripts/validate-hibridos.js` exige que la op fuzzy **NO** vaya en
`module.json.subscribes`).

Su invariante rectora es **"PROPONE, NO DECIDE"**: el corte **DURO** de la
contrapartida lo fija la **REGLA** (`regla-contrapartida`, A6.2, custodio). Aquí solo
se **LEE** esa regla por EVENTO (`contabilidad.regla.leer.request`) y se replica su
veredicto:

- Si una regla que **ACTÚA** (`estado ∈ {DECLARADA, RATIFICADA}`, constante
  `ESTADOS_QUE_ACTUAN`) **cubre** el hecho, la propuesta es la de la regla
  (`origen:'REGLA'`, `confianza:1`, `decidido_por_regla:true`).
- Si **ninguna** regla cubre → **NO se inventa la cuenta**: se **alza una EXCEPCIÓN** a
  la cola de revisión (naturaleza `CONTABLE` → cola `ASESOR`) para que lo decida quien
  tiene la silla (invariante *Cero estimación*: dato ausente = desconocido).

Como es un micro-agente que **persiste**, lleva **PosPersistencia** + store en memoria
(su memoria de lo propuesto y de lo escalado es el **aprendizaje** del juicio): storage
`/contabilidad/resolucion-contrapartida/resolucion-contrapartida.json`.

> **NO REUTILIZA**: no existe resolución de contrapartida contable en el inventario
> (IVA / plan / diario = 0 módulos).

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.contrapartida.proponer.request` | `onProponerRequest` | RPC micro-agente: {project_id, hecho:{vertical, fecha_operacion, tercero, lineas, impuestos, clave_natural?}} → {project_id, vertical, propuesta:{hecho_vertical, clave_natural, cuenta, tercero, periodo, origen, regla_id, confianza, ambiguedad, propone_no_decide, decidido_por_regla}, justificacion, origen:'REGLA', ambiguedad}. El corte DURO lo fija la regla (A6.2), que se LEE por EVENTO (contabilidad.regla.leer.request): si una regla que ACTUA cubre el hecho, la propuesta es la suya; si NO cubre, se alza excepcion a la cola de revision (409 SIN_COBERTURA) y NO se inventa la cuenta. Exito publica contabilidad.contrapartida_propuesta y responde por contabilidad.contrapartida.proponer.response; si falta project_id/hecho/vertical, o regla-contrapartida no responde (503 DEPENDENCIA_NO_DISPONIBLE) → contabilidad.contrapartida.proponer.failed. |
| `contabilidad.hecho_nuevo` | `onHechoNuevo` | Fire-and-forget (A7 → A6.1): deduplicacion-hecho declaro el hecho NUEVO (no repetido) → {project_id, vertical, hecho, clave_natural}. Se propone la contrapartida del hecho por el mismo juicio (dependencia por EVENTO, sin require cruzado): exito publica contabilidad.contrapartida_propuesta; lo que no cubre ninguna regla publica contabilidad.contrapartida_propuesta.failed y va a la cola de revision. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.contrapartida_propuesta` | Fire-and-forget (A6.1): la contrapartida de un hecho quedo PROPUESTA → {project_id, vertical, propuesta, justificacion, origen, ambiguedad}. Lo consume escritor-diario (B2) para asentar; la propuesta NO es una decision: el corte duro lo fijo la regla (A6.2) y el asiento lo firma el libro. |
| `contabilidad.contrapartida.proponer.failed` | Par de fallo determinista: proponer sin project_id/hecho/vertical (400), sin cobertura de regla — excepcion a la cola de revision (409 SIN_COBERTURA, no se inventa la cuenta), o regla-contrapartida (A6.2) sin responder (503 DEPENDENCIA_NO_DISPONIBLE, contrato TOLERANTE). Cierra el circulo de contabilidad.contrapartida.proponer.request. |
| `contabilidad.contrapartida_propuesta.failed` | Par de fallo del evento de dominio contabilidad.contrapartida_propuesta: la emision del hecho de dominio no se completo (lo que no cubre ninguna regla va aqui y a la cola de revision). |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `contabilidad.contrapartida.proponer.failed` cierra
> `contabilidad.contrapartida.proponer.request`, y
> `contabilidad.contrapartida_propuesta.failed` cierra el evento de dominio
> `contabilidad.contrapartida_propuesta` (se emite en la rama de fallo de
> `onHechoNuevo`).

> Nota: no está en module.json pero sí lo emite index.js — `_atender` publica
> `contabilidad.contrapartida.proponer.response` (el par response del RPC); **NO está
> declarada en `publishes`**.

> Nota: no está en module.json pero sí lo declara index.js — el handler
> **`onProjectActivated`** (evento `project.activated`) restaura la memoria del juicio
> del proyecto activado vía PosPersistencia. El módulo **tiene store**, pero
> `project.activated` **no aparece** en `module.json.subscribes` (sub-declaración).

> Nota: no está en module.json pero sí lo emite index.js en **`_leerReglasActivas`** —
> el módulo publica `contabilidad.regla.leer.request` por `_rpc` para leer las reglas
> de A6.2 (dependencia por EVENTO, no declarada como publisher).

## Reglas de negocio

1. **PROPONE, NO DECIDE (invariante rectora)**: la propuesta siempre marca
   `propone_no_decide:true`. Si viene de la regla, además `decidido_por_regla:true` y
   `confianza:1`; el asiento lo firma el libro (escritor-diario B2), nunca este
   micro-agente.
2. **El corte DURO vive en la regla (A6.2)**: `_leerReglasActivas` lee por EVENTO
   `contabilidad.regla.leer.request` (`timeout_ms:4000`) y filtra las que **ACTÚAN**
   (`estado ∈ {DECLARADA, RATIFICADA}` → `ESTADOS_QUE_ACTUAN`). Una regla
   `RATIFICACION_PENDIENTE` (aprendida, sin ratificar) **NO** actúa.
3. **Contrato TOLERANTE con la regla**: si `regla-contrapartida` **no responde**
   (`null`), `_proponer` devuelve **`503 DEPENDENCIA_NO_DISPONIBLE`** con
   `{ dependencia:'regla-contrapartida', accion:'NO_PROPONER_PUBLICAR_FALLO',
   hecho_vertical }`. **NUNCA** se emite una propuesta inventada.
4. **Sin cobertura → a la cola, no se inventa la cuenta**: si ninguna regla cubre el
   hecho (o cubre pero sin cuenta declarada), se llama a `_alzarExcepcion`, que
   devuelve **`409 SIN_COBERTURA`** con
   `{ project_id, cola:'ASESOR', excepcion, ambiguedad, senal:'excepcion_a_cola_revision',
   no_inventa_cuenta:true }`. La excepción se registra en
   `store[pid].excepciones`. *Inventar una cuenta sería asentar sobre nada*.
5. **Coincidencia determinista regla↔hecho**: `_reglaQueCubre` toma el `patron` de cada
   regla (debe ser objeto no vacío) y exige que **todas** sus claves cumplan
   `hecho[k] === patron[k]`. La primera que coincide gana.
6. **Regla sin cuenta tampoco autoriza inventar**: si la regla que cubre no trae
   `contrapartida.cuenta`, se alza excepción con motivo **`REGLA_SIN_CUENTA`** (misma
   cola `ASESOR`, mismo 409).
7. **Ambigüedad medida y determinista**: `_gradoAmbiguedad(hecho) = round(1 -
   señales_presentes/6, 2)` sobre `SENALES_HECHO = [vertical, fecha_operacion, tercero,
   lineas, impuestos, documento_origen]`. Un valor vacío (`undefined`/`null`/`''`/array
   vacío) **no cuenta** como señal. Con `ambiguedad >= 0.5` (constante
   `UMBRAL_AMBIGUEDAD`) → `ambiguedad_alta:true` y `prioridad:'ALTA'`; si no,
   `'NORMAL'`.
8. **La excepción es CONTABLE → cola ASESOR**: constantes `NATURALEZA_EXCEPCION =
   'CONTABLE'` y `COLA_DESTINO = 'ASESOR'`. El id de la excepción es
   `` `${pid}-A6.1-${hecho.clave_natural || Date.now()}` ``.
9. **Justificación explicable (base de L2)**: `_justificar` devuelve
   `{ cifra, base, origen:`regla ${regla_id}`|'juicio', estado:'PROPUESTA', confianza,
   ambiguedad, explicable:true, propone_no_decide:true }` — nada es caja negra.
10. **Validaciones deterministas**: falta `project_id` → `400 INVALID_INPUT
    project_id`; `hecho` ausente/no objeto → `400 INVALID_INPUT hecho`; sin
    `hecho.vertical` ni `input.vertical` → `400 INVALID_INPUT hecho.vertical`. Shape:
    `{ status:400, error:{ code:'INVALID_INPUT', message:'<campo> requerido',
    details:{ field:<campo> } } }`.
11. **La ley entra como DATO**: el patrón y la contrapartida de la regla son datos
    declarados (A6.2 / K9); el micro-agente no cabla cuentas.
12. **HTTP exacto**: éxito `200`; payload inválido → `400`; sin cobertura → `409`;
    regla no disponible → `503`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPC que responde en `contabilidad.contrapartida.proponer.response`. La entrada también
puede llegar por el evento `contabilidad.hecho_nuevo` (fire-and-forget).

### 1. `proponer` — una regla cubre el hecho (propuesta = la de la regla)

```json
{
  "project_id": "e57a318a-...",
  "hecho": {
    "vertical": "COMPRA",
    "fecha_operacion": "2026-09-12",
    "tercero": "B12345678",
    "lineas": [{ "base": 100, "tipo_iva": 21 }],
    "impuestos": { "iva": 21 },
    "documento_origen": "FAC-2026-0042",
    "clave_natural": "e57a318a-...:COMPRA:9f2c1a7b3e5d0c84"
  },
  "correlation_id": "abc-123"
}
```
Respuesta `200` (suponiendo una regla DECLARADA cuyo patrón coincide):
```json
{
  "project_id": "e57a318a-...",
  "vertical": "COMPRA",
  "propuesta": { "hecho_vertical": "COMPRA", "clave_natural": "e57a318a-...:COMPRA:9f2c1a7b3e5d0c84", "cuenta": "600", "tercero": "B12345678", "periodo": "2026-09", "origen": "REGLA", "regla_id": "...", "confianza": 1, "ambiguedad": 0, "propone_no_decide": true, "decidido_por_regla": true },
  "justificacion": { "cifra": "600", "base": "e57a318a-...:COMPRA:9f2c1a7b3e5d0c84", "origen": "regla ...", "estado": "PROPUESTA", "confianza": 1, "ambiguedad": 0, "explicable": true, "propone_no_decide": true },
  "origen": "REGLA",
  "ambiguedad": 0,
  "nota": "propone, no decide: el corte duro lo fija la regla (A6.2) y lo asienta escritor-diario (B2)"
}
```
Emite `contabilidad.contrapartida_propuesta` (res.data + `correlation_id`).

### 2. `proponer` — sin cobertura → 409, el hecho va a la cola (NO se inventa)

```json
{ "project_id": "e57a318a-...", "hecho": { "vertical": "COMPRA", "fecha_operacion": "2026-09-12", "tercero": "B12345678", "documento_origen": "FAC-2026-0042" } }
```
Respuesta `409` + `contabilidad.contrapartida.proponer.failed`:
```json
{ "status": 409, "error": { "code": "SIN_COBERTURA", "message": "ninguna regla cubre el hecho: no se inventa la cuenta, va a la cola de revision", "details": { "project_id": "e57a318a-...", "cola": "ASESOR", "excepcion": { "id": "e57a318a-...-A6.1-FAC-2026-0042", "naturaleza": "CONTABLE", "motivo": "SIN_COBERTURA", "cola_destino": "ASESOR", "ambiguedad": 0.33, "ambiguedad_alta": false, "prioridad": "NORMAL", "vertical": "COMPRA", "hecho": { "...": "..." }, "regla_cubre": false, "senal": "excepcion_a_cola_revision", "no_inventa_cuenta": true }, "ambiguedad": 0.33, "senal": "excepcion_a_cola_revision", "no_inventa_cuenta": true, "nota": "el encolado entra por ADMISION (unica puerta de A8.1); aqui se alza la senal" } } }
```
Emite `contabilidad.contrapartida.proponer.failed` (el `res` completo + `correlation_id`).

### 3. `proponer` — regla-contrapartida no responde → 503 (contrato TOLERANTE)

```json
{ "status": 503, "error": { "code": "DEPENDENCIA_NO_DISPONIBLE", "message": "regla-contrapartida (A6.2) no respondio: no se inventa la contrapartida", "details": { "dependencia": "regla-contrapartida", "accion": "NO_PROPONER_PUBLICAR_FALLO", "hecho_vertical": "COMPRA" } } }
```

### 4. Fallo — payload inválido

Sin `project_id` → `400 INVALID_INPUT`:
```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

### 5. Tools (sin RPC en module.json)

`toolProponer` → `_proponer`; `toolJustificar` → `_justificar`;
`toolGradoAmbiguedad` → `_gradoAmbiguedad`.

## Tests

El test vive en `tests/unit/resolucion-contrapartida.test.js`. Cubre:

- `proponer` con una regla DECLARADA que cubre el hecho → `200`, `origen:'REGLA'`,
  `confianza:1`, `decidido_por_regla:true`, y emite `contabilidad.contrapartida_propuesta`.
- Una regla `RATIFICACION_PENDIENTE` **NO** actúa (no cubre) → `409 SIN_COBERTURA` +
  `contabilidad.contrapartida.proponer.failed`.
- **Sin cobertura**: ninguna regla cubre → `409 SIN_COBERTURA`, `no_inventa_cuenta:true`,
  la excepción se guarda en `store[pid].excepciones`.
- Regla sin `contrapartida.cuenta` → `409` con motivo `REGLA_SIN_CUENTA`.
- `regla-contrapartida` no disponible → `503 DEPENDENCIA_NO_DISPONIBLE` (no se inventa).
- Payloads inválidos (sin `project_id`/`hecho`/`hecho.vertical`) → `400 INVALID_INPUT`.
- **Determinismo** de `_gradoAmbiguedad` (misma entrada → misma ambigüedad); umbral 0.5.
- `contabilidad.hecho_nuevo` propone y emite `contabilidad.contrapartida_propuesta`; en
  fallo emite `contabilidad.contrapartida_propuesta.failed`.
- `project.activated` restaura la memoria vía PosPersistencia.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/resolucion-contrapartida
node --test tests/unit/resolucion-contrapartida.test.js
```

## Notas de implementación

- Clase `ResolucionContrapartida extends ModuloHibridoReflejo`; `name =
  'resolucion-contrapartida'`, `version = 'reflejo-0.1.0'`. Store en memoria
  `this._store` (Map project_id → `{ esquema:'contabilidad-resolucion-contrapartida-v1',
  propuestas:[], excepciones:[], updated_at }`).
- Constantes: `ESTADOS_QUE_ACTUAN` (Set `DECLARADA`,`RATIFICADA`),
  `NATURALEZA_EXCEPCION='CONTABLE'`, `COLA_DESTINO='ASESOR'`, `UMBRAL_AMBIGUEDAD=0.5`,
  `SENALES_HECHO` (6 señales).
- **PosPersistencia**: `_persist = new PosPersistencia({ modulo, file:
  'resolucion-contrapartida.json', dir: '/contabilidad/resolucion-contrapartida',
  snapshot, hidratar })`. `onProjectActivated` → `restaurar(project_id)`; `onUnload` →
  `flush()` + `detener()`. Cada mutación marca `marcarDirty(pid)`.
- `onProponerRequest` delega en `_atender(e, 'proponer',
  'contabilidad.contrapartida.proponer.response', fn)`; en éxito publica
  `contabilidad.contrapartida_propuesta`, en fallo
  `contabilidad.contrapartida.proponer.failed`. `onHechoNuevo` es fire-and-forget y
  no usa `_atender`: propone y publica el mismo evento de dominio (o su
  `*.failed`).
- Proyecciones puras: `_proponer` (regla→propuesta o excepción), `_justificar`
  (explicación), `_reglaQueCubre`, `_gradoAmbiguedad`, `_alzarExcepcion` + helper
  `_obtenerOCrear(pid)`. `_rpc`/`_invalid`/`_errorResponse` vienen de la base.
- Tools: `toolProponer`, `toolJustificar`, `toolGradoAmbiguedad`.
- DEP hacia delante: `contabilidad.contrapartida_propuesta` lo consume
  `escritor-diario` (B2). DEP hacia atrás por evento: A6.2 `regla-contrapartida`
  (leída por `contabilidad.regla.leer.request`), A7 `deduplicacion-hecho`
  (entrada `contabilidad.hecho_nuevo`), A8.1 cola de revisión (destino de la excepción).
