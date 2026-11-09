---
name: puerta-admision
description: >-
  Usar cuando haya que decidir (o depurar) si una entrada se ADMITE en un hilo —
  ABRIR o RECHAZAR con motivo y base — y por qué: la puerta de admisión en 5
  pasos, reproducible, con la política como DATO. Skill FULL del módulo REFLEJO
  puro `puerta-admision` (P03) del proyecto sistema-de-conversaciones: contrato
  exacto, los 9 motivos de rechazo literales, payloads reales, pitfalls y su test
  unitario de 14 pasos.
version: 0.1.0
autor: enki
tags: [enki, modulo, reflejo, conversaciones, puerta-admision, admision, contrato, proyecto-sistema-de-conversaciones]
---

# puerta-admision — REFLEJO puro: el veredicto de entrada

## Qué hace el módulo

Es la función `ContextoDeAdmision → DecisionDeAdmision`: recibe un contexto **ya
hidratado por valor** (veredicto del sobre, proyecto, hilo, sujeto, acto, política
y llaves) y devuelve `ABRIR` o `RECHAZAR`. Cinco pasos en el orden del diseño; **el
primero que corta manda**:

1. **El sobre** — `ctx.veredicto.estado` debe ser `COMPLETO`.
2. **El proyecto y el hilo existen** — `proyecto` no puede ser `NO_RESUELVE`,
   `conversacion` no puede ser `NINGUNA`, y **el proyecto del hilo debe ser el del
   sobre** (I2). Aquí **nunca se crea** nada.
3. **El sujeto** — participante conocido y con `id` (I1: nadie anónimo).
4. **El acto y el estado del hilo** — la política es **DATO**: sin
   `politica.actosPorEntrada[acto]` no se decide (`MOTIVO_POLITICA_NO_DECLARADA`,
   O12), no se inventa.
5. **La llave** — **una por acto** (I7: LEER ≠ ESCRIBIR), revocada/caducada/ajena
   no cubre.

Por qué existe: hoy el mensaje se escribe **antes** de que nadie diga "sí". Esta
puerta es la que puede decir **no** antes del efecto, y lo hace **sin almacén**:
como no consulta nada, la decisión es **reproducible** (I6 — misma ctx, misma
decisión byte a byte). Eso es lo que permite auditar después por qué entró una
entrada (`base`) y por qué no (`motivo`).

**P3 — no emite hechos ni escribe.** La puerta sólo publica su `.response` (o su
`.failed` si el contexto viene malformado). El rastro lo pone el coordinador en la
traza. Un test lo verifica: al admitir, el bus sólo ve
`conversacion.admitir.response`.

## Contrato de eventos (module.json real)

### Subscribes (RPC request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `conversacion.admitir.request` | `onAdmitirRequest` | Veredicto de admisión. Payload: `{ request_id, veredicto, proyecto, conversacion, participante, acto, politica, llaves[], ahora }`. Devuelve `{ decision: ABRIR\|RECHAZAR, actos, llaves, motivo?, base }`. |

> Sin `project.activated`: **REFLEJO puro stateless** (sin store, sin
> `PosPersistencia`). `config.persistence.pattern = "none"`.

### Publishes

| Evento | Descripción |
|---|---|
| `conversacion.admitir.response` | DecisionDeAdmision correlada por `request_id` (incluye `base` SIEMPRE y `motivo` si rechaza). |
| `conversacion.admitir.failed` | Error de dominio: ctx sin veredicto (el clasificador P13 siempre pasa antes). Nunca un timeout como sustituto del error. |

> Cruce con `index.js`: exactamente dos emisiones, las dos declaradas —
> `conversacion.admitir.failed` (motivo `CONTEXTO_SIN_VEREDICTO`) y la `.response`
> que publica `_atender`. **Cero hechos de dominio** (P3). No hay eventos
> sub-declarados.

## Reglas de negocio

### Los 9 motivos de rechazo (literales del código)

| Motivo | Cuándo |
|---|---|
| `MOTIVO_SOBRE_INCOMPLETO` | `ctx.veredicto.estado !== 'COMPLETO'` (detalle: `faltantes`) |
| `MOTIVO_PROYECTO_NO_RESUELVE` | `!ctx.proyecto` o `'NO_RESUELVE'` |
| `MOTIVO_CONVERSACION_NO_EXISTE` | `!ctx.conversacion` o `'NINGUNA'` |
| `MOTIVO_FUERA_DE_AMBITO` | `ctx.conversacion.proyecto !== ctx.proyecto.idCanonico` (I2; detalle con ambos) |
| `MOTIVO_PARTICIPANTE_DESCONOCIDO` | sin participante, `'DESCONOCIDO'` o sin `.id` (I1) |
| `MOTIVO_POLITICA_NO_DECLARADA` | la política (o `actosPorEntrada[acto]`) no está declarada (O12) |
| `MOTIVO_ESTADO_NO_ADMITE` | el estado del hilo no admite esos actos (detalle: `acto`, `estado`, `actos`) |
| `MOTIVO_SIN_LLAVE` | `ctx.llaves` vacío |
| `MOTIVO_LLAVE_NO_CUBRE_ACTO` | hay llaves pero ninguna cubre ESTE acto (I7; detalle: `acto`) |

