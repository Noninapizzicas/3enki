---
name: puente-humano
description: >
  Skill FULL del módulo PUENTE `puente-humano` de la vertical nichos (Radar de
  Nichos, proyecto 3D). Es la EXCEPCIÓN del sistema: cuando el sistema no sabe,
  presenta nicho+problema+dudas al admin por EVENTO con paquete cerrado
  (SolicitudDecision). Es un tapón humano de Nichos, nunca el flujo normal: se
  activa por un BLOQUEO que el sistema no puede resolver solo (construir sin
  alternativa, autorizar). Detecta/arma el paquete cerrado de dudas y enruta la
  solicitud hacia el dueño (vía canal-supervision G1). Sin persistencia: solo
  enruta/comunica con el exterior; NUNCA lo resuelve. Úsala para operar, depurar o
  extender el puente, o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites presentar un bloqueo no resoluble por el sistema al dueño
    (RPC nichos.puente.solicitar.request).
  - Cuando depures por qué una solicitud no se arma (NICHO_INVALIDO o
    PROBLEMA_INVALIDO por bloqueo incompleto) o por qué se emite
    nichos.puente_solicitado.
  - Cuando quieras entender el patrón de puente humano (excepción, tapón, nunca
    resuelve) y su contrato de eventos.
  - Cuando vayas a escribir/ampliar el test unitario del puente puente-humano.
tags: [enki, modulo, puente, stateless, nichos, radar, humano, decision, excepcion, proyecto-3d]
---

# puente-humano — PUENTE STATELESS de la EXCEPCIÓN del sistema

## Qué hace el módulo

`puente-humano` es un **PUENTE STATELESS** (D2, hoja del plan): la **EXCEPCIÓN del
sistema** — cuando el sistema **no sabe**, presenta `nicho + problema + dudas` al
admin **por EVENTO** con **paquete cerrado** (`SolicitudDecision`). Es un tapón
humano de Nichos, **nunca el flujo normal**: se activa por un **BLOQUEO** que el
sistema no puede resolver solo (construir sin alternativa, autorizar).

Cero persistencia, cero store: cada op entra objeto, sale objeto. Dos proyecciones
puras:

- **`_detectarBloqueo`**: valida que llegue un bloqueo real (`nicho` + `problema`)
  y arma el paquete cerrado de dudas a resolver por el dueño.
- **`_emitirSolicitud`**: enruta el paquete cerrado (`nicho + problema + dudas`)
  → `SolicitudDecision` al canal de supervision; publica `nichos.puente_solicitado`.

El puente comunica con el exterior (el humano), **no decide por su cuenta ni lo
resuelve** (la decisión NO la toma el sistema).

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `nichos.puente.solicitar.request` | `onSolicitarRequest` | RPC puro: {project_id, nicho, problema, dudas?} → SolicitudDecision cerrada. Detecta el bloqueo (reflejo: valida nicho+problema), arma el paquete cerrado de dudas y enruta la solicitud hacia el dueño. Nicho o problema faltante → error determinista `nichos.puente.solicitar.failed`. Éxito → publica `nichos.puente_solicitado` y responde por `nichos.puente.solicitar.response`. |

### Publishes

| Evento | Descripción |
|---|---|
| `nichos.puente_solicitado` | Fire-and-forget (D2): un bloqueo no resoluble por el sistema fue presentado al admin → {tipo, nicho, problema, dudas, estado:'PENDIENTE', paquete_cerrado:true, solicitado_en}. Lo consume cola-decisiones-gate (K2) y la entrega el canal-supervision (G1). |
| `nichos.puente.solicitar.failed` | Par de fallo determinista (D2): la solicitud al humano no pudo armarse (nicho o problema faltante/invalido) → {status, code, mensaje, data}. Cierra el circulo de `nichos.puente.solicitar.request`. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `nichos.puente.solicitar.failed` cierra `nichos.puente.solicitar.request`
> cuando `_solicitar` devuelve status ≠ 200 (NICHO_INVALIDO o PROBLEMA_INVALIDO).

## Reglas de negocio

1. **Nicho obligatorio → `400 NICHO_INVALIDO`**: `_detectarBloqueo` exige `nicho`
   objeto. Si falta o no es objeto →
   `{ status:400, code:'NICHO_INVALIDO', mensaje:'el nicho es obligatorio para presentar el bloqueo al humano' }`
   + `nichos.puente.solicitar.failed`.
