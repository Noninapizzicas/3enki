---
name: encolado-excepcion
description: >-
  Skill FULL del módulo CUSTODIO CON PERSISTENCIA `encolado-excepcion` de la vertical
  contabilidad (Enki). LA PARCELA DE LO DUDOSO: un solo escritor. El flujo CONTINÚA; lo dudoso
  espera — encolar NO bloquea nada (`flujo_continua:true`). Guard de rol `ENCOLADO_EXCEPCION`
  (segundo escritor → 403). Idempotente por clave (at-least-once del bus): la misma excepción
  no se encola dos veces (`duplicada:true`). Append-only: encolar AÑADE y tomar NO borra —
  MARCA (`estado:'tomada'`). Persiste por proyecto vía PosPersistencia
  (`/contabilidad/encolado-excepcion`), restaura en `project.activated`. Al encolar publica
  `contabilidad.excepcion_encolada` (lo escucha aviso-revision A8.2). La op `encolar` es ORDEN
  (ui_handler); `tomar` es PREGUNTA (sin ui_handler).
when-to-use: >-
  - Cuando necesites encolar una excepción para revisión sin parar el flujo
    (RPC encolado-excepcion.encolar.request) o tomar la primera pendiente (encolado-excepcion.tomar.request).
  - Cuando depures por qué no se encola (403 rol, 400 falta clave), por qué sale `duplicada:true`
    (idempotencia) o por qué tomar no la borra (append-only: sigue con quien la tomó).
  - Cuando quieras entender su contrato de eventos y por qué NO empuja él mismo el aviso.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, custodio, persistencia, contabilidad, entrada, excepciones, cola, single-writer]
---

# encolado-excepcion — CUSTODIO de la parcela de lo dudoso

## Qué hace el módulo

`encolado-excepcion` es un **CUSTODIO CON PERSISTENCIA** (A8.1, hoja del plan) de la vertical
**contabilidad**, eje **entrada**. Es **la parcela de lo dudoso**: cuando algo no se puede
resolver automáticamente, **no se inventa el dato y no se para el flujo**: se **ENCOLA** la
excepción para que un humano la revise.

**El flujo CONTINÚA; lo dudoso espera.** Encolar no bloquea nada (`flujo_continua:true`).
El empujón al canal de avisos lo da `aviso-revision` (A8.2), que **escucha** el hecho de esta
cola — aquí **no se pisan**.

**Invariantes que impone el código:**
- **UN escritor por parcela**: guard de rol `ENCOLADO_EXCEPCION`; otro (declarado) → `403 PERMISSION_DENIED`.
- **IDEMPOTENTE por clave**: la misma excepción (misma clave) no se encola dos veces
  (at-least-once del bus) → `duplicada:true`, sin duplicar en silencio.
- **APPEND-ONLY**: encolar **AÑADE**; tomar **NO borra** — **MARCA** (`estado:'tomada'`,
  `tomada_por`, `tomada_en`). La excepción sigue visible con quién la tomó.
- **Dato ausente = desconocido**: sin motivo/origen declarado se anota el hueco, no se estima.

Persiste por proyecto con **PosPersistencia** (storage `/contabilidad/encolado-excepcion`),
restaura en `project.activated`. La op `encolar` es **ORDEN** → `ui_handler`; `tomar` es
**PREGUNTA** → sin `ui_handler`.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Qué hace |
|---|---|---|
| `encolado-excepcion.encolar.request` | `onEncolarRequest` | RPC custodio (ORDEN): `{project_id, rol, clave, motivo?, origen?, payload?}` → `{project_id, excepcion, encolada, pendientes, flujo_continua}`. Guard + idempotencia. Al encolar publica `contabilidad.excepcion_encolada`. Si `status ≠ 200` publica `.failed`. Responde por `encolado-excepcion.encolar.response`. |
| `encolado-excepcion.tomar.request` | `onTomarRequest` | RPC custodio (PREGUNTA, sin ui_handler): `{project_id, clave?, revisor?}` → `{project_id, excepcion, pendientes}`. Marca la primera pendiente (o la de la clave) como TOMADA sin borrarla. Sin cola/pendientes → `excepcion:null`. Si `status ≠ 200` publica `.failed`. Responde por `encolado-excepcion.tomar.response`. |
| `project.activated` | `onProjectActivated` | Restaura la cola de excepciones del proyecto activado desde el storage. |

### Publishes

| Evento | Cuándo |
|---|---|
| `contabilidad.excepcion_encolada` | Fire-and-forget (A8.1): quedó una excepción en espera → `{project_id, excepcion_id, clave, motivo, origen, pendientes, correlation_id}`. Lo escucha `aviso-revision` (A8.2), que **empuja el aviso** al canal. |
| `encolado-excepcion.encolar.response` / `.encolar.failed` | Respuesta RPC + par de fallo determinista de `encolar`. |
| `encolado-excepcion.tomar.response` / `.tomar.failed` | Respuesta RPC + par de fallo determinista de `tomar`. |

> **Sí publica un HECHO** (`contabilidad.excepcion_encolada`): encolar **es escribir**. Pero
> **NO empuja el aviso** él mismo (evita pisarse con `aviso-revision` A8.2, que es quien lo hace).

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `encolar` | **ORDEN** (ui_handler: workspace_module) | `{project_id, rol?, clave?\|ref?\|entidad?+entidad_id?, motivo?, origen?, vertical?, payload?}` | `{project_id, excepcion, encolada, duplicada, pendientes, append_only, flujo_continua, abierto}`; o `duplicada:true` | `403 PERMISSION_DENIED`; `400 INVALID_INPUT` (falta `project_id` o clave); `500`. |
| `tomar` | **PREGUNTA** (sin ui_handler) | `{project_id, clave?, revisor?}` | `{project_id, excepcion, pendientes, append_only, abierto}` (o `vacia:true`) | `400 INVALID_INPUT` si falta `project_id`; `500`. |

