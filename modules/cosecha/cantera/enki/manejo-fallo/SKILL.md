---
name: manejo-fallo
description: >-
  Skill FULL del módulo PUENTE STATELESS `manejo-fallo` (L3, hoja del plan) de la
  vertical nichos (Radar de Nichos). Reintento MECÁNICO del ciclo hasta un máximo
  [ABIERTO] ANTES de escalar a humano: gestiona el fallo del pipeline (recibe
  nichos.canal.envio_fallido o RPC directo) e intenta reintento; si se agota la
  alternativa o el fallo no es reintentable, DERIVA a puente-humano (D2) por evento
  con paquete cerrado (SolicitudDecision). Úsala para operar, depurar o extender el
  puente, o para entender su contrato de eventos y reglas de negocio (reintento
  mecánico antes que humano, fallos no reintentables).
when-to-use: >-
  - Cuando necesites manejar un fallo del ciclo del pipeline (RPC nichos.fallo.manejar.request
    o fire-and-forget nichos.canal.envio_fallido) con reintento mecánico o deriva a puente humano.
  - Cuando depures por qué un fallo se reintentó (REINTENTO_MECANICO), se escaló a humano
    (PUENTE_HUMANO) o se rechazó (fallo/project_id ausente → 400 INVALID_INPUT).
  - Cuando quieras entender el patrón PUENTE stateless (sin PosPersistencia, contadores en
    memoria) y el desacople por evento con canal-supervision (G1) / puente-humano (D2).
  - Cuando vayas a escribir/ampliar el test unitario del puente.
tags: [enki, modulo, puente, stateless, nichos, radar, fallo, reintento, escalar, puente-humano, proyecto-3d]
---

# manejo-fallo — PUENTE STATELESS (L3) del fallo del ciclo del Radar

## Qué hace el módulo

`manejo-fallo` es un **PUENTE STATELESS** (L3): gestiona el **fallo del ciclo del pipeline** de
nichos. Ante un fallo (un envío del canal que falló vía `nichos.canal.envio_fallido`, o un fallo
declarado vía RPC directo) intenta un **REINTENTO MECÁNICO** hasta un máximo (**3**, `MAX_REINTENTOS`).
Si se agota la alternativa o el fallo **no es reintentable** → **DERIVA a puente-humano (D2) por
evento** con paquete cerrado (SolicitudDecision). El reintento mecánico SIEMPRE va ANTES de escalar
a humano (regla de la hoja L3).

Es un **PUENTE** (patrón real, stateless): **sin PosPersistencia**, solo cuenta intentos en memoria
(`this._intentos` Map fallo_id → intentos). Comunica con el exterior **por evento** (canal-supervision
G1 / puente-humano D2), **nunca con un vendor concreto**.

Fallos **no reintentables** (`NO_REINTENTABLES`, Set): `UPSTREAM_UNREACHABLE` (recurso inexistente),
`PERMISSION_DENIED` (sin permiso → acción humana), `INVALID_INPUT` (payload corrupto → revisión
humana). Estos derivan directo a humano.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `nichos.fallo.manejar.request` | `onManejarRequest` | RPC puro: {project_id, fallo} → reintento mecánico o deriva a puente humano. Fallo falta/inválido o project_id faltante → error determinista nichos.fallo.manejar.failed. Éxito → publica nichos.fallo_manejado (+ nichos.puente_solicitado si escala a humano) y responde por nichos.fallo.manejar.response. |
| `nichos.canal.envio_fallido` | `onEnvioFallido` | Fire-and-forget (canal-supervision G1): un envío del canal falló → el puente lo maneja (reintento mecánico o deriva a humano). Publica nichos.fallo_manejado o nichos.fallo.manejar.failed. |
| `project.activated` | `onProjectActivated` | Puente sin estado: solo registra el proyecto activo para enriquecer los fallos derivados. |

### Publishes

| Evento | Descripción |
|---|---|
| `nichos.fallo_manejado` | Fire-and-forget (L3): un fallo del ciclo fue tramitado → {project_id, fallo_id, reintentado, intento, max_reintentos, resolucion:'REINTENTO_MECANICO'\|'PUENTE_HUMANO'}. Reintento mecánico ANTES de escalar a humano. |
| `nichos.puente_solicitado` | Fire-and-forget (L3→D2): el fallo no se resolvió por reintento mecánico → se deriva a puente humano con paquete cerrado (SolicitudDecision). Lo consume cola-decisiones-gate (K2) y lo entrega canal-supervision (G1). |
| `nichos.fallo.manejar.failed` | Par de fallo determinista (L3): el fallo no pudo tramitarse (fallo faltante/inválido o project_id faltante) → {status, code, mensaje, data}. Cierra el ciclo de nichos.fallo.manejar.request. |

