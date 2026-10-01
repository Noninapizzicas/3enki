---
name: regla-movimiento-bancario
description: >-
  Skill FULL del módulo CUSTODIO CON PERSISTENCIA `regla-movimiento-bancario` de
  la vertical contabilidad (Enki). La parcela de REGLAS declarables/aprendidas del
  banco ('esta comisión → esta cuenta'): UN solo escritor. 'declarar' es ORDEN
  (panel); 'aplicar'/'proponer' son PREGUNTA. Las aprendidas NO operan hasta que el
  asesor las ratifique (gate L10). Anuncia contabilidad.movimiento_regla_declarada.
  Sin regla declarada no se inventa la contrapartida.
when-to-use: >-
  - Cuando necesites declarar, aplicar o proponer una regla de movimiento bancario
    (RPC declarar/aplicar/proponer).
  - Cuando depures un PERMISSION_DENIED (rol != REGLA_MOVIMIENTO_BANCARIO), una
    contrapartida:null (sin regla operativa) o un 400 INVALID_INPUT.
  - Cuando quieras entender su contrato de eventos (subscribes/publishes) y el gate
    de ratificación L10.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, custodio, persistencia, contabilidad, libro, banco, reglas, ratificacion, single-writer]
---

# regla-movimiento-bancario — CUSTODIO CON PERSISTENCIA de las reglas del banco

## Qué hace el módulo

