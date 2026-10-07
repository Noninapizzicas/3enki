---
name: vista-portafolio
description: >
  Skill FULL del módulo CUSTODIO CON PERSISTENCIA `vista-portafolio` de la vertical nichos
  (Radar de Nichos). Dashboard que cruza la salud de TODOS los nichos/módulos en una vista
  agregada de portafolio para el jefe: cuántos en cada estado de salud (GENERA|SANGRA|NEUTRO)
  y el total en caja. Es el dashboard que responde "cómo va todo". CUSTODIO HÍBRIDO:
  ingesta reflejo (cruza la salud financiera F3 y regenera la VistaPortafolio) + guardado
  custodio del store de vistas + lectura (DashboardJefe). Persiste por proyecto vía
  PosPersistencia. Publica nichos.vista_portafolio y su par de fallo. Úsala para operar,
  depurar o extender el custodio, o para entender su contrato de eventos y sus reglas.
when-to-use: >
  - Cuando necesites leer o (re)generar la vista agregada de portafolio de un proyecto
    (RPC nichos.vista.leer.request / nichos.vista.guardar.request).
  - Cuando depures por qué la vista no se regenera (falta project_id) o quieras entender el
    flujo fire-and-forget de nichos.salud.actualizada (F3).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las reglas de
    negocio (agregación por salud vigente por nicho, totales, en_caja).
  - Cuando vayas a escribir/ampliar el test unitario del custodio.
tags: [enki, modulo, custodio, persistencia, nichos, radar, portafolio, dashboard, salud, proyecto-3d]
---

# vista-portafolio — CUSTODIO CON PERSISTENCIA de la vista agregada de portafolio

## Qué hace el módulo

`vista-portafolio` es un **CUSTODIO CON PERSISTENCIA** (K1, hoja del plan): cruza la **SALUD de
TODOS los nichos/módulos** en una **VISTA AGREGADA de portafolio** para el jefe — cuántos nichos
están en cada **estado de salud del pipeline** (`GENERA|SANGRA|NEUTRO`) y el **total en caja**.
Es el dashboard que responde "¿cómo va todo?" sin mirar nicho a nicho.

Es un **CUSTODIO HÍBRIDO** (patrón real de perfil-supervision):

- `_agregarSalud` — **REFLEJO**: cruza una salud (F3) recibida contra el store y regenera la
  VistaPortafolio (pura);
- `_guardarVista` — **CUSTODIO**: persiste la vista agregada en el store;
- `_leer` — lectura (**no muta**): DashboardJefe.

Escucha el fire-and-forget **`nichos.salud.actualizada`** (F3) y re-agrega/guarda la vista cada vez.
Persiste por proyecto con **PosPersistencia** (storage `/prisma/nichos/vista-portafolio.json`),
restaura en `project.activated` y vuelca en `onUnload`. Emite `nichos.vista_portafolio` en éxito y
su par de fallo `nichos.vista.guardar.failed`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response + fire-and-forget)

| Evento | Handler | Descripción |
|---|---|---|
| `nichos.vista.leer.request` | `onLeerRequest` | RPC custodia: {project_id} → DashboardJefe (la vista agregada actual del portafolio). No muta. Responde por `nichos.vista.leer.response`. |
| `nichos.vista.guardar.request` | `onGuardarRequest` | RPC custodia: {project_id, salud*} → re-agrega la VistaPortafolio de la salud recibida (o del store) y la guarda. Éxito → publica `nichos.vista_portafolio` y responde por `nichos.vista.guardar.response`. Fallo (sin salud) → `nichos.vista.guardar.failed`. |
| `nichos.salud.actualizada` | `onSaludActualizada` | Fire-and-forget (F3): cuadro-salud-financiera emite la salud de un nicho → el custodia re-agrega la vista del portafolio (reflejo) y la guarda; publica `nichos.vista_portafolio` actualizada. |
| `project.activated` | `onProjectActivated` | Custodio: restaura el store de vistas del proyecto activado vía PosPersistencia. |

### Publishes

| Evento | Descripción |
|---|---|
| `nichos.vista_portafolio` | Fire-and-forget (K1): la vista agregada de portafolio fue regenerada y guardada → {project_id, vista: VistaPortafolio, totales}. La consume el jefe (panel) y el canal de supervisión para el dashboard. |
| `nichos.vista.guardar.failed` | Par de fallo determinista: no hay salud que cruzar o la vista no pudo guardarse → {status, code, mensaje}. Cierra el círculo de nichos.vista.guardar.request. |

