---
name: sobre-conversacion
description: >-
  Usar cuando haya que construir, validar o depurar el SOBRE de una conversación
  (la identidad mínima de un mensaje: proyecto + conversación + participante) —
  es la definición única del sistema y el valor `Sobre` con sus invariantes.
  Skill FULL del módulo REFLEJO puro `sobre-conversacion` (P01) del proyecto
  sistema-de-conversaciones: qué hace y por qué, contrato de eventos exacto del
  module.json, payloads reales, reglas de negocio (nada se rellena, lo ausente se
  nombra), pitfalls y su test unitario de 10 pasos.
version: 0.1.0
autor: enki
tags: [enki, modulo, reflejo, conversaciones, sobre-conversacion, contrato, proyecto-sistema-de-conversaciones]
---

# sobre-conversacion — REFLEJO puro: la definición ÚNICA del sobre

## Qué hace el módulo

Es el dueño de **D1**: en todo el sistema hay **una sola definición** de qué es un
sobre válido, y vive aquí. Un *sobre* es la identidad mínima que viaja con cada
entrada de una conversación: **proyecto**, **conversación** y **participante**
(los campos obligatorios están declarados en su `context.json`, no en código).

Y es el dueño del valor `Sobre`: copiar campo a campo, nombrar los huecos, validar
y re-emitir. Tres invariantes que este módulo sostiene con código, no con
disciplina:

- **S1 — nada se rellena.** Un campo ausente queda `DESCONOCIDO` y aparece
  nombrado en `faltantes[]`. La excepción declarada: `padre` ausente es
  `NINGUNO` (ausencia declarada, no relleno).
- **S2 — el sobre es inmutable.** `conCampos()` devuelve **otro** objeto; el
  original (y la declaración de entrada) no se mutan.
- **S3 — el sobre no transporta contenido.** Sólo identifica; el contenido es
  del cuaderno (`chat-io`).

Por qué existe: el sistema viejo escribía mensajes **sin identidad en el cable**
(el mensaje cruzaba sin decir a quién pertenecía). Un sobre inventado, completado
a ojo o deducido del texto del mensaje hace imposible el aislamiento (I2) y la
admisión (I1). Aquí lo ausente se **declara**, no se adivina: es la condición para
que el resto del proceso sea reproducible.

Es **REFLEJO puro**: no escribe, no tiene almacén de negocio y **no depende de
nadie** (ni `require` cruzado ni evento). Es el cimiento del rail: P13
(`clasificador-sobre`), P03 (`puerta-admision`) y todo el coordinador replican su
veredicto.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `sobre.definicion.request` | `onDefinicionRequest` | Devuelve la definición vigente (campos obligatorios). Con `{ camposObligatorios, declarar: true }` la adopta y publica `sobre.definicion_cambiada`. Payload: `{ request_id, camposObligatorios?, declarar?, declaradaPor? }`. |
| `sobre.construir.request` | `onConstruirRequest` | Construye el sobre copiando campo a campo (lo ausente queda DESCONOCIDO / padre NINGUNO) y devuelve `{ sobre, faltantes, estado }`. Con `{ nuevos }` re-emite otro sobre sin mutar el original. Payload: `{ request_id, declaracion, definicion?, nuevos? }`. |
| `sobre.validar.request` | `onValidarRequest` | VeredictoDeSobre: `{ estado: AUSENTE\|PARCIAL\|COMPLETO\|POR_DECLARAR, faltantes[], camposPresentes[], sobre }`. Payload: `{ request_id, sobre\|declaracion, definicion? }`. Sin sobre → `sobre.validar.failed`. |

> No hay `project.activated`: el módulo es **stateless** (sin store, sin
> `PosPersistencia`). La definición declarada por payload vive en memoria y se
> pierde al reiniciar (`config.persistence.lost_on_restart`).

### Publishes

| Evento | Descripción |
|---|---|
| `sobre.definicion.response` | Definición vigente + su fuente (`context.json` \| `payload`). |
| `sobre.construir.response` | Sobre construido + faltantes nombrados + estado. |
| `sobre.validar.response` | VeredictoDeSobre correlado por `request_id`. |
| `sobre.validar.failed` | Error de dominio de la validación (payload sin sobre) — nunca un timeout como sustituto del error. |
| `sobre.definicion_cambiada` | Hecho: la definición se adoptó de un payload y cambió. Se publica DESPUÉS de adoptarla. `{ antes, despues, declaradaPor }`. |

> Cruce con `index.js`: **todo lo que el código emite está declarado**. Las tres
> `.response` las publica `_atender` (`modulo-hibrido-reflejo.js:93`), no el
> handler; el resto lo emite `_publicarEvento`. No hay pares `.failed` genéricos
> ni hechos sub-declarados en este módulo.

