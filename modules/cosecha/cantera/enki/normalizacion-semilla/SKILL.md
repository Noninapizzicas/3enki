---
name: normalizacion-semilla
description: >
  Skill FULL del módulo MICRO-AGENTE (fuzzy) `normalizacion-semilla` de la vertical
  nichos (Radar de Nichos). Recibe la semilla capturada por captura-semilla (A1) y la
  DESAMBIGUA a intenciones de búsqueda claras (producto/servicio, audiencia,
  territorio). Úsala para operar, depurar o extender el juicio de la búsqueda, o para
  entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites desambiguar una semilla cruda a intenciones de búsqueda claras
    (RPC nichos.semilla.normalizar.request).
  - Cuando depures por qué el juicio no entrega intenciones (SIN_INTENCIONES), cae al
    fallback reflejo, o por qué la semilla vacía no se desambigua (SEMILLA_VACIA).
  - Cuando quieras entender el patrón híbrido reflexivo+fuzzy (llm.complete.request
    con guion-prompt self-contained y fallback determinista por reglas).
  - Cuando vayas a escribir/ampliar el test unitario del micro-agente.
tags: [enki, modulo, micro-agente, fuzzy, nichos, radar, semilla, proyecto-3d]
---

# normalizacion-semilla — MICRO-AGENTE (fuzzy) de la búsqueda del Radar

## Qué hace el módulo

`normalizacion-semilla` es un **MICRO-AGENTE HÍBRIDO** (el juicio de la búsqueda). Recibe
la semilla capturada por `captura-semilla` (A1) — la palabra/idea cruda del dueño,
p. ej. `'quiero vender salsa picante'` — y la **DESAMBIGUA a intenciones de búsqueda
claras**: qué producto/servicio, a qué audiencia, en qué territorio.

Dos mitades (patrón real de `prisma/formulador`):

- **REFLEJO** (`_normalizarEstructura`): mecánico y determinista. Normaliza el texto
  (`trim` + colapso de espacios) y lo trocea en señales de producto/audiencia/lugar/verbo.
- **FUZZY** (`_desambiguar`): juicio LLM. Una llamada headless a `llm.complete.request` con un
  guion-prompt self-contained (`GUION_DESAMBIGUAR`) que genera una lista de intenciones
  en JSON tipado validado.

Si el LLM falla o no cumple el contrato, **el fallback reflejo por reglas garantiza al
menos una intención útil** (no deja el pipeline roto). Si ni así hay intenciones
interpretables → falla honesto con el par determinista. **NUNCA inventa**: no fabrica
producto ni audiencia que no estén en la semilla. Sin store, sin custodio: entra semilla,
sale intenciones.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `nichos.semilla.normalizar.request` | `onNormalizarRequest` | RPC híbrido: {project_id, semilla, formateada} → {semilla, intenciones:[{tipo, producto, audiencia, lugar, confianza}], normalizada}. Desambiguación fuzzy (llm.complete.request) con fallback reflejo determinista por reglas; semilla vacía → error determinista. Éxito → publica `nichos.semilla.normalizada` y responde por `nichos.semilla.normalizar.response`. |

### Publishes

| Evento | Descripción |
|---|---|
| `nichos.semilla.normalizada` | Fire-and-forget (A2): la semilla fue desambiguada a N intenciones de búsqueda claras → {project_id, semilla, intenciones, normalizada}. La consume sondeo-territorio (B1) y el pipeline-por-nicho (L1). |
| `nichos.semilla.normalizar.failed` | Par de fallo determinista: la semilla llegó vacía o el juicio de desambiguación no entregó intenciones interpretables → {status, code, mensaje, data}. Cierra el círculo de nichos.semilla.normalizar.request. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico. Aquí el
> único par posible es `nichos.semilla.normalizar.failed` (semilla vacía o sin intenciones).

> **Nota: `project.activated` NO está en module.json ni como handler** en index.js — este
> micro-agente es stateless y no se subscribe a él (aunque conserva `project_id`).

## Reglas de negocio

1. **NUNCA inventar intenciones (honestidad)**: el juicio (LLM o reflejo) usa SOLO lo que
   esté en la semilla. Si falta audiencia/lugar, van `null`. `_validarIntenciones` descarta
   las intenciones sin NINGUNA señal (`filter(i => i.producto || i.audiencia || i.lugar)`).
2. **Semilla vacía/malformada → `400 SEMILLA_VACIA`** + `nichos.semilla.normalizar.failed`
   con `{ status: 400, code: 'SEMILLA_VACIA', mensaje: 'la semilla esta vacia o no es util para desambiguar' }`.