> **Regla de cierre de círculo**: el par `nichos.vista.guardar.failed` cierra el círculo de
> `nichos.vista.guardar.request`. En éxito `onGuardarRequest` y `onSaludActualizada` propaga el
> fire-and-forget de dominio `nichos.vista_portafolio` (payload `{project_id, vista, totales}`)
> además de la `.response` (en el RPC de guardado).

> **Nota de honestidad**: `nichos.salud.actualizada` (subscribes) no es un RPC request/response — es
> un **fire-and-forget** de transición que `index.js` (`onSaludActualizada`) maneja re-agregando y
> guardando, y publica el mismo evento de dominio `nichos.vista_portafolio` que el RPC de guardado.
> Está correctamente declarado en module.json (no es sub-declaración), pero conviene marcarlo porque
> no sigue el patrón request/response de los demás.

## Reglas de negocio

1. **`project_id` obligatorio → `400 INVALID_INPUT`**: si falta → `_invalid('project_id')` en
   `_guardarVista` y `_leer` + failed.
2. **Ingesta reflejo: un nicho solo tiene UNA salud vigente**: `_agregarSalud` normaliza la salud con
   `['GENERA','SANGRA','NEUTRO'].includes(s) ? s : 'NEUTRO'` (cualquier valor desconocido → `NEUTRO`).
   Reemplaza/agrega en `v.por_estado[nicho]` (si el nicho ya tenía salud, el contador de buckets y
   `en_caja` reflejan la salud más reciente) e incrementa `v.salud[val]`.
3. **`en_caja` solo para lo que GENERA**: en `_agregarSalud`, `if (val === 'GENERA') v.en_caja += 1`.
   Los nichos SANGRA/NEUTRO no suman a la caja.
4. **Totales honestos**: `_vistaDesdeSalud` arranca de `vistaVacia()` (`total_nichos:0, en_caja:0,
   salud:{GENERA:0,SANGRA:0,NEUTRO:0}, por_estado:{}`), marca `actualizada_en` ISO, agrega CADA nicho
   del store auxiliar `_salud`, y fija `total_nichos = saludMap.size`.
5. **CERO salud inventada**: si no se recibe salud alguna, la vista queda `NEUTRO` vacía por los
   defaults — nunca se fabrican estados que no llegaron del store de salud (F3).
6. **CUSTODIO guarda la vista regenerada**: `_guardarVista` guarda la salud `salud_extra` (si viene)
   en el auxiliar `_salud` (set por `nicho`), regenera desde ahí y persist e; marca `marcarDirty(pid)`.
7. **La lectura no muta (con cache honesto)**: `_leer` devuelve la vista guardada o la regenera al
   vuelo; si no había vista, la setea en el store como **cache** (primera lectura "materializa" el
   dashboard sin inventar salud). Responde `{project_id, vista, dashboard_jefe:true}`.
8. **HTTP exacto**: éxito `200`; falta `project_id` → `400`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPC request/response que responden en `nichos.vista.leer.response` y `nichos.vista.guardar.response`:

### 1. `leer` — leer el DashboardJefe (no muta)

```json
{ "project_id": "e57a318a-..." }
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "vista": {
    "esquema": "nichos-vista-portafolio-v1",
    "total_nichos": 2,
    "en_caja": 1,
    "salud": { "GENERA": 1, "SANGRA": 0, "NEUTRO": 1 },
    "por_estado": { "pan-artesano-cordoba": "GENERA", "vivero-local": "NEUTRO" },
    "actualizada_en": "2026-09-25T10:00:00.000Z"
  },
  "dashboard_jefe": true
}
```

### 2. `guardar` — re-agregar (con o sin salud extra) y guardar la vista