## Reglas de negocio

1. **Definición vacía ⇒ `POR_DECLARAR`, no se valida.** Si
   `context.json.definicion.camposObligatorios` está vacío, `_estado()` devuelve
   `POR_DECLARAR` y `faltantes[]` sale vacío. El módulo **jamás** rellena la
   lista por su cuenta (decisión abierta O3 hecha código). Al cargar deja el warn
   `sobre-conversacion.definicion.por_declarar`.
2. **Los 4 estados del veredicto son excluyentes y este orden manda:**
   `POR_DECLARAR` (sin definición) → `AUSENTE` (no se reconoce **ningún** campo de
   identidad; basura incluida, nunca lanza) → `COMPLETO` (faltantes vacío) →
   `PARCIAL` (hay identidad pero falta algún obligatorio).
3. **Alias explícitos, cero heurística.** El sobre se **reconoce** campo a campo
   por un mapa único de alias — nunca se deduce del texto del mensaje:
   - `proyecto`: `proyecto` · `project_id` · `id_proyecto`
   - `conversacion`: `conversacion` · `conversation_id` · `id_conversacion`
   - `participante`: `participante` · `participant_id` · `id_participante`
   - `mensaje`: `mensaje` · `mensaje_id` · `message_id` · `id_mensaje`
   - `padre`: `padre` · `parent_id` · `id_padre`
   - `instante`: `instante` · `timestamp` · `en`
4. **`DESCONOCIDO` y `NINGUNO` no son valores presentes.** `_presente()` los
   rechaza junto con `undefined`/`null`/`''`: un sobre que dice "DESCONOCIDO" es
   un sobre **incompleto**, no un sobre relleno.
5. **`mensaje`, `padre` e `instante` no identifican el hilo** (S3): pueden venir,
   pero no son obligatorios. Obligatorios reales hoy:
   `["proyecto", "conversacion", "participante"]`.
6. **El veredicto negativo no es un error de bus.** Validar un sobre incompleto
   devuelve **200** con `estado: PARCIAL|AUSENTE`; el 400 sólo existe cuando el
   payload **no trae ni `sobre` ni `declaracion`**.
7. **Un cambio de definición sólo se anuncia si de verdad cambió**
   (`JSON.stringify(antes) !== JSON.stringify(despues)`), y se anuncia **después**
   de adoptarla. Cambiar el orden de la misma lista no es cambio (se comparan
   arrays ordenados por declaración).

## Cómo se usa (RPCs)

### `sobre.definicion.request` → `sobre.definicion.response`

```json
// request (consulta)
{ "request_id": "req-3" }
// request (declarar / adoptar — opcional, y OJO: no persiste)
{ "request_id": "req-4",
  "camposObligatorios": ["proyecto", "conversacion"], "declarar": true,
  "declaradaPor": "dueno" }
```
```json
// response 200 — publicado como sobre.definicion.response { request_id, status, data }
{ "request_id": "req-4", "status": 200,
  "data": { "definicion": { "camposObligatorios": ["proyecto","conversacion"] },
            "fuente": "payload" } }
```
Con cambio real se publica además el hecho
`sobre.definicion_cambiada { antes, despues, declaradaPor }`.

### `sobre.construir.request` → `sobre.construir.response`

```json
{ "request_id": "req-c1",
  "declaracion": { "project_id": "bocaos", "conversation_id": "c-1" } }
```
```json
{ "request_id": "req-c1", "status": 200,
  "data": {
    "sobre": { "proyecto": "bocaos", "conversacion": "c-1",
               "participante": "DESCONOCIDO", "mensaje": "DESCONOCIDO",
               "padre": "NINGUNO", "instante": "DESCONOCIDO" },
    "faltantes": ["participante"],
    "estado": "PARCIAL",
    "definicion": { "camposObligatorios": ["proyecto","conversacion","participante"] } } }
```
Re-emitir sin mutar (S2): añadir `"nuevos": { "participante": "ana" }` → sobre
nuevo `COMPLETO`; el primero sigue con `participante: "DESCONOCIDO"`.

### `sobre.validar.request` → `sobre.validar.response` (o `.failed`)

```json
{ "request_id": "req-1",
  "sobre": { "proyecto": "bocaos", "conversacion": "c-1", "participante": "ana" } }
```
```json
{ "request_id": "req-1", "status": 200,
  "data": { "veredicto": { "estado": "COMPLETO", "faltantes": [],
                           "camposPresentes": ["proyecto","conversacion","participante"],
                           "sobre": { "...": "tal cual entró" } } } }
```

Payload sin sobre (error de dominio, **no timeout**):

