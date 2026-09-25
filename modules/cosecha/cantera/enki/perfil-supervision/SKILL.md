---
name: perfil-supervision
description: >
  Skill FULL del módulo CUSTODIO CON PERSISTENCIA `perfil-supervision` de la vertical
  nichos (Radar de Nichos). Guarda el PERFIL DE SUPERVISIÓN por proyecto: cadencia de pulso
  (diaria|semanal|quincenal|tiempo_real) y límites declarables (max_alertas_dia,
  techo_perdida_eur). Es el STORE que canal-supervision (G1) y el monitor/pulso consumen
  para decidir cuándo y cómo avisar al dueño. Un solo escritor (DUEÑO, guard de rol);
  la lectura no muta. Persiste por proyecto vía PosPersistencia. Úsala para operar, depurar
  o extender el custodio, o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites declarar o consultar el perfil de supervisión de un proyecto
    (RPC nichos.supervision.declarar.request / nichos.supervision.leer.request).
  - Cuando depures por qué una declaración se rechaza (PERMISSION_DENIED si el rol no es
    DUEÑO, INVALID_INPUT si la cadencia no está permitida o los límites están vacíos).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las reglas de
    negocio (un solo escritor, cadencias/límites validados, merge conservador).
  - Cuando vayas a escribir/ampliar el test unitario del custodio.
tags: [enki, modulo, custodio, persistencia, nichos, radar, supervision, proyecto-3d]
---

# perfil-supervision — CUSTODIO CON PERSISTENCIA del perfil de supervisión del nicho

## Qué hace el módulo

`perfil-supervision` es un **CUSTODIO CON PERSISTENCIA** (H2, hoja del plan): el dueño del
store del perfil de supervisión **por proyecto**. Guarda la **cadencia de pulso** de la
supervisión del nicho (`diaria|semanal|quincenal|tiempo_real`) y los **límites declarables**:
`max_alertas_dia` (tope de alertas al día) y `techo_perdida_eur` (tope de pérdida económica).
Es el **STORE** que **canal-supervision (G1)** y el **monitor/pulso (G2/escalones-mensaje)**
consumen para decidir cuándo y cómo avisar al dueño.

Un **solo escritor** del store: el **DUEÑO** declara la cadencia y los límites (guard de rol en
`_declarar`); el canal y el monitor son solo **lectores** (`_leer` no muta). Persiste por
proyecto con **PosPersistencia** (storage `/prisma/nichos/perfil-supervision.json`), restaura
en `project.activated` y vuelca en `onUnload`. Emite `nichos.supervision.declarado` en éxito y
su par de fallo `nichos.supervision.declarar.failed` en rechazo.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `nichos.supervision.leer.request` | `onLeerRequest` | RPC custodio: {project_id} → {project_id, perfil}. Lee el perfil de supervisión vigente del proyecto (cadencia_pulso, limites{max_alertas_dia, techo_perdida_eur}). La lectura no muta. Lo consumen el canal de supervisión (G1) y el monitor/pulso de nicho. |
| `nichos.supervision.declarar.request` | `onDeclararRequest` | RPC custodio: {project_id, rol:'DUEÑO', perfil:{cadencia_pulso?, limites?}} → {project_id, perfil, declarado}. Guard Rol=DUEÑO (second-writer rechazado). Persiste el perfil, publica `nichos.supervision.declarado` y responde por `nichos.supervision.declarar.response`. Si no es DUEÑO o el perfil es inválido (cadencia no permitida, límites vacíos) → `nichos.supervision.declarar.failed`. |
| `project.activated` | `onProjectActivated` | Restaura el perfil de supervisión del proyecto activado desde el storage (PosPersistencia). |

### Publishes

| Evento | Descripción |
|---|---|
| `nichos.supervision.declarado` | Fire-and-forget (H2): el DUEÑO declaró el perfil de supervisión → {project_id, perfil, declarado:true}. Lo consumen el canal de supervisión (G1) y el monitor/pulso (G2/escalones-mensaje) para aplicar la cadencia y límites vigentes. |
| `nichos.supervision.declarar.failed` | Par de fallo determinista (H2): declaración rechazada (rol != DUEÑO) o perfil inválido → {status, code, message, data}. Cierra el círculo de nichos.supervision.declarar.request. |

