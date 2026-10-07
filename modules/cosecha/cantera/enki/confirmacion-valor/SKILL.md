---
name: confirmacion-valor
description: >
  Skill FULL del módulo CUSTODIO CON PERSISTENCIA `confirmacion-valor` de la vertical nichos
  (Radar de Nichos). Recoge y persiste el FEEDBACK post-compra / valor que el pagador recibió de
  verdad del nicho: confirma que el valor prometido en la propuesta de valor se materializó.
  Es un CUSTODIO HÍBRIDO: ingesta reflejo (estructura el feedback crudo del canal sin guardar) +
  guardado custodio del store (single-writer, append por nicho) + consulta (no muta). Persiste
  por proyecto vía PosPersistencia. Publica nichos.feedback_recibido y su par de fallo. Úsala para
  operar, depurar o extender el custodio, o para entender su contrato de eventos y sus reglas.
when-to-use: >
  - Cuando necesites ingestar, guardar o consultar el feedback post-compra/valor recibido de un
    nicho (RPC nichos.feedback.ingestar.request / guardar.request).
  - Cuando depures por qué un feedback se rechaza (FEEDBACK_VACIO, INVALID_INPUT de nicho/valor).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las reglas de negocio
    (single-writer, valores {alto|medio|bajo}, puntuación 1-5, append por nicho).
  - Cuando vayas a escribir/ampliar el test unitario del custodio.
tags: [enki, modulo, custodio, persistencia, reflect, nichos, radar, feedback, valor, confirmación, proyecto-3d]
---

# confirmacion-valor — CUSTODIO CON PERSISTENCIA del feedback post-compra / valor recibido

## Qué hace el módulo

`confirmacion-valor` es un **CUSTODIO CON PERSISTENCIA** (I3, hoja del plan): recoge el
**FEEDBACK POST-COMPRA** / el **VALOR** que el pagador recibió **de verdad** del nicho — confirma
que el valor prometido en la propuesta se materializó (o en qué grado). Lo consumen la **salud
financiera (F3)** y el canal para cerrar el círculo de la propuesta de valor.

Es un **CUSTODIO HÍBRIDO** (patrón real de perfil-supervision):

- `_ingestar` — **REFLEJO**: estructura el feedback crudo del canal (sintetiza
  `valor_recibido`/`puntuacion`/`comentario`) **sin guardar**;
- `_guardar` — **CUSTODIO**: escribe en el store de feedback del proyecto (**single-writer**;
  **append** de confirmaciones por nicho);
- `_consultar` — lectura, **no muta**.

Persiste por proyecto con **PosPersistencia** (storage `/prisma/nichos/confirmacion-valor.json`),
restaura en `project.activated` y vuelca en `onUnload`. El store lo escribe el CUSTODIO; el campo
`feedback` lo ingiere el reflejo. Emite `nichos.feedback_recibido` en éxito y su par de fallo.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `nichos.feedback.ingestar.request` | `onIngestarRequest` | RPC reflejo: {project_id, nicho, feedback_crudo} → feedback estructurado {valor_recibido, puntuacion, comentario}. Estructura sintética sin guardar; no toca el store. Si el crudo es vacío/inválido → error (`nichos.feedback.guardar.failed`). Responde por `nichos.feedback.ingestar.response`. |
| `nichos.feedback.guardar.request` | `onGuardarRequest` | RPC custodio: {project_id, nicho, feedback} → persiste el feedback en el store del proyecto (single-writer; append de confirmaciones de valor). Éxito → publica `nichos.feedback_recibido` y responde por `nichos.feedback.guardar.response`. Fallo (nicho o feedback inválido, escritor no permitido) → `nichos.feedback.guardar.failed`. |
| `project.activated` | `onProjectActivated` | Custodio: restaura el store de feedback del proyecto activado vía PosPersistencia. |

### Publishes

| Evento | Descripción |
|---|---|
| `nichos.feedback_recibido` | Fire-and-forget (I3): se guardó el feedback post-compra / valor recibido de un nicho → {project_id, nicho, valor_recibido, puntuacion, comentario, confirmado}. Alimenta la salud financiera del nicho (F3) y la retroalimentación del canal. |
| `nichos.feedback.guardar.failed` | Par de fallo determinista: el feedback llegó vacío/inválido o no pudo guardarse → {status, code, mensaje}. Cierra el círculo de nichos.feedback.ingestar/guardar.request. |

> **Regla de cierre de círculo**: el par `nichos.feedback.guardar.failed` cierra el círculo de
> `nichos.feedback.ingestar.request` y de `nichos.feedback.guardar.request`. En éxito `onGuardarRequest`
> propaga el fire-and-forget de dominio `nichos.feedback_recibido` (con `correlation_id`) además de la
> `.response`; y `onIngestarRequest` publica el mismo par `nichos.feedback.guardar.failed` si la
> ingesta no es 200 (aunque esa estricta reutilización del par de fallo no está en module.json).

