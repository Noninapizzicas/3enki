---
name: ratificacion-regla-aprendida
description: >
  Skill FULL del módulo PUENTE `ratificacion-regla-aprendida` de la vertical
  contabilidad de Enki (L10, hoja del plan). PUERTA ÚNICA de RATIFICACIÓN: el ASESOR
  ratifica o BLOQUEA una regla aprendida ANTES de que actúe sobre el volumen. Cubre DOS
  repositorios con UNA sola puerta — A6.2 `regla-contrapartida` y E8
  `regla-movimiento-bancario` — no tres puertas distintas. El sistema NO firma ni
  decide (invariante 11): arma la SolicitudDecision (tipo RATIFICAR_REGLA, contexto
  Documento autocxplicado, estado PENDIENTE, resolucion null) y la entrega por
  contabilidad.regla.ratificar.request; si VENCE sin respuesta → estado EXPIRADA, la
  regla NO actúa y se re-pregunta (JAMÁS asume). Es stateless: sin PosPersistencia ni
  project.activated. Úsala para operar, depurar o extender el puente.
when-to-use: >
  - Cuando una regla queda APRENDIDA y hay que armar la solicitud de decisión al asesor
    (la entrada es contabilidad.regla_aprendida, fire-and-forget).
  - Cuando el asesor responde (misma vía con `decision`) y hay que aplicar la
    resolución: APRUEBA deja actuar la regla; RECHAZA/BLOQUEA/EXPIRA no.
  - Cuando depures por qué una ratificación no deja actuar la regla (payload inválido →
    400 INVALID_INPUT decision, o bloqueada/vencida → contabilidad.regla.ratificar.failed)
    o por qué no se arma la solicitud (sin project_id/regla.id → 400).
  - Cuando quieras entender el contrato de eventos, la puerta única y por qué el sistema
    no firma ni decide.
  - Cuando vayas a escribir/ampliar el test unitario del puente ratificacion-regla-aprendida.
tags: [enki, modulo, puente, contabilidad, ratificacion-regla-aprendida, ratificacion, asesor]
---

# ratificacion-regla-aprendida — PUENTE de la puerta única de ratificación

## Qué hace el módulo

`ratificacion-regla-aprendida` es un **PUENTE STATELESS** (L10, hoja del plan): la
**PUERTA ÚNICA de RATIFICACIÓN**. El **ASESOR** ratifica o **BLOQUEA** una **regla
aprendida** **ANTES** de que actúe sobre el volumen. Cubre **DOS repositorios con UNA
sola puerta** — A6.2 `regla-contrapartida` y E8 `regla-movimiento-bancario` — **no tres
puertas distintas**.

La invariante rectora: **el sistema NO firma ni decide** (invariante 11). El puente
**arma la `SolicitudDecision`** (tipo `'RATIFICAR_REGLA'`, contexto = Documento
autocxplicado, estado `'PENDIENTE'`, `resolucion:null`) y **la entrega** al asesor por
`contabilidad.regla.ratificar.request`. Si **VENCE sin respuesta** → estado `'EXPIRADA'`,
la regla **NO actúa** y **se re-pregunta**; **jamás asume**.

Es **stateless**: sin PosPersistencia ni `project.activated` — no guarda estado. La
regla aprendida entra por **EVENTO** `contabilidad.regla_aprendida` (de A6.2 / del lado
banco E8) y la **decisión vuelve por el MISMO canal**: si el payload trae `decision`, es
la **RESOLUCIÓN del asesor** (se aplica); si no, es una **regla candidata** y se arma la
solicitud. La dependencia entre módulos es **por EVENTO, nunca por `require` cruzado**.

> **NO REUTILIZA**: cubre los dos repositorios con UNA sola puerta; no existe en el
> inventario una puerta única de ratificación.

## Contrato de eventos (module.json real)

