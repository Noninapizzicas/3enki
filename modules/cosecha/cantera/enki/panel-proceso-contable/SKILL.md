---
name: panel-proceso-contable
description: >-
  Skill FULL del módulo REFLEJO STATELESS `panel-proceso-contable` de la vertical contabilidad
  (Enki). Es el DISPLAY DE COCINA de la contabilidad: qué entra, se procesa, está en cola y falla.
  Lo ausente se declara, no se inventa. Lee la tasa de cobertura de `tasa-cobertura-entrada` (P4)
  por RPC — no la recalcula. Observa `contabilidad.hecho_recibido`, `contabilidad.excepcion_encolada`
  y `contabilidad.excepcion_desatascada` (ventana acotada). Sin store propio. La op `latido` es
  PREGUNTA → sin ui_handler.
when-to-use: >-
  - Cuando necesites el latido del proceso contable (entra/procesa/cola/falla) de un proyecto
    (RPC panel-proceso-contable.latido.request).
  - Cuando depures por qué la tasa sale `null` (`abierto.tasa`) o por qué el panel está vacío
    (`abierto.proceso`).
  - Cuando quieras entender su contrato de eventos y su papel de observador (no escribe).
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, reflejo, stateless, contabilidad, entrada, panel, proceso, observabilidad]
---

# panel-proceso-contable — REFLEJO STATELESS del proceso contable

## Qué hace el módulo

`panel-proceso-contable` es un **REFLEJO STATELESS** (P1, hoja del plan) de la vertical
**contabilidad**, eje **entrada**. Es el **display de cocina** de la contabilidad: muestra qué
**entra**, qué se **procesa**, qué está **en cola** y qué **falla**.

**Observa, no escribe**: mantiene una ventana acotada (`VENTANA = 500`) por proyecto con los
`hecho_recibido`, las `excepcion_encolada` y las `excepcion_desatascada`. **Lee la tasa de cobertura**
de `tasa-cobertura-entrada` (P4) por RPC — **no la recalcula**.

**Honestidad (invariante 13):** si no llega la tasa → `abierto.tasa` (no se inventa); si la ventana
está vacía → `abierto.proceso` («no se finge actividad»).

**No persiste** (STATELESS). La op `latido` es **PREGUNTA** → **sin ui_handler**.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Qué hace |
|---|---|---|
| `panel-proceso-contable.latido.request` | `onLatidoRequest` | RPC reflejo (PREGUNTA): `{project_id, pendientes?}` → `{entra, procesa, en_cola, desatascadas, tasa, fuente_tasa, abierto}`. Delega en `_atender` → `_latido`. Si `status ≠ 200` publica `.failed`. Responde por `panel-proceso-contable.latido.response`. |
| `contabilidad.hecho_recibido` | `onHechoRecibido` | Fire-and-forget (A1): llegó un hecho → se apila en `entrados` (tope `VENTANA`). |
| `contabilidad.excepcion_encolada` | `onExcepcionEncolada` | Fire-and-forget (A8.1): una excepción entró a la cola → se apila en `encoladas`. |
| `contabilidad.excepcion_desatascada` | `onExcepcionDesatascada` | Fire-and-forget (desatasco-entrada P3): una excepción quedó desatascada → se apila en `desatascadas`. |

> **NOTA R3**: el handler `onExcepcionDesatascada` existe en el código; se declara solo si el emisor
> (`desatasco-entrada`, P3) existe.

### Publishes

| Evento | Cuándo |
|---|---|
| `panel-proceso-contable.latido.response` | Respuesta RPC correlada de la op `latido`. |
| `panel-proceso-contable.latido.failed` | Par de fallo determinista: falta `project_id` o entrada inválida. |

> **NO publica un hecho de dominio**: es un panel de observación (no escribe).

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `latido` | **PREGUNTA** | `{project_id, pendientes?}` | `{project_id, tipo, entra:{num,ultimos}, procesa:{num}, en_cola:{num,pendientes}, desatascadas, tasa, fuente_tasa, determinista, abierto}` | `400 INVALID_INPUT` si falta `project_id`. Excepción → `500 UNKNOWN_ERROR`. |