> **Nota (honestidad sobre el código real)**: además del shape descrito en module.json, el evento
> `nichos.puente_solicitado` que index.js publica en `_manejar` (línea 141) lleva un **paquete
> cerrado real** con `{ project_id, nicho, problema, dudas:[{codigo, causa}], estado:'PENDIENTE',
> paquete_cerrado:true, derivado_en }` — la SolicitudDecision completa. Documentado tal cual.

> **Nota (honestidad sobre el código real)**: en `onEnvioFallido`, si el fallo no trae `project_id`
> se usa `this.project_id` (activo); el `fallo` que se pasa a `_manejar` se construye con default
> `tipo:'CANAL_ENVIO'`, `codigo: d.code || d.error?.code || 'UPSTREAM_UNREACHABLE'`, `mensaje`. El
> resultado de `onEnvioFallido` **no** se responde por ningún `.response` (es fire-and-forget puro):
> solo publica `nichos.fallo_manejado` o `nichos.fallo.manejar.failed`.

> **Nota: no está en module.json pero sí lo emite `_atender` (modulo-hibrido-reflejo)**:
> ante una excepción inesperada en la proyección, se responde por el canal de la response con
> `{ status: 500, code: 'UNKNOWN_ERROR', mensaje: err.message }`.

## Reglas de negocio

1. **Reintento mecánico ANTES de escalar a humano**: `_manejar` decide `reintentable =
   this._esReintentable(fallo)` y `reintentado = reintentable && this._reintentarMecanico(fallo)`.
   Si `reintentado` es true → responde `200` con `resolucion:'REINTENTO_MECANICO'` (no escala).
2. **Límite de reintentos `MAX_REINTENTOS = 3` (ABIERTO)**: `_reintentarMecanico` incrementa el
   contador por `fallo.id` (o `'default'`); si `actual >= 3` → `false` (agotado → escalar). El
   `_intentos` es un Map en memoria (puente stateless, sin persistencia).
3. **Fallos no reintentables → deriva directa a humano**: `_esReintentable` es false si `codigo`
   (`fallo.codigo || fallo.code`) ∈ `NO_REINTENTABLES` (`UPSTREAM_UNREACHABLE` | `PERMISSION_DENIED`
   | `INVALID_INPUT`). Un fallo no reintentable **nunca se reintenta**, escala directo a
   puente-humano.
4. **Escalar a humano = publicar `nichos.puente_solicitado`**: en `_manejar`, cuando no hay
   reintento (agotado o no reintentable), se construye el paquete cerrado con `_derivarASinAlternativa`
   `{ ...fallo, project_id: pid }` y causa (`'reintentos agotados (max 3)'` o
   `'fallo no reintentable (<codigo>)'`), se publica `nichos.puente_solicitado` y responde `200` con
   `resolucion:'PUENTE_HUMANO'`, `escalado_humano:true`, `paquete_cerrado:true`. module.json lo
   marca como `nichos.fallo_manejado` + `nichos.puente_solicitado` para el mismo tramite.
5. **Input inválido → `400 INVALID_INPUT`**: en `_manejar`, si `input.fallo` no es objeto → failed
   con `fallo`; si `project_id` ausente (ni input ni activo) → failed con `project_id`. El handler
   publica `nichos.fallo.manejar.failed` con `{status, code, field}`.
6. **Regla de cierre de círculo**: en `onManejarRequest` (y `onEnvioFallido`), éxito (status 200) →
   publica `nichos.fallo_manejado` (y si escaló, ya se publicó `nichos.puente_solicitado` en
   `_manejar`); fallo → publica `nichos.fallo.manejar.failed`. El RPC responde por
   `nichos.fallo.manejar.response`; el fire-and-forget no responde.

## Cómo se usa (RPCs)

RPC que responde en `nichos.fallo.manejar.response`:

### 1. `manejar` — manejar un fallo del ciclo (reintento mecánico o deriva a humano)

```json
{
  "project_id": "e57a318a-...",
  "fallo": { "id": "fallo_abc", "codigo": "TIMEOUT_ENVIO", "mensaje": "el canal no acuso en 30s" }
}
```
Respuesta `200` (reintento mecánico, primer intento) + publica `nichos.fallo_manejado`:
```json
{
  "status": 200,
  "data": {
    "project_id": "e57a318a-...",
    "fallo_id": "fallo_abc",
    "reintentado": true,
    "intento": 1,
    "max_reintentos": 3,
    "resolucion": "REINTENTO_MECANICO"
  }
}
```

