---
name: regla-contrapartida
description: >-
  Skill FULL del módulo CUSTODIO CON PERSISTENCIA `regla-contrapartida` de la vertical contabilidad
  (Enki). La parcela de REGLAS declarables/aprendidas ("este proveedor → esta cuenta"): UN solo
  escritor. `declarar` (ORDEN) registra una regla; si nace APRENDIDA NO opera hasta que el asesor
  la ratifique (gate L10 ratificacion-regla-aprendida). `aplicar` y `proponer` son PREGUNTA (bus).
  ESCUCHA contabilidad.regla_ratificada (deja la regla operativa/inerte) y
  contabilidad.excepcion_desatascada (registra una regla aprendida nueva) — ambos fire-and-forget
  que anuncian contabilidad.contrapartida_regla_declarada. Persiste por proyecto.
when-to-use: >-
  - Cuando necesites declarar una regla de contrapartida, proponer/aplicar la contrapartida de un
    contexto (RPC regla-contrapartida.declarar.request / .proponer.request / .aplicar.request).
  - Cuando depures por qué `contrapartida:null` (no hay regla operativa) o por qué una regla
    aprendida no opera (`pendiente_ratificacion`).
  - Cuando quieras entender su contrato de eventos y su hecho contabilidad.contrapartida_regla_declarada.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, custodio, persistencia, contabilidad, entrada, contrapartida, reglas, aprendizaje]
---

# regla-contrapartida — CUSTODIO de las reglas de contrapartida

## Qué hace el módulo

`regla-contrapartida` es un **CUSTODIO CON PERSISTENCIA** (A6.2, hoja del plan). Es la parcela de
**REGLAS declarables/aprendidas** ("este proveedor → esta cuenta"). **UN solo escritor.** La regla
**PROPONE** la contrapartida de un hecho; mientras no esté declarada, el sistema **PREGUNTA**. Y
una regla **APRENDIDA** no actúa hasta que el asesor la **RATIFICA**: `ratificacion-regla-aprendida`
(L10) emite `contabilidad.regla_ratificada`, que esta hoja **ESCUCHA** para dejar la regla operativa
o inerte.

Invariantes:
- **UN escritor por parcela** (guard rol `REGLA_CONTRAPARTIDA`; segundo escritor → 403).
- **Dato ausente = desconocido**: sin regla declarada NO se inventa una contrapartida.
- **No se borra**: declarar de nuevo APPENDEA al historial; la regla guarda su autor y su fecha.
- **Solo OPERAN** las reglas declaradas o las aprendidas ratificadas (`_opera`).

Persiste por proyecto con **PosPersistencia** (storage `/contabilidad/regla-contrapartida`, archivo
`regla-contrapartida.json`), restaura en `project.activated` y vuelca en `onUnload`.

**Tres caras:** `aplicar` y `proponer` son **PREGUNTA** (bus); `declarar` es **ORDEN**
(`workspace_module`).

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `regla-contrapartida.aplicar.request` | `onAplicarRequest` | RPC custodio (**PREGUNTA**, por el bus): `{project_id, contexto?}` → `{project_id, contexto, contrapartida, regla, aplicada, opera, abierto, motivo}`. Aplica la contrapartida del contexto según la regla vigente (solo operan declaradas o aprendidas ratificadas). Sin regla → `contrapartida:null`. Responde por `.aplicar.response`. |
| `regla-contrapartida.proponer.request` | `onProponerRequest` | RPC custodio (**PREGUNTA**, por el bus): `{project_id, hecho?, contexto?}` → `{project_id, contexto, propuesta, propuesta_disponible, abierto}`. Propone la contrapartida; el sistema propone y el humano declara. Sin regla → `propuesta:null`. Responde por `.proponer.response`. |
| `regla-contrapartida.declarar.request` | `onDeclararRequest` | RPC custodio (**ORDEN**, panel): `{project_id, rol:'REGLA_CONTRAPARTIDA', regla{contexto?, cuenta?, origen?}}` → `{project_id, clave, regla, declarada, pendiente_ratificacion, abierto}`. Guard de escritor. Registra la regla; si nace APRENDIDA queda pendiente del asesor. Publica `contabilidad.contrapartida_regla_declarada`. Responde por `.declarar.response`. |
| `contabilidad.regla_ratificada` | `onReglaRatificada` | **Fire-and-forget** (lo emite `ratificacion-regla-aprendida` L10): el asesor se pronunció → `{project_id, regla, decision, actua, por}`. Deja la regla operativa (`actua:true`) o inerte y publica `contabilidad.contrapartida_regla_declarada` (R2). **No responde.** |
| `project.activated` | `onProjectActivated` | Restaura la parcela de reglas del proyecto activado desde el storage. |