3. **Fallback reflejo (no romper el pipeline)**: si `_desambiguar` (LLM) retorna `null` o
   ninguna intención válida, se llama `_desambiguarReflejo`, que extrae por reglas el
   `producto` (recortando el verbo de negocio) y detecta señales `para X`/`a X` (audiencia)
   y `en X` (lugar), con `confianza` 0.7 (con verbo, tipo `producto`) o 0.4 (sin verbo, tipo `territorio`).
4. **Sin intenciones interpretables → `502 SIN_INTENCIONES`** + `nichos.semilla.normalizar.failed`
   con `{ status: 502, code: 'SIN_INTENCIONES', mensaje: 'el juicio no pudo extraer intenciones interpretables de la semilla' }`.
   Avisa (502 = juicio LLM degradado), no inventa.
5. **Contrato LLM validado**: `_validarIntenciones` acepta `tipo` ∈ {producto, servicio,
   audiencia, territorio} (default `producto`), trimea `producto`/`audiencia`/`lugar`
   (null si vacíos) y normaliza `confianza` a `[0,1]` (default `0.5`).
6. **`llm.complete.request` es una llamada RPC externa headless** con
   `{ system: GUION_DESAMBIGUAR, messages:[{role:'user', content: JSON.stringify({semilla})}], tools:[], settings:{temperature:0.2} }`,
   `timeout_ms: 30000`, y `.catch(() => null)` (si el proveedor falla → fallback reflejo).
7. **Sin estado (micro-agente stateless)**: `project_id` del request tiene preferencia
   sobre el de contexto; no hay PosPersistencia ni store.

## Cómo se usa (RPCs)

RPC request/response que responde en `nichos.semilla.normalizar.response`:

### 1. `normalizar` — desambiguar la semilla a intenciones

```json
{
  "project_id": "e57a318a-...",
  "semilla": "quiero vender salsa picante a restaurantes",
  "formateada": true
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "semilla": "quiero vender salsa picante a restaurantes",
  "intenciones": [
    { "tipo": "producto", "producto": "salsa picante", "audiencia": "restaurantes", "lugar": null, "confianza": 0.9 }
  ],
  "normalizada": true
}
```
Emite `nichos.semilla.normalizada` con ese mismo `data`.

### Fallo — semilla vacía

```json
{ "project_id": "e57a318a-...", "semilla": "   " }
```
Respuesta `400` + `nichos.semilla.normalizar.failed`:
```json
{ "status": 400, "code": "SEMILLA_VACIA", "mensaje": "la semilla esta vacia o no es util para desambiguar", "project_id": "e57a318a-..." }
```

### Fallo — juicio sin intenciones interpretables

```json
{ "project_id": "e57a318a-...", "semilla": "xyz qwerty" }
```
Respuesta `502` + `nichos.semilla.normalizar.failed`:
```json
{ "status": 502, "code": "SIN_INTENCIONES", "mensaje": "el juicio no pudo extraer intenciones interpretables de la semilla", "project_id": "e57a318a-...", "semilla": "xyz qwerty" }
```

## Tests

El test vive en `tests/unit/normalizacion-semilla.test.js`. Cubre:

- `normalizar` con semilla válida → `200`, normaliza la estructura (trim + colapso) y
  entrega intenciones; emite `nichos.semilla.normalizada`.
- Semilla vacía → `400` + `nichos.semilla.normalizar.failed` (`SEMILLA_VACIA`).
- Si el LLM falla/no cumple contrato → cae al fallback reflejo `_desambiguarReflejo` (≥1 intención).
- Si ni el LLM ni el fallback entregan intenciones → `502 SIN_INTENCIONES` + failed.
- `_validarIntenciones` descarta intenciones sin señal y normaliza `confianza`/`null`.

Para ejecutarlo:

```bash
cd /home/admin/3enki/modules/nichos/normalizacion-semilla
node tests/unit/normalizacion-semilla.test.js
```

## Notas de implementación

- Clase `NormalizacionSemilla extends ModuloHibridoReflejo`; `name = 'normalizacion-semilla'`,
  `version = 'reflejo-0.1.0'`. Sin store ni PosPersistencia (stateless).
- `onNormalizarRequest` delega en `_atender(e, 'normalizar', 'nichos.semilla.normalizar.response', fn)`
  y publica el fire-and-forget de dominio (`normalizada` si `status===200`, si no `failed`).
- `_normalizar` orquesta: reflejo (`_normalizarEstructura`) → fallback `_desambiguarReflejo` → error honesto.
- `_desambiguar` hace 1 llamada `this._rpc('llm.complete.request', ...)` headless (sin tools)
  con el `GUION_DESAMBIGUAR` self-contained y `temperature: 0.2`, `timeout_ms: 30000`.
- `_parse` tolera fences ```` ```json ````, texto y objetos crudos al extraer el JSON.
- DEP hacia delante: la consume `sondeo-territorio` (B1) vía `nichos.semilla.normalizada`.
