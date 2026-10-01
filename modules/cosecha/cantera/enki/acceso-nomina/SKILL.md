---
name: acceso-nomina
description: >-
  Skill FULL del módulo CUSTODIO CON PERSISTENCIA `acceso-nomina` de la vertical contabilidad
  (Enki). Gobernanza de QUIÉN VE QUÉ nómina: cada uno ve la suya. UN escritor. Complementa I4
  (eje persona). El default es `propio`; ver la de otro exige declararlo. Dato ausente =
  desconocido: sin regla declarada, `autorizado:null` (no se concede por silencio). No se borra:
  re-declarar appendea al historial de la regla. Publica el hecho
  contabilidad.acceso_nomina_declarado. Persiste por proyecto vía PosPersistencia.
when-to-use: >-
  - Cuando necesites declarar quién puede ver la nómina de un empleado, o preguntar si una
    identidad está autorizada (RPC acceso-nomina.declarar.request / .autorizar.request).
  - Cuando depures por qué `autorizado:null` (sin regla declarada y solicitante ≠ empleado).
  - Cuando quieras entender su contrato de eventos y su hecho contabilidad.acceso_nomina_declarado.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, custodio, persistencia, contabilidad, fiscal, nomina, acceso, gobernanza]
---

# acceso-nomina — CUSTODIO de la gobernanza de acceso a la nómina

## Qué hace el módulo

`acceso-nomina` es un **CUSTODIO CON PERSISTENCIA** (G7, hoja del plan). Gobierna **QUIÉN VE QUÉ
nómina**: cada uno ve la suya. **UN escritor.** Complementa I4 (eje persona).

La parcela se **DECLARA** por empleado; el módulo **no inventa una política por defecto**, la
aplica. Invariantes:
- **El DEFAULT es `propio`**: cada empleado ve su nómina; ver la de otro exige declararlo.
- **Dato ausente = desconocido**: sin regla declarada, `autorizado:null` (no `true`) — un acceso
  que no consta **NO se concede por silencio**.
- **No se borra**: re-declarar **APPENDEA** al historial de la regla; el vigente queda con su fecha.

Persiste por proyecto con **PosPersistencia** (storage `/contabilidad/acceso-nomina`, archivo
`acceso-nomina.json`), restaura en `project.activated` y vuelca en `onUnload`.

**Dos caras:** `autorizar` es **PREGUNTA** (bus, sin `ui_handler`); `declarar` es **ORDEN**
(`system_panel`).

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `acceso-nomina.autorizar.request` | `onAutorizarRequest` | RPC custodio (**PREGUNTA**, por el bus): `{project_id, empleado_id, solicitante}` → `{project_id, empleado_id, solicitante, autorizado, motivo, regla_declarada, abierto}`. Sin regla declarada: cada uno ve la suya (true) y ver la de otro queda `autorizado:null`. Responde por `.autorizar.response`. |
| `acceso-nomina.declarar.request` | `onDeclararRequest` | RPC custodio (**ORDEN**, panel): `{project_id, empleado_id, quien_puede_ver?}` → `{project_id, regla, declarado}`. Declara qué identidades pueden ver la nómina de un empleado (el propio siempre). Publica `contabilidad.acceso_nomina_declarado`. Responde por `.declarar.response`. |
| `project.activated` | `onProjectActivated` | Restaura las reglas de acceso del proyecto activado desde el storage. |

> Nota de deriva (R3): el plan declara subir `cola-declaraciones-criterio.fijar.request`, pero el
> `module.json` real **no** lo declara. No hay envío a la cola de criterios en el código.

### Publishes

| Evento | Cuándo |
|---|---|
| `contabilidad.acceso_nomina_declarado` | Fire-and-forget (G7): quedó declarada la regla de acceso a una nómina → `{project_id, empleado_id, regla, declarado:true}`. Lo consume `recibo-nomina` (para autorizar la entrega del recibo). |
| `acceso-nomina.autorizar.response` | Respuesta RPC correlada de la op `autorizar`. |
| `acceso-nomina.autorizar.failed` | Fallo determinista: falta `project_id` o `empleado_id`. |
| `acceso-nomina.declarar.response` | Respuesta RPC correlada de la op `declarar`. |
| `acceso-nomina.declarar.failed` | Fallo determinista: falta `project_id` o `empleado_id`. |

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `autorizar` | **PREGUNTA** (bus) | `{project_id, empleado_id, solicitante?\|rol?}` | `{project_id, empleado_id, solicitante, autorizado, motivo, regla_declarada, regla?, abierto}` | 400 `INVALID_INPUT` (`project_id`/`empleado_id`) |
| `declarar` | **ORDEN** (panel) | `{project_id, empleado_id, quien_puede_ver?}` | `{project_id, regla, declarado:true}` | 400 `INVALID_INPUT` |