> **Regla de cierre de círculo**: el par `nichos.supervision.declarar.failed` cierra el círculo de
> `nichos.supervision.declarar.request`. En éxito `onDeclararRequest` propaga el fire-and-forget de
> dominio `nichos.supervision.declarado` (con `correlation_id` del request) además de la `.response`.

> **Nota: los eventos de dominio que emite index.js en `onDeclararRequest` (nichos.supervision.declarado,
> nichos.supervision.declarar.failed) coinciden exactamente con los publicados en module.json** — no hay
> sub-declaración en este módulo. Además `index.js` define el alias semántico `leerPerfil(pid)` (helper
> público, NO un RPC del manifest) que canal-supervision (G1) puede invocar en proceso.

## Reglas de negocio

1. **Un solo escritor (guard de rol)**: `_declarar` exige `rol === 'DUEÑO'` (constante `ROL_DUENYO`).
   Si el rol es cualquiera otro (p. ej. `'CANAL'`, `'MONITOR'`) → `403 PERMISSION_DENIED` con
   `{ status:403, code:'PERMISSION_DENIED', mensaje:'solo el DUEÑO puede declarar el perfil de supervisión', rol_esperado:'DUEÑO', rol_recibido:<rol> }`
   + `nichos.supervision.declarar.failed`. Second-writer rechazado.
2. **Perfil obligatorio → `400 INVALID_INPUT`**: si `perfil` falta o no es objeto →
   `{ status:400, code:'INVALID_INPUT', mensaje:'perfil requerido', field:'perfil' }` + failed.
3. **Cadencias cerradas**: `perfil.cadencia_pulso` debe estar en `['diaria','semanal','quincenal','tiempo_real']`
   (Set `CADENCIAS`). Si se declara una no permitida (p. ej. `'mensual'`) → `400 INVALID_INPUT`
   `perfil.cadencia_pulso`. El valor se normaliza a minúsculas.
4. **Límites con al menos un valor positivo**: `perfil.limites.max_alertas_dia` y
   `perfil.limites.techo_perdida_eur` se normalizan con `numPos` (entero estrictamente `> 0`). Si
   AMBOS quedan `null` (vacíos o no positivos) → `400 INVALID_INPUT` `perfil.limites`. Cero límites
   ≤ 0.
5. **`project_id` obligatorio → `400 INVALID_INPUT`**: si falta `project_id` → `_invalid('project_id')`
   (mismo shape `{status:400, code:'INVALID_INPUT', field:'project_id'}`) + failed.
6. **Merge conservador sobre el molde**: `_declarar` preserva el valor previo de cada campo si no viene
   en la nueva declaración (cadencia previa, límites previos). Marca `updated_at` ISO y `declarado_por:'DUEÑO'`.
7. **La lectura no muta**: `_leer` obtiene o crea el perfil (`_obtenerOCrear`, que solo crea el
   `perfilVacio()` si no existe) y devuelve `200 {project_id, perfil}` sin tocar el perfil.
8. **HTTP exacto**: éxito `200`; rol inválido → `403`; campos inválidos → `400`;
   excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPC request/response que responde en `nichos.supervision.declarar.response` y `nichos.supervision.leer.response`:

### 1. `declarar` — declarar/ajustar el perfil de supervisión (solo DUEÑO)