```json
{ "project_id": "e57a318a-...", "nicho": "pan-artesano-cordoba", "salud_extra": "GENERA", "correlation_id": "abc-123" }
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "vista": { "esquema": "nichos-vista-portafolio-v1", "total_nichos": 1, "en_caja": 1, "salud": { "GENERA": 1, "SANGRA": 0, "NEUTRO": 0 }, "por_estado": { "pan-artesano-cordoba": "GENERA" }, "actualizada_en": "..." }, "totales": 1 }
```
Emite `nichos.vista_portafolio`:
```json
{ "project_id": "e57a318a-...", "vista": { "esquema": "nichos-vista-portafolio-v1", "total_nichos": 1, "en_caja": 1, "salud": { "GENERA": 1, "SANGRA": 0, "NEUTRO": 0 }, "por_estado": { "pan-artesano-cordoba": "GENERA" }, "actualizada_en": "..." }, "totales": 1 }
```

### 3. Re-agregación automática (fire-and-forget, `nichos.salud.actualizada` → publica `nichos.vista_portafolio`)

cuadro-salud-financiera (F3) emite `nichos.salud.actualizada`; `onSaludActualizada` re-agrega con
`{ project_id, nicho, salud_extra }` (lee `salud`/`estado_salud`/`tipo_salud` del payload) y publica
`nichos.vista_portafolio` actualizada.

### Fallo típico

- Falta `project_id` en `leer`/`guardar` → `400` + `nichos.vista.guardar.failed` (`INVALID_INPUT`).

## Tests

El test vive en `tests/unit/nichos__vista-portafolio.test.js`. Cubre:

- `leer` → `200` devuelve el DashboardJefe (`dashboard_jefe:true`) con `vista` y `totales`, sin mutar.
- `guardar` con `salud_extra` → re-agrega la vista (health buckets, `en_caja`), publica
  `nichos.vista_portafolio` + `.response`.
- `_agregarSalud` normaliza salud desconocida a `NEUTRO` y suma solo `GENERA` a `en_caja`.
- Un nicho con salud re-declarada → reemplaza su `por_estado`, no duplica contadores.
- `_vistaDesdeSalud` totaliza correctamente `total_nichos` y `actualizada_en`.
- `onSaludActualizada` (fire-and-forget) re-agrega y publica `nichos.vista_portafolio`.
- Falta `project_id` → `400 INVALID_INPUT` + failed.
- `project.activated` restaura la vista del proyecto (PosPersistencia).
- Manifest: subscribes/publishes exactos de la hoja K1.

Para ejecutarlo (test central del repo):

```bash
cd /home/admin/3enki
node tests/unit/nichos__vista-portafolio.test.js
```

## Notas de implementación

- Clase `VistaPortafolio extends ModuloHibridoReflejo`; `name = 'vista-portafolio'`,
  `version = 'reflejo-0.1.0'`. Stores en memoria: `this._vistas` (Map project_id → VistaPortafolio) y
  `this._salud` (Map project_id → Map<nicho, salud>) auxiliar para re-agregar.
- **PosPersistencia**: `this._persist = new PosPersistencia({ modulo: this, file:
  'vista-portafolio.json', dir: '/prisma/nichos', snapshot, hidratar })`. `onProjectActivated` →
  `restaurar(project_id)`; `onUnload` → `flush()` + `detener()`. `_guardarVista` marca `marcarDirty(pid)`.
- `onLeerRequest` → `_atender(e, 'leer', 'nichos.vista.leer.response', d => _leer(d))`.
  `onGuardarRequest` → `_atender(e, 'guardar', 'nichos.vista.guardar.response', d => _guardarVista(d))`
  con el fire-and-forget de dominio (`nichos.vista_portafolio` vía `_payloadVista` en 200 o
  `nichos.vista.guardar.failed` si no).
- `onSaludActualizada` es el handler **fire-and-forget** (no `_atender`): re-agrega con
  `_guardarVista({project_id, nicho, salud_extra})` y publica `nichos.vista_portafolio` si es 200.
- Proyecciones: `_agregarSalud` (reflejo puro), `_vistaDesdeSalud` (regenera desde el store auxiliar),
  `_guardarVista` (custodio), `_leer` (lectura no muta, cachea la vista si no existía). Helper
  `vistaVacia()`. `_payloadVista(res)` = `{project_id, vista, totales}`.
- Tools: `toolLeer` → `_leer`, `toolGuardarVista` → `_guardarVista`.
- DEP hacia delante: lo consume el jefe (panel) y el canal de supervisión (dashboard). Fuente de
  salud: cuadro-salud-financiera (F3).