`regla-movimiento-bancario` es un **CUSTODIO CON PERSISTENCIA** (E8, hoja del
plan): la **parcela de REGLAS declarables/aprendidas** del banco (*"esta comisión
→ esta cuenta"*). Es **UN solo escritor**.

- `declarar` es **ORDEN (panel)**: registra una regla con su contexto y su cuenta.
  Si nace **APRENDIDA** NO opera hasta que el asesor la ratifique (**gate L10**
  `ratificacion-regla-aprendida`).
- `aplicar` y `proponer` son **PREGUNTA** y van por el bus.

Escucha `contabilidad.regla_ratificada` (L10) para dejar la regla operativa/inerte —
handler fire-and-forget (no-RPC) que, si **ESCRIBE**, anuncia
`contabilidad.movimiento_regla_declarada` (R2). **Ratificación ÚNICA por L10.**
**Dato ausente = desconocido**: sin regla declarada no se inventa la contrapartida.

**Guard de escritor**: solo el rol `REGLA_MOVIMIENTO_BANCARIO`; un segundo escritor
→ `403 PERMISSION_DENIED`. Persiste por proyecto vía **PosPersistencia** (storage
`/contabilidad/regla-movimiento-bancario`). `declarar` es **CLASE ORDEN** → **SÍ
lleva `ui_handler`** (`workspace_module`, `barra_modulos`).

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `regla-movimiento-bancario.aplicar.request` | `onAplicarRequest` | RPC custodio (PREGUNTA, por el bus): `{project_id, contexto?, movimiento?}` → `{project_id, contexto, contrapartida, regla, aplicada, opera, abierto}`. Devuelve la contrapartida del movimiento según la regla vigente; sin regla operativa, `contrapartida:null` y abierto (no se inventa). Responde por `regla-movimiento-bancario.aplicar.response`. |
| `regla-movimiento-bancario.proponer.request` | `onProponerRequest` | RPC custodio (PREGUNTA, por el bus): `{project_id, contexto?, movimiento?}` → `{project_id, contexto, propuesta, propuesta_disponible, abierto}`. Propone la contrapartida del movimiento; sin regla, `propuesta:null`. Responde por `regla-movimiento-bancario.proponer.response`. |
| `regla-movimiento-bancario.declarar.request` | `onDeclararRequest` | RPC custodio (ORDEN, panel): `{project_id, rol:'REGLA_MOVIMIENTO_BANCARIO', regla{contexto?, cuenta?, origen?, asiento?}}` → `{project_id, clave, regla, declarada, pendiente_ratificacion, abierto}`. Guard de escritor (otro rol → `403 PERMISSION_DENIED`). Re-declarar APPENDEA al historial. Publica `contabilidad.movimiento_regla_declarada` (R2) y responde por `regla-movimiento-bancario.declarar.response`. Sin `project_id`/`regla` → `regla-movimiento-bancario.declarar.failed`. |
| `contabilidad.regla_ratificada` | `onReglaRatificada` | Fire-and-forget (lo emite `ratificacion-regla-aprendida` L10): el asesor ratificó/bloqueó una regla aprendida → deja la regla operativa o inerte y anuncia `contabilidad.movimiento_regla_declarada` (R2). No responde (no es RPC). |
| `project.activated` | `onProjectActivated` | Restaura la parcela de reglas del proyecto activado desde el storage (PosPersistencia). |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.movimiento_regla_declarada` | Fire-and-forget (E8): la parcela de reglas de movimiento bancario cambió (regla declarada o ratificada) → `{project_id, clave, regla}`. Lo consume la conciliación bancaria para contabilizar el movimiento. |
| `regla-movimiento-bancario.aplicar.response` | Respuesta RPC correlada de la op `aplicar` (PREGUNTA). |
| `regla-movimiento-bancario.aplicar.failed` | Par de fallo determinista: falta `project_id` → `{status, code, message}`. Cierra el círculo de `aplicar.request`. |
| `regla-movimiento-bancario.proponer.response` | Respuesta RPC correlada de la op `proponer` (PREGUNTA). |
| `regla-movimiento-bancario.proponer.failed` | Par de fallo determinista: falta `project_id` → `{status, code, message}`. Cierra el círculo de `proponer.request`. |
| `regla-movimiento-bancario.declarar.response` | Respuesta RPC correlada de la op `declarar` (ORDEN). |
| `regla-movimiento-bancario.declarar.failed` | Par de fallo determinista: rol != REGLA_MOVIMIENTO_BANCARIO, falta `project_id` o la regla es inválida → `{status, code, message}`. Cierra el círculo de `declarar.request`. |

## Operaciones (RPC)

| op | tipo | entrada | salida | errores |
|---|---|---|---|---|
| `aplicar` | **PREGUNTA** (bus) | `{project_id, contexto?, movimiento?}` | `{project_id, contexto, contrapartida, regla, aplicada, opera, abierto}` | `400 INVALID_INPUT project_id` |
| `proponer` | **PREGUNTA** (bus) | `{project_id, contexto?, movimiento?}` | `{project_id, contexto, propuesta, propuesta_disponible, abierto}` | `400 INVALID_INPUT project_id` |
| `declarar` | **ORDEN** (panel) | `{project_id, rol:'REGLA_MOVIMIENTO_BANCARIO', regla{contexto?, cuenta?, origen?, asiento?}}` | `{project_id, clave, regla, declarada, pendiente_ratificacion, abierto}` | `403 PERMISSION_DENIED`; `400 INVALID_INPUT` (`project_id`, `regla`) |

Tools expuestas: `regla-movimiento-bancario.aplicar`, `.proponer`, `.declarar`.

## Reglas de negocio

1. **Un solo escritor (guard de rol)**: `declarar` exige
   `rol === 'REGLA_MOVIMIENTO_BANCARIO'`. Otro rol → `403 PERMISSION_DENIED`.
   Second-writer rechazado.
2. **Orígenes cerrados (const `ORIGENES`)**: `['DECLARADA', 'APRENDIDA']`. Una regla
   `APRENDIDA` nace `pendiente_ratificacion` y **NO opera** hasta la ratificación
   (gate L10 `contabilidad.regla_ratificada`).
3. **Estados de ratificación**: la regla se deja operativa (`RATIFICADA`) o inerte
   (`BLOQUEADA`) tras L10. **Ratificación ÚNICA.**
4. **Re-declarar APPENDEA**: el historial de la regla se apila; no se pisa.
5. **Sin regla no se inventa**: `aplicar` sin regla operativa → `contrapartida:null`,
   `aplicada:false`, `opera:false`, `abierto` declarado. `proponer` sin regla →
   `propuesta:null`.
6. **Validaciones de declarar**: sin `regla` objeto → `400 INVALID_INPUT regla`;
   sin contexto ni cuenta → `400 INVALID_INPUT regla.contexto|regla.cuenta`; clave
   vacía o `*::*` → `400 INVALID_INPUT regla`.
7. **HTTP exacto**: éxito `200`; rol inválido → `403`; campos inválidos → `400`;
   excepción → `500`.

## Cómo se usa (RPC)

### `declarar` — registrar una regla (solo el rol custodio)

```json
{
  "project_id": "e57a318a-...",
  "rol": "REGLA_MOVIMIENTO_BANCARIO",
  "regla": { "contexto": "COMISION_MANTENIMIENTO", "cuenta": "626", "origen": "DECLARADA" },
  "correlation_id": "abc-123"
}
```
Respuesta `200` (y se publica `contabilidad.movimiento_regla_declarada`):
```json
{ "project_id": "e57a318a-...", "clave": "COMISION_MANTENIMIENTO::626", "regla": { "contexto": "COMISION_MANTENIMIENTO", "cuenta": "626", "origen": "DECLARADA" }, "declarada": true, "pendiente_ratificacion": false, "abierto": null }
```

### `aplicar` — contrapartida del movimiento

```json
{ "project_id": "e57a318a-...", "contexto": "COMISION_MANTENIMIENTO" }
```
Sin regla operativa → `{ "contrapartida": null, "aplicada": false, "opera": false, "abierto": true }`.

### Fallo — rol inválido

```json
{ "project_id": "e57a318a-...", "rol": "OTRO", "regla": { "contexto": "X", "cuenta": "626" } }
```
Respuesta `403` + `regla-movimiento-bancario.declarar.failed`:
```json
{ "status": 403, "code": "PERMISSION_DENIED", "message": "..." }
```

## Errores y qué significan

- `403 PERMISSION_DENIED` — el rol no es `REGLA_MOVIMIENTO_BANCARIO`.
- `400 INVALID_INPUT` — falta `project_id`, `regla`, contexto/cuenta, o clave vacía.
- `200 {contrapartida:null, abierto}` — no hay regla operativa (no se inventa).
- `500 UNKNOWN_ERROR` — excepción no prevista.

## Relación con otras piezas (por EVENTO, nunca import)

- **Hacia atrás (escucha)**: `contabilidad.regla_ratificada` (L10
  `ratificacion-regla-aprendida`).
- **Hacia delante (publica el hecho)**: `contabilidad.movimiento_regla_declarada` lo
  consume la **conciliación bancaria** para contabilizar el movimiento. También lo
  observan `control-calidad-muestreo` (L8) y `cambio-desde-ultima-revision` (L9).
- **Hacia atrás (restaura)**: `project.activated`.
- No importa a nadie.

## Verificación

- **Fichero**: `modules/contabilidad-libro/regla-movimiento-bancario/` (clase
  `ReglaMovimientoBancario extends ModuloHibridoReflejo`, `version 'reflejo-0.1.0'`).
- **Eventos**: `grep -F "movimiento_regla_declarada" module.json index.js`,
  `grep -F "regla_ratificada" module.json`, `grep -F "PERMISSION_DENIED" index.js`.
- **Test unitario**: `declarar` con rol correcto → `200` + hecho; otro rol →
  `403 PERMISSION_DENIED`; regla APRENDIDA → `pendiente_ratificacion:true`;
  `regla_ratificada` deja operativa/inerte; sin regla, `aplicar` da
  `contrapartida:null`.

## Notas de implementación

- **PosPersistencia** (`file: 'regla-movimiento-bancario.json'`, `dir:
  '/contabilidad/regla-movimiento-bancario'`); restaura en `onProjectActivated`,
  vuelca en `onUnload`.
- Helpers: `_aplicar`, `_proponer`, `_declarar`, `_opera`, `_contexto`, `_clave`,
  `_obtenerOCrear`, `toolAplicar`, `toolProponer`, `toolDeclarar`.
