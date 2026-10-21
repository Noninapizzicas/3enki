---
name: perfil-administrativo
description: >-
  Skill FULL del módulo CUSTODIO CON PERSISTENCIA `perfil-administrativo` de la vertical
  contabilidad (Enki). Perfil DECLARABLE de administraciones y obligaciones (territorio y
  régimen). Un solo escritor (rol `ADMINISTRATIVO`; otro → 403). El sistema PREGUNTA, no estima:
  lo no declarado queda `ABIERTO`. Append-only del historial. Persiste por proyecto vía
  PosPersistencia (`/contabilidad/perfil-administrativo`), restaura en `project.activated`. Al
  declarar publica `contabilidad.perfil_administrativo_declarado` y sube (best-effort)
  `cola-declaraciones-criterio.fijar.request` y `calendario-fiscal.declarar.request`. La op
  `declarar` es ORDEN (system_panel); `obligaciones` es PREGUNTA (sin ui_handler).
when-to-use: >-
  - Cuando necesites declarar el perfil (régimen, territorio, obligaciones) de un proyecto
    (RPC perfil-administrativo.declarar.request) o leerlo (perfil-administrativo.obligaciones.request).
  - Cuando depures un 403 (rol ≠ ADMINISTRATIVO) o por qué algo queda `ABIERTO` (sin régimen,
    territorio ni obligaciones declaradas).
  - Cuando quieras entender su contrato de eventos y su papel de fuente declarable para D3/D6.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, custodio, persistencia, contabilidad, fiscal, perfil, obligaciones, declarable]
---

# perfil-administrativo — CUSTODIO del perfil declarable de administraciones

## Qué hace el módulo

`perfil-administrativo` es un **CUSTODIO CON PERSISTENCIA** (D15, hoja del plan) de la vertical
**contabilidad**, eje **fiscal**. Guarda el **perfil declarable** del proyecto: su **régimen**,
su **territorio** y la lista de **obligaciones** (modelo, periodicidad, administración).

**El sistema PREGUNTA, no estima.** Si nada se declara, el perfil queda `ABIERTO`: no se inventan
ni territorio ni régimen ni obligaciones. Es la fuente declarable que alimenta a D3
(cola-declaraciones-criterio) y D6 (calendario-fiscal), por evento.

**Invariantes que impone el código:**
- **UN SOLO ESCRITOR**: guard de rol `ADMINISTRATIVO`; cualquier otro (incluido `null`) → `403 PERMISSION_DENIED`.
- **APPEND-ONLY del historial**: cada declaración apila `{estado, regimen, territorio, num_obligaciones, por, en}`.
- **Dato ausente = desconocido**: sin régimen/territorio/obligaciones → `estado:'ABIERTO'`.
- **Declaración acumulativa**: los campos no declarados en una llamada **no borran** los previos
  (régimen/territorio solo se sobreescriben si llegan; las obligaciones solo si son array con elementos).

Persiste por proyecto con **PosPersistencia** (storage `/contabilidad/perfil-administrativo`),
restaura en `project.activated`. La op `declarar` es **ORDEN** → `ui_handler` `system_panel`
(la mesa del asesor); `obligaciones` es **PREGUNTA** → sin `ui_handler`.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Qué hace |
|---|---|---|
| `perfil-administrativo.obligaciones.request` | `onObligacionesRequest` | RPC de LECTURA (PREGUNTA): `{project_id}` → `{regimen, territorio, obligaciones, estado, declarado_en, abierto}`. Lee el perfil declarado, **no lo calcula**. Si `status ≠ 200` publica `.failed`. Responde por `perfil-administrativo.obligaciones.response`. |
| `perfil-administrativo.declarar.request` | `onDeclararRequest` | RPC de ESCRITURA (ORDEN): `{project_id, rol, regimen?, territorio?, obligaciones?}`. Guard de rol, declara, y publica `contabilidad.perfil_administrativo_declarado` + sube a `cola-declaraciones-criterio.fijar.request` y `calendario-fiscal.declarar.request`. Si `status ≠ 200` publica `.failed`. Responde por `perfil-administrativo.declarar.response`. |
| `project.activated` | `onProjectActivated` | Restaura el perfil del proyecto activado desde el storage. |

### Publishes

| Evento | Cuándo |
|---|---|
| `contabilidad.perfil_administrativo_declarado` | Fire-and-forget (D15): al declarar (status 200) → `{project_id, regimen, territorio, obligaciones, estado, abierto, correlation_id}`. |
| `cola-declaraciones-criterio.fijar.request` | Best-effort por EVENTO al declarar: sube el perfil como criterio (D3). |
| `calendario-fiscal.declarar.request` | Best-effort por EVENTO al declarar: sube obligaciones/régimen/territorio al calendario (D6). |
| `perfil-administrativo.obligaciones.response` / `.obligaciones.failed` | Respuesta + par de fallo de `obligaciones`. |
| `perfil-administrativo.declarar.response` / `.declarar.failed` | Respuesta + par de fallo de `declarar`. |

> **Sí publica un HECHO** (`contabilidad.perfil_administrativo_declarado`): declarar **es escribir**
> → R2 obliga a anunciarlo. Además sube best-effort a D3 y D6.

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `declarar` | **ORDEN** (ui_handler: system_panel) | `{project_id, rol:'ADMINISTRATIVO', regimen?, territorio?, obligaciones?:[{modelo, periodicidad, administracion}]}` | `{project_id, perfil:{regimen, territorio, obligaciones, estado, declarado_por, declarado_en}, declarado, abierto}` | `403 PERMISSION_DENIED` (rol ≠ ADMINISTRATIVO); `400 INVALID_INPUT` (falta `project_id`); `500`. |
| `obligaciones` | **PREGUNTA** (sin ui_handler) | `{project_id}` | `{project_id, regimen, territorio, obligaciones, estado, declarado_en, abierto}` o ABIERTO | `400 INVALID_INPUT` si falta `project_id`; `500`. |