### Fallo — deriva a puente humano (reintentos agotados o no reintentable)

Reintentando el mismo fallo hasta agotar `max_reintentos`, la respuesta pasa a:
```json
{
  "status": 200,
  "data": {
    "project_id": "e57a318a-...",
    "fallo_id": "fallo_abc",
    "reintentado": false,
    "escalado_humano": true,
    "resolucion": "PUENTE_HUMANO",
    "causa": "reintentos agotados (max 3)",
    "paquete_cerrado": true
  }
}
```
Y adicionalmente publica `nichos.puente_solicitado` con el paquete cerrado (SolicitudDecision).

### Fallo — payload inválido

```json
{ "project_id": "e57a318a-..." }
```
Respuesta `400` + `nichos.fallo.manejar.failed`:
```json
{ "status": 400, "code": "INVALID_INPUT", "mensaje": "fallo requerido", "data": { "field": "fallo" } }
```

### Fire-and-forget — `nichos.canal.envio_fallido` (canal-supervision G1)

```json
{ "project_id": "e57a318a-...", "code": "TIMEOUT_ENVIO", "mensaje": "sin ack" }
```
`onEnvioFallido` construye `fallo={tipo:'CANAL_ENVIO', codigo:'TIMEOUT_ENVIO', mensaje:'sin ack'}`,
origen `'canal'`, y publica `nichos.fallo_manejado` (o `nichos.fallo.manejar.failed`).

## Tests

El test vive en `tests/unit/manejo-fallo.test.js`. Cubre (del código real):

- `manejar` con fallo reintentable dentro del límite → `200`, `resolucion:'REINTENTO_MECANICO'`,
  incrementa el contador y publica `nichos.fallo_manejado`.
- `manejar` con fallo reintentable agotado (3) → `200`, `resolucion:'PUENTE_HUMANO'`, publica
  `nichos.puente_solicitado` y `nichos.fallo_manejado`.
- `manejar` con fallo no reintentable (`UPSTREAM_UNREACHABLE` | `PERMISSION_DENIED` | `INVALID_INPUT`)
  → deriva directo a humano (sin reintentar), publica `nichos.puente_solicitado`.
- `manejar` sin `fallo` o sin `project_id` → `400 INVALID_INPUT` + `nichos.fallo.manejar.failed`.
- `onEnvioFallido` (fire-and-forget) → construye el fallo y publica `nichos.fallo_manejado`.
- `project.activated` registra el `project_id` activo (puente sin persistencia).

Para ejecutarlo:
```bash
cd /home/admin/3enki/modules/nichos/manejo-fallo
node tests/unit/manejo-fallo.test.js
```

## Notas de implementación

- Clase `ManejoFallo extends ModuloHibridoReflejo`; `name = 'manejo-fallo'`,
  `version = 'reflejo-0.1.0'`. Sin store ni PosPersistencia (puente stateless): `this._intentos` Map
  (fallo_id → intentos) en memoria + `this.project_id` (activo).
- **Constantes**: `MAX_REINTENTOS = 3`; `NO_REINTENTABLES = new Set(['UPSTREAM_UNREACHABLE',
  'PERMISSION_DENIED', 'INVALID_INPUT'])`.
- **Escritura de dominio**: `onManejarRequest` delega en `_atender(e,'manejar',
  'nichos.fallo.manejar.response',fn)` y publica `nichos.fallo_manejado`/`nichos.fallo.manejar.failed`;
  `onEnvioFallido` (fire-and-forget) hace lo mismo sin response.
- Proyecciones puras: `_manejar` (orquestador: reintento → humano), `_reintentarMecanico` (contador),
  `_esReintentable` (Set), `_derivarASinAlternativa` (paquete cerrado D2).
- `onUnload` es `return super.onUnload()` (no hay persistencia que volcar).
- Tools: `toolManejar(params)`, `toolReintentarMecanico(fallo)`.
- DEP: escucha `nichos.canal.envio_fallido` (canal-supervision G1); publica `nichos.puente_solicitado`
  que consumen `cola-decisiones-gate` (K2) y `canal-supervision` (G1); `nichos.fallo_manejado` es el
  tramite del fallo. Es el L3 de la cadena de soporte del `pipeline-por-nicho` (L1).
