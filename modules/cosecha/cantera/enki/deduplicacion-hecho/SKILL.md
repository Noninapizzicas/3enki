---
name: deduplicacion-hecho
description: >
  Skill FULL del módulo REFLEJO `deduplicacion-hecho` de la vertical contabilidad de
  Enki (A7, hoja del plan). ANTI-BUCLE: aplica la clave natural del hecho/documento
  (M3). Reprocesar NO duplica (idempotencia): si la clave ya se procesó, el hecho es
  DUPLICADO y no vuelve a asentarse. Si el hecho es RECTIFICATIVO (A13), su clave
  apunta al ORIGINAL y NO se considera duplicado — corregir no es repetir. Determinista.
  Si clave-natural (M3) no responde, no se asume: se publica el fallo (contrato
  TOLERANTE) y nunca se asienta basura. Sin estado. Úsala para operar, depurar o
  extender el reflejo, o para entender su contrato de eventos y sus reglas.
when-to-use: >
  - Cuando necesites verificar si un hecho ya se procesó
    (RPC contabilidad.duplicado.verificar.request) y saber si es DUPLICADO o NUEVO.
  - Cuando llegue un hecho normalizado por evento (contabilidad.hecho_normalizado de
    normalizador-hecho A2) y haya que aplicar la idempotencia.
  - Cuando depures por qué no se resuelve la verificación (503 UPSTREAM_UNREACHABLE si
    clave-natural no responde, o INVALID_INPUT si falta project_id/hecho/vertical) o
    por qué un rectificativo NO se marca como duplicado.
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), el cerrojo
    anti-bucle y el contrato TOLERANTE con clave-natural.
  - Cuando vayas a escribir/ampliar el test unitario del reflejo deduplicacion-hecho.
tags: [enki, modulo, reflejo, contabilidad, deduplicacion-hecho, idempotencia, anti-bucle]
---

# deduplicacion-hecho — REFLEJO del anti-bucle por clave natural

## Qué hace el módulo

`deduplicacion-hecho` es un **REFLEJO STATELESS** (A7, hoja del plan): el
**ANTI-BUCLE** del dominio. Aplica la **clave natural** del hecho/documento (M3):
**reprocesar NO duplica** — si la clave ya se procesó, el hecho es **`DUPLICADO`** y
**no vuelve a asentarse**. Y una regla sutil: **si el hecho es RECTIFICATIVO (A13),
su clave apunta al ORIGINAL y NO se considera duplicado** — *corregir no es repetir*.

Es **determinista**: mismas entradas → misma salida (un test unitario lo afirma).
Es **stateless**: sin PosPersistencia ni `project.activated` — el registro de claves
ya procesadas vive **en memoria del propio reflejo** (`this._procesadas`); es el
**caché de idempotencia**, no una parcela que persistir.