## Reglas de negocio

1. **Guard estricto de escritor**: `input.rol !== 'ADMINISTRATIVO'` → `403` (incluso `rol` ausente).
   A diferencia de otros custodios, aquí la puerta **sí** se cierra al vacío.
2. **Campos declarables normalizados**: `_txt` hace `trim`; vacío/`null` → `null`. Las obligaciones
   se filtran a objetos y se mapean a `{modelo, periodicidad, administracion}` (strings o `null`).
3. **Declarado vs ABIERTO**: `declarado = Boolean(regimen || territorio || obligaciones.length)`.
   Si no hay ninguno → `estado:'ABIERTO'`; si hay alguno → `estado:'DECLARADO'`.
4. **Acumulativo**: partiendo del perfil existente, se sobreescriben solo los campos declarados
   (régimen/territorio si no son `null`; obligaciones solo si el array tiene elementos).
5. **Lectura honesta**: si no hay perfil → `200` con `abierto:true` y
   `motivo:'el perfil administrativo no esta declarado: el sistema pregunta, no estima'`.
6. **Append-only**: cada declaración apila en `historial` (nada se borra) y actualiza `updated_at`.
7. **Subidas best-effort**: los dos `publish` a D3/D6 se hacen siempre al declarar (status 200),
   con `correlation_id`.
8. **HTTP exacto**: éxito `200`; rol → `403`; input → `400`; excepción → `500`.

## Cómo se usa (RPC)

### Declarar el perfil

```json
{
  "project_id": "e57a318a-...",
  "rol": "ADMINISTRATIVO",
  "regimen": "general",
  "territorio": "comun",
  "obligaciones": [
    { "modelo": "303", "periodicidad": "trimestral", "administracion": "AEAT" },
    { "modelo": "111", "periodicidad": "trimestral", "administracion": "AEAT" }
  ],
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "perfil": {
    "regimen": "general",
    "territorio": "comun",
    "obligaciones": [ { "modelo": "303", "periodicidad": "trimestral", "administracion": "AEAT" }, {…} ],
    "estado": "DECLARADO",
    "declarado_por": "ADMINISTRATIVO",
    "declarado_en": "2026-09-30T..."
  },
  "declarado": true,
  "abierto": false
}
```
Emite `contabilidad.perfil_administrativo_declarado` + sube `cola-declaraciones-criterio.fijar.request`
y `calendario-fiscal.declarar.request`.

### Leer las obligaciones (aún sin declarar)

```json
{ "project_id": "e57a318a-..." }
```
→ `200 {regimen:null, territorio:null, obligaciones:[], abierto:true, motivo:'el perfil administrativo no esta declarado: el sistema pregunta, no estima'}`.

### Rol inválido — 403

```json
{ "project_id": "...", "regimen": "general" }
```
→ `403 PERMISSION_DENIED` con `{rol_esperado:'ADMINISTRATIVO', rol_recibido:null}`.

## Errores y qué significan

| Código | HTTP | Causa |
|---|---|---|
| `PERMISSION_DENIED` | 403 | `rol` ≠ `ADMINISTRATIVO` (o ausente). |
| `INVALID_INPUT` | 400 | Falta `project_id` en cualquiera de las dos ops. |
| `UNKNOWN_ERROR` | 500 | Excepción no controlada. |

## Relación con otras piezas (deps por EVENTO)

- **Restaura con**: `project.activated` (core).
- **Sube a (best-effort)**: `cola-declaraciones-criterio.fijar.request` (D3), `calendario-fiscal.declarar.request` (D6).
- **Publica el hecho** `contabilidad.perfil_administrativo_declarado` que leen D3/D6.
- **Le consultan por RPC**: `estimacion-is-irpf` (D5) llama a `perfil-administrativo.obligaciones.request`.

## Verificación

1. Fichero: `modules/contabilidad-fiscal/perfil-administrativo/`.
2. Eventos reales: subscribes `perfil-administrativo.obligaciones.request`,
   `perfil-administrativo.declarar.request`, `project.activated`; publishes
   `contabilidad.perfil_administrativo_declarado`, `cola-declaraciones-criterio.fijar.request`,
   `calendario-fiscal.declarar.request`, `perfil-administrativo.obligaciones.response`,
   `.obligaciones.failed`, `perfil-administrativo.declarar.response`, `.declarar.failed`.
3. Strings en código:
   ```bash
   grep -oE "publish\('[^']*'" modules/contabilidad-fiscal/perfil-administrativo/index.js
   # → contabilidad.perfil_administrativo_declarado / cola-declaraciones-criterio.fijar.request
   # → calendario-fiscal.declarar.request / perfil-administrativo.declarar.failed / perfil-administrativo.obligaciones.failed
   ```
4. Persistencia: file `perfil-administrativo.json`, dir `/contabilidad/perfil-administrativo`,
   esquema `contabilidad-perfil-administrativo-v1`.
5. Test unitario (si existe): declarar → 200 + hecho + subidas; leer sin declarar → ABIERTO;
   rol inválido → 403; acumulativo; `project.activated` restaura.
