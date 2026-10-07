---
name: ensamblador-solucion
description: >
  Skill FULL del módulo MICRO-AGENTE (fuzzy) `ensamblador-solucion` de la vertical
  nichos (Radar de Nichos, proyecto 3D). Arma la SOLUCIÓN del nicho con las
  capacidades del catálogo (D3): decide QUÉ construir según el nicho (juicio fuzzy
  con fallback reflejo) y ejecuta el montaje de forma determinista en una
  SoluciónOperable. Nunca inventa: no usa una capacidad que no esté en el catálogo;
  si falta la capacidad esencial de entrega/cobro → par de fallo honesto
  (INVARIANTE 'se crea lo que falta'). Úsala para operar, depurar o extender el
  micro-agente, o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites armar la solución operable de un nicho (RPC nichos.solucion.construir.request).
  - Cuando depures por qué un ensamblaje falla (SIN_ESPECIFICACION si ni el LLM ni
    el reflejo componen especificación, FALTA_CAPACIDAD_ESENCIAL si falta entrega/cobro).
  - Cuando quieras entender el patrón híbrido reflejo+fuzzy del montaje (decidir con
    llm.complete + ejecutar montaje determinista sobre el catálogo) y su contrato.
  - Cuando vayas a escribir/ampliar el test unitario del micro-agente.
tags: [enki, modulo, micro-agente, fuzzy, nichos, radar, solucion, ensamblador, proyecto-3d]
---

# ensamblador-solucion — MICRO-AGENTE (fuzzy) que arma la solución del nicho

## Qué hace el módulo

`ensamblador-solucion` es un **MICRO-AGENTE HÍBRIDO** (D1, hoja del plan): el que
**materializa la solución** de un nicho `CONSTRUIR`. Decide **QUÉ construir** según
el nicho y las capacidades disponibles del catálogo (D3), y ejecuta el **montaje**
de forma determinista para obtener una **SoluciónOperable**.

Dos mitades (patrón real de `normalizacion-semilla`):

- **FUZZY** (`_decidirQueConstruir`): juicio LLM. Un guion-prompt self-contained
  (`GUION_MONTAR`) + el nicho y las capacidades → **ESPECIFICACIÓN** (nombre,
  descripción, `1-4` capacidades ordenadas por rol `captura|entrega|cobro`, y la
  `faltante` si no hay esencial). Fallback reflejo si el LLM falla.
- **REFLEJO** (`_ejecutarMontaje`): monta la **SoluciónOperable** de forma
  determinista a partir de la especificación **sobre las capacidades reales del
  catálogo**.

**NUNCA inventa**: no usa una capacidad que no esté en el catálogo; si falta una
capacidad esencial → par de fallo honesto (la crea el catálogo D3,
**INVARIANTE 'se crea lo que falta'**). Sin store, sin custodio (solo registra el
`project_id` activo en contexto).

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `nichos.solucion.construir.request` | `onConstruirRequest` | RPC micro-agente: {project_id, nicho, capacidades} → {project_id, especificacion, solucion, construida}. Decide qué construir (juicio) y ejecuta el montaje (reflejo determinista). Publica `nichos.solucion.construida` y responde por `nichos.solucion.construir.response`. Si el payload es inválido o falta capacidad esencial → `nichos.solucion.construir.failed`. |
| `nichos.camino.decidido` | `onCaminoDecidido` | Fire-and-forget (D1): camino-encontrar-construir (C4) decidió CONSTRUIR → {project_id, nicho, camino:'CONSTRUIR', capacidades?}. Arma la solución del nicho y publica `nichos.solucion.construida`. |

### Publishes

