---
name: captura-semilla
description: >
  Skill FULL del módulo REFLEJO `captura-semilla` de la vertical nichos
  (Radar de Nichos, proyecto 3D). Acepta y formatea la SEMILLA (la palabra/idea
  que el dueño da para arrancar la búsqueda de nichos), valida que no esté vacía
  ni malformada, rechaza vacíos con error determinista y emite que la semilla fue
  capturada. Úsala para operar, depurar o extender el reflejo, o para entender su
  contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites aceptar/formatear la semilla inicial del dueño para arrancar
    la búsqueda de nichos (RPC nichos.semilla.aceptar.request).
  - Cuando depures por qué una semilla vacía no se acepta (par determinista
    SEMILLA_VACIA) o no se emite nichos.semilla.capturada.
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    reglas de negocio del arranque del flujo de nichos.
  - Cuando vayas a escribir/ampliar el test unitario del reflejo captura-semilla.
tags: [enki, modulo, reflejo, nichos, radar, semilla, proyecto-3d]
---

# captura-semilla — REFLEJO de la semilla del Radar de Nichos

## Qué hace el módulo

`captura-semilla` es un **REFLEJO JS PURO** (cero LLM, cero estado, cero red): es el
**A1** del flujo de arranque del Radar de Nichos. Cada op es una función pura (entra
objeto, sale objeto). Acepta `{project_id, mensaje}` → devuelve la semilla formateada
y, con éxito, emite `nichos.semilla.capturada`. Si la semilla viene vacía o malformada
**no la inventa**: responde un error determinista `400 SEMILLA_VACIA` y cierra el círculo
con el par `nichos.semilla.aceptar.failed`.

Sin store y sin custodio: **no persiste nada**. Solo registra en memoria el
`project_id` activo (contexto) al recibir `project.activated`. Es la puerta de entrada
del flujo: sin semilla capturada no arranca la búsqueda.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `nichos.semilla.aceptar.request` | `onAcceptRequest` | RPC puro: {project_id, mensaje} → semilla formateada. Valida vacíos/formato; mensaje vacío o no string → error determinista. Éxito → publica `nichos.semilla.capturada` y responde por `nichos.semilla.aceptar.response`. |
| `project.activated` | `onProjectActivated` | Reflejo sin estado: registra el project_id activo para scope del contexto; no persiste nada. Responde `200 {project_id}`. |

### Publishes

| Evento | Descripción |
|---|---|
| `nichos.semilla.capturada` | Fire-and-forget: la semilla del dueño fue aceptada y formateada → {project_id, semilla, formateada, capturada}. La consumen normalizacion-semilla (A2) y el pipeline-por-nicho (L1). |
| `nichos.semilla.aceptar.failed` | Par de fallo determinista: la semilla llegó vacía o malformada → {status:400, code:'SEMILLA_VACIA', mensaje}. Cierra el círculo de nichos.semilla.aceptar.request. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí el único par posible es `nichos.semilla.aceptar.failed`, emitido cuando `_aceptar`
> devuelve un status distinto de 200 (semilla vacía).

## Reglas de negocio

1. **CERO semillas inventadas (honestidad)**: `_formatear` acepta la semilla solo si es
   un `string` que, tras normalizar, no queda vacío. Si no es string o queda vacía →
   retorna `null` y `_aceptar` responde `400` + `nichos.semilla.aceptar.failed` con
   `{ status: 400, code: 'SEMILLA_VACIA', mensaje: 'la semilla esta vacia o no es un texto util' }`.
2. **Aceptar = formatear + emitir**: `_formatear` normaliza la semilla haciendo
   `trim()` + colapsar espacios múltiples (`/\s+/g → ' '`). Con éxito devuelve
   `{ project_id, semilla: normalizada, formateada: true, capturada: true }`.
3. **Fire-and-forget de dominio**: `onAcceptRequest` publica `nichos.semilla.capturada`
   (`res.data`) si `status === 200`; si no, publica `nichos.semilla.aceptar.failed` (`res`).
   El response siempre se responde por `nichos.semilla.aceptar.response`.
4. **Sin estado (reflejo)**: `project.activated` solo memoriza `project_id` en memoria
   (`this.project_id`); no hay PosPersistencia ni store. El `project_id` del request
   tiene preferencia sobre el activo (`project_id || this.project_id`).
5. **HTTP exacto**: éxito `200`; semilla vacía/malformada → `400`.

## Cómo se usa (RPCs)

RPC request/response que responde en `nichos.semilla.aceptar.response`:

### 1. `aceptar` — capturar y formatear la semilla inicial

```json
{
  "project_id": "e57a318a-...",
  "mensaje": "   impresion 3D   por   demanda   "
}
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "semilla": "impresion 3D por demanda", "formateada": true, "capturada": true }
```
Emite `nichos.semilla.capturada` con ese mismo `data`.

### Fallo — semilla vacía o no string

```json
{ "project_id": "e57a318a-...", "mensaje": "   " }
```
Respuesta `400` + `nichos.semilla.aceptar.failed`:
```json
{ "status": 400, "code": "SEMILLA_VACIA", "mensaje": "la semilla esta vacia o no es un texto util", "project_id": "e57a318a-..." }
```

## Tests

El test vive en `tests/unit/captura-semilla.test.js`. Cubre:

- `aceptar` con semilla válida → `200`, semilla formateada (trim + colapso de espacios)
  y emite `nichos.semilla.capturada`.
- Semilla vacía (`"   "`) o no-string → `400` + `nichos.semilla.aceptar.failed`
  (`SEMILLA_VACIA`).
- `project.activated` registra el `project_id` de contexto.

Para ejecutarlo:

```bash
cd /home/admin/3enki/modules/nichos/captura-semilla
node tests/unit/captura-semilla.test.js
```

## Notas de implementación

- Clase `CapturaSemilla extends ModuloHibridoReflejo`; `name = 'captura-semilla'`,
  `version = 'reflejo-0.1.0'`.
- Sin store ni PosPersistencia: `this.project_id` (memoria) como único estado.
- `onAcceptRequest` delega en `_atender(e, 'aceptar', 'nichos.semilla.aceptar.response', fn)`
  y hace el fire-and-forget de dominio (`capturada` o `failed`) dentro de ese handler.
- Proyecciones puras: `_aceptar` (valida + formatea + prepara evento) y `_formatear`
  (normalización del string).
- DEP hacia delante: la consume `normalizacion-semilla` (A2) vía `nichos.semilla.capturada`.