### Leyes duras

1. **Rechazar NO es un error HTTP.** Una `DecisionDeAdmision` de rechazo sale
   con **status 200** y `data.decision === 'RECHAZAR'`. El 400
   (`INVALID_INPUT`) está reservado a `ctx.veredicto` ausente: es un error de
   **contrato**, no una decisión de dominio.
2. **Toda decisión lleva `base`** (siempre, también al rechazar) — con qué se
   decidió: `veredicto`, `faltantes`, `proyecto`, `conversacion`, `participante`,
   `estado`, `acto`, `ahora` (P2/I6).
3. **Determinismo por construcción**: la puerta NO mira el reloj. `ahora` llega en
   el ctx y sólo se usa para caducidad y para `base`. Si usara `new Date()` la
   decisión no sería reproducible y el test de I6 fallaría.
4. **`cubre()` real (5 líneas, duplicación aceptada entre islas):** una llave no
   cubre si `revocadaEn` existe y no es `'NINGUNO'`, si es de otra conversación, si
   sus `actos` no incluyen el acto pedido, o si `caducaEn` está declarada y
   **`String(ahora) > String(caducaEn)`**. Sin `ahora` y con caducidad declarada →
   **no cubre** (fail-closed: lo que no se puede verificar no se da por bueno).
5. **`actosPorEstado[estado]` que no es array ⇒ `false`** → `MOTIVO_ESTADO_NO_ADMITE`.
   Pero si falta `actosPorEstado` entero ⇒ `POR_DECLARAR` (no se asume nada).
6. **`base` normaliza los centinelas**: `NO_RESUELVE`, `NINGUNA` y `DESCONOCIDO`
   se conservan tal cual; los objetos se reducen a su id
   (`proyecto.idCanonico`, `conversacion.id`, `participante.id`).
7. **La llave devuelta es un resumen mínimo** `{ id, actos }`, deduplicada por id:
   la puerta no filtra el objeto completo al llamante.

## Cómo se usa (RPCs)

### `conversacion.admitir.request` → `conversacion.admitir.response` (ABRIR)

```json
{
  "request_id": "req-1",
  "veredicto": { "estado": "COMPLETO", "faltantes": [],
                 "camposPresentes": ["proyecto","conversacion","participante"] },
  "proyecto": { "idCanonico": "bocaos" },
  "conversacion": { "id": "c-1", "proyecto": "bocaos", "estado": "ACTIVA" },
  "participante": { "id": "ana" },
  "acto": "MENSAJE",
  "politica": {
    "actosPorEntrada": { "MENSAJE": ["ESCRIBIR"] },
    "actosPorEstado": { "ACTIVA": ["ESCRIBIR","LEER"], "ARCHIVADA": ["LEER"] }
  },
  "llaves": [{ "id": "ll-1", "conversacion": "c-1", "actos": ["ESCRIBIR"],
               "caducaEn": "POR_DECLARAR" }],
  "ahora": "2026-11-09T04:00:00.000Z"
}
```
```json
{ "request_id": "req-1", "status": 200,
  "data": {
    "decision": "ABRIR",
    "actos": ["ESCRIBIR"],
    "llaves": [{ "id": "ll-1", "actos": ["ESCRIBIR"] }],
    "base": { "veredicto": "COMPLETO", "faltantes": [], "proyecto": "bocaos",
              "conversacion": "c-1", "participante": "ana", "estado": "ACTIVA",
              "acto": "MENSAJE", "ahora": "2026-11-09T04:00:00.000Z" } } }
```

### Rechazo (200, no 4xx)

```json
{ "request_id": "req-2", "status": 200,
  "data": {
    "decision": "RECHAZAR",
    "motivo": "MOTIVO_LLAVE_NO_CUBRE_ACTO",
    "detalle": { "acto": "ESCRIBIR" },
    "base": { "veredicto": "COMPLETO", "acto": "MENSAJE",
              "proyecto": "bocaos", "conversacion": "c-1", "participante": "ana",
              "estado": "ACTIVA", "ahora": "2026-11-09T04:00:00.000Z", "faltantes": [] } } }
```

### Error de dominio (ctx sin veredicto) → 400 + `.failed`