| Evento | Descripción |
|---|---|
| `nichos.solucion.construida` | Fire-and-forget (D1): la solución del nicho quedó construida con las capacidades del catálogo → {project_id, nicho, especificacion, solucion, construida:true}. Lo consumen proponedor-modelo-cobro (D4), motor-cobro (E3) y el pipeline. |
| `nichos.solucion.construir.failed` | Par de fallo determinista (D1): payload inválido o sin capacidades para montar → {status, code, message, data}. Cierra el círculo de `nichos.solucion.construir.request`. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `nichos.solucion.construir.failed` cierra `nichos.solucion.construir.request`
> cuando `_construir` devuelve status ≠ 200 (INVALID_INPUT, SIN_ESPECIFICACION o
> FALTA_CAPACIDAD_ESENCIAL).

> **Nota: no está en module.json pero sí lo escucha index.js en `onProjectActivated`
> (líneas 44-49)**: el micro-agente registra el `project_id` activo en contexto
> (respondiendo `200 {project_id}`). Es sub-declaración de module.json: el índice
> sí escucha `project.activated` pero el manifest no lo lista como subscribe.

## Reglas de negocio

1. **Nicho obligatorio → `400 INVALID_INPUT`**: si `nicho` falta o no es objeto →
   `{ status:400, code:'INVALID_INPUT', mensaje:'nicho requerido', field:'nicho' }`
   + `nichos.solucion.construir.failed`.
2. **Sin especificación → `502 SIN_ESPECIFICACION`**: si ni el juicio fuzzy ni el
   fallback reflejo componen una especificación → `{ status:502, code:'SIN_ESPECIFICACION', mensaje:'el juicio no pudo componer una especificación para el nicho', project_id, nicho }`
   + failed.
3. **Solo capacidades del catálogo (honestidad)**: `_validarEspecificacion` descarta
   todo `id` que no exista entre las capacidades recibidas (`nombres`); si queda
   `capacidades.length === 0` → devuelve `null` (dispara el fallback/sin-espec).
4. **Falta capacidad esencial → `400 FALTA_CAPACIDAD_ESENCIAL`**: `_ejecutarMontaje`
   devuelve `null` si no hay ninguna pieza con rol `entrega` o `cobro`
   (`INVARIANTE D3: se crea lo que falta`) →
   `{ status:400, code:'FALTA_CAPACIDAD_ESENCIAL', mensaje:'falta una capacidad esencial para montar la solución (INVARIANTE: se crea)', project_id, faltante: espec.faltante }`
   + failed. No se monta a medias.
5. **Solo CONSTRUIR pide ensamblaje**: `onCaminoDecidido` ignora los caminos
   `ENCONTRAR`/`PUENTE` (y `CONSTRUIR` en minúsculas normaliza a mayúsculas); solo
   arma la solución cuando `camino === 'CONSTRUIR'`.
6. **Fallback reflejo por catálogo**: `_decidirQueConstruirReflejo` compone a partir
   de las capacidades existentes asignando roles por posición (`0→captura`, `1→entrega`,
   `2→cobro`); si `capacidades` está vacío → `null`.
7. **Montaje determinista**: `_ejecutarMontaje` descarta piezas sin capacidad real
   (`porId.get(cp.id)` ausente → `continue`) — no inventa — y construye
   `{ nombre, descripcion, piezas:[{id, rol, capacidad}], operativa:true, montada_el }`.
8. **Roles cerrados**: el rol de cada pieza solo puede ser `captura | entrega |
   cobro`; si el LLM no lo cumple, por defecto `captura`.
9. **HTTP exacto**: éxito `200`; sin `project_id` → `400 INVALID_INPUT project_id`;
   nicho inválido → `400`; sin especificación → `502`; falta esencial → `400`;
   excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPC request/response que responde en `nichos.solucion.construir.response`:

### 1. `construir` — armar la solución de un nicho

