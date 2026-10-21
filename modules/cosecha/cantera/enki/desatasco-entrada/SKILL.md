---
name: desatasco-entrada
description: >-
  Skill FULL del módulo MICRO-AGENTE `desatasco-entrada` de la vertical contabilidad (Enki).
  Resuelve / reencola / descarta una excepción con MOTIVO. Es el ÚNICO micro-agente que
  **publica** (ACTÚA, no propone). Escucha `contabilidad.excepcion_encolada`. Al actuar publica
  el hecho `contabilidad.excepcion_desatascada` y SUBE la acción concreta al dueño del destino
  (escritor-diario, encolado-excepcion, regla-contrapartida, historial-proceso-contable). Sin
  MOTIVO no actúa. Sin store propio. La op `juzgar` es ORDEN → system_panel.
when-to-use: >-
  - Cuando necesites resolver, reencolar o descartar una excepción de la cola
    (RPC desatasco-entrada.juzgar.request).
  - Cuando depures por qué se rechaza (falta excepción o falta motivo) o a dónde se subió la
    acción según lo decidido.
  - Cuando quieras entender su contrato de eventos y su diferencia con los micro-agentes que
    solo proponen (etiquetado, partida-no-identificada).
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, micro-agente, reflejo, stateless, contabilidad, entrada, excepciones, desatasco]
---

# desatasco-entrada — MICRO-AGENTE que desatasca excepciones (ACTÚA)

## Qué hace el módulo

`desatasco-entrada` es un **MICRO-AGENTE** (mitad refleja) (P3, hoja del plan) de la vertical
**contabilidad**, eje **entrada**. Toma una **excepción de la cola** y **decide y actúa** sobre
ella con una de tres acciones:

- **`resolver`** → si hay `asiento` declarado, lo SUBE a `escritor-diario` (B2);
- **`reencolar`** → la vuelve a encolar vía `encolado-excepcion` (A8.1);
- **`descartar`** → si hay `contrapartida` declarada, aplica la regla (`regla-contrapartida`).

**Es el ÚNICO micro-agente que publica** (ACTÚA, no propone). A diferencia de
`etiquetado-analitico` o `partida-no-identificada` (que solo PROPORCIONAN una propuesta),
este módulo **ejecuta** y **anuncia el hecho** `contabilidad.excepcion_desatascada`.

**SIN MOTIVO NO SE ACTÚA**: resolver/descartar sin causa es tapar la excepción → `400 INVALID_INPUT motivo`.

**No persiste**: memoria acotada `this._excepciones` (tope 1000) por `contabilidad.excepcion_encolada`.
La op `juzgar` es **ORDEN** → `ui_handler` `system_panel`.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Qué hace |
|---|---|---|
| `desatasco-entrada.juzgar.request` | `onJuzgarRequest` | RPC (ORDEN): `{project_id, excepcion?:{…}, excepcion_id?, clave?, accion?, motivo?, asiento?, contrapartida?}` → `{accion, motivo, desatascada, resuelta, reencolada, descartada, abierto}`. Delega en `_atender` → `_juzgar`. Al actuar publica `contabilidad.excepcion_desatascada` y sube la acción concreta; si `status ≠ 200` publica `.failed`. Responde por `desatasco-entrada.juzgar.response`. |
| `contabilidad.excepcion_encolada` | `onExcepcionEncolada` | Fire-and-forget (encolado-excepcion A8.1): una excepción entró a la cola → se observa en la ventana (tope 1000). |

### Publishes

| Evento | Cuándo |
|---|---|
| `contabilidad.excepcion_desatascada` | Fire-and-forget (P3): al actuar → `{project_id, excepcion_id, clave, accion, motivo, en, correlation_id}`. |
| `escritor-diario.asentar.request` | Si `accion:'resolver'` y hay `asiento` declarado. |
| `encolado-excepcion.encolar.request` | Si `accion:'reencolar'` (`rol:'DESATASCO_ENTRADA'`, motivo, origen). |
| `regla-contrapartida.aplicar.request` | Si `accion:'descartar'` y hay `contrapartida` declarada. |
| `historial-proceso-contable.anotar.request` | **Siempre** al desatascar: `{registro:{resultado:'PROCESADO'|'FALLADO', asunto:'excepcion desatascada', origen, motivo, hecho_id}}`. |
| `desatasco-entrada.juzgar.response` / `.juzgar.failed` | Respuesta + par de fallo de `juzgar`. |

> **SÍ publica un HECHO** (`contabilidad.excepcion_desatascada`): el desatasco ES la escritura →
> R2 obliga a anunciarlo. Además **anota siempre** en el historial del proceso (append-only).

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `juzgar` | **ORDEN** (ui_handler: system_panel) | `{project_id, excepcion?, excepcion_id?\|clave?, accion?\|decision?, motivo?\|causa?, asiento?, contrapartida?}` | `{project_id, tipo, excepcion_id, clave, accion, motivo, asiento, contrapartida, desatascada, resuelta, reencolada, descartada, en, abierto}` | `400 INVALID_INPUT` (falta `project_id`, falta excepción, o falta motivo); `500`. |