```json
// request malformado
{ "request_id": "req-3", "proyecto": { "idCanonico": "bocaos" } }
```
```json
// conversacion.admitir.response publicado con
{ "request_id": "req-3", "status": 400,
  "error": { "code": "INVALID_INPUT",
             "message": "ctx.veredicto requerido (el clasificador pasa antes)",
             "details": { "kind": "domain", "field": "veredicto" } } }
// + hecho conversacion.admitir.failed
{ "motivo": "CONTEXTO_SIN_VEREDICTO",
  "detalle": "el clasificador (P13) siempre pasa antes: ctx.veredicto es precondición" }
```

### Flujo típico (en el coordinador)

1. `chat-io` publica `conversacion.entrada.recibida` (pre-INSERT) con el
   interruptor `conversaciones.gate` ON.
2. El coordinador clasifica el sobre (`clasificador-sobre` → `veredicto`), resuelve
   proyecto/hilo (`project-manager` + `chat-io`), el sujeto
   (`registro-participantes`) y pide las llaves vigentes (`gestor-llaves` →
   `llave.vigentes`).
3. Hidrata TODO eso como ctx y llama `conversacion.admitir.request`.
4. `ABRIR` → anexa al cuaderno con `admitido: true`; `RECHAZAR` →
   `conversacion.entrada_rechazada` + nada se escribe (I1).

## Tests

`tests/unit/puerta-admision.test.js` — bus mock síncrono, sin core.
**14 pasos OK, 0 fallos (14 total)**:

```bash
node tests/unit/puerta-admision.test.js
```

Cubre: I6 (misma ctx dos veces ⇒ `JSON.stringify` idéntico), ABRIR con
`actos`/`llaves`/`base` completo, I7 (`{LEER}` + ESCRIBIR ⇒
`LLAVE_NO_CUBRE_ACTO` con detalle `acto`), `SIN_LLAVE`, llave **caducada** y
llave **sin `ahora`** (ambas no cubren), llave **revocada**, O12 (política
`POR_DECLARAR` y política sin `actosPorEntrada`), `ESTADO_NO_ADMITE` (hilo
ARCHIVADA), I1 (`DESCONOCIDO`), I2 (hilo de otro proyecto), sobre PARCIAL con
`faltantes` en el detalle, `NO_RESUELVE`/`NINGUNA`, **P3** (al admitir sólo se
publica `conversacion.admitir.response`, correlada por `request_id`) y el 400 +
`conversacion.admitir.failed`.

## Notas de implementación

- `class PuertaAdmision extends ModuloHibridoReflejo`, `this.name =
  'puerta-admision'`, `this.version = 'reflejo-0.1.0'`. Sin constructor de estado.
- Un solo handler de una línea:
  `onAdmitirRequest(e) { return this._atender(e, 'admitir',
  'conversacion.admitir.response', d => this._decidir(d)); }`.
- Proyecciones: `_decidir(ctx)` (los 5 pasos), `_actos_pedidos(acto, politica)`,
  `_permite(politica, actos, estado)`, `_primera_llave(actos, llaves,
  conversacion, ahora)`, `_cubre(llave, acto, conversacion, ahora)`, `_base(ctx)`,
  `_rechazar(motivo, base, detalle)`.
- **Constantes** (no strings sueltos): `POR_DECLARAR`, `NO_RESUELVE`, `NINGUNA`,
  `DESCONOCIDO` y el mapa `MOTIVOS`.
- **Store: ninguno.** `config.persistence.pattern = "none"`,
  `lost_on_restart: []` (no hay nada que perder).

### Pitfalls reales (pagados al construirlo)

- **El rechazo de dominio NO es un error HTTP.** Si se devolviera 4xx al
  rechazar, el coordinador no podría distinguir "la puerta dijo no" (información
  de negocio, hay que trazar) de "el módulo está roto". Hoy: rechazo = 200 con
  `decision: 'RECHAZAR'` + `motivo` + `base`; roto = 400/500.
- **`ctx.proyecto` es un OBJETO (`{ idCanonico }`), no un string.** Comparar
  `ctx.conversacion.proyecto !== ctx.proyecto` daría `FUERA_DE_AMBITO` **siempre**.
  El paso 2 comprueba primero si `proyecto` es el centinela `'NO_RESUELVE'` (string)
  y sólo después lee `.idCanonico`; por eso el orden importa.
- **Sin `ahora` no se puede validar la caducidad, así que la llave NO cubre.**
  La tentación es "si no hay reloj, asumir vigente": eso sería
  `MOTIVO_LLAVE_NO_CUBRE_ACTO` mal resuelto a favor del que entra.
- **`_primera_llave` corta en el primer acto sin cobertura y devuelve
  `usadas: []`** (no las parcialmente usadas): la decisión se lee entera, no a
  medias. Una llave "de todo" no existe (I7).
- **La política es dato, no configuración del módulo.** No hay defaults: sin
  `actosPorEntrada` la respuesta es `MOTIVO_POLITICA_NO_DECLARADA`, aunque el hilo
  esté ACTIVO y la llave sea válida.