La dependencia con `clave-natural` (M3) es **por EVENTO** (`_rpc` a
`contabilidad.clave.calcular.request`), **nunca por `require` cruzado**. **Si ese
RPC no responde, se publica el par de fallo y NUNCA se asienta basura** (contrato
TOLERANTE): `503 UPSTREAM_UNREACHABLE` con
`accion:'NO_ASENTAR_PUBLICAR_FALLO'`. Emite `contabilidad.hecho_nuevo` o
`contabilidad.hecho_duplicado` según el veredicto, más sus pares deterministas.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response + fire-and-forget)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.duplicado.verificar.request` | `onVerificarRequest` | RPC reflejo: {project_id, hecho:{vertical, ...}, clave?} → {project_id, vertical, clave_natural, duplicado, estado:'DUPLICADO'\|'NUEVO', es_rectificativo}. Aplica la clave natural (M3): si viene en el payload se usa; si no, se pide a clave-natural por EVENTO. Si el hecho es RECTIFICATIVO (A13) NO es duplicado. Exito publica contabilidad.hecho_nuevo (o contabilidad.hecho_duplicado) y responde por contabilidad.duplicado.verificar.response; si falta project_id/hecho/vertical, o clave-natural no responde (503 TOLERANTE) → contabilidad.duplicado.verificar.failed. |
| `contabilidad.hecho_normalizado` | `onHechoNormalizado` | Fire-and-forget (A2 → A7): normalizador-hecho dejo el hecho en forma asentable → {project_id, vertical, hecho, clave_natural}. Aqui se verifica la idempotencia (dependencia por EVENTO, sin require cruzado) y se publica contabilidad.hecho_nuevo o contabilidad.hecho_duplicado; si no se puede resolver la clave, contabilidad.duplicado.verificar.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.hecho_nuevo` | Fire-and-forget (A7): el hecho no estaba asentado (o es rectificativo) → {project_id, vertical, clave_natural, duplicado:false, estado:'NUEVO'}. Lo consume resolucion-contrapartida (A6.1) para proponer cuenta/tercero/periodo. |
| `contabilidad.hecho_duplicado` | Fire-and-forget (A7): la clave natural ya se asento → {project_id, vertical, clave_natural, duplicado:true, estado:'DUPLICADO'}. Reprocesar NO duplica: el hecho no vuelve a asentarse. |
| `contabilidad.duplicado.verificar.failed` | Par de fallo determinista: verificar con payload invalido (sin hecho/vertical) o porque clave-natural (M3) no respondio (503, contrato TOLERANTE: nunca se asienta basura). Cierra el circulo de contabilidad.duplicado.verificar.request. |
| `contabilidad.hecho_nuevo.failed` | Par de fallo del evento de dominio contabilidad.hecho_nuevo: la emision del hecho de dominio no se completo. |
| `contabilidad.hecho_duplicado.failed` | Par de fallo del evento de dominio contabilidad.hecho_duplicado: la emision del hecho de dominio no se completo. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `contabilidad.duplicado.verificar.failed` cierra el círculo de
> `contabilidad.duplicado.verificar.request` (payload inválido **o** clave-natural sin
> responder).

> Nota: no está en module.json pero sí lo emite index.js — el RPC
> `onVerificarRequest` publica `contabilidad.hecho_duplicado` (si `duplicado`) o
> `contabilidad.hecho_nuevo` (si no), y `onHechoNormalizado` publica el mismo par
> fire-and-forget; ambos publican `contabilidad.duplicado.verificar.failed` cuando
> falla la verificación.

> Nota: `contabilidad.duplicado.verificar.response` la emite `_atender` y **NO está
> declarada en `publishes`**.

> Nota: **`contabilidad.hecho_nuevo.failed` y `contabilidad.hecho_duplicado.failed`
> están declaradas en `publishes` pero no se emiten en `index.js`** — el reflejo solo
> publica el par de fallo del RPC, no los pares de sus eventos de dominio.

> Nota: **`_marcarProcesado` (tools `toolMarcarProcesado`) es una proyección + Tool
> pero NO tiene evento RPC en `module.json`**: se invoca como tool o desde el sitio de
> despliegue (marca una clave como procesada en el caché). `_esDuplicado`/`toolEsDuplicado`
> también existen como proyección + Tool, deterministas sobre la clave ya resuelta.

## Reglas de negocio

1. **Reprocesar NO duplica (idempotencia · cerrojo 3)**: si la `clave_natural` ya
   está en `this._procesadas[pid]`, el hecho es **`duplicado:true`, `estado:'DUPLICADO'`**;
   no vuelve a asentarse. El veredicto lo delata la clave natural (M3).
2. **Un rectificativo NO es duplicado (`A13`)**: `_esRectificativo` marca el hecho
   como rectificativo si `clase_hecho`/`clase === 'RECTIFICATIVO'`, o
   `vertical === 'RECTIFICATIVO'`, o `hecho.rectificativo === true`, o si trae
   `hecho.hecho_original`. En tal caso `duplicado = yaVisto && !esRectificativo` →
   **siempre `false`**: *corregir no es repetir*. La nota lo dice:
   `'rectificativo: casa con su original, no es duplicado'`.
