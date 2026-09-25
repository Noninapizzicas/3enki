---
name: gestion-limites-fuente
description: >
  Skill FULL del módulo REFLEJO `gestion-limites-fuente` de la vertical nichos
  (Radar de Nichos). Política determinista de límites/cola/rate de consultas a las
  fuentes de datos para no quemar el recurso: dado el límite declarado de una fuente
  (J1) y las consultas ya hechas (input, stateless), decide si PERMITE la siguiente
  consulta, la ENCOLA o la DENIEGA. Úsala para operar, depurar o extender el reflejo,
  o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites dosificar un pedido de consulta contra el límite declarado de una
    fuente (RPC nichos.fuente.dosificar.request) o encolar una consulta (RPC nichos.fuente.encolar.request).
  - Cuando depures por qué una consulta se deniega (colas llenas / límite declarado faltante)
    o no se dosifica (LIMITE_FALTANTE / INVALID_INPUT).
  - Cuando quieras entender el patrón stateless de política de rate (PERMITIR|ENCOLAR|DENEGAR)
    y su contrato de eventos.
  - Cuando vayas a escribir/ampliar el test unitario del reflejo.
tags: [enki, modulo, reflejo, nichos, radar, fuentes, rate-limit, proyecto-3d]
---

# gestion-limites-fuente — REFLEJO de la política de rate del Radar

## Qué hace el módulo

`gestion-limites-fuente` es un **REFLEJO JS PURO** (J3, político): gestiona los
límites/cola/rate de consultas a las fuentes de datos para **no quemar el recurso**
(rate limit, cola de consultas, presupuesto por fuente). Es una política **DETERMINISTA**:
dado el límite declarado de una fuente y las consultas ya hechas (ambas llegan **por
input, STATELESS** — no persiste nada), decide si permite la siguiente consulta, la
encola o la deniega.

Sin estado, sin red, sin store: cada op es una función pura. Dos cálculos:

- `_dosificar`: dado el límite declarado y las consultas ya hechas → `PERMITIR | ENCOLAR | DENEGAR`.
- `_encolar`: añade una consulta a la cola dada (input) → cola resultante + posición;
  si la cola está llena → `DENEGADO` con par de fallo determinista.

Si falta el límite declarado, **NO inventa uno**: responde el par de fallo con `422`.
Esta política va antes de golpear la fuente: `sondeo-territorio` (B1), `estudio-demanda` (C1)
y `estudio-competencia` (E1) la consultan para respetar el rate.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `nichos.fuente.dosificar.request` | `onDosificarRequest` | RPC puro: {fuente, limite, consultas_hechas, cola_ocupada} → {decision: PERMITIR\|ENCOLAR\|DENEGAR}. Bajo límite → PERMITIR; en o por encima → ENCOLAR (o DENEGAR si la cola está llena). Si falta el límite declarado → error determinista `nichos.fuente.dosificar.failed`. Éxito → publica `nichos.fuente.dosificado` y responde por `nichos.fuente.dosificar.response`. |
| `nichos.fuente.encolar.request` | `onEncolarRequest` | RPC puro: {fuente, solicitud, cola:[], max_cola} → {cola resultante, posicion}. Añade la consulta al final de la cola; si la cola está llena (>= max_cola) → DENEGADO con par de fallo `nichos.fuente.encolar.failed`. Éxito → publica `nichos.fuente.encolado` y responde por `nichos.fuente.encolar.response`. |

### Publishes

| Evento | Descripción |
|---|---|
| `nichos.fuente.dosificado` | Fire-and-forget (J3): un pedido de consulta a una fuente fue dosificado → {fuente, decision, consultas_hechas, limite}. La consumen sondeo-territorio (B1), estudio-demanda (C1) y estudio-competencia (E1) para respetar el rate antes de golpear la fuente. |
| `nichos.fuente.dosificar.failed` | Par de fallo determinista: no se pudo dosificar (falta el límite declarado o input inválido) → {status:400\|422, code, mensaje}. Cierra el círculo de nichos.fuente.dosificar.request. |
| `nichos.fuente.encolado` | Fire-and-forget (J3): una consulta fue encolada → {fuente, solicitud, posicion, total_en_cola}. La consume el propio gestor para despachar la cola sin quemar el rate de la fuente. |
| `nichos.fuente.encolar.failed` | Par de fallo determinista: no se pudo encolar (cola llena o input inválido) → {status, code, mensaje}. Cierra el círculo de nichos.fuente.encolar.request. |

> **Regla de cierre de círculo**: cada flujo cierra su círculo con su par `*.failed`
> canónico: `nichos.fuente.dosificar.failed` y `nichos.fuente.encolar.failed`. Se emiten
> cuando el handler detecta un status distinto de 200 (`_dosificar`/`_encolar` con error).

> **Nota: los pares `*.failed` de dosificar (422 LIMITE_FALTANTE, 429 COLA_LLENA) NO están
> enumerados sueltos en module.json como eventos de dominio**, pero sí se documentan en las
> descripciones de la tabla de publishes y se emiten desde index.js en `onDosificarRequest`/`onEncolarRequest`.

## Reglas de negocio

