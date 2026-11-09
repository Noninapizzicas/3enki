---
name: amarre-sesion
description: >-
  Usar cuando haya que abrir, resolver, refrescar o cerrar la SESIÓN de un
  participante en una conversación (siempre el par participante+hilo, nunca una
  sesión global), o listar huérfanas. Skill FULL del módulo CUSTODIO
  `amarre-sesion` (P08) del proyecto sistema-de-conversaciones: clave = el par,
  snapshot JSON por proyecto, cerrar sin tocar el hilo (I5), umbral explícito y
  test de 14 pasos.
version: 0.1.0
autor: enki
tags: [enki, modulo, custodio, conversaciones, amarre-sesion, sesiones, par, proyecto-sistema-de-conversaciones]
---

# amarre-sesion — CUSTODIO de la sesión atada al PAR (participante, conversación)

## Qué hace el módulo

Ata la sesión a un **par**: `(participante, conversación)`. Dos participantes
sobre el mismo hilo tienen **dos sesiones** (I4) y ninguna sesión cruza de
conversación (AS2: el mismo participante en otro hilo abre otra).

**No existe la sesión global por proyecto.** Ésa es, literalmente, la
`session_state` que este diseño mata: una sesión por proyecto compartida por todos
los sujetos es la forma más barata de que un mensaje acabe en el hilo de otro.
Aquí la clave **ES** el par: `"<participante>::<conversacion>"`.