3. **Marcar procesado solo si NO es duplicado**: si el hecho es NUEVO (o
   rectificativo) `_esDuplicado` añade la clave al caché; si es duplicado, **no**
   remarca (ya estaba). `procesadas` en la respuesta da el tamaño del caché.
4. **La clave natural se toma del payload o se pide por EVENTO**: `clave` viene de
   `input.clave` o `hecho.clave_natural`. Si falta, `_verificar` llama por `_rpc` a
   `contabilidad.clave.calcular.request` (timeout **4000 ms**) con `unidad_de_cierre`
   de `input` o `hecho.unidad_cierre`.
5. **Contrato TOLERANTE (nunca se asienta basura)**: si clave-natural **no responde**
   o no devuelve clave → **`503 UPSTREAM_UNREACHABLE`** con
   `{ message:'clave-natural (M3) no devolvio la clave: no se asume, no se asienta', details:{ vertical, dependencia:'clave-natural', accion:'NO_ASENTAR_PUBLICAR_FALLO' } }`
   y se publica `contabilidad.duplicado.verificar.failed`. **No se asume la clave ni se
   asienta el hecho**.
6. **Determinismo**: `_esDuplicado` es función pura del caché y de la clave; mismas
   entradas → mismo veredicto. El caché es **memoria del proceso**: no persistir es
   deliberado (idempotencia de la ruta de entrada, no parcela).
7. **Validaciones deterministas**: falta `project_id` → `400 INVALID_INPUT project_id`;
   hecho ausente/no objeto → `400 INVALID_INPUT hecho`; sin vertical → `400
   INVALID_INPUT hecho.vertical`. Shape: `{ status:400, error:{ code:'INVALID_INPUT', message:'<campo> requerido', details:{ field:<campo> } } }`.
8. **HTTP exacto**: éxito `200`; payload inválido → `400`; clave-natural sin responder
   → `503`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPC que responde en `contabilidad.duplicado.verificar.response`.

### 1. `verificar` — ¿duplicado o nuevo? (aplica la clave natural)

```json
{
  "project_id": "e57a318a-...",
  "clave": "e57a318a-...:COMPRA:9f2c1a7b3e5d0c84",
  "hecho": { "vertical": "COMPRA", "documento_origen": "FAC-2026-0042", "total": 121 },
  "correlation_id": "abc-123"
}
```
Respuesta `200` (primera vez → NUEVO):
```json
{
  "project_id": "e57a318a-...",
  "vertical": "COMPRA",
  "clave_natural": "e57a318a-...:COMPRA:9f2c1a7b3e5d0c84",
  "duplicado": false,
  "estado": "NUEVO",
  "es_rectificativo": false,
  "ya_visto": false,
  "procesadas": 1,
  "nota": "hecho nuevo"
}
```
Emite `contabilidad.hecho_nuevo` (res.data + `correlation_id`).
La **segunda** vez con la misma clave → `duplicado:true`, `estado:'DUPLICADO'`,
`ya_visto:true`; emite `contabilidad.hecho_duplicado`.

### 2. `verificar` un hecho rectificativo → NO es duplicado

```json
{ "project_id": "e57a318a-...", "clave": "e57a318a-...:RECTIFICATIVO:deadbeefcafe0001", "hecho": { "vertical": "RECTIFICATIVO", "hecho_original": "e57a318a-...:COMPRA:9f2c1a7b3e5d0c84", "total": -121 } }
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "vertical": "RECTIFICATIVO", "clave_natural": "e57a318a-...:RECTIFICATIVO:deadbeefcafe0001", "duplicado": false, "estado": "NUEVO", "es_rectificativo": true, "ya_visto": false, "procesadas": 2, "nota": "rectificativo: casa con su original, no es duplicado" }
```
Emite `contabilidad.hecho_nuevo`.

### 3. `verificar` sin clave → se pide a clave-natural; si no responde, 503

