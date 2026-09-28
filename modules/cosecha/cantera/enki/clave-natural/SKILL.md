---
name: clave-natural
description: >
  Skill FULL del módulo REFLEJO `clave-natural` de la vertical contabilidad de Enki
  (M3, hoja del plan). CERROJO 3 · IDEMPOTENCIA: un solo calculador de la clave natural
  del hecho — mismos componentes → mismo hecho → mismo asiento. La clave cuelga de la
  UNIDAD DE CIERRE (A14 anclaje-cierre-vertical / M4 definicion-cierre, [ABIERTO],
  declarable en cola-declaraciones-criterio): si la fuente no la declara, la clave queda
  INCOMPLETA y el hecho va a cola — JAMÁS se inventa una unidad de cierre. Reprocesar NO
  duplica: la clave lo delata. Sin estado. Úsala para operar, depurar o extender el
  reflejo, o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites calcular la clave natural de un hecho/documento
    (RPC contabilidad.clave.calcular.request) o saber si una clave ya está asentada
    (RPC contabilidad.clave.repeticion.request).
  - Cuando depures por qué no se calcula la clave (422 PRECONDITION_FAILED si falta la
    unidad de cierre [ABIERTO], INVALID_INPUT si falta project_id/hecho/vertical).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), la
    determinación bit a bit de la clave y el invariante "un hecho = un asiento".
  - Cuando vayas a escribir/ampliar el test unitario del reflejo clave-natural.
tags: [enki, modulo, reflejo, contabilidad, clave-natural, idempotencia, cerrojo, anti-bucle]
---

# clave-natural — REFLEJO del cerrojo de idempotencia

## Qué hace el módulo

`clave-natural` es un **REFLEJO STATELESS** (M3, hoja del plan): **CERROJO 3 ·
IDEMPOTENCIA**. Es el **único calculador de la clave natural del hecho** del
dominio contable. La invariante rectora: **mismos componentes → mismo hecho → mismo
asiento**. Reprocesar **NO duplica**: la clave natural lo **delata**.

La clave cuelga de la **UNIDAD DE CIERRE** (A14 `anclaje-cierre-vertical` / M4
`definicion-cierre`, pieza **`[ABIERTO]`** declarable en
`cola-declaraciones-criterio`). **Si la fuente no la declara, la clave queda
INCOMPLETA y el hecho va a cola** — **JAMÁS se inventa una unidad de cierre**
(invariante Cero estimación). Se devuelve **`422 PRECONDITION_FAILED`** con
`senal:'unidad_de_cierre_no_declarada'`.

Es **stateless**: sin PosPersistencia ni `project.activated` — no guarda estado.
Cada op **entra objeto, sale objeto** y es **DETERMINISTA** (*mismas entradas → misma
clave*; un test unitario lo afirma). La dependencia con `anclaje-cierre-vertical`
(A14) y `cola-declaraciones-criterio` (K9) es **por EVENTO, nunca por `require`
cruzado**. Emite `contabilidad.clave_calculada` en éxito y su par determinista en
fallo.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.clave.calcular.request` | `onCalcularRequest` | RPC reflejo: {project_id, hecho:{vertical, ...}, unidad_de_cierre\|criterio} → {project_id, vertical, unidad_de_cierre, componentes, clave_natural, completa:true}. Calcula la clave natural DETERMINISTA (hash reproducible de vertical + unidad_de_cierre + componentes). Si la unidad de cierre (M4 [ABIERTO]) no esta declarada → 422 PRECONDITION_FAILED (el hecho va a cola; JAMAS se inventa) y contabilidad.clave.calcular.failed. Exito publica contabilidad.clave_calculada y responde por contabilidad.clave.calcular.response. |
| `contabilidad.clave.repeticion.request` | `onRepeticionRequest` | RPC reflejo: {project_id, clave, ya_asentados:[Clave\|Asiento]} → {project_id, clave_natural, repeticion, ya_asentados}. Proyeccion PURA de idempotencia (no muta): dice si la clave ya esta entre los asentados. Los ya_asentados pueden ser claves sueltas o asientos con su clave_natural. Responde por contabilidad.clave.repeticion.response; si el payload es invalido → contabilidad.clave.repeticion.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.clave_calculada` | Fire-and-forget (M3): una clave natural quedo calculada (o se detecto repeticion) → {project_id, vertical, unidad_de_cierre, componentes, clave_natural}. Es el cerrojo anti-bucle: lo consumen deduplicacion-hecho (A7) y hecho-rectificativo (A13). |
| `contabilidad.clave.calcular.failed` | Par de fallo determinista: calcular sin hecho/vertical o sin la unidad de cierre declarada (422, el hecho va a cola). Cierra el circulo de contabilidad.clave.calcular.request. |
| `contabilidad.clave.repeticion.failed` | Par de fallo determinista: repeticion con payload invalido (sin clave). Cierra el circulo de contabilidad.clave.repeticion.request. |
| `contabilidad.clave_calculada.failed` | Par de fallo del evento de dominio contabilidad.clave_calculada: la emision del hecho de dominio no se completo. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `contabilidad.clave.calcular.failed` cierra `contabilidad.clave.calcular.request`
> y `contabilidad.clave.repeticion.failed` cierra `contabilidad.clave.repeticion.request`.