> **Nota de deriva (R3):** el plan declara también escucha de `contabilidad.excepcion_desatascada`
> (P3 `desatasco-entrada`), pero **ningún** módulo del repo lo emite aún (grupo posterior):
> declararlo daría cadena colgada. NO se declara.

### Publishes

| Evento | Cuándo |
|---|---|
| `contabilidad.contrapartida_regla_declarada` | Fire-and-forget (A6.2): una regla de contrapartida quedó declarada, o cambió de estado (ratificada/bloqueada) → `{project_id, clave, regla, ratificada?}`. Lo consume `control-calidad-muestreo`. Se emite desde `declarar` y desde `onReglaRatificada`. |
| `regla-contrapartida.aplicar.response` / `.aplicar.failed` | RPC `aplicar`. |
| `regla-contrapartida.proponer.response` / `.proponer.failed` | RPC `proponer`. |
| `regla-contrapartida.declarar.response` / `.declarar.failed` | RPC `declarar`. |

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `aplicar` | **PREGUNTA** (bus) | `{project_id, contexto?}` | `{project_id, contexto, contrapartida, regla, aplicada, opera, abierto, motivo}` | 400 `INVALID_INPUT` (`project_id`) |
| `proponer` | **PREGUNTA** (bus) | `{project_id, hecho?, contexto?}` | `{project_id, contexto, propuesta, propuesta_disponible, abierto}` | 400 `INVALID_INPUT` |
| `declarar` | **ORDEN** (panel) | `{project_id, rol:'REGLA_CONTRAPARTIDA', regla{contexto?, cuenta?, origen?}}` | `{project_id, clave, regla, declarada, pendiente_ratificacion, abierto}` | 403 `PERMISSION_DENIED`; 400 `INVALID_INPUT` |

## Reglas de negocio (lo que el código IMPONE)

1. **`_opera(regla)`**: `true` si `origen==='DECLARADA'`; si es `APRENDIDA`, solo si
   `ratificada===true`.
2. **`_aplicar`**: filtra las operativas; si viene `contexto`, las que casen (`r.contexto ===
   contexto`); toma la primera. Sin regla → `contrapartida:null, aplicada:false, opera:false,
   abierto:true` con `motivo` (no hay regla operativa, o ninguna cubre el contexto).
3. **`_proponer`**: contexto de `input.contexto`, de `hecho.contexto` o de `hecho.proveedor`.
   Devuelve `propuesta = {contrapartida, regla}` si hay regla operativa; si no, `propuesta:null`,
   `abierto` declarado.
4. **`_declarar`**: guard de escritor (`REGLA_CONTRAPARTIDA`). Exige `contexto` o `cuenta`; la clave
   `` `${contexto || '*'}::${cuenta || '*'}` `` no puede ser `*::*`.
5. **Origen** (`ORIGENES = {DECLARADA, APRENDIDA}`): desconocido → `DECLARADA`. `opera = origen ===
   'DECLARADA'`; `ratificada = opera`. Una APRENDIDA → `pendiente_ratificacion:true` y
   `abierto:'la regla nacio APRENDIDA: no opera hasta que el asesor la ratifique (gate L10)'`.