Sin `clave` ni `hecho.clave_natural`, `_verificar` **hace el RPC** a clave-natural.
Si clave-natural no responde (o la unidad de cierre no está declarada → 422):
Respuesta `503` + `contabilidad.duplicado.verificar.failed`:
```json
{ "status": 503, "error": { "code": "UPSTREAM_UNREACHABLE", "message": "clave-natural (M3) no devolvio la clave: no se asume, no se asienta", "details": { "vertical": "COMPRA", "dependencia": "clave-natural", "accion": "NO_ASENTAR_PUBLICAR_FALLO" } } }
```

### 4. Fallo — payload inválido

Sin `hecho` → `400` + `contabilidad.duplicado.verificar.failed`:
```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "hecho requerido", "details": { "field": "hecho" } } }
```

### 5. Entrada por evento — hecho normalizado

`contabilidad.hecho_normalizado` (de `normalizador-hecho`, A2) con
`{project_id, vertical, hecho, clave_natural}` → se verifica la idempotencia y se
publica `contabilidad.hecho_nuevo` o `contabilidad.hecho_duplicado`; si no se puede
resolver la clave → `contabilidad.duplicado.verificar.failed`. Sin `project_id` el
handler retorna `null` sin publicar.

## Tests

El test vive en `tests/unit/deduplicacion-hecho.test.js`. Cubre:

- `verificar` la primera vez → `200 {duplicado:false, estado:'NUEVO'}` + emite
  `contabilidad.hecho_nuevo`.
- `verificar` la **segunda** vez con la misma clave → `{duplicado:true,
  estado:'DUPLICADO'}` + emite `contabilidad.hecho_duplicado` (reprocesar NO duplica).
- Un hecho **RECTIFICATIVO** con clave ya vista → `duplicado:false`,
  `es_rectificativo:true` (corregir no es repetir).
- `verificar` sin `clave` → pide a clave-natural por RPC (mock del bus); si no
  responde → `503 UPSTREAM_UNREACHABLE` + par de fallo.
- `verificar` sin `project_id`/`hecho`/`vertical` → `400 INVALID_INPUT`.
- `contabilidad.hecho_normalizado` → dispara la verificación y publica el evento.
- El reflejo es **stateless**: sin `project.activated` ni persistencia.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/deduplicacion-hecho
node --test tests/unit/deduplicacion-hecho.test.js
```

## Notas de implementación

- Clase `DeduplicacionHecho extends ModuloHibridoReflejo`; `name =
  'deduplicacion-hecho'`, `version = 'reflejo-0.1.0'`. **Sin store persistente**:
  caché en memoria `this._procesadas` (Map `project_id` → `Set<ClaveNatural>`).
- Constantes: `CLASE_RECTIFICATIVO = 'RECTIFICATIVO'`.
- `onVerificarRequest` delega en
  `_atender(e, 'verificar', 'contabilidad.duplicado.verificar.response', fn)`;
  `_verificar` es **async** (puede hacer `_rpc`). `onHechoNormalizado` es
  fire-and-forget y reutiliza `_verificar`.
- `_rpc('contabilidad.clave.calcular.request', {...}, { timeout_ms: 4000 })` —
  dependencia por EVENTO con M3; si devuelve `null` → `503`.
- Proyecciones puras: `_verificar` (resuelve la clave; contrato TOLERANTE),
  `_esDuplicado` (aplica idempotencia + rectificativo), `_esRectificativo`,
  `_marcarProcesado`. `_invalid`/`_errorResponse` vienen de la base.
- Tools: `toolVerificar` → `_verificar`, `toolEsDuplicado` → `_esDuplicado`,
  `toolMarcarProcesado` → `_marcarProcesado`.
- DEP hacia delante: `contabilidad.hecho_nuevo` lo consume `resolucion-contrapartida`
  (A6.1). DEP hacia atrás por evento: `normalizador-hecho` (A2) emite
  `contabilidad.hecho_normalizado`; `clave-natural` (M3) responde el RPC de clave.