> **Nota: no está en module.json pero sí lo implementa index.js** — el RPC **`nichos.feedback.consultar.request`**
> (handler `onConsultarRequest`) con su respuesta `nichos.feedback.consultar.response` (proyección
> `_consultar`). module.json sub-declara este query de lectura (solo lista ingestar/guardar); index.js
> sí lo escucha y responde. Devulelve el feedback por nicho o el mapa completo del proyecto sin mutar.

> **Nota de honestidad sobre el guard de rol**: module.json menciona «escritor no permitido» como motivo
> de fallo y define la constante `ROL_CUSTODIO='CUSTODIO'` en index.js, pero **`_guardar` NO verifica un
> rol en el código real** — cualquier llamador con `project_id` válido y feedback estructurado correcto
> puede guardar. Documentado así porque el contrato real del código manda.

## Reglas de negocio

1. **Nicho obligatorio y string → `400 INVALID_INPUT`**: en `_ingestar`, si falta `nicho` o no es
   string → `_invalid('nicho')`. En `_guardar`, si no llega `nicho` ni `feedback.nicho` →
   `_invalid('nicho')`.
2. **`feedback_crudo` obligatorio y objeto → `400 FEEDBACK_VACIO`**: si falta `feedback_crudo` o
   no es objeto → `{ status:400, code:'FEEDBACK_VACIO', mensaje:'el feedback crudo es obligatorio
   y debe ser un objeto', data:{ project_id } }` + `nichos.feedback.guardar.failed`.
3. **Valor de feedback sintetizado con honestidad**: `_ingestar` calcula `valor_recibido` desde
   `feedback_crudo.valor_recibido` **o** lo deriva de la puntuación (`>=4`⇒`'alto'`, `>=3`⇒`'medio'`,
   resto⇒`'bajo'`). Si tras eso `valor` es `null` → `_invalid('feedback_crudo.valor_recibido o puntuacion')`.
   Si `valor` no está en el Set `VALORES_VALIDOS` (`alto|medio|bajo`) → `_invalid('feedback_crudo.valor_recibido')`.
4. **Valores de feedback cerrados (moneda honesta)**: `valor_recibido` SOLO puede ser
   `'alto' | 'medio' | 'bajo'` (Set `VALORES_VALIDOS`). Nada de inventar grados no declarados.
5. **Puntuación de 1 a 5**: `numPuntuacion` exige `Number` entero en `[1,5]`; si no viene o no es
   válido, queda `null` (no se fuerza).
6. **CERO feedbacks inventados**: si el feedback crudo no aporta valor ni puntuación, se rechaza
   (regla 3) — nunca se fabrica un valor no sustentado por el dato.
7. **Append, no overwrite (single-writer custodio)**: `_guardar` hace `lista.push(confirmacion)` al
   store `project_id → Map<nicho, Array<confirmacion>>`. Cada confirmación lleva `esquema
   'nichos-confirmacion-valor-v1'`, `recibido_el` ISO y se cuenta `total` (= longitud de la lista).
8. **Acepta feedback crudo embebido**: si `feedback` trae `feedback_crudo` y no trae
   `valor_recibido`, `_guardar` lo estructura primero vía `_ingestar` (propagando el error si la
   ingesta no es limpia).
9. **`project_id` obligatorio → `400 INVALID_INPUT`**: si falta → `_invalid('project_id')` en
   `_ingestar`, `_guardar` y `_consultar` (en `_ingestar` se puede usar `this.project_id` de contexto).
10. **La lectura no muta**: `_consultar` devuelve `200` con el feedback de UN nicho (si se pasa
    `nicho`) o el **mapa completo** `{feedback: {nicho: [confirmaciones...]}}` del proyecto.
11. **HTTP exacto**: éxito `200`; campos inválidos → `400`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPC request/response que responden en `nichos.feedback.ingestar.response`,
`nichos.feedback.guardar.response` y `nichos.feedback.consultar.response`:

### 1. `ingestar` — estructurar el feedback crudo (reflejo, no guarda)

```json
{ "project_id": "e57a318a-...", "nicho": "pan-artesano-cordoba", "feedback_crudo": { "puntuacion": 5, "comentario": "Excelente, lo recomiendo" } }
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "nicho": "pan-artesano-cordoba", "valor_recibido": "alto", "puntuacion": 5, "comentario": "Excelente, lo recomiendo", "estructurado": true }
```

### 2. `guardar` — persistir el feedback (custodio, single-writer)