1. **CERO límites inventados (honestidad)**: `_dosificar` EXIGE el `limite` declarado de la
   fuente. Si `!(Number(limite) >= 0)` → `422 LIMITE_FALTANTE` con
   `"no hay limite declarado para la fuente 'X'; declara uno antes de dosificar"`. No adivina.
2. **Fuente requerida**: `_dosificar` con `fuente` no-string → `400 INVALID_INPUT`
   (`'fuente requerida'`, `{field:'fuente'}`). `_encolar` además exige `solicitud` objeto
   (si no → `400 'solicitud requerida'`, `{field:'solicitud'}`).
3. **Política determinista de rate**: `_dosificar` decide:
   - `hechas < limite` → `PERMITIR` (permitido `true`).
   - si no, `cola_ocupada >= max_cola` → `DENEGAR`.
   - si no → `ENCOLAR`.
   Devuelve `{ fuente, decision, permitido, consultas_hechas, limite, pendientes_hasta_limite }`
   con `pendientes_hasta_limite = max(0, limite - hechas)`.
4. **ENC OLAR con cola llena → DENEGADO**: `_encolar` copia la cola de entrada
   (`Array.isArray(cola) ? cola.slice() : []`), y si `longitud >= max_cola` → `429 COLA_LLENA`
   (`"la cola de la fuente 'X' esta llena (N >= M); deniega sin encolar"`). Encola solo si
   hay hueco; `posicion = longitud + 1`.
5. **Stateless (reflejo)**: el estado llega por input (`consultas_hechas`, `cola_ocupada`,
   `cola`, `max_cola`); no hay tienda, no hay PosPersistencia ni `project.activated`.

## Cómo se usa (RPCs)

RPCs request/response que responden en `*.response`. Dosificar → `nichos.fuente.dosificar.request`,
encolar → `nichos.fuente.encolar.request`.

### 1. `dosificar` — decidir si permitir, encolar o denegar

```json
{ "fuente": "buscador", "limite": 10, "consultas_hechas": 8, "cola_ocupada": 2, "max_cola": 100 }
```
Respuesta `200`:
```json
{ "fuente": "buscador", "decision": "PERMITIR", "permitido": true, "consultas_hechas": 8, "limite": 10, "pendientes_hasta_limite": 2 }
```
Emite `nichos.fuente.dosificado` con ese `data`.

Con `consultas_hechas: 10` (>= limite) y `cola_ocupada: 2` (>0, < max) → `decision: "ENCOLAR"`.

### 2. `encolar` — añadir una consulta a la cola

```json
{ "fuente": "buscador", "solicitud": { "nicho": "salsa picante", "pagina": 2 }, "cola": [], "max_cola": 100 }
```
Respuesta `200`:
```json
{ "fuente": "buscador", "solicitud": { "nicho": "salsa picante", "pagina": 2 }, "posicion": 1, "encolado": true, "total_en_cola": 1, "cola": [ { "nicho": "salsa picante", "pagina": 2, "posicion": 1 } ] }
```
Emite `nichos.fuente.encolado`.

### Fallos típicos

- Límite faltante → `422` `{ status:422, error:{ code:'LIMITE_FALTANTE', message:"no hay limite declarado para la fuente 'X'; declara uno antes de dosificar" } }` + `nichos.fuente.dosificar.failed`.
- Cola llena → `429` `{ status:429, error:{ code:'COLA_LLENA', message:"la cola de la fuente 'X' esta llena (N >= M); deniega sin encolar" } }` + `nichos.fuente.encolar.failed`.
- Sin `fuente` → `400 INVALID_INPUT` + su `*.failed`.

## Tests

El test vive en `tests/unit/gestion-limites-fuente.test.js`. Cubre:

- `dosificar` bajo límite → `PERMITIR` y publica `nichos.fuente.dosificado`; en/por encima
  del límite → `ENCOLAR`; con `cola_ocupada >= max_cola` → `DENEGAR`. Sin `limite` → `422 LIMITE_FALTANTE`
  + `nichos.fuente.dosificar.failed`; sin `fuente` → `400 INVALID_INPUT`.
- `encolar` añade al final (posición correcta) y publica `nichos.fuente.encolado`;
  cola llena → `429 COLA_LLENA` + `nichos.fuente.encolar.failed`; sin `solicitud` → `400`.

Para ejecutarlo:

```bash
cd /home/admin/3enki/modules/nichos/gestion-limites-fuente
node tests/unit/gestion-limites-fuente.test.js
```

## Notas de implementación

- Clase `GestionLimitesFuente extends ModuloHibridoReflejo`; `name = 'gestion-limites-fuente'`,
  `version = 'reflejo-0.1.0'`. Sin store ni PosPersistencia (stateless).
- Handlers RPC delegan en `_atender(e, accion, 'nichos.fuente.<accion>.response', fn)`;
  publican `dosificado`/`encolado` con `status === 200` y `dosificar.failed`/`encolar.failed`
  en cualquier otro caso.
- `_dosificar` y `_encolar` son proyecciones puras (sin IO); la política es determinista
  (no hay aleatoriedad ni heurística).
- DEP hacia delante: lo consumen `sondeo-territorio` (B1), `estudio-demanda` (C1) y
  `estudio-competencia` (E1) vía `nichos.fuente.dosificado`.