```json
{ "request_id": "req-2", "status": 400,
  "error": { "code": "INVALID_INPUT",
             "message": "sobre (o declaracion) requerido",
             "details": { "kind": "domain", "field": "sobre" } } }
```
y en paralelo el hecho `sobre.validar.failed { motivo: "SOBRE_AUSENTE" }`.

### Flujo típico

1. `sobre.construir.request` con lo que llegó del cable → `sobre` + `faltantes`.
2. Si `estado !== 'COMPLETO'`, el coordinador **no escribe nada** y avisa
   (`conversacion.sobre_incompleto` del coordinador; aquí no hay aviso).
3. Si `COMPLETO`, `sobre.validar.request` da el `VeredictoDeSobre` que consume
   `puerta-admision` (`ctx.veredicto.estado === 'COMPLETO'` es su primer paso).

## Tests

`tests/unit/sobre-conversacion.test.js` — bus mock síncrono, sin core.
**10 pasos OK, 0 fallos (10 total)**:

```bash
node tests/unit/sobre-conversacion.test.js
```

Cubre: S1 (sin participante → `PARCIAL` con `faltantes:["participante"]`, `padre:
NINGUNO`), basura `{}` → `AUSENTE` sin lanzar, sobre completo → `COMPLETO`,
S2 (`conCampos` devuelve otro objeto y no muta ni el original ni la entrada),
O3 definición vacía → `POR_DECLARAR`, `_cubreA`, el par
`sobre.validar.request → .response` correlado por `request_id`, el 400
`INVALID_INPUT` + `sobre.validar.failed` (`SOBRE_AUSENTE`), la definición leída
de `context.json` (`fuente: "context.json"`) y el hecho
`sobre.definicion_cambiada` con `antes`/`despues` y la nueva definición rigiendo.

## Notas de implementación

- `class SobreConversacion extends ModuloHibridoReflejo`, `this.name =
  'sobre-conversacion'`, `this.version = 'reflejo-0.1.0'`.
- Los tres handlers son de una línea:
  `onXRequest(e) { return this._atender(e, '<op>', 'sobre.<op>.response', d => this._<op>(d)); }`.
  `_atender` publica `{ request_id, ...result }` y cuenta
  `<name>.reflejo.served` / `.errors`.
- Lógica en proyecciones puras: `_construir`, `_validar`, `_definicion`,
  `_faltantes`, `_es_completo`, `_estado`, `_cubre_a`, `_conCampos`, más los
  internals `_copiar`, `_buscar`, `_valor`, `_presente`, `_definicionDe`,
  `_limpiarCampos`, `_definicionDeclarada`.
- **Store: ninguno.** `config.persistence.pattern = "none"`,
  `restart_resilient: false`, `lost_on_restart: ["definicion adoptada por
  payload (la declarada vive en context.json)"]`.
- La definición declarada se lee en `onLoad` de `path.join(__dirname,
  'context.json')` (`definicion.camposObligatorios` o `camposObligatorios`
  plano). Si el fichero es ilegible: warn `sobre-conversacion.context.ilegible`
  y lista vacía ⇒ `POR_DECLARAR`.

### Pitfalls reales (pagados al construirlo)

- **`padre` ausente NO es `DESCONOCIDO`.** Es `NINGUNO` porque es una **ausencia
  declarada**, no un hueco por rellenar. Si se unificara con `DESCONOCIDO`, `S1`
  mentiría: un hilo raíz no es "un padre que no se conoce".
- **`_limpiarCampos` descarta en silencio los nombres desconocidos** (sólo
  sobreviven los 6 campos del mapa de alias, deduplicados). Un typo en la
  definición (`"conversation"` en vez de `"conversacion"`) no da error: deja la
  lista más corta y puede convertir el veredicto en `POR_DECLARAR`. Al declarar
  la definición, usar EXACTAMENTE los nombres del mapa.
- **`_estado` mira los 6 campos, no sólo los obligatorios** para decidir
  `AUSENTE`. Un payload con solo `mensaje` **no** es `AUSENTE` (hay identidad
  parcial) sino `PARCIAL` con todos los obligatorios en `faltantes`.
- **La definición adoptada por payload no se persiste.** Vive en `this.definicion`
  y vuelve a `context.json` en el siguiente arranque. No es un bug: es la
  degradación honesta declarada en el manifest.
- **`sobre.definicion_cambiada` se publica DESPUÉS de adoptar** y sólo si el
  array cambió. Un `declarar: true` idempotente **no** emite hecho — no hay
  "hechos de nada" (P3).

## Verificación en vivo (opcional)

Los tres `*.request` son consultables por el bus sin estado previo. El
`request_id` de la respuesta es el mismo del request: si no llega respuesta y
tampoco `sobre.validar.failed`, el bus no entregó el evento (no es un fallo del
módulo).