```json
{
  "project_id": "e57a318a-...",
  "nicho": { "producto": "salsa picante", "audiencia": "restaurantes" },
  "capacidades": [
    { "id": "web", "descripcion": "Landing de producto" },
    { "id": "pedidos", "descripcion": "Procesador de pedidos" },
    { "id": "pago", "descripcion": "Pasarela de pago" }
  ]
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "nicho": { "producto": "salsa picante", "audiencia": "restaurantes" },
  "especificacion": { "nombre": "Tienda de salsa picante para restaurantes", "descripcion": "...", "capacidades": [ { "id": "web", "rol": "captura" }, { "id": "pedidos", "rol": "entrega" }, { "id": "pago", "rol": "cobro" } ], "faltante": null },
  "solucion": { "nombre": "Tienda de salsa picante para restaurantes", "descripcion": "...", "piezas": [ { "id": "web", "rol": "captura", "capacidad": "Landing de producto" }, { "id": "pedidos", "rol": "entrega", "capacidad": "Procesador de pedidos" }, { "id": "pago", "rol": "cobro", "capacidad": "Pasarela de pago" } ], "operativa": true, "montada_el": "2026-09-25T..." },
  "construida": true
}
```
Emite `nichos.solucion.construida` con ese mismo `data`.

### Fallo — falta capacidad esencial

```json
{ "project_id": "e57a318a-...", "nicho": { "producto": "salsa" }, "capacidades": [ { "id": "web", "descripcion": "Landing" } ] }
```
Respuesta `400` + `nichos.solucion.construir.failed`:
```json
{ "status": 400, "code": "FALTA_CAPACIDAD_ESENCIAL", "mensaje": "falta una capacidad esencial para montar la solución (INVARIANTE: se crea)", "project_id": "e57a318a-...", "faltante": { "id": "pago", "motivo": "..." } }
```

## Tests

El test vive en `tests/unit/ensamblador-solucion.test.js`. Cubre:

- `construir` con nicho + capacidades → `200`, decide especificación, monta la
  SoluciónOperable y emite `nichos.solucion.construida`.
- `nicho` ausente/no objeto → `400 INVALID_INPUT` + failed.
- Si el LLM falla/incumple contrato → fallback `_decidirQueConstruirReflejo`
  (asigna roles por posición 0→captura, 1→entrega, 2→cobro).
- Ni LLM ni reflejo componen especificación → `502 SIN_ESPECIFICACION` + failed.
- No hay capacidad de entrega/cobro → `400 FALTA_CAPACIDAD_ESENCIAL` + failed.
- `_validarEspecificacion` descarta capacidades no del catálogo.
- `onCaminoDecidido` solo ensambla con camino CONSTRUIR (ignora ENCONTRAR/PUENTE).

Para ejecutarlo:

```bash
cd /home/admin/3enki/modules/nichos/ensamblador-solucion
node tests/unit/ensamblador-solucion.test.js
```

## Notas de implementación

- Clase `EnsambladorSolucion extends ModuloHibridoReflejo`; `name =
  'ensamblador-solucion'`, `version = 'reflejo-0.1.0'`. Sin store ni PosPersistencia
  (stateless); `this.project_id` (memoria) como único estado.
- `GUION_MONTAR`: guion-prompt self-contained que exige JSON
  `{"especificacion":{"nombre":"<s>","descripcion":"<d>","capacidades":[{"id":"<id>","rol":"captura|entrega|cobro"}],"faltante":{"id":"<id o null>","motivo":"<m>"}}}`
  con `1-4` capacidades SOLO del catálogo y regla `NO inventes capacidades ausentes`.
- `_decidirQueConstruir` hace 1 llamada `this._rpc('llm.complete.request', ...)`
  headless (`system=GUION`, `temperature: 0.2`, `timeout_ms: 30000`, `tools: []`).
  `_parse` tolera fences ```json; `_validarEspecificacion` valida contra el catálogo.
- `_construir` es la operación maestra: decidir (fuzzy→reflejo) + montar (reflejo).
- `onConstruirRequest` delega en `_atender(e, 'construir',
  'nichos.solucion.construir.response', fn)`; `onCaminoDecidido` (fire-and-forget)
  hace el mismo publicar `nichos.solucion.construida` / `nichos.solucion.construir.failed`.
- DEP hacia delante: lo consumen proponedor-modelo-cobro (D4), motor-cobro (E3) y
  el pipeline; depende de catalogo-capacidades (D3); entra por `nichos.camino.decidido` (C4).