## Reglas de negocio

1. **Guard de un solo escritor**: si `rol` llega y ≠ `ENCOLADO_EXCEPCION` → `403` con
   `{rol_esperado, rol_recibido}`. Si `rol` es `null` no se bloquea (por construcción es el único
   escritor; «la puerta no se cierra al vacío»).
2. **Clave**: `clave` → `ref` → `entidad + ':' + entidad_id`. Sin ninguna → `400 INVALID_INPUT clave`.
3. **Idempotencia por clave**: si la clave ya está en el `Set` de la cola → `200 encolada:false,
   duplicada:true` con `pendientes` actuales. **Nada se añade**.
4. **Estructura de la excepción**: `{excepcion_id: 'exc_<pid>_<8 hex>', clave, motivo, origen,
   entidad, entidad_id, payload, estado:'pendiente', tomada_por:null, tomada_en:null, encolada_en}`.
5. **Append-only**: encolar hace `cola.push` y añade la clave al `Set`; **nunca** se elimina.
6. **Tomar NO borra, MARCA**: se busca la primera `pendiente` (o la de `clave`), se marca
   `estado:'tomada'`, `tomada_por = revisor`, `tomada_en = now`. La excepción **sigue en la cola**.
7. **Contadores**: `pendientes` = número de excepciones en `estado:'pendiente'`.
8. **Honestidad**: sin `motivo`/`origen` se declaran en `abierto`; sin `revisor` al tomar, igual.
9. **HTTP exacto**: éxito `200`; rol → `403`; input → `400`; excepción → `500`.

## Cómo se usa (RPC)

### Encolar una excepción

```json
{
  "project_id": "e57a318a-...",
  "rol": "ENCOLADO_EXCEPCION",
  "clave": "doc:4455",
  "motivo": "el OCR no lee el total",
  "origen": "extraccion-dato",
  "payload": { "ruta": "/inbox/4455.pdf" },
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "excepcion": { "excepcion_id": "exc_e57a318a-..._a1b2c3d4", "clave": "doc:4455", "motivo": "el OCR no lee el total", "origen": "extraccion-dato", "estado": "pendiente", "tomada_por": null, "encolada_en": "..." },
  "encolada": true,
  "duplicada": false,
  "pendientes": 1,
  "append_only": true,
  "flujo_continua": true,
  "abierto": { "motivo": null, "origen": null }
}
```
Emite `contabilidad.excepcion_encolada` (lo escucha `aviso-revision`).

### Repetir la misma clave — duplicada

→ `200 encolada:false, duplicada:true, motivo:'la excepcion ya estaba en la cola (misma clave): no se duplica (append-only)'`.

### Tomar la primera pendiente

```json
{ "project_id": "e57a318a-...", "revisor": "ana" }
```
→ `200` con la excepción marcada `estado:'tomada'`, `tomada_por:'ana'`, `pendientes:0`.
**Sigue en la cola** (append-only).

### Fallo — falta clave

`{ "project_id": "...", "rol": "ENCOLADO_EXCEPCION" }` → `400 INVALID_INPUT clave` + `.failed`.

## Errores y qué significan

| Código | HTTP | Causa |
|---|---|---|
| `PERMISSION_DENIED` | 403 | `rol` declarado ≠ `ENCOLADO_EXCEPCION`. |
| `INVALID_INPUT` | 400 | Falta `project_id` o falta clave/ref/entidad. |
| `UNKNOWN_ERROR` | 500 | Excepción no controlada. |

## Relación con otras piezas (deps por EVENTO)

- **Restaura con**: `project.activated` (core).
- **Le consumen el hecho** `contabilidad.excepcion_encolada`: `aviso-revision` (A8.2) — es quien
  empuja el aviso — y `tasa-cobertura-entrada` (P4) y `panel-proceso-contable` (P1) que lo cuentan.
- **Le encolan (previsto)**: `control-cuadre-documento` (A4.3), `cruce-factura-recepcion` (N5),
  `desatasco-entrada` (P3), `etiquetado-analitico` (J1), `partida-no-identificada` (E7),
  `extraccion-dato` (A4.1).

## Verificación

1. Fichero: `modules/contabilidad-entrada/encolado-excepcion/`.
2. Eventos reales: subscribes `encolado-excepcion.encolar.request`, `encolado-excepcion.tomar.request`,
   `project.activated`; publishes `contabilidad.excepcion_encolada`, `encolado-excepcion.encolar.response`,
   `.encolar.failed`, `encolado-excepcion.tomar.response`, `.tomar.failed`.
3. Strings en código:
   ```bash
   grep -oE "publish\('[^']*'" modules/contabilidad-entrada/encolado-excepcion/index.js
   # → contabilidad.excepcion_encolada / encolado-excepcion.encolar.failed / encolado-excepcion.tomar.failed
   ```
4. Persistencia: file `encolado-excepcion.json`, dir `/contabilidad/encolado-excepcion`, esquema
   `contabilidad-encolado-excepcion-v1`.
5. Test unitario (si existe): encolar → 200 + hecho + `flujo_continua`; repetir → duplicada;
   rol inválido → 403; tomar → marca sin borrar; falta clave → 400; restaurar en `project.activated`.