```json
{
  "project_id": "e57a318a-...",
  "nicho": "pan-artesano-cordoba",
  "feedback": { "valor_recibido": "alto", "puntuacion": 5, "comentario": "Excelente, lo recomiendo" },
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "nicho": "pan-artesano-cordoba", "valor_recibido": "alto", "puntuacion": 5, "comentario": "Excelente, lo recomiendo", "confirmado": true, "total": 1 }
```
Emite `nichos.feedback_recibido`:
```json
{ "project_id": "e57a318a-...", "nicho": "pan-artesano-cordoba", "valor_recibido": "alto", "puntuacion": 5, "comentario": "Excelente, lo recomiendo", "confirmado": true, "correlation_id": "abc-123" }
```

### 3. `consultar` — leer el feedback (no muta) — **no declarado en module.json**

```json
{ "project_id": "e57a318a-...", "nicho": "pan-artesano-cordoba" }
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "nicho": "pan-artesano-cordoba", "feedback": [ { "esquema": "nichos-confirmacion-valor-v1", "nicho": "pan-artesano-cordoba", "valor_recibido": "alto", "puntuacion": 5, "comentario": "Excelente, lo recomiendo", "recibido_el": "2026-09-25T10:00:00.000Z" } ] }
```
Sin `nicho` devuelve el mapa completo: `{ "project_id": "...", "feedback": { "pan-artesano-cordoba": [ { "...": "..." } ] } }`.

### Fallos típicos

- `feedback_crudo` vacío o no objeto → `400` + `nichos.feedback.guardar.failed` (`FEEDBACK_VACIO`).
- Valor no en {alto|medio|bajo} ni derivable de puntuación → `400` + failed (`INVALID_INPUT`).
- Falta `project_id`/`nicho` → `400` + failed.

## Tests

El test vive en `tests/unit/nichos__confirmacion-valor.test.js`. Cubre:

- `ingestar` feedback crudo con `puntuacion` → `200` estructura `valor_recibido` (deriva de la nota), no persiste.
- `guardar` feedback estructurado → `200` hace append por nicho (`total` crece), publica
  `nichos.feedback_recibido` + `.response` correlada con `correlation_id`.
- `guardar` con `feedback_crudo` embebido → estructura primero y guarda.
- Valor inválido o falta de valor/puntuación → `400` + `nichos.feedback.guardar.failed`.
- `nicho` inválido o falta `project_id` → `400 INVALID_INPUT` + failed.
- `consultar` por nicho y por mapa completo → `200` sin mutar.
- `project.activated` restaura el store de feedback del proyecto (PosPersistencia) — formato Map.
- Manifest: subscribes/publishes exactos de la hoja I3.

Para ejecutarlo (test central del repo):

```bash
cd /home/admin/3enki
node tests/unit/nichos__confirmacion-valor.test.js
```

## Notas de implementación

- Clase `ConfirmacionValor extends ModuloHibridoReflejo`; `name = 'confirmacion-valor'`,
  `version = 'reflejo-0.1.0'`. Store en memoria `this._feedback` (Map project_id → Map<nicho, Array>).
- **PosPersistencia**: `this._persist = new PosPersistencia({ modulo: this, file:
  'confirmacion-valor.json', dir: '/prisma/nichos', snapshot, hidratar })`. `onProjectActivated` →
  `restaurar(project_id)`; `onUnload` → `flush()` + `detener()`. Las escrituras/lecturas con creación
  marcan `marcarDirty(pid)`.
- `onIngestarRequest` delega en `_atender(e, 'ingestar', 'nichos.feedback.ingestar.response', ...)` y
  publica `nichos.feedback.guardar.failed` si la ingesta no es 200. `onGuardarRequest` delega en
  `_atender(e, 'guardar', 'nichos.feedback.guardar.response', ...)` con el fire-and-forget de dominio
  (`nichos.feedback_recibido` en 200 o `nichos.feedback.guardar.failed` si no), propagando `correlation_id`.
  `onConsultarRequest` → `_atender(e, 'consultar', 'nichos.feedback.consultar.response', d => _consultar(d))`.
- Proyecciones: `_ingestar` (reflejo, estructura sin guardar), `_guardar` (custodio single-writer con
  append), `_consultar` (lectura). Helpers `confirmacionVacia()`/`numPuntuacion`, Set `VALORES_VALIDOS`,
  constante `ROL_CUSTODIO` (declarada pero sin guard efectivo en `_guardar`).
- Tools: `toolIngestar` → `_ingestar`, `toolGuardar` → `_guardar`, `toolConsultar` → `_consultar`.
- DEP hacia delante: lo consumen salud financiera (F3) y el canal (feedback del pagador).