2. **Problema obligatorio → `400 PROBLEMA_INVALIDO`**: exige `problema` string
   no vacío (tras trim) →
   `{ status:400, code:'PROBLEMA_INVALIDO', mensaje:'el problema a resolver es obligatorio' }`
   + failed.
3. **Paquete cerrado (nicho+problema+dudas)**: `_emitirSolicitud` arma una
   `SolicitudDecision` autocontenida: `{ tipo:'puente_humano', nicho, problema,
   dudas, estado:'PENDIENTE', paquete_cerrado:true, solicitado_en }`. El `nicho`
   emitido es `producto || servicio || nombre || id`. `dudas` por defecto
   `['decide sobre este bloqueo']` si no llegan.
4. **NUNCA resuelve**: el puente solo detecta/arma/enruta la solicitud; la decisión
   la toma el humano (`excepcion: true` en `_detectarBloqueo`). No hay lógica que
   decida por el sistema.
5. **HTTP exacto**: éxito `200`; bloqueo incompleto → `400` (NICHO_INVALIDO /
   PROBLEMA_INVALIDO); excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPC request/response que responde en `nichos.puente.solicitar.response`:

### 1. `solicitar` — presentar un bloqueo no resoluble al humano

```json
{
  "project_id": "e57a318a-...",
  "nicho": { "producto": "salsa picante", "audiencia": "restaurantes" },
  "problema": "El ensamblador no encuentra una capacidad de cobro para montar la solucion.",
  "dudas": ["¿Qué pasarela de pago habilitamos?", "¿Autorizas crear la capacidad?"]
}
```
Respuesta `200`:
```json
{
  "tipo": "puente_humano",
  "nicho": "salsa picante",
  "problema": "El ensamblador no encuentra una capacidad de cobro para montar la solucion.",
  "dudas": ["¿Qué pasarela de pago habilitamos?", "¿Autorizas crear la capacidad?"],
  "estado": "PENDIENTE",
  "paquete_cerrado": true,
  "solicitado_en": "2026-09-25T..."
}
```
Emite `nichos.puente_solicitado` con ese mismo `data`.

### Fallo — problema faltante

```json
{ "project_id": "e57a318a-...", "nicho": { "producto": "salsa" } }
```
Respuesta `400` + `nichos.puente.solicitar.failed`:
```json
{ "status": 400, "code": "PROBLEMA_INVALIDO", "mensaje": "el problema a resolver es obligatorio", "project_id": "e57a318a-..." }
```

## Tests

El test vive en `tests/unit/puente-humano.test.js`. Cubre:

- `solicitar` con nicho + problema válidos → `200`, arma la `SolicitudDecision`
  cerrada (tipo puente_humano, estado PENDIENTE, paquete_cerrado true) y emite
  `nichos.puente_solicitado`.
- `solicitar` sin nicho → `400 NICHO_INVALIDO` + failed.
- `solicitar` sin problema (o vacío) → `400 PROBLEMA_INVALIDO` + failed.
- `dudas` vacías → por defecto `['decide sobre este bloqueo']`.
- Confirmar que el puente nunca emite decisión (solo solicita).

Para ejecutarlo:

```bash
cd /home/admin/3enki/modules/nichos/puente-humano
node tests/unit/puente-humano.test.js
```

## Notas de implementación

- Clase `PuenteHumano extends ModuloHibridoReflejo`; `name = 'puente-humano'`,
  `version = 'reflejo-0.1.0'`. Sin store ni PosPersistencia (stateless). No escucha
  `project.activated` (puente agnóstico al proyecto): `this.project_id` solo se
  propaga desde el request (`_solicitar` usa `project_id || this.project_id`, que
  queda null si no se pasó).
- `onSolicitarRequest` delega en `_atender(e, 'solicitar',
  'nichos.puente.solicitar.response', fn)` y publica `nichos.puente_solicitado` en
  200 o `nichos.puente.solicitar.failed` si no.
- `_solicitar` encadena `_detectarBloqueo` (valida y arma el paquete) →
  `_emitirSolicitud` (arma la SolicitudDecision autocontenida).
- DEP hacia delante: lo consume cola-decisiones-gate (K2) y lo entrega
  canal-supervision (G1).