## Reglas de negocio

1. **Sin excepción no hay nada que desatascar**: si no llega `excepcion_id` ni `clave`
   → `400 INVALID_INPUT excepcion`.
2. **SIN MOTIVO NO SE ACTÚA**: `motivo` (o `causa`, o `excepcion.motivo`) vacío/`null`
   → `400 INVALID_INPUT motivo`. Es la regla dura: no se tapa una excepción sin causa.
3. **Acción** (`_accion`): `resolver` / `reencolar` / `descartar` (Set `ACCIONES`); cualquier otro
   valor (o ausente) → **`resolver`** por defecto.
4. **Resolver**: si hay `asiento`, se sube a `escritor-diario`; si no, se declara en
   `abierto.asiento` («se anota el hueco, no se inventa el apunte»).
5. **Reencolar**: se reenvía a `encolado-excepcion.encolar.request` con `rol:'DESATASCO_ENTRADA'`.
6. **Descartar**: si hay `contrapartida`, se sube `regla-contrapartida.aplicar.request` (aprendizaje).
7. **Historial siempre**: todo desatasco anota en `historial-proceso-contable` con
   `resultado:'PROCESADO'` (resolver) o `'FALLADO'` (reencolar/descartar).
8. **Banderas coherentes**: `resuelta = accion==='resolver'`; `reencolada = ...==='reencolar'`;
   `descartada = ...==='descartar'`; `desatascada:true`.
9. **HTTP exacto**: éxito `200`; input → `400`; excepción → `500`.

## Cómo se usa (RPC)

### Resolver una excepción con asiento

```json
{
  "project_id": "e57a318a-...",
  "excepcion_id": "exc_e57a318a-..._a1b2",
  "accion": "resolver",
  "motivo": "se localizo la contrapartida manualmente",
  "asiento": { "fecha": "2026-09-30", "lineas": [ { "cuenta": "629", "debe": 45, "haber": 0 }, { "cuenta": "572", "debe": 0, "haber": 45 } ] },
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "tipo": "desatasco-entrada",
  "excepcion_id": "exc_e57a318a-..._a1b2",
  "accion": "resolver",
  "motivo": "se localizo la contrapartida manualmente",
  "asiento": { "fecha": "2026-09-30", "lineas": [ … ] },
  "contrapartida": null,
  "desatascada": true,
  "resuelta": true,
  "reencolada": false,
  "descartada": false,
  "en": "2026-09-30T...",
  "abierto": { "asiento": null }
}
```
Emite `contabilidad.excepcion_desatascada`, sube `escritor-diario.asentar.request` y
`historial-proceso-contable.anotar.request` (`resultado:'PROCESADO'`).

### Reencolar

`{...,"accion":"reencolar","motivo":"faltan datos del proveedor"}` → emite el hecho y publica
`encolado-excepcion.encolar.request`.

### Sin motivo — se rechaza

```json
{ "project_id": "...", "excepcion_id": "exc_1", "accion": "resolver" }
```
→ `400 INVALID_INPUT motivo` + `desatasco-entrada.juzgar.failed`.

## Errores y qué significan

| Código | HTTP | Causa |
|---|---|---|
| `INVALID_INPUT` | 400 | Falta `project_id`; falta excepción (`excepcion_id`/`clave`); **falta motivo**. |
| `UNKNOWN_ERROR` | 500 | Excepción no controlada. |

## Relación con otras piezas (deps por EVENTO)

- **Escucha**: `contabilidad.excepcion_encolada` (A8.1).
- **Sube a**: `escritor-diario.asentar.request` (B2), `encolado-excepcion.encolar.request` (A8.1),
  `regla-contrapartida.aplicar.request`, `historial-proceso-contable.anotar.request`.

## Verificación

1. Fichero: `modules/contabilidad-entrada/desatasco-entrada/`.
2. Eventos reales: subscribes `desatasco-entrada.juzgar.request`, `contabilidad.excepcion_encolada`;
   publishes `contabilidad.excepcion_desatascada`, `escritor-diario.asentar.request`,
   `encolado-excepcion.encolar.request`, `regla-contrapartida.aplicar.request`,
   `historial-proceso-contable.anotar.request`, `desatasco-entrada.juzgar.response`, `.juzgar.failed`.
3. Strings en código:
   ```bash
   grep -oE "publish\('[^']*'" modules/contabilidad-entrada/desatasco-entrada/index.js
   # → contabilidad.excepcion_desatascada / escritor-diario.asentar.request / encolado-excepcion.encolar.request
   # → regla-contrapartida.aplicar.request / historial-proceso-contable.anotar.request / desatasco-entrada.juzgar.failed
   ```
4. Test unitario (si existe): resolver con asiento → asienta + hecho + historial PROCESADO;
   reencolar → encola; descartar con contrapartida → aplica regla; sin motivo → 400; sin excepción → 400.