> Nota: no está en module.json pero sí lo emite index.js — `onCalcularRequest`
> publica `contabilidad.clave_calculada` (éxito) / `contabilidad.clave.calcular.failed`
> (fallo). Además, **`_esRepeticion` publica `contabilidad.clave_calculada` cuando
> detecta repetición** (`{project_id, clave_natural, repeticion:true, ya_asentados,
> correlation_id}`) — una segunda vía de emisión de ese evento, no declarada como tal
> en `publishes`. `onRepeticionRequest` publica `contabilidad.clave.repeticion.failed`
> cuando `res.status !== 200`.

> Nota: `contabilidad.clave.calcular.response` y `contabilidad.clave.repeticion.response`
> las emite `_atender` y **NO están declaradas en `publishes`**.

> Nota: **`contabilidad.clave_calculada.failed` está declarada en `publishes` pero no
> se emite en `index.js`** — el reflejo solo publica los pares de fallo de sus RPC.

## Reglas de negocio

1. **Un hecho = un asiento (idempotencia · cerrojo 3)**: la **clave natural** es
   **determinista y reproducible**: `_serializar` hace `JSON.stringify(partes)` →
   `sha1` → primeros **16** hex → `"<pid>:<vertical>:<hash>"`. Mismas entradas →
   **misma clave, bit a bit**. Reprocesar el mismo hecho produce la misma clave; el
   consumidor (A7) la delata como duplicado.
2. **La clave cuelga de la unidad de cierre (nunca se inventa)**: `_calcular` toma
   `unidad_de_cierre` de `input.unidad_de_cierre`, `input.criterio` o
   `hecho.unidad_cierre`. Si **no hay unidad** → **`422 PRECONDITION_FAILED`** con
   `{ message:'la unidad de cierre no esta declarada (M4 [ABIERTO])', details:{ vertical, senal:'unidad_de_cierre_no_declarada', accion:'el hecho va a cola; no se inventa la unidad' } }`.
   El hecho **va a cola**; el reflejo **jamás** asume una unidad.
3. **Componentes reproducibles y orden fijo**: `COMPONENTES = [vertical, fuente,
   documento_origen, fecha_operacion, fecha_valor, tercero, moneda, total]`. El objeto
   `partes` se construye como `{ vertical, unidad_de_cierre, fuente, documento_origen,
   fecha_operacion, fecha_valor, tercero, moneda, total }` — **el orden importa**: la
   clave es reproducible. Un componente ausente se fija a `null` (no se omite).
4. **`repeticion` es proyección PURA (no muta)**: `_esRepeticion` compara la `clave`
   contra el conjunto de `ya_asentados` (acepta **claves sueltas o asientos con su
   `clave_natural`/`clave`**) y devuelve `repeticion:true|false`. **La marca de
   "procesado" NO la hace este módulo** — la lleva su consumidor A7. La nota lo dice:
   `'mismo hecho ya asentado: reprocesar NO duplica'` / `'hecho nuevo'`.
5. **Alias de entrada tolerados**: el hecho puede venir en `hecho`, `documento` o
   `hecho_crudo`; la vertical en `hecho.vertical` o `input.vertical`.
6. **Validaciones deterministas**: falta `project_id` → `400 INVALID_INPUT project_id`;
   hecho ausente/no objeto → `400 INVALID_INPUT hecho`; sin vertical → `400
   INVALID_INPUT hecho.vertical`; sin `clave` (en repeticion) → `400 INVALID_INPUT
   clave`. Shape: `{ status:400, error:{ code:'INVALID_INPUT', message:'<campo> requerido', details:{ field:<campo> } } }`.
7. **La ley entra como DATO**: los componentes del hecho y la unidad de cierre son
   **datos declarados** (M4 declarable en K9); el reflejo **no cabla** unidades ni
   componentes de negocio.
8. **HTTP exacto**: éxito `200`; payload inválido → `400`; unidad de cierre no
   declarada → `422`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPCs que responden en `contabilidad.clave.calcular.response` y
`contabilidad.clave.repeticion.response`.

### 1. `calcular` — la clave natural del hecho (determinista)