## Reglas de negocio

1. **Ventana acotada**: `VENTANA = 500` por lista (`entrados`, `encoladas`, `desatascadas`); los
   últimos 10 se devuelven en `ultimos`/`pendientes`.
2. **Tasa por RPC**: `tasa-cobertura-entrada.calcular.request` (P4, timeout 700 ms); si responde
   con `tasa`, se usa; si no → `tasa:null` y `abierto.tasa`.
3. **`en_cola.num`**: `input.pendientes` si se declara y es finito; si no, la longitud observada de `encoladas`.
4. **`procesa.num`**: `entrados − encoladas` (mínimo 0).
5. **No recalcula la tasa** ni cuenta por su cuenta más allá de la ventana observada.
6. **Sin actividad**: si la ventana está vacía → `abierto.proceso` (no se finge actividad).
7. **Determinista** respecto a lo observado.
8. **HTTP exacto**: éxito `200`; input → `400`; excepción → `500`.

## Cómo se usa (RPC)

### Pedir el latido del proceso

```json
{ "project_id": "e57a318a-...", "correlation_id": "abc-123" }
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "tipo": "panel-proceso-contable",
  "entra": { "num": 42, "ultimos": [ { "tipo": "factura", "vertical": "entrada", "en": "..." } ] },
  "procesa": { "num": 39 },
  "en_cola": { "num": 3, "pendientes": [ { "clave": "doc:4455", "motivo": "OCR no lee el total", "en": "..." } ] },
  "desatascadas": [ { "clave": "doc:4455", "en": "..." } ],
  "tasa": 0.95,
  "fuente_tasa": "tasa-cobertura-entrada",
  "determinista": true,
  "abierto": { "tasa": null, "proceso": null }
}
```

### Panel vacío — se declara

```json
{ "project_id": "e57a318a-..." }
```
→ `abierto.proceso = "la ventana de proceso esta vacia: no hay nada que mostrar todavia (no se finge actividad)"`.

### Sin tasa

→ `tasa:null`, `abierto.tasa = "no llego la tasa (ni declarada ni de tasa-cobertura-entrada P4): el panel la declara, no la inventa"`.

### Fallo — falta project_id

→ `400 INVALID_INPUT` + `panel-proceso-contable.latido.failed`.

## Errores y qué significan

| Código | HTTP | Causa |
|---|---|---|
| `INVALID_INPUT` | 400 | Falta `project_id`. |
| `UNKNOWN_ERROR` | 500 | Excepción en `_latido`. |
| (no es error) | 200 | Sin tasa o sin actividad → `abierto` (honesto). |

## Relación con otras piezas (deps por EVENTO)

- **Escucha**: `contabilidad.hecho_recibido` (A1), `contabilidad.excepcion_encolada` (A8.1),
  `contabilidad.excepcion_desatascada` (P3).
- **Llama por RPC (best-effort, 700 ms)**: `tasa-cobertura-entrada.calcular.request` (P4).

## Verificación

1. Fichero: `modules/contabilidad-entrada/panel-proceso-contable/`.
2. Eventos reales: subscribes `panel-proceso-contable.latido.request`, `contabilidad.hecho_recibido`,
   `contabilidad.excepcion_encolada`; publishes `panel-proceso-contable.latido.response`, `.failed`.
   (El handler `onExcepcionDesatascada` existe; su subscribe se declara si P3 existe.)
3. Strings en código:
   ```bash
   grep -oE "publish\('[^']*'|_rpc\('[^']*'" modules/contabilidad-entrada/panel-proceso-contable/index.js
   # → panel-proceso-contable.latido.failed → tasa-cobertura-entrada.calcular.request
   ```
4. Test unitario (si existe): latido con ventana → `entra/procesa/en_cola`; sin tasa → `abierto.tasa`;
   ventana vacía → `abierto.proceso`; sin `project_id` → 400 + failed.