### Subscribes (consumo por evento fire-and-forget)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.regla_aprendida` | `onReglaAprendida` | Fire-and-forget (A6.2/E8 → L10): una regla quedo APRENDIDA (candidata, aun no actua) → {project_id, regla:{id, patron, contrapartida, evidencia, repositorio}}. Si el payload NO trae decision → se arma la SolicitudDecision (contexto autocxplicado) y se publica contabilidad.regla.ratificar.request hacia el ASESOR: el sistema NO resuelve. Si el payload SI trae decision (la resolucion del asesor volviendo por el mismo canal) → se aplica: APRUEBA publica contabilidad.regla_ratificada; RECHAZA/BLOQUEA/EXPIRA publica contabilidad.regla.ratificar.failed (la regla NO actua). |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.regla.ratificar.request` | Fire-and-forget (L10): la SOLICITUD de decision quedo armada y se entrega al ASESOR → {project_id, solicitud:{solicitud_id, tipo:'RATIFICAR_REGLA', contexto, estado:'PENDIENTE', resolucion:null}, regla_id}. El sistema solo la crea y la entrega: no la resuelve. Si vence sin respuesta → EXPIRADA y se re-pregunta; jamas asume. |
| `contabilidad.regla_ratificada` | Fire-and-forget (L10): el ASESOR ratifico (APRUEBA) la regla aprendida y ya actua sobre el volumen → {project_id, regla_id, decision:'APRUEBA', estado:'RATIFICADA', actua:true, ratificada_por}. Lo consumen regla-contrapartida (A6.2) y regla-movimiento-bancario (E8) para dejar actuar la regla. |
| `contabilidad.regla.ratificar.failed` | Par de fallo determinista: la regla aprendida NO actua (decision RECHAZA/BLOQUEA), o VENCIO sin respuesta (EXPIRA → se re-pregunta), o el payload es invalido → {status, error}. Cierra el circulo de la ratificacion (y del evento contabilidad.regla_aprendida cuando no pudo armarse la solicitud). |
| `contabilidad.regla_ratificada.failed` | Par de fallo del evento de dominio contabilidad.regla_ratificada: la emision del hecho de dominio no se completo (la ratificacion no llego a los repositorios). |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> `contabilidad.regla.ratificar.failed` cierra el círculo de la ratificación (y de
> `contabilidad.regla_aprendida` cuando no pudo armarse la solicitud).

> Nota: este módulo es **PUENTE stateless** y **no tiene ningún `*.request`/`*.response`
> de RPC** en su `module.json`: todo entra y sale por EVENTOS fire-and-forget
> (`contabilidad.regla_aprendida` → `contabilidad.regla.ratificar.request` /
> `contabilidad.regla_ratificada`). **No usa `_atender`** ni hay pares response.

## Reglas de negocio

1. **Puerta única**: este puente es la **única** puerta de ratificación del dominio.
   Sirve a **dos** repositorios — `regla-contrapartida` (A6.2) y
   `regla-movimiento-bancario` (E8) — **sin** abrir una tercera puerta.
2. **El sistema NO firma ni decide (invariante 11)**: `_solicitarRatificacion` arma la
   `SolicitudDecision` con `tipo:'RATIFICAR_REGLA'`, `destinatario:'ASESOR'`,
   `estado:'PENDIENTE'`, `resolucion:null` y **`creada_por_sistema:true`**. El sistema
   **solo crea y entrega**; nunca resuelve.
3. **La decisión vuelve por el MISMO canal**: si `contabilidad.regla_aprendida` trae
   `decision` no nula → es la **resolución del asesor** y se aplica con
   `_aplicarRatificacion`. Si no trae `decision` → es la **candidata** y se arma la
   solicitud.
4. **Solo APRUEBA deja actuar**: `DECISIONES = {APRUEBA, RECHAZA, BLOQUEA, EXPIRA}`.
   `_aplicarRatificacion` devuelve `actua:true` **solo** si `decision === 'APRUEBA'`;
   entonces `estado:'RATIFICADA'` y publica `contabilidad.regla_ratificada`. Cualquier
   otra decisión → `actua:false`, `estado:'BLOQUEADA'` (o `'EXPIRADA'` si `EXPIRA`) y
   se publica `contabilidad.regla.ratificar.failed` con `code:'RATIFICACION_BLOQUEADA'`.
5. **Vencida sin respuesta NO actúa (jamás asume)**: `decision:'EXPIRA'` →
   `estado:'EXPIRADA'`, `actua:false` y **`re_preguntar:true`**: se volverá a preguntar.