```json
{
  "project_id": "e57a318a-...",
  "unidad_de_cierre": "MENSUAL-2026-09",
  "hecho": {
    "vertical": "COMPRA",
    "fuente": "PUERTO_EVENTO_VERTICAL",
    "documento_origen": "FAC-2026-0042",
    "fecha_operacion": "2026-09-12",
    "fecha_valor": "2026-09-15",
    "tercero": "B12345678",
    "moneda": "EUR",
    "total": 121
  },
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "vertical": "COMPRA",
  "unidad_de_cierre": "MENSUAL-2026-09",
  "componentes": { "vertical": "COMPRA", "unidad_de_cierre": "MENSUAL-2026-09", "fuente": "PUERTO_EVENTO_VERTICAL", "documento_origen": "FAC-2026-0042", "fecha_operacion": "2026-09-12", "fecha_valor": "2026-09-15", "tercero": "B12345678", "moneda": "EUR", "total": 121 },
  "clave_natural": "e57a318a-...:COMPRA:9f2c1a7b3e5d0c84",
  "completa": true,
  "determinista": true
}
```
Emite `contabilidad.clave_calculada` (res.data + `correlation_id`).

### 2. `calcular` sin unidad de cierre → 422 (el hecho va a cola)

```json
{ "project_id": "e57a318a-...", "hecho": { "vertical": "COMPRA", "total": 121 } }
```
Respuesta `422` + `contabilidad.clave.calcular.failed`:
```json
{ "status": 422, "error": { "code": "PRECONDITION_FAILED", "message": "la unidad de cierre no esta declarada (M4 [ABIERTO])", "details": { "vertical": "COMPRA", "senal": "unidad_de_cierre_no_declarada", "accion": "el hecho va a cola; no se inventa la unidad" } } }
```

### 3. `repeticion` — ¿la clave ya está asentada? (pura)

```json
{ "project_id": "e57a318a-...", "clave": "e57a318a-...:COMPRA:9f2c1a7b3e5d0c84", "ya_asentados": ["e57a318a-...:COMPRA:9f2c1a7b3e5d0c84", { "clave_natural": "e57a318a-...:COBRO:aaaabbbbccccdddd" }] }
```
Respuesta `200` (repetición: **reprocesar NO duplica**; además publica `contabilidad.clave_calculada` con `repeticion:true`):
```json
{ "project_id": "e57a318a-...", "clave_natural": "e57a318a-...:COMPRA:9f2c1a7b3e5d0c84", "repeticion": true, "ya_asentados": 2, "nota": "mismo hecho ya asentado: reprocesar NO duplica" }
```
Sin repetición → `repeticion:false`, `nota:'hecho nuevo'`.

### 4. Fallo — payload inválido

Sin `clave` → `400` + `contabilidad.clave.repeticion.failed`:
```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "clave requerido", "details": { "field": "clave" } } }
```

## Tests

El test vive en `tests/unit/clave-natural.test.js`. Cubre:

- `calcular` con unidad de cierre y hecho completo → `200`, `completa:true` y emite
  `contabilidad.clave_calculada`.
- **Determinismo**: la MISMA entrada devuelve EXACTAMENTE la MISMA `clave_natural`
  (dos llamadas → mismo string); el orden de componentes es reproducible.
- `calcular` **sin unidad de cierre** → `422 PRECONDITION_FAILED` +
  `contabilidad.clave.calcular.failed` (el hecho va a cola, no se inventa).
- `calcular` sin `project_id`/`hecho`/`vertical` → `400 INVALID_INPUT`.
- `repeticion` con clave ya asentada → `repeticion:true` + emite
  `contabilidad.clave_calculada`; con clave nueva → `repeticion:false`.
- `ya_asentados` mezcla claves sueltas y asientos con `clave_natural`.
- El reflejo es **stateless**: sin `project.activated` ni persistencia.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/clave-natural
node --test tests/unit/clave-natural.test.js
```

## Notas de implementación

- Clase `ClaveNatural extends ModuloHibridoReflejo`; `name = 'clave-natural'`,
  `version = 'reflejo-0.1.0'`. **Sin store** (reflejo stateless: nada que persistir).
- Constante: `COMPONENTES = ['vertical', 'fuente', 'documento_origen',
  'fecha_operacion', 'fecha_valor', 'tercero', 'moneda', 'total']`. `crypto` de Node
  para el `sha1`.
- `onCalcularRequest`/`onRepeticionRequest` delegan en
  `_atender(e, '<op>', 'contabilidad.clave.<op>.response', fn)`; los handlers emiten
  el evento de dominio (`contabilidad.clave_calculada`) o el par determinista dentro
  de la proyección, propagando `correlation_id`.
- Proyecciones puras: `_calcular` (clave determinista; 422 si falta la unidad de
  cierre), `_esRepeticion` (idempotencia; no muta) + helpers `_componentes(vertical,
  hecho, unidad)` y `_serializar(pid, partes)` (sha1 → 16 hex). `_invalid`/
  `_errorResponse` vienen de la base.
- Tools: `toolCalcular` → `_calcular`, `toolEsRepeticion` → `_esRepeticion`.
- DEP hacia delante: `contabilidad.clave_calculada` lo consumen `deduplicacion-hecho`
  (A7) y `hecho-rectificativo` (A13) — el cerrojo anti-bucle. DEP hacia atrás por
  evento: A14 `anclaje-cierre-vertical` y K9 `cola-declaraciones-criterio` proveen la
  unidad de cierre.