```json
{
  "project_id": "e57a318a-...",
  "rol": "DUEÑO",
  "perfil": {
    "cadencia_pulso": "diaria",
    "limites": { "max_alertas_dia": 3, "techo_perdida_eur": 150 }
  },
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "perfil": {
    "esquema": "nichos-perfil-supervision-v1",
    "cadencia_pulso": "diaria",
    "limites": { "max_alertas_dia": 3, "techo_perdida_eur": 150 },
    "updated_at": "2026-09-25T10:00:00.000Z",
    "declarado_por": "DUEÑO"
  },
  "declarado": true
}
```
Emite `nichos.supervision.declarado`:
```json
{ "project_id": "e57a318a-...", "perfil": { "esquema": "nichos-perfil-supervision-v1", "cadencia_pulso": "diaria", "limites": { "max_alertas_dia": 3, "techo_perdida_eur": 150 }, "updated_at": "...", "declarado_por": "DUEÑO" }, "declarado": true, "correlation_id": "abc-123" }
```

### 2. `leer` — consultar el perfil vigente (no muta)

```json
{ "project_id": "e57a318a-..." }
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "perfil": { "esquema": "nichos-perfil-supervision-v1", "cadencia_pulso": "diaria", "limites": { "max_alertas_dia": 3, "techo_perdida_eur": 150 }, "updated_at": "...", "declarado_por": "DUEÑO" } }
```

### Fallos típicos

- Rol distinto de DUEÑO (p. ej. `'CANAL'`) → `403` + `nichos.supervision.declarar.failed` (`PERMISSION_DENIED`).
- Cadencia no permitida (`'mensual'`) → `400` + failed (`INVALID_INPUT`).
- Límites vacíos o no positivos → `400` + failed (`INVALID_INPUT`).
- Falta `project_id` o `perfil` → `400` + failed (`INVALID_INPUT`).

## Tests

El test vive en `tests/unit/nichos__perfil-supervision.test.js`. Cubre:

- `declarar` con rol DUEÑO y perfil válido → `200`, guarda cadencia/límites, publica
  `nichos.supervision.declarado` y su `.response` correlado con `request_id`.
- `leer` → `200 {project_id, perfil}` sin mutar.
- `declarar` de ajuste → **merge conservador** (preserva cadencia/límites previos) y `declarado_por:'DUEÑO'`.
- Rol distinto → `403 PERMISSION_DENIED` + `nichos.supervision.declarar.failed`.
- Perfil inválido (cadencia no permitida / límites vacíos) → `400 INVALID_INPUT` + failed.
- `project.activated` restaura el perfil de otro proyecto vía PosPersistencia.
- Manifest: subscribes (leer/declarar/project.activated) ↔ handlers y publishes exactos de la hoja H2.

Para ejecutarlo (test central del repo):

```bash
cd /home/admin/3enki
node tests/unit/nichos__perfil-supervision.test.js
```

## Notas de implementación

- Clase `PerfilSupervision extends ModuloHibridoReflejo`; `name = 'perfil-supervision'`,
  `version = 'reflejo-0.1.0'`. Store en memoria `this._perfiles` (Map project_id → perfil).
- **PosPersistencia**: `this._persist = new PosPersistencia({ modulo: this, file:
  'perfil-supervision.json', dir: '/prisma/nichos', snapshot, hidratar })`.
  `onProjectActivated` → `restaurar(project_id)`; `onUnload` → `flush()` + `detener()`. Las
  escrituras/lecturas con creación marcan `marcarDirty(pid)`.
- `onDeclararRequest` delega en `_atender(e, 'declarar', 'nichos.supervision.declarar.response', fn)` y
  hace el fire-and-forget de dominio (`nichos.supervision.declarado` en 200 o
  `nichos.supervision.declarar.failed` si no) dentro del handler, propagando `correlation_id`.
- `onLeerRequest` delega en `_atender(e, 'leer', 'nichos.supervision.leer.response', d => this._leer(d))`.
- Proyecciones: `_leer` (lectura, no muta) y `_declarar` (escritura con guard de rol + merge
  conservador); alias semántico `leerPerfil(pid)` para G1 (canal-supervision). Helpers
  `perfilVacio()`/`numPos`. `_invalid`/`_errorResponse` vienen de `modulo-hibrido-reflejo`.
- Tools: `toolLeer` → `_leer`, `toolDeclarar` → `_declarar`.
- DEP hacia delante: lo consumen canal-supervision (G1) y el monitor/pulso (G2/escalones-mensaje).