6. **El sistema no firma**: la respuesta incluye **`firma_del_sistema:false`** — la firma
   es del asesor (`ratificada_por`).
7. **Contexto autocxplicado**: la solicitud lleva un `contexto` (Documento) con
   `{ patron, contrapartida, evidencia, estado_origen, origen }` para que el asesor
   decida **sin ambigüedad**.
8. **Validaciones deterministas**: falta `project_id` → `400 INVALID_INPUT project_id`;
   `regla` ausente/no objeto → `400 INVALID_INPUT regla`; sin `regla.id` (o `regla_id`)
   → `400 INVALID_INPUT regla.id` / `400 INVALID_INPUT regla_id`; decisión fuera de
   `DECISIONES` → `400 INVALID_INPUT` con
   `{ decision_recibida, decisiones_validas }`. Shape: `{ status:400, error:{
   code:'INVALID_INPUT', message:'<campo> requerido', details:{ field:<campo> } } }`.
9. **La ley entra como DATO**: el patrón, la contrapartida y la evidencia de la regla
   son **datos**; el puente no cabla reglas ni decisiones.
10. **HTTP exacto**: éxito `200`; payload inválido → `400`; decisión distinta de
    `APRUEBA` → `409` en el par de fallo publicado (`RATIFICACION_BLOQUEADA`);
    excepción → `500 UNKNOWN_ERROR` (vía base).

## Cómo se usa (eventos)

Este puente **no tiene RPCs**: todo el flujo es por eventos fire-and-forget.

### 1. Entrada — regla candidata → se arma y se entrega la solicitud

Entra `contabilidad.regla_aprendida`:
```json
{
  "project_id": "e57a318a-...",
  "regla": { "id": "e57a318a-...-mba1", "patron": { "descripcion": "TRANSF RECIBIDA" }, "contrapartida": { "cuenta": "430" }, "evidencia": "3 movs iguales", "repositorio": "MOVIMIENTO_BANCARIO" },
  "correlation_id": "abc-123"
}
```
El sistema publica `contabilidad.regla.ratificar.request`:
```json
{
  "project_id": "e57a318a-...",
  "solicitud": {
    "solicitud_id": "e57a318a-...-rat-e57a318a-...-mba1",
    "tipo": "RATIFICAR_REGLA",
    "project_id": "e57a318a-...",
    "regla_id": "e57a318a-...-mba1",
    "repositorio": "MOVIMIENTO_BANCARIO",
    "destinatario": "ASESOR",
    "contexto": { "patron": { "descripcion": "TRANSF RECIBIDA" }, "contrapartida": { "cuenta": "430" }, "evidencia": "3 movs iguales", "estado_origen": null, "origen": null },
    "estado": "PENDIENTE",
    "resolucion": null,
    "creada_por_sistema": true,
    "emitida_en": "2026-09-28T..."
  },
  "regla_id": "e57a318a-...-mba1",
  "correlation_id": "abc-123"
}
```

### 2. Entrada — resolución del asesor APRUEBA → la regla actúa

Entra `contabilidad.regla_aprendida` **con `decision`**:
```json
{ "project_id": "e57a318a-...", "regla_id": "e57a318a-...-mba1", "decision": "APRUEBA", "regla": { "id": "e57a318a-...-mba1", "repositorio": "MOVIMIENTO_BANCARIO" } }
```
Se publica `contabilidad.regla_ratificada`:
```json
{ "project_id": "e57a318a-...", "regla_id": "e57a318a-...-mba1", "repositorio": "MOVIMIENTO_BANCARIO", "decision": "APRUEBA", "estado": "RATIFICADA", "actua": true, "ratificada_por": "ASESOR", "re_preguntar": false, "firma_del_sistema": false, "correlation_id": "abc-124" }
```
Lo consumen `regla-contrapartida` (A6.2) y `regla-movimiento-bancario` (E8) para dejar
actuar la regla.

### 3. Entrada — bloqueo o vencimiento → la regla NO actúa