Invariantes: **SS1** la clave es el par · **AS1** único escritor (dos escritores =
dos sesiones vivas del mismo par) · **AS2** una sesión no se reutiliza en otra
conversación · **AS3** la sesión la fija la puerta — el llamante no la impone
desde el cuerpo del mensaje (aquí sólo se resuelve por par o por id, **nunca** "la
sesión activa del sistema") · **AS4** `mecanismo_de_sesion` es `POR_DECLARAR` y se
declara la ausencia · **I4** una sesión viva pertenece a UN par · **I5** cerrar
una sesión **NUNCA** archiva ni borra la conversación: el hilo sigue completo.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `sesion.resolver.request` | `onSesionResolverRequest` | Resuelve la sesión del par: devuelve la VIVA si existe o abre una nueva (201). Participante `DESCONOCIDO` → rechazo + `sesion.resolver.failed`. Payload: `{ request_id, project_id, participante, conversacion, ahora? }`. |
| `sesion.senal.request` | `onSesionSenalRequest` | Señal de vida: actualiza `ultimaSenal`. Payload: `{ request_id, id? \| participante+conversacion, ahora? }`. |
| `sesion.cerrar.request` | `onSesionCerrarRequest` | Cierra SÓLO la sesión (estado `CERRADA` + `cerradaEn` + motivo): nunca archiva la conversación (I5). Payload: `{ request_id, id? \| participante+conversacion, motivo, ahora? }`. |
| `sesion.huerfanas.request` | `onSesionHuerfanasRequest` | Sesiones vivas sin señal dentro del umbral. Payload: `{ request_id, umbral_ms, project_id?, ahora? }`. Sin umbral explícito → 400 (`POR_DECLARAR` no se estima). |
| `project.activated` | `onProjectActivated` | Restaura las sesiones del proyecto activado desde `/conversaciones/sesiones.json`. |

### Publishes

| Evento | Descripción |
|---|---|
| `sesion.abierta` | Hecho: se abrió una sesión para el par. Se publica DESPUÉS de escribir. `{ sesion }`. |
| `sesion.cerrada` | Hecho: se cerró una sesión (sólo la sesión). `{ sesion, motivo }`. |
| `sesion.huerfana_detectada` | Hecho: una sesión viva dejó de dar señal dentro del umbral declarado. `{ sesion, umbral_ms }`. |
| `sesion.resolver.response` | Sesión del par + si se reutilizó, correlada por `request_id`. |
| `sesion.resolver.failed` | Rechazo de dominio del resolver (participante `DESCONOCIDO` / conversación ausente) — nunca un timeout como sustituto del error. |
| `sesion.senal.response` | Sesión con la última señal actualizada. |
| `sesion.cerrar.response` | Sesión cerrada. |
| `sesion.huerfanas.response` | Sesiones huérfanas + total + umbral aplicado. |

> Cruce con `index.js`: **todo lo emitido está declarado**. Las cuatro
> `.response` salen de `_atender`; los tres hechos de `_publicarEvento`. El par
> `sesion.resolver.failed` se emite en DOS casos con motivos distintos:
> `PARTICIPANTE_DESCONOCIDO` y `CONVERSACION_AUSENTE`. No hay eventos
> sub-declarados.

> Nota: el plan sólo listó `sesion.abierta`, `sesion.cerrada`,
> `sesion.huerfana_detectada`, `sesion.resolver.response` y
> `sesion.resolver.failed`. El **contrato vigente es el module.json**: añade
> `sesion.senal.response`, `sesion.cerrar.response` y `sesion.huerfanas.response`
> (los publica `_atender` con su op real).

## Reglas de negocio

### Resolver (`_resolver`)

1. **Sin sujeto no hay sesión.** `participante` ausente o `'DESCONOCIDO'` → **403**
   `PERMISSION_DENIED` ("No hay sesión para un participante DESCONOCIDO (nadie
   entra anónimo)"), `details.motivo = 'PARTICIPANTE_DESCONOCIDO'`, **cero
   sesiones creadas** y hecho `sesion.resolver.failed { motivo:
   'PARTICIPANTE_DESCONOCIDO', conversacion }`.
2. **Sin hilo no hay par.** `conversacion` ausente → **400** `INVALID_INPUT`
   ("conversacion requerido (la sesión se ata a UN hilo)") + `sesion.resolver.failed
   { motivo: 'CONVERSACION_AUSENTE', participante }`.
3. **Viva ⇒ se devuelve LA MISMA**: **200** `{ sesion, reutilizada: true }`, sin
   hecho, sin tocar `ultimaSenal` (para eso está `senal`).
4. **No viva (o no existe) ⇒ se abre una nueva**: **201** `{ sesion, reutilizada:
   false }` + hecho `sesion.abierta`. Campos: `id: "sesion-<uuid>"`,
   `participante`, `conversacion`, `project_id` (o `null`), `abiertaEn`,
   `ultimaSenal` (los dos = `ahora` o reloj), `estado: 'VIVA'`,
   `mecanismo_de_sesion: 'POR_DECLARAR'` (AS4: se declara la ausencia, no se elige).

### Señal (`_senal`)

Busca por `id` **o** por el par; si no hay → **404** `RESOURCE_NOT_FOUND`.
Actualiza `ultimaSenal` (a `ahora` o reloj), marca persistencia, devuelve la
sesión. **No** publica hecho: la señal no es un suceso de dominio auditable.

### Cerrar (`_cerrar`) — I5

1. Busca por `id` o par; si no hay → **404** `RESOURCE_NOT_FOUND`.
2. Si ya está `CERRADA` → **200** `{ sesion, ya_cerrada: true }` (**idempotente**,
   no duplica ni re-emite hecho).
3. Si no: `estado = 'CERRADA'`, `cerradaEn`, `motivo_cierre = motivo ||
   'POR_DECLARAR'`, marca persistencia, hecho `sesion.cerrada { sesion, motivo }`,
   **200**.
4. **NUNCA** archiva, cierra ni borra la conversación: no se publica ningún
   evento `conversacion.*` (el test lo comprueba con un filtro de prefijo). La
   sesión cerrada **no se borra** de la colección en ese momento.

### Huérfanas (`_huerfanas`)

- `umbral_ms` **obligatorio, numérico y > 0**: si no → **400** `INVALID_INPUT`
  ("umbral_ms requerido y positivo: el umbral de vida está POR_DECLARAR y no se
  estima"), `details.motivo = 'UMBRAL_POR_DECLARAR'`. Ni 30 min ni 24 h por
  defecto: **el umbral es una decisión del dueño**.
- Filtro: `estado === 'VIVA'` **y** (si viene `project_id`) del proyecto **y**
  `ahoraMs - ultimaSenal > umbral`.
- Por cada huérfana se publica `sesion.huerfana_detectada { sesion, umbral_ms }`
  (no se cierra nada: detectar no es decidir).
- Respuesta **200**: `{ sesiones, total, umbral_ms }`.

## Cómo se usa (RPCs)

### Resolver (nueva)

```json
{ "request_id": "req-1", "project_id": "bocaos", "participante": "ana",
  "conversacion": "c-1", "ahora": "2026-11-09T04:00:00.000Z" }
```
```json
{ "request_id": "req-1", "status": 201,
  "data": { "sesion": {
    "id": "sesion-35835…", "participante": "ana", "conversacion": "c-1",
    "project_id": "bocaos", "abiertaEn": "2026-11-09T04:00:00.000Z",
    "ultimaSenal": "2026-11-09T04:00:00.000Z", "estado": "VIVA",
    "mecanismo_de_sesion": "POR_DECLARAR" }, "reutilizada": false } }
```
Segunda llamada del mismo par → **200** con `reutilizada: true` y el **mismo id**.

### Resolver sin sujeto (rechazo de dominio)

```json
{ "request_id": "req-2", "status": 403,
  "error": { "code": "PERMISSION_DENIED",
             "message": "No hay sesión para un participante DESCONOCIDO (nadie entra anónimo)",
             "details": { "kind": "domain", "motivo": "PARTICIPANTE_DESCONOCIDO",
                          "field": "participante" } } }
// + sesion.resolver.failed { motivo: "PARTICIPANTE_DESCONOCIDO", conversacion: "c-1" }
```

### Señal

```json
{ "request_id": "req-3", "id": "sesion-35835…", "ahora": "2026-11-09T04:30:00.000Z" }
→ 200 { "data": { "sesion": { "…": "…", "ultimaSenal": "2026-11-09T04:30:00.000Z" } } }
```
Se acepta también el par en vez de `id`: `{ participante, conversacion }`.

### Cerrar

```json
{ "request_id": "req-4", "id": "sesion-35835…", "motivo": "SE_FUE",
  "ahora": "2026-11-09T05:00:00.000Z" }
→ 200 { "data": { "sesion": { "estado": "CERRADA",
                             "cerradaEn": "2026-11-09T05:00:00.000Z",
                             "motivo_cierre": "SE_FUE", "…": "…" } } }
```
Segunda vez → 200 con `ya_cerrada: true`.

### Huérfanas

```json
{ "request_id": "req-5", "project_id": "bocaos",
  "umbral_ms": 1800000, "ahora": "2026-11-09T05:00:00.000Z" }
→ 200 { "data": { "sesiones": [ { "participante": "ana", "…": "…" } ],
                  "total": 1, "umbral_ms": 1800000 } }
```

### Flujo típico

1. El coordinador admite (`ABRIR`) y **ata**: `sesion.resolver` con el par.
2. Cada entrada posterior refresca con `senal` (o el resolver devuelve la viva).
3. Al irse el sujeto, `sesion.cerrar` **sólo la sesión**; el hilo sigue entero.
4. Un barrido periódico llama `huerfanas` con un umbral **declarado** y avisa al
   dueño con `sesion.huerfana_detectada` (`adaptador-avisos`).

## Tests

`tests/unit/amarre-sesion.test.js` — bus mock **con fs simulado**.
**14 pasos OK, 0 fallos (14 total)**:

```bash
node tests/unit/amarre-sesion.test.js
```

Cubre: I4 (A y B sobre el mismo hilo ⇒ **dos ids** y 2 hechos `sesion.abierta`);
SS1 (mismo par dos veces ⇒ mismo id, `reutilizada: true`, 1 sola sesión); AS2
(mismo participante en otra conversación ⇒ otra sesión); `DESCONOCIDO` ⇒ 403 +
`sesion.resolver.failed` + cero sesiones; resolver sin conversación ⇒ 400; I5
(cerrar ⇒ `CERRADA` + `sesion.cerrada` y **cero** eventos `conversacion.*`, la
sesión no se borra); tras cerrar, el par abre una sesión **nueva**; cerrar dos
veces ⇒ 200 `ya_cerrada: true`; `senal` actualiza `ultimaSenal`; `huerfanas` sin
umbral ⇒ 400 `UMBRAL_POR_DECLARAR`, con umbral ⇒ 1 huérfana + 1 hecho; snapshot
por proyecto (`bocaos` y `the-pirate` escriben **su** fichero, sin mezclarse);
`project.activated` restaura y la sesión viva **sobrevive al reinicio**
(`reutilizada: true`); el par `sesion.resolver.request → .response` correlado por
`request_id` con status 201.

## Notas de implementación

- `class AmarreSesion extends ModuloHibridoReflejo`, `this.name =
  'amarre-sesion'`, `this.version = 'reflejo-0.1.0'`.
- Estado: `this.sesiones = new Map()` con clave `_clave(participante,
  conversacion) = \`${participante}::${conversacion}\``. **Una entrada por par.**
- Persistencia: `new PosPersistencia({ modulo: this, file: 'sesiones.json',
  dir: '/conversaciones', snapshot: pid => ({ sesiones:
  [...this.sesiones.values()].filter(s => s.project_id === pid) }), hidratar })`
  → `/conversaciones/sesiones.json` **del storage del proyecto**, debounced
  800 ms, `flush()` en `onUnload`. `config.persistence`: `json-file-per-project`,
  `restart_resilient: true`, `concurrency: single-writer`.
- `onProjectActivated(e)` → `_persist.restaurar(e.data.project_id)`; `_hidratar`
  **merge por par** y **gana la más reciente por `ultimaSenal`**.
- Handlers de una línea con `_atender(e, 'sesion.<op>', 'sesion.<op>.response',
  d => this._<op>(d))`.
- `_buscar(d)` resuelve por `id` (recorriendo el Map) o por el par (acceso
  directo); es el buscador común de `senal` y `cerrar`.

### Pitfalls reales (pagados al construirlo)

- **Una sola entrada por par ⇒ el histórico de cierres NO vive en el Map.**
  Al cerrar, la entrada sigue siendo la misma; si el par vuelve, `_resolver` abre
  una sesión **nueva** y **pisa** la clave (`this.sesiones.set(clave, sesion)`).
  Verificado en vivo: tras cerrar+reabrir, `sesiones.size === 1` y el snapshot
  guarda sólo la nueva. Consecuencia honesta: el registro de cierres es el
  **hecho `sesion.cerrada`** (y la traza), no este almacén. Si se necesita
  histórico en el custodio habría que cambiar el modelo a ledger sólo-añadir —
  decisión explícita, no un parche.
- **`_hidratar` no puede pisar una viva posterior con un snapshot viejo.** Gana la
  sesión con `ultimaSenal` más reciente; sin esa comparación, un `project.activated`
  tardío resucitaría una `CERRADA` o retrocedería la señal.
- **`marcarDirty(sesion.project_id)` con `project_id: null` no persiste.** El
  resolver acepta sesiones sin proyecto (degradación honesta en memoria); si el
  llamante necesita durabilidad, **debe** pasar `project_id`.
- **`huerfanas` sin `ahora` usa el reloj real** (`Date.now()`), lo que hace el
  resultado no determinista entre llamadas. Los tests y la auditoría pasan
  `ahora` explícito; en producción el reloj es el correcto.
- **Detectar no es cerrar.** `_huerfanas` publica el hecho y deja la sesión
  `VIVA`: cerrarla es una decisión (del dueño/coordinador) y se hace con
  `sesion.cerrar`. Un barrido que cerrara solo convertiría una red lenta en un
  cierre de sesión.
- **Cerrar dos veces no es error.** Devuelve 200 `ya_cerrada: true` y **no**
  re-emite `sesion.cerrada`: los hechos describen lo que pasó, no lo que se pidió.