6. **No se borra**: cada declaración hace `push` a `regla.historial` con `{estado, por, en}`.
7. **`onReglaRatificada`**: busca la regla por `clave = d.regla`; si no existe, **no inventa nada**.
   Fija `ratificada = d.actua===true`, `ratificada_en/por/decision`, apila historial
   `RATIFICADA|BLOQUEADA` y publica el hecho. Envuelto en `try/catch` con `logger.error`.

## Cómo se usa (RPC + evento)

### 1. Declarar una regla declarada (opera ya)

```json
{ "project_id": "e57a318a-...", "rol": "REGLA_CONTRAPARTIDA", "regla": { "contexto": "proveedor:ACME", "cuenta": "4000", "origen": "DECLARADA" }, "correlation_id": "abc-15" }
```
Respuesta `200` + `contabilidad.contrapartida_regla_declarada`: `{clave:'proveedor:ACME::4000',
regla:{... opera:true, ratificada:true ...}, declarada:true, pendiente_ratificacion:false, abierto:null}`.

### 2. Declarar una regla APRENDIDA (no opera)

```json
{ "project_id": "e57a318a-...", "rol": "REGLA_CONTRAPARTIDA", "regla": { "contexto": "proveedor:X", "cuenta": "629", "origen": "APRENDIDA" } }
```
Respuesta `200`: `pendiente_ratificacion:true`, `abierto:'la regla nacio APRENDIDA: ...'`.

### 3. Aplicar

```json
{ "project_id": "e57a318a-...", "contexto": "proveedor:ACME" }
```
Respuesta `200`: `{contrapartida:'4000', aplicada:true, opera:true}`.

### 4. Sin regla → [ABIERTO]

```json
{ "project_id": "e57a318a-...", "contexto": "otro" }
```
Respuesta `200`: `{contrapartida:null, aplicada:false, abierto:true, motivo:'...'}`.

## Errores y qué significan

| Código | Cuándo |
|---|---|
| `403 PERMISSION_DENIED` | `rol !== 'REGLA_CONTRAPARTIDA'` en `declarar`. |
| `400 INVALID_INPUT` (`project_id`/`regla`/`regla.contexto\|regla.cuenta`) | falta el campo. |
| `500 UNKNOWN_ERROR` | excepción dentro de `_atender`. |

## Relación con otras piezas

- **Depende de:** `ratificacion-regla-aprendida` (L10) — **escucha** `contabilidad.regla_ratificada`.
- **Quién la consume por evento:** `control-calidad-muestreo` lee
  `contabilidad.contrapartida_regla_declarada`.
- **Deps por EVENTO, nunca import.**

## Verificación

1. Ficheros en disco: `modules/contabilidad-entrada/regla-contrapartida/module.json` + `index.js`.
2. Smoke: `declarar` DECLARADA → 200 + `contabilidad.contrapartida_regla_declarada`, `opera:true`.
3. `declarar` APRENDIDA → `pendiente_ratificacion:true`, `abierto` declarado.
4. `contabilidad.regla_ratificada` con `actua:true` → `ratificada:true` y publica el hecho.
5. `aplicar` sin regla → `contrapartida:null, abierto:true`.
6. Gate `scripts/validate-hibridos.js`.

## Notas de implementación

- Clase `ReglaContrapartida extends ModuloHibridoReflejo`; `name = 'regla-contrapartida'`,
  `version = 'reflejo-0.1.0'`. Store `this._parcelas` (Map `pid → {esquema, reglas: Map<clave,
  Regla>}`). Set `ORIGENES`.
- **PosPersistencia**: `file:'regla-contrapartida.json'`, `dir:'/contabilidad/regla-contrapartida'`.
- Proyecciones `_aplicar`/`_proponer`/`_declarar`; handler `onReglaRatificada`; helpers `_opera`,
  `_clave`; tools `toolAplicar`/`toolProponer`/`toolDeclarar`.