Con `"decision": "RECHAZA"` (o `BLOQUEA`) → se publica `contabilidad.regla.ratificar.failed`:
```json
{ "status": 409, "error": { "code": "RATIFICACION_BLOQUEADA", "message": "la regla aprendida NO actua: bloqueada o vencida sin respuesta", "details": { "decision": "RECHAZA", "estado": "BLOQUEADA", "actua": false, "re_preguntar": false, "firma_del_sistema": false } } }
```
Con `"decision": "EXPIRA"` → `estado:'EXPIRADA'`, `actua:false`, **`re_preguntar:true`**
(se re-pregunta; **jamás asume**).

### 4. Fallo — decisión no válida

`"decision": "QUIZA"` → `_aplicarRatificacion` devuelve `400 INVALID_INPUT` con
`{ decision_recibida:'QUIZA', decisiones_validas:['APRUEBA','RECHAZA','BLOQUEA','EXPIRA'] }`.

### 5. Fallo — no se puede armar la solicitud

Sin `project_id` o sin `regla.id` → `400 INVALID_INPUT` y se publica
`contabilidad.regla.ratificar.failed`.

### 6. Tools (sin RPC en module.json)

`toolSolicitarRatificacion` → `_solicitarRatificacion`; `toolAplicarRatificacion` →
`_aplicarRatificacion`.

## Tests

El test vive en `tests/unit/ratificacion-regla-aprendida.test.js`. Cubre:

- Regla candidata (sin `decision`) → **NO** actúa: publica
  `contabilidad.regla.ratificar.request` con la `SolicitudDecision`
  (`tipo:'RATIFICAR_REGLA'`, `estado:'PENDIENTE'`, `resolucion:null`,
  `creada_por_sistema:true`).
- Resolución `APRUEBA` → publica `contabilidad.regla_ratificada` con `actua:true` y
  `firma_del_sistema:false`.
- Resolución `RECHAZA`/`BLOQUEA` → publica `contabilidad.regla.ratificar.failed` con
  `RATIFICACION_BLOQUEADA`, `actua:false`.
- Resolución `EXPIRA` → `estado:'EXPIRADA'`, `actua:false`, `re_preguntar:true`.
- Decisión no válida → `400 INVALID_INPUT` con `decisiones_validas`.
- Payload sin `project_id`/`regla.id` → `400 INVALID_INPUT` + par de fallo.
- El puente es **stateless**: sin `project.activated` ni persistencia.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/ratificacion-regla-aprendida
node --test tests/unit/ratificacion-regla-aprendida.test.js
```

## Notas de implementación

- Clase `RatificacionReglaAprendida extends ModuloHibridoReflejo`; `name =
  'ratificacion-regla-aprendida'`, `version = 'reflejo-0.1.0'`. **Sin store** (puente
  stateless: no hay `this._store` ni PosPersistencia ni `project.activated`).
- Constantes: `DECISIONES` (Set `APRUEBA`,`RECHAZA`,`BLOQUEA`,`EXPIRA`),
  `SOLICITUD_PENDIENTE = 'PENDIENTE'`, `SOLICITUD_EXPIRADA = 'EXPIRADA'`.
- **No usa `_atender`** (no hay RPCs request/response): el único handler
  `onReglaAprendida` es **fire-and-forget** y decide entre el caso SOLICITUD (arma y
  publica `contabilidad.regla.ratificar.request`) y el caso RESOLUCIÓN (aplica y publica
  `contabilidad.regla_ratificada` o `contabilidad.regla.ratificar.failed`). Sin
  `project_id` retorna `null` sin publicar.
- Proyecciones puras: `_solicitarRatificacion` (arma el Documento autocxplicado),
  `_aplicarRatificacion` (aplica la decisión: solo APRUEBA → `actua:true`). `_invalid`
  (→ 400 INVALID_INPUT `{field}`) y `_errorResponse` vienen de la base.
- Tools: `toolSolicitarRatificacion`, `toolAplicarRatificacion`.
- DEP hacia delante: `contabilidad.regla_ratificada` lo consumen `regla-contrapartida`
  (A6.2) y `regla-movimiento-bancario` (E8) para dejar actuar la regla. DEP hacia atrás
  por evento: A6.2 / E8 publican `contabilidad.regla_aprendida`.
