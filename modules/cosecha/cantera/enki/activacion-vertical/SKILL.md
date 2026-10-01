---
name: activacion-vertical
description: >-
  Skill FULL del módulo REFLEJO STATELESS `activacion-vertical` de la vertical
  contabilidad (Enki). Enciende la observación contable por CONFIGURACIÓN
  DECLARADA: si contabilidad no está activada, la vertical FUNCIONA IGUAL (la
  contabilidad es observador opcional, bloquea_operacion:false). Sin config
  legible NO se estima un default (activa:false + abierto.config). No escribe, no
  persiste; su cara es el bus.
when-to-use: >-
  - Cuando necesites resolver si la observación contable queda activa y con qué
    alcance (RPC activacion-vertical.activar.request).
  - Cuando depures por qué la activación sale activa:false o abierto.config (falta
    project_id → 400 INVALID_INPUT).
  - Cuando quieras entender su contrato de eventos (subscribes/publishes).
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, reflejo, contabilidad, analitica, activacion, configuracion-declarada, observador-opcional]
---

# activacion-vertical — REFLEJO STATELESS de la activación contable por configuración

## Qué hace el módulo

`activacion-vertical` es un **REFLEJO STATELESS** (K4, hoja del plan): enciende
la observación contable **por la CONFIGURACIÓN DECLARADA** de la vertical. La
regla que lo define es tajante: **si contabilidad NO está activada, la vertical
FUNCIONA IGUAL** — la contabilidad es *observador opcional*
(`bloquea_operacion:false`). Lee la config declarada por la vertical
(`onboarding-negocio`) y dice si la observación contable queda activa y con qué
alcance.

**Invariante 13 (honestidad)**: sin config legible **NO se estima un default** —
devuelve `activa:false` + `abierto.config`. No escribe, no persiste (sin
PosPersistencia). Su op es **CLASE PREGUNTA**: va por el bus, sin panel. Publica
`activacion-vertical.activar.response` y su par `.failed`.

> **Nota R3**: la escucha de `contabilidad.negocio_registrado` que el plan
> mencionaba **NO se declara aún**: su emisor `onboarding-negocio` no existe
> todavía → la cadena quedaría colgada. Por eso este módulo solo expone el RPC.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `activacion-vertical.activar.request` | `onActivarRequest` | RPC reflejo (PREGUNTA, por el bus): `{project_id, config?, alcance?, activa?}` → `{project_id, activa, bloquea_operacion:false, alcance, config_declarada, abierto}`. Resuelve la activación por lo declarado; sin config NO se estima un default. Responde por `activacion-vertical.activar.response`. Payload inválido → `activacion-vertical.activar.failed`. |

### Publishes

| Evento | Descripción |
|---|---|
| `activacion-vertical.activar.response` | Respuesta RPC correlada de la op `activar` (una sola cara: el bus). |
| `activacion-vertical.activar.failed` | Par de fallo determinista: falta `project_id` → `{status, code, message}`. Cierra el círculo de `activar.request`. |

## Operaciones (RPC)

| op | tipo | entrada | salida | errores |
|---|---|---|---|---|
| `activar` | **PREGUNTA** (bus, sin panel) | `{project_id, config?, alcance?, activa?}` | `{project_id, activa, bloquea_operacion:false, alcance, config_declarada, abierto}` | `400 INVALID_INPUT project_id` |

Tool expuesta: `activacion-vertical.activar` (`toolActivar` → `_activar`).

## Reglas de negocio

1. **La config manda**: la activación sale de la config declarada, no de un
   default cableado. `bloquea_operacion` es **siempre `false`**: la contabilidad
   nunca bloquea la operación de la vertical.
2. **Invariante 13 — sin config no se estima**: si no hay config legible →
   `activa:false` con `abierto.config` declarado. No se adivina.
3. **Sin project_id** → `400 INVALID_INPUT` `{status:400, code:'INVALID_INPUT',
   message:'project_id requerido', details:{field:'project_id'}}` + publicación de
   `activacion-vertical.activar.failed`.
4. **Estateless**: no escribe, no persiste, no muta nada; solo resuelve y responde.
5. **HTTP exacto**: éxito `200`; falta `project_id` → `400`; excepción en
   `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPC)

### `activar` — ¿queda activa la observación contable?

```json
{
  "project_id": "e57a318a-...",
  "config": { "contabilidad": { "activa": true, "alcance": "libro+fiscal" } },
  "alcance": "libro+fiscal",
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "activa": true, "bloquea_operacion": false, "alcance": "libro+fiscal", "config_declarada": { "contabilidad": { "activa": true, "alcance": "libro+fiscal" } }, "abierto": { "config": null } }
```
Sin config → `activa:false` con `abierto.config` explicando que no hay config
legible (no se estima un default).

## Errores y qué significan

- `400 INVALID_INPUT project_id` — falta el proyecto; no se puede resolver.
- `200 {activa:false, abierto.config}` — no hay config declarada: NO se finge un
  default (comportamiento honesto, no un error).
- `500 UNKNOWN_ERROR` — excepción no prevista.

## Relación con otras piezas (por EVENTO, nunca import)

- **Hacia atrás (config declarada)**: `onboarding-negocio` (declara la config de la
  vertical). *Aún sin escucha por evento (R3).*
- **Hacia delante**: su resultado lo consume quien decide si mostrar/mostrar la
  observación contable; hoy solo responde por el bus.
- No bloquea a nadie: la vertical opera igual con o sin contabilidad activada.

## Verificación

- **Fichero**: `modules/contabilidad-analitica/activacion-vertical/` (clase
  `ActivacionVertical extends ModuloHibridoReflejo`, `version 'reflejo-0.1.0'`).
- **Eventos**: `grep -F "activar.request" module.json` y `grep -F "activar.response"
  index.js` para confirmar los strings.
- **Test unitario**: con config declarada activa → `activa:true,
  bloquea_operacion:false`; sin config → `activa:false` + `abierto.config`; sin
  `project_id` → `400 INVALID_INPUT` + `.failed`.

## Notas de implementación

- Stateless: sin `PosPersistencia`, sin `onProjectActivated`.
- `onActivarRequest` delega en `_atender(e, 'activar',
  'activacion-vertical.activar.response', d => this._activar(d))`; si el status ≠
  200 publica `activacion-vertical.activar.failed`.
- Helpers `_invalid`/`_errorResponse` vienen de `modulo-hibrido-reflejo`.