## Reglas de negocio (lo que el código IMPONE)

1. **Validación**: sin `project_id` → `_invalid('project_id')`; sin `empleado_id` →
   `_invalid('empleado_id')` (en ambas ops).
2. **`_autorizar`** (`solicitante` de `input.solicitante` o `input.rol`):
   - **Sin regla**: si `solicitante === empleado_id` (no vacío) → `autorizado:true` con motivo
     `'ve su propia nomina (default propio)'`; si no → `autorizado:null` con motivo
     `'sin regla declarada: el acceso no consta'` y `abierto.regla` declarado. `regla_declarada:false`.
   - **Con regla**: `autorizado = quien_puede_ver.includes(solicitante)`; `regla_declarada:true`,
     `abierto:null`.
3. **`_declarar`**: `quien_puede_ver` es array declarado (strings no vacíos); **el propio
   empleado se incluye siempre**. No se borra: cada declaración hace `push` a `regla.historial`
   con `{quien_puede_ver, en}`; `declarado_en` se refresca.
4. **Sin política por defecto**: el módulo no rellena `quien_puede_ver` con nada más que el propio.
5. **Lectura directa**: no hay helper de lectura extra; la regla vigente se consulta vía
   `_autorizar` con `regla`.

## Cómo se usa (RPCs)

### 1. Declarar la regla de acceso

```json
{ "project_id": "e57a318a-...", "empleado_id": "emp-1", "quien_puede_ver": ["asesor", "rrhh"], "correlation_id": "abc-9" }
```
Respuesta `200` + `contabilidad.acceso_nomina_declarado`:
```json
{ "project_id": "e57a318a-...", "regla": { "empleado_id": "emp-1", "quien_puede_ver": ["asesor","rrhh","emp-1"], "declarado_en": "2026-10-01T...", "historial": [ { "quien_puede_ver": ["asesor","rrhh","emp-1"], "en": "2026-10-01T..." } ] }, "declarado": true }
```

### 2. Autorizar (con regla)

```json
{ "project_id": "e57a318a-...", "empleado_id": "emp-1", "solicitante": "asesor" }
```
Respuesta `200`: `{autorizado:true, motivo:'está declarado en quien_puede_ver', regla_declarada:true}`.

### 3. Autorizar (sin regla, otro solicitante) → [ABIERTO]

```json
{ "project_id": "e57a318a-...", "empleado_id": "emp-1", "solicitante": "desconocido" }
```
Respuesta `200`: `{autorizado:null, motivo:'sin regla declarada: el acceso no consta', abierto:{regla:'...'}}`.

## Errores y qué significan

| Código | Cuándo |
|---|---|
| `400 INVALID_INPUT` (`project_id`/`empleado_id`) | falta el campo. |
| `500 UNKNOWN_ERROR` | excepción dentro de `_atender`. |

## Relación con otras piezas

- **Depende de:** — (raíz; según el plan depende de `cola-declaraciones-criterio`, pero el
  `module.json` real no declara ese envío). Bases: `_shared` + PosPersistencia.
- **Quién la consume:** `recibo-nomina` lee `contabilidad.acceso_nomina_declarado` para autorizar
  la entrega del recibo.
- **Deps por EVENTO, nunca import.**

## Verificación

1. Ficheros en disco: `modules/contabilidad-fiscal/acceso-nomina/module.json` + `index.js`.
2. Smoke: `declarar` → 200 + `contabilidad.acceso_nomina_declarado`, el propio siempre incluido.
3. `autorizar` sin regla y solicitante propio → `true`; con otro → `null`.
4. `autorizar` con regla → `true`/`false` según `quien_puede_ver`.
5. Sin `empleado_id` → 400 + `.failed`.
6. Gate `scripts/validate-hibridos.js`.

## Notas de implementación

- Clase `AccesoNomina extends ModuloHibridoReflejo`; `name = 'acceso-nomina'`,
  `version = 'reflejo-0.1.0'`. Store `this._accesos` (Map `pid → {esquema, reglas:
  Map<empleado_id, Regla>}`).
- **PosPersistencia**: `file:'acceso-nomina.json'`, `dir:'/contabilidad/acceso-nomina'`.
- Proyecciones `_autorizar`/`_declarar`; tools `toolAutorizar`/`toolDeclarar`.
